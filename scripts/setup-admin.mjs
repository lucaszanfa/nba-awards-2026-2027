import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// Não imprime o segredo nem o coloca em argumentos de processo.
const path = '.dev.vars';
let key;
if (existsSync(path)) key = readFileSync(path, 'utf8').match(/^ADMIN_KEY=([a-f0-9]{64})$/m)?.[1];
if (!key) {
  key = randomBytes(32).toString('hex');
  writeFileSync(path, '# Código privado do organizador. Nunca publique ou compartilhe este arquivo.\nADMIN_KEY=' + key + '\n', { mode: 0o600 });
}
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'put', 'ADMIN_KEY'], {
  input: key + '\n', encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
});
if (result.status !== 0) {
  console.error('Não foi possível configurar o segredo na Cloudflare. Consulte o log local do Wrangler.');
  process.exit(1);
}
console.log('Código do organizador salvo localmente em .dev.vars e configurado como segredo na Cloudflare.');
