(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const setup = location.pathname === '/setup';
  if (setup) {
    $('#page-title').textContent = '为知识空间设置密码';
    $('#page-intro').textContent = '首次初始化完成后，这个入口将自动关闭。';
    $('#setup-key-row').hidden = false; $('#confirmation-row').hidden = false;
    $('#setup-key').required = true; $('#confirmation').required = true;
    $('#password').autocomplete = 'new-password'; $('#password').minLength = 14;
    $('#password-label').textContent = '设置访问密码'; $('#submit').textContent = '完成初始化 →';
  }
  fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }).then(r => { if (r.ok) location.replace('/'); }).catch(() => {});
  fetch('/api/status', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.json()).then(s => {
    if (setup && s.configured) { location.replace('/login'); return; }
    if (!s.configured && !s.setupAvailable) { $('#message').textContent = '网站正在准备中，暂时不能登录。'; $('#submit').disabled = true; }
    if (!setup && s.setupAvailable) $('#setup-link').hidden = false;
  }).catch(() => { $('#message').textContent = '暂时无法连接，请稍后刷新。'; });
  $('#auth-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('#submit'); $('#message').textContent = '';
    if (setup && $('#password').value !== $('#confirmation').value) { $('#message').textContent = '两次输入的密码不一致。'; return; }
    button.disabled = true;
    const body = { password: $('#password').value }; if (setup) body.key = $('#setup-key').value;
    try {
      const response = await fetch(setup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body), cache: 'no-store' });
      const result = await response.json();
      $('#password').value = ''; $('#confirmation').value = ''; $('#setup-key').value = '';
      if (!response.ok) throw new Error(result.error || '暂时无法登录。');
      location.replace(setup ? '/settings' : '/');
    } catch (error) { $('#message').textContent = error.message || '连接失败，请稍后重试。'; }
    finally { button.disabled = false; }
  });
})();
