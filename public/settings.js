(() => {
  'use strict'; const $ = s => document.querySelector(s); let version = 0;
  const message = text => { $('#message').textContent = text; };
  async function request(path, init = {}) {
    const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
    if (r.status === 401) { location.replace('/login'); throw new Error('登录已失效。'); }
    const body = await r.json(); if (!r.ok) throw new Error(body.error || '操作失败。'); return body;
  }
  async function refresh() {
    const s = await request('/api/auth/session'); version = s.version;
    $('#current-version').textContent = version ? `当前保存版本：${version}` : '尚未导入资料。请选择你的知识库文件。';
    const v = await request('/api/versions'); $('#versions').replaceChildren();
    for (const row of v.versions) {
      const item = document.createElement('div'); item.className = 'version-row';
      const label = document.createElement('span'); label.textContent = `版本 ${row.id} · ${new Date(row.created).toLocaleString('zh-CN')}`;
      const link = document.createElement('a'); link.href = '/api/versions/' + row.id; link.download = `atlas-backup-v${row.id}.json`; link.className = 'subtle'; link.textContent = '下载备份'; item.append(label, link); $('#versions').append(item);
    }
  }
  $('#atlas-file').addEventListener('change', () => { const f = $('#atlas-file').files[0]; $('#file-summary').textContent = f ? `${f.name} · ${(f.size / 1024).toFixed(1)} KB，等待导入。` : '文件在你点击导入后才会上传。'; });
  $('#import-form').addEventListener('submit', async event => {
    event.preventDefault(); const file = $('#atlas-file').files[0]; if (!file) return;
    if (file.size > 1800000) { message('文件过大，请控制在 1.8 MB 以内。'); return; }
    $('#import-button').disabled = true; message('正在保存资料…');
    try {
      const text = await file.text(); const data = JSON.parse(text);
      if (!Array.isArray(data.records) || !Array.isArray(data.edges)) throw new Error('这个文件不是有效的知识库资料。');
      const result = await request('/api/atlas', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': '"' + version + '"' }, body: text });
      version = result.version; await refresh(); $('#atlas-file').value = ''; $('#file-summary').textContent = '文件在你点击导入后才会上传。'; message(`保存完成，共 ${data.records.length} 条记录。可以返回知识库阅读。`);
    } catch (error) { message(error.message); }
    finally { $('#import-button').disabled = false; }
  });
  $('#logout-button').addEventListener('click', async () => { try { await request('/api/auth/logout', { method: 'POST' }); document.body.replaceChildren(); location.replace('/login'); } catch (e) { message(e.message); } });
  $('#password-form').addEventListener('submit', async event => {
    event.preventDefault();
    if ($('#new-password').value !== $('#confirm-password').value) { message('两次输入的新密码不一致。'); return; }
    const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try { await request('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#old-password').value, newPassword: $('#new-password').value }) }); document.body.replaceChildren(); location.replace('/login'); }
    catch (error) { message(error.message); }
    finally { button.disabled = false; }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  refresh().catch(error => message(error.message));
})();
