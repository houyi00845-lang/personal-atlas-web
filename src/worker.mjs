import { DurableObject } from 'cloudflare:workers';
import { Vault } from './vault.mjs';
import { handleRequest } from './router.mjs';
export class AtlasVault extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.vault = new Vault(ctx.storage, env); }
  fetch(request) { return this.vault.fetch(request); }
}
export default { fetch: handleRequest };
