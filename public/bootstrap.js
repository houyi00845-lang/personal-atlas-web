(async () => {
  'use strict';
  try {
    const response = await fetch('/api/atlas', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) { location.replace('/login'); return; }
    if (response.status === 404) { location.replace('/settings'); return; }
    if (!response.ok) throw new Error('资料暂时无法读取，请稍后重试。');
    window.ATLAS_DATA = await response.json();
    const name = window.ATLAS_DATA.profile?.siteName || '个人知识库';
    const brand = document.querySelector('.brand>span');
    brand.replaceChildren(document.createTextNode(name)); const small = document.createElement('small'); small.textContent = 'PERSONAL KNOWLEDGE'; brand.append(small);
    for (const src of ['/reviews.js', '/app.js']) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = reject; document.body.append(script); });
    document.querySelector('#loading')?.remove();
  } catch (error) { const main = document.querySelector('#main'); main.replaceChildren(); const p = document.createElement('p'); p.textContent = error.message || '页面加载失败，请刷新后重试。'; main.append(p); }
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  let checking = false;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || checking) return; checking = true;
    try { const r = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' }); if (r.status === 401) { delete window.ATLAS_DATA; document.body.replaceChildren(); location.replace('/login'); } } finally { checking = false; }
  });
})();
