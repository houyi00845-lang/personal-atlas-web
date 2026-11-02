import { protect, json } from './security.mjs';
const publicPaths = new Set(['/auth.css', '/auth.js', '/styles.css', '/reviews.css', '/app.js', '/reviews.js', '/bootstrap.js', '/settings.js']);
export async function handleRequest(request, env) {
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return protect(new Response('HTTPS required', { status: 400 }));
    if (url.pathname === '/robots.txt') return protect(new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } }));
    if (!env.VAULT || !env.ASSETS) return protect(json({ error: '网站尚未配置完成。' }, 503));
    const stub = env.VAULT.get(env.VAULT.idFromName('owner'));
    const api = async (path, method = 'GET') => {
      const target = new URL(path, url.origin);
      const h = new Headers(request.headers);
      h.set('X-Atlas-Client', request.headers.get('CF-Connecting-IP') || 'unknown');
      return stub.fetch(new Request(target, { method, headers: h, body: method === 'GET' ? undefined : request.body, ...(method === 'GET' ? {} : { duplex: 'half' }) }));
    };
    if (url.pathname.startsWith('/api/')) return protect(await api(url.pathname, request.method));
    if (!['GET', 'HEAD'].includes(request.method)) return protect(new Response('Method not allowed', { status: 405 }));
    let file, renewalCookie;
    if (url.pathname === '/login' || url.pathname === '/setup') file = 'login.html';
    else if (publicPaths.has(url.pathname)) file = url.pathname.slice(1);
    else if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/settings') {
      const session = await api('/api/auth/session');
      if (!session.ok) return protect(Response.redirect(new URL('/login', url.origin), 303));
      renewalCookie = session.headers.get('Set-Cookie');
      file = url.pathname === '/settings' ? 'settings.html' : 'index.html';
    } else return protect(new Response('Not found', { status: 404 }));
    const assetUrl = new URL('/' + file, url.origin);
    const response = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method }));
    const secured = protect(response);
    if (renewalCookie) secured.headers.set('Set-Cookie', renewalCookie);
    return secured;
  } catch { return protect(json({ error: '网站暂时无法访问，请稍后重试。' }, 503)); }
}
