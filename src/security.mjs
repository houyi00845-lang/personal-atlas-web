export const SESSION_COOKIE = '__Host-atlas_session';
export const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
const comparisonKey = crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
export function hex(bytes) { return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function digest(value) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
export async function equalSecret(a, b) {
  const key = await comparisonKey;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(String(a)));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(String(b)));
}
export function randomToken() { return hex(crypto.getRandomValues(new Uint8Array(32))); }
export function validPassword(password) { return typeof password === 'string' && password.length >= 14 && password.length <= 256; }
export async function hashPassword(password, salt = randomToken()) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { algorithm: 'pbkdf2-sha256', iterations: 100000, salt, hash: hex(bits) };
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 256 || !encoded) return false;
  const stored = JSON.parse(encoded);
  if (stored.algorithm !== 'pbkdf2-sha256' || stored.iterations !== 100000) return false;
  const actual = await hashPassword(password, stored.salt);
  return equalSecret(actual.hash, stored.hash);
}
export function cookieToken(request) {
  const match = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(SESSION_COOKIE + '='));
  const value = match?.slice(SESSION_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
export function sessionCookie(token, seconds = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
}
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  return origin === new URL(request.url).origin && (!site || site === 'same-origin' || site === 'none');
}
export function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', ...extra } });
}
export function protect(response) {
  const h = new Headers(response.headers);
  h.set('Cache-Control', 'no-store, private');
  h.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
  h.set('Referrer-Policy', 'no-referrer');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.set('Strict-Transport-Security', 'max-age=15552000');
  h.set('Vary', 'Cookie');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}
export async function readJson(request, limit = 2 * 1024 * 1024) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw Object.assign(new Error('请使用 JSON 格式提交。'), { status: 415 });
  if (Number(request.headers.get('Content-Length')) > limit) throw Object.assign(new Error('文件过大。'), { status: 413 });
  if (!request.body) throw Object.assign(new Error('内容不能为空。'), { status: 400 });
  const reader = request.body.getReader();
  const parts = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw Object.assign(new Error('文件过大。'), { status: 413 }); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw Object.assign(new Error('JSON 文件无法解析。'), { status: 400 }); }
}
