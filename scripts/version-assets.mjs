import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const htmlPath = resolve('dist/index.html');
const html = readFileSync(htmlPath, 'utf8').replace(/((?:src|href)=")([^"?]+\.(?:js|css))(?:\?[^"\s]*)?(")/g, (_, prefix, asset, suffix) => {
  const version = createHash('sha256').update(readFileSync(resolve('dist', asset))).digest('hex').slice(0, 12);
  return prefix + asset + '?v=' + version + suffix;
});
writeFileSync(htmlPath, html);
console.log('Referências de scripts e estilos atualizadas para evitar versões antigas no cache.');
