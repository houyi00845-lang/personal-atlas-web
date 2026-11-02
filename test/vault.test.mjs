import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Vault } from '../src/vault.mjs';
import { handleRequest } from '../src/router.mjs';
import { REMEMBER_SECONDS, SESSION_SECONDS, digest } from '../src/security.mjs';

const origin = 'https://example.test';
const key = 'test-bootstrap-key-with-at-least-32-characters';
const password = 'sample-long-password-for-tests';
function fixture({ legacySessions = false } = {}) {
  const db = new DatabaseSync(':memory:');
  if (legacySessions) db.exec('CREATE TABLE sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);');
  const storage = {
    sql: { exec(query, ...args) {
      if (!args.length && query.trim().split(';').filter(Boolean).length > 1) { db.exec(query); return { toArray: () => [] }; }
      const rows = db.prepare(query).all(...args); return { toArray: () => rows };
    } },
    transactionSync(fn) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  };
  const vault = new Vault(storage, { BOOTSTRAP_KEY: key });
  const request = (path, { method = 'GET', data, cookie, client = 'test-client', from = origin, headers = {} } = {}) => {
    const h = { 'X-Atlas-Client': client, ...headers };
    if (cookie) h.Cookie = cookie;
    if (method === 'POST') { h.Origin = from; if (data !== undefined) h['Content-Type'] = 'application/json'; }
    return new Request(origin + path, { method, headers: h, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  };
  const call = (path, options) => vault.fetch(request(path, options));
  const setup = async () => { const r = await call('/api/auth/setup', { method: 'POST', data: { key, password } }); assert.equal(r.status, 200); return r.headers.get('Set-Cookie').split(';')[0]; };
  return { db, storage, vault, request, call, setup };
}
function atlas(label = 'Synthetic note') {
  return { profile: { displayName: 'Example', siteName: 'Example atlas' }, records: [{ id: 'one', label, detail: 'Synthetic data for testing only.' }], edges: [], domains: { Example: ['Notes'] }, documents: [], reviews: { months: [], overview: { axes: [] } } };
}

test('private endpoints, direct asset paths and application shell reject anonymous access', async () => {
  const f = fixture();
  for (const path of ['/api/atlas', '/api/versions', '/api/versions/1', '/api/auth/session']) assert.equal((await f.call(path)).status, 401);
  const assets = [];
  const env = { VAULT: { idFromName: () => 'owner', get: () => f.vault }, ASSETS: { fetch: async r => { assets.push(new URL(r.url).pathname); return new Response('PUBLIC SHELL'); } } };
  for (const path of ['/', '/index.html', '/settings']) {
    const response = await handleRequest(f.request(path), env); assert.equal(response.status, 303); assert.equal(response.headers.get('Location'), origin + '/login');
  }
  for (const path of ['/data.js', '/content/graph-data.json', '/atlas.json', '/.git/config', '/login.html', '/index.html/../data.js']) assert.equal((await handleRequest(f.request(path), env)).status, 404);
  assert.equal(assets.length, 0);
  const login = await handleRequest(f.request('/login'), env); assert.equal(login.status, 200); assert.deepEqual(assets, ['/login.html']);
  assert.equal(login.headers.get('Cache-Control'), 'no-store, private'); assert(login.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
  f.db.close();
});

test('setup is fail-closed, requires its secret, and cannot be repeated', async () => {
  const f = fixture();
  f.vault.env = {}; assert.equal((await f.call('/api/auth/setup', { method: 'POST', data: { key, password } })).status, 503);
  f.vault.env = { BOOTSTRAP_KEY: key };
  assert.equal((await f.call('/api/auth/setup', { method: 'POST', data: { key: 'wrong', password } })).status, 401);
  assert.equal((await f.call('/api/auth/setup', { method: 'POST', data: { key, password: 'short' } })).status, 400);
  const cookie = await f.setup();
  assert.equal((await f.call('/api/auth/setup', { method: 'POST', data: { key, password } })).status, 409);
  assert.equal((await f.call('/api/auth/session', { cookie })).status, 200);
  assert(!JSON.stringify(f.vault.rows('SELECT * FROM settings')).includes(password));
  f.db.close();
});

test('wrong passwords, forged cookies, cross-origin writes and bad content types fail', async () => {
  const f = fixture(); const cookie = await f.setup();
  const wrong = await f.call('/api/auth/login', { method: 'POST', data: { password: 'wrong' } }); assert.equal(wrong.status, 401); assert.equal(wrong.headers.get('Set-Cookie'), null);
  assert.equal((await f.call('/api/atlas', { cookie: '__Host-atlas_session=' + 'a'.repeat(64) })).status, 401);
  assert.equal((await f.call('/api/auth/logout', { method: 'POST', cookie, from: 'https://attacker.test' })).status, 403);
  const badType = new Request(origin + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: JSON.stringify({ password }) });
  assert.equal((await f.vault.fetch(badType)).status, 415);
  assert.equal((await f.call('/api/auth/login', { method: 'POST', data: { password }, from: '' })).status, 403);
  const good = await f.call('/api/auth/login', { method: 'POST', data: { password } });
  assert.equal(good.status, 200); const header = good.headers.get('Set-Cookie');
  for (const value of ['__Host-', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert(header.includes(value));
  f.db.close();
});

test('failed-login limits are persistent across instances sharing the same store', async () => {
  const f = fixture(); await f.setup();
  for (let i = 0; i < 5; i++) assert.equal((await f.call('/api/auth/login', { method: 'POST', data: { password: 'wrong' } })).status, 401);
  const recreated = new Vault(f.storage, { BOOTSTRAP_KEY: key });
  const r = await recreated.fetch(f.request('/api/auth/login', { method: 'POST', data: { password } }));
  assert.equal(r.status, 429); assert(Number(r.headers.get('Retry-After')) > 0);
  f.db.close();
});

test('private import validates relationships and rejects stale writes; five backups survive', async () => {
  const f = fixture(); const cookie = await f.setup();
  const upload = (a, revision) => f.call('/api/atlas', { method: 'POST', data: a, cookie, headers: revision === undefined ? {} : { 'If-Match': '"' + revision + '"' } });
  assert.equal((await upload(atlas())).status, 428);
  const bad = atlas(); bad.edges = [{ from: 'one', to: 'missing' }]; assert.equal((await upload(bad, 0)).status, 400);
  assert.equal((await upload(atlas(), 0)).status, 200);
  assert.equal((await upload(atlas('Stale write'), 0)).status, 409);
  for (let revision = 1; revision < 7; revision++) assert.equal((await upload(atlas('Version ' + (revision + 1)), revision)).status, 200);
  const body = await (await f.call('/api/atlas', { cookie })).json(); assert.equal(body.records[0].label, 'Version 7');
  const versions = await (await f.call('/api/versions', { cookie })).json(); assert.equal(versions.versions.length, 5);
  assert.equal((await f.call('/api/versions/1', { cookie })).status, 404); assert.equal((await f.call('/api/versions/3', { cookie })).status, 200);
  const privateResponse = await f.call('/api/atlas', { cookie }); assert.equal(privateResponse.headers.get('Cache-Control'), 'no-store, private'); assert.equal(privateResponse.headers.get('ETag'), '"7"');
  assert.equal((await f.call('/api/atlas')).status, 401);
  f.db.close();
});

test('logout revokes an existing session immediately, even when the old cookie is replayed', async () => {
  const f = fixture(); const cookie = await f.setup();
  const out = await f.call('/api/auth/logout', { method: 'POST', cookie }); assert.equal(out.status, 200); assert(out.headers.get('Set-Cookie').includes('Max-Age=0'));
  assert.equal((await f.call('/api/auth/session', { cookie })).status, 401); assert.equal((await f.call('/api/atlas', { cookie })).status, 401);
  f.db.close();
});

test('expired sessions cannot read data, and changing the password revokes every session', async () => {
  const f = fixture(); const cookie = await f.setup();
  const login = await f.call('/api/auth/login', { method: 'POST', data: { password } }); const second = login.headers.get('Set-Cookie').split(';')[0];
  const changed = await f.call('/api/auth/password', { method: 'POST', cookie, data: { password, newPassword: 'another-long-test-password' } });
  assert.equal(changed.status, 200);
  for (const value of [cookie, second]) assert.equal((await f.call('/api/auth/session', { cookie: value })).status, 401);
  assert.equal((await f.call('/api/auth/login', { method: 'POST', data: { password } })).status, 401);
  const fresh = await f.call('/api/auth/login', { method: 'POST', data: { password: 'another-long-test-password' } }); assert.equal(fresh.status, 200);
  const third = fresh.headers.get('Set-Cookie').split(';')[0]; f.vault.sql.exec('UPDATE sessions SET expires = ?', 0);
  assert.equal((await f.call('/api/atlas', { cookie: third })).status, 401);
  f.db.close();
});

test('parallel failed logins cannot bypass the attempt budget', async () => {
  const f = fixture(); await f.setup();
  const results = await Promise.all(Array.from({ length: 12 }, () => f.call('/api/auth/login', { method: 'POST', data: { password: 'wrong' } })));
  assert.equal(results.filter(r => r.status === 401).length, 5); assert.equal(results.filter(r => r.status === 429).length, 7);
  f.db.close();
});

test('setup and password changes accept ten characters and reject nine', async () => {
  const f = fixture(); const ten = 'Test-Key42'; assert.equal(ten.length, 10);
  assert.equal((await f.call('/api/auth/setup', { method: 'POST', data: { key, password: ten.slice(1) } })).status, 400);
  const created = await f.call('/api/auth/setup', { method: 'POST', data: { key, password: ten } });
  assert.equal(created.status, 200); const cookie = created.headers.get('Set-Cookie').split(';')[0];
  const next = 'New-Key123'; assert.equal(next.length, 10);
  assert.equal((await f.call('/api/auth/password', { method: 'POST', cookie, data: { password: ten, newPassword: next.slice(1) } })).status, 400);
  assert.equal((await f.call('/api/auth/password', { method: 'POST', cookie, data: { password: ten, newPassword: next } })).status, 200);
  assert.equal((await f.call('/api/auth/login', { method: 'POST', data: { password: next } })).status, 200);
  f.db.close();
});

test('devices are remembered for 180 days by default, with an explicit short-session option', async () => {
  const f = fixture(); await f.setup();
  const long = await f.call('/api/auth/login', { method: 'POST', data: { password } });
  assert(long.headers.get('Set-Cookie').includes('Max-Age=' + REMEMBER_SECONDS));
  let session = await f.vault.session(f.request('/api/auth/session', { cookie: long.headers.get('Set-Cookie').split(';')[0] }));
  assert.equal(session.remembered, true); assert(session.expires >= Date.now() + REMEMBER_SECONDS * 1000 - 1000);
  const short = await f.call('/api/auth/login', { method: 'POST', data: { password, remember: false } });
  assert(short.headers.get('Set-Cookie').includes('Max-Age=' + SESSION_SECONDS));
  const shortCookie = short.headers.get('Set-Cookie').split(';')[0];
  session = await f.vault.session(f.request('/api/auth/session', { cookie: shortCookie })); assert.equal(session.remembered, false);
  const checked = await f.call('/api/auth/session', { cookie: shortCookie }); assert.equal(checked.headers.get('Set-Cookie'), null);
  f.db.close();
});

test('remembered sessions renew after one day and the browser receives the renewed cookie', async () => {
  const f = fixture(); const cookie = await f.setup();
  const oldExpiry = Date.now() + (REMEMBER_SECONDS - 2 * 86400) * 1000;
  f.vault.sql.exec('UPDATE sessions SET expires = ?', oldExpiry);
  const renewed = await f.call('/api/auth/session', { cookie }); assert.equal(renewed.status, 200);
  assert(renewed.headers.get('Set-Cookie').includes('Max-Age=' + REMEMBER_SECONDS));
  const body = await renewed.json(); assert(body.expires > oldExpiry); assert.equal(body.remembered, true);
  const again = await f.call('/api/auth/session', { cookie }); assert.equal(again.headers.get('Set-Cookie'), null);
  assert.equal(f.vault.rows('SELECT token FROM sessions').length, 1);
  const pendingSession = await f.vault.session(f.request('/api/auth/session', { cookie }));
  await f.call('/api/auth/logout', { method: 'POST', cookie }); pendingSession.expires = oldExpiry;
  assert.equal(f.vault.renewSession(pendingSession), null);
  assert.equal((await f.call('/api/auth/session', { cookie })).status, 401);
  f.db.close();
});

test('protected HTML responses propagate cookie renewal from their authentication check', async () => {
  const f = fixture(); const cookie = await f.setup();
  const env = { VAULT: { idFromName: () => 'owner', get: () => f.vault }, ASSETS: { fetch: async () => new Response('PUBLIC SHELL') } };
  for (const path of ['/', '/index.html', '/settings']) {
    f.vault.sql.exec('UPDATE sessions SET expires = ?', Date.now() + (REMEMBER_SECONDS - 2 * 86400) * 1000);
    const response = await handleRequest(f.request(path, { cookie }), env);
    assert.equal(response.status, 200); assert(response.headers.get('Set-Cookie').includes('Max-Age=' + REMEMBER_SECONDS));
    assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
  }
  f.vault.sql.exec('UPDATE sessions SET expires = ?', 0);
  const expired = await handleRequest(f.request('/', { cookie }), env);
  assert.equal(expired.status, 303); assert.equal(expired.headers.get('Set-Cookie'), null);
  f.db.close();
});

test('upgrading an old vault preserves old sessions without silently extending them', async () => {
  const f = fixture({ legacySessions: true });
  const token = 'b'.repeat(64); const expires = Date.now() + 3600000;
  f.vault.sql.exec('INSERT INTO sessions (token, expires) VALUES (?, ?)', await digest(token), expires);
  f.vault.put('compatibility-test', 'keep-existing-settings');
  const upgraded = new Vault(f.storage, { BOOTSTRAP_KEY: key });
  const response = await upgraded.fetch(f.request('/api/auth/session', { cookie: '__Host-atlas_session=' + token }));
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.expires, expires); assert.equal(body.remembered, false);
  assert.equal(response.headers.get('Set-Cookie'), null); assert.equal(upgraded.get('compatibility-test'), 'keep-existing-settings');
  assert.equal(upgraded.rows('PRAGMA table_info(sessions)').filter(column => column.name === 'remembered').length, 1);
  f.db.close();
});
