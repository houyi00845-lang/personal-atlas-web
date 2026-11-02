import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const deniedNames = /^(content|\.private|private|\.env(?:\..*)?|\.dev\.vars|data\.js|atlas\.json|.*\.sqlite.*)$/;
async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.wrangler'].includes(e.name)) continue;
    if (deniedNames.test(e.name)) throw new Error('Private file or directory found: ' + relative(root, join(dir, e.name)));
    files.push(...(e.isDirectory() ? await walk(join(dir, e.name)) : [join(dir, e.name)]));
  }
  return files;
}
const files = await walk(root);
const privacyMarkers = ['window.ATLAS_DATA = {', 'sk_live_', 'ghp_', 'github_pat_', 'BEGIN PRIVATE KEY'];
for (const file of files) {
  if (file.endsWith('check-public.mjs')) continue;
  const text = await readFile(file, 'utf8');
  for (const marker of privacyMarkers) if (text.includes(marker)) throw new Error('Unexpected embedded data or secret in ' + relative(root, file));
}
const index = await readFile(join(root, 'public/index.html'), 'utf8');
if (index.includes('src="data.js"')) throw new Error('Index still loads a public data bundle');
const config = JSON.parse((await readFile(join(root, 'wrangler.jsonc'), 'utf8')));
if (config.assets.run_worker_first !== true) throw new Error('Worker must run before static assets');
console.log(`PASS: ${files.length} public files checked; no embedded data bundle or credential patterns; Worker-first routing enabled.`);
