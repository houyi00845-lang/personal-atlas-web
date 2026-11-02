import { SESSION_SECONDS, REMEMBER_SECONDS, RENEW_AFTER_SECONDS, cookieToken, sessionCookie, randomToken, digest, hashPassword, verifyPassword, equalSecret, validPassword, sameOrigin, readJson, json } from './security.mjs';

export class Vault {
  constructor(storage, env) {
    this.storage = storage; this.sql = storage.sql; this.env = env;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL, remembered INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS versions (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created INTEGER NOT NULL);`);
    // Preserve existing sessions and data when upgrading an already deployed vault.
    if (!this.rows('PRAGMA table_info(sessions)').some(column => column.name === 'remembered')) this.sql.exec('ALTER TABLE sessions ADD COLUMN remembered INTEGER NOT NULL DEFAULT 0');
  }
  rows(query, ...args) { return this.sql.exec(query, ...args).toArray(); }
  get(key) { return this.rows('SELECT value FROM settings WHERE key = ?', key)[0]?.value; }
  put(key, value) { this.sql.exec('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, String(value)); }
  current() { return this.rows('SELECT id, payload, created FROM versions ORDER BY id DESC LIMIT 1')[0]; }
  async session(request) {
    const token = cookieToken(request);
    if (!token) return null;
    const hash = await digest(token);
    const row = this.rows('SELECT expires, remembered FROM sessions WHERE token = ? AND expires > ?', hash, Date.now())[0];
    return row ? { hash, token, expires: row.expires, remembered: row.remembered === 1 } : null;
  }
  renewSession(session) {
    const now = Date.now();
    if (!session.remembered || session.expires > now + (REMEMBER_SECONDS - RENEW_AFTER_SECONDS) * 1000) return null;
    const expires = now + REMEMBER_SECONDS * 1000;
    const updated = this.rows('UPDATE sessions SET expires = ? WHERE token = ? AND expires > ? RETURNING expires', expires, session.hash, now)[0];
    if (!updated) return null;
    session.expires = expires;
    return sessionCookie(session.token, REMEMBER_SECONDS);
  }
  rememberedResponse(session, response) {
    const cookie = this.renewSession(session);
    if (cookie) response.headers.set('Set-Cookie', cookie);
    return response;
  }
  async issueSession(expectedPassword, remember = true) {
    const token = randomToken(); const hash = await digest(token);
    if (this.get('password') !== expectedPassword) return null;
    this.sql.exec('DELETE FROM sessions WHERE expires <= ?', Date.now());
    const seconds = remember ? REMEMBER_SECONDS : SESSION_SECONDS;
    this.sql.exec('INSERT INTO sessions (token, expires, remembered) VALUES (?, ?, ?)', hash, Date.now() + seconds * 1000, remember ? 1 : 0);
    return sessionCookie(token, seconds);
  }
  async reserveAttempt(request, kind) {
    const now = Date.now(); const key = kind + ':' + await digest(request.headers.get('X-Atlas-Client') || 'unknown');
    this.sql.exec('DELETE FROM attempts WHERE expires <= ?', now);
    for (const [k, max] of [[key, 5], [kind + ':global', 60]]) {
      const row = this.rows('SELECT count, expires FROM attempts WHERE key = ?', k)[0];
      if (row && row.count >= max) return json({ error: '尝试次数过多，请稍后再试。' }, 429, { 'Retry-After': String(Math.max(1, Math.ceil((row.expires - now) / 1000))) });
    }
    for (const k of [key, kind + ':global']) this.sql.exec('INSERT INTO attempts (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1', k, now + 15 * 60 * 1000);
    return null;
  }
  async fetch(request) {
    try { return await this.route(request); }
    catch (error) { return json({ error: error.status ? error.message : '暂时无法完成操作，请稍后重试。' }, error.status || 500); }
  }
  async route(request) {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (!['GET', 'POST'].includes(method)) return json({ error: '不支持此操作。' }, 405);
    if (method === 'POST' && !sameOrigin(request)) return json({ error: '来源验证失败。' }, 403);
    if (path === '/api/status' && method === 'GET') return json({ configured: !!this.get('password'), setupAvailable: !this.get('password') && (this.env.BOOTSTRAP_KEY?.length || 0) >= 32 });
    if (path === '/api/auth/setup' && method === 'POST') {
      if (this.get('password')) return json({ error: '初始化已经完成，请直接登录。' }, 409);
      if ((this.env.BOOTSTRAP_KEY?.length || 0) < 32) return json({ error: '网站尚未开放初始化。' }, 503);
      const blocked = await this.reserveAttempt(request, 'setup'); if (blocked) return blocked;
      const input = await readJson(request, 4096);
      if (typeof input.key !== 'string' || input.key.length > 512 || !await equalSecret(this.env.BOOTSTRAP_KEY, input.key)) return json({ error: '初始化密钥不正确。' }, 401);
      if (!validPassword(input.password)) return json({ error: '请设置 10 至 256 个字符的密码。' }, 400);
      if (Number(this.get('setupLock') || 0) > Date.now()) return json({ error: '初始化正在进行，请稍后重试。' }, 409);
      this.put('setupLock', Date.now() + 120000);
      try {
        const encoded = await hashPassword(input.password);
        if (this.get('password')) return json({ error: '初始化已经完成。' }, 409);
        const stored = JSON.stringify(encoded);
        this.put('password', stored);
        const cookie = await this.issueSession(stored, input.remember !== false);
        return cookie ? json({ ok: true }, 200, { 'Set-Cookie': cookie }) : json({ error: '密码状态已变化，请重新登录。' }, 401);
      } finally { this.put('setupLock', 0); }
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const encoded = this.get('password');
      if (!encoded) return json({ error: '请先完成网站初始化。', setupRequired: true }, 503);
      const blocked = await this.reserveAttempt(request, 'login'); if (blocked) return blocked;
      const input = await readJson(request, 4096);
      if (!await verifyPassword(input.password, encoded)) return json({ error: '密码不正确。' }, 401);
      const cookie = await this.issueSession(encoded, input.remember !== false);
      return cookie ? json({ ok: true }, 200, { 'Set-Cookie': cookie }) : json({ error: '密码状态已变化，请重新登录。' }, 401);
    }
    const session = await this.session(request);
    if (!session) return json({ error: '请先登录。' }, 401);
    if (path === '/api/auth/session' && method === 'GET') {
      const cookie = this.renewSession(session);
      return json({ authenticated: true, expires: session.expires, remembered: session.remembered, version: this.current()?.id || 0 }, 200, cookie ? { 'Set-Cookie': cookie } : {});
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      this.sql.exec('DELETE FROM sessions WHERE token = ?', session.hash);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0), 'Clear-Site-Data': '"cache", "storage"' });
    }
    if (path === '/api/auth/password' && method === 'POST') {
      const blocked = await this.reserveAttempt(request, 'password'); if (blocked) return blocked;
      const input = await readJson(request, 4096);
      if (!validPassword(input.newPassword)) return json({ error: '新密码需为 10 至 256 个字符。' }, 400);
      const currentPassword = this.get('password');
      if (!await verifyPassword(input.password, currentPassword)) return json({ error: '当前密码不正确。' }, 401);
      const encoded = await hashPassword(input.newPassword);
      if (this.get('password') !== currentPassword) return json({ error: '密码状态已变化，请重新登录。' }, 401);
      this.storage.transactionSync(() => { this.put('password', JSON.stringify(encoded)); this.sql.exec('DELETE FROM sessions'); });
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0), 'Clear-Site-Data': '"cache", "storage"' });
    }
    if (path === '/api/atlas' && method === 'GET') {
      const row = this.current();
      if (!row) return this.rememberedResponse(session, json({ error: '还没有导入资料。', empty: true }, 404));
      return this.rememberedResponse(session, new Response(row.payload, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'ETag': '"' + row.id + '"' } }));
    }
    if (path === '/api/atlas' && method === 'POST') {
      const atlas = await readJson(request);
      const error = validateAtlas(atlas); if (error) return json({ error }, 400);
      const expected = request.headers.get('If-Match');
      if (!expected || !/^"\d+"$/.test(expected)) return json({ error: '缺少当前版本，请刷新后重试。' }, 428);
      const current = this.current()?.id || 0;
      if (expected !== '"' + current + '"') return json({ error: '资料已被更新，请刷新后重试。' }, 409);
      const payload = JSON.stringify(atlas);
      if (new TextEncoder().encode(payload).byteLength > 1800000) return json({ error: '单份资料请控制在 1.8 MB 以内。' }, 413);
      this.storage.transactionSync(() => {
        this.sql.exec('INSERT INTO versions (payload, created) VALUES (?, ?)', payload, Date.now());
        this.sql.exec('DELETE FROM versions WHERE id NOT IN (SELECT id FROM versions ORDER BY id DESC LIMIT 5)');
      });
      return json({ ok: true, version: this.current().id });
    }
    if (path === '/api/versions' && method === 'GET') return this.rememberedResponse(session, json({ versions: this.rows('SELECT id, created FROM versions ORDER BY id DESC') }));
    const match = path.match(/^\/api\/versions\/(\d+)$/);
    if (match && method === 'GET') {
      const row = this.rows('SELECT payload FROM versions WHERE id = ?', Number(match[1]))[0];
      return this.rememberedResponse(session, row ? new Response(row.payload, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' } }) : json({ error: '未找到此版本。' }, 404));
    }
    return json({ error: '未找到。' }, 404);
  }
}

export function validateAtlas(atlas) {
  if (!atlas || !Array.isArray(atlas.records) || !Array.isArray(atlas.edges) || !Array.isArray(atlas.documents) || !atlas.domains || !atlas.reviews?.months || !Array.isArray(atlas.reviews.overview?.axes) || !atlas.profile?.displayName) return '资料结构不完整。';
  if (!atlas.records.length || atlas.records.length > 20000 || atlas.edges.length > 100000) return '记录数量不符合要求。';
  const ids = new Set();
  for (const r of atlas.records) {
    if (typeof r.id !== 'string' || ids.has(r.id) || typeof r.label !== 'string' || typeof r.detail !== 'string') return '记录存在重复编号或缺少内容。';
    ids.add(r.id);
  }
  for (const e of atlas.edges) if (!ids.has(e.from) || !ids.has(e.to)) return '关联指向了不存在的记录。';
  return null;
}
