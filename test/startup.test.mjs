import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('the complete Worker module loads without request-only operations at global scope', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === 'cloudflare:workers') return { shortCircuit: true, url: 'data:text/javascript,export class DurableObject {}' };
      return next(specifier, context);
    }});
    const forbidden = name => () => { throw new Error('Request-only operation at module startup: ' + name); };
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
      getRandomValues: forbidden('crypto.getRandomValues'), randomUUID: forbidden('crypto.randomUUID'),
      subtle: new Proxy({}, { get: (_, property) => forbidden('crypto.subtle.' + String(property)) })
    }});
    globalThis.fetch = forbidden('fetch');
    globalThis.setTimeout = forbidden('setTimeout');
    globalThis.setInterval = forbidden('setInterval');
    const worker = await import('./src/worker.mjs');
    if (typeof worker.default.fetch !== 'function' || typeof worker.AtlasVault !== 'function') throw new Error('Missing Worker exports');
    console.log('Worker imports without request-only startup operations.');
  `], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
