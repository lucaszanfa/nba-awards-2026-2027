import { spawnSync } from 'node:child_process';
const owner = 'lucaszanfa', repo = 'nba-awards-2026-2027';
function git(args, input) {
  const result = spawnSync('git', args, { input, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (result.status !== 0) throw new Error('Falha no Git: ' + result.stderr.replace(/https:\/\/[^@\s]+@/g, 'https://'));
  return result.stdout.trim();
}
const raw = git(['credential', 'fill'], 'protocol=https\nhost=github.com\n\n');
const token = raw.match(/^password=(.+)$/m)?.[1];
if (!token) throw new Error('Entre na conta GitHub pelo gerenciador de credenciais.');
async function github(path, method = 'GET', data) {
  const response = await fetch('https://api.github.com' + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  const result = response.status === 204 ? null : await response.json();
  return { status: response.status, result };
}
const user = await github('/user');
if (user.result?.login?.toLowerCase() !== owner) throw new Error('A conta GitHub conectada não é ' + owner + '.');
let repository = await github(`/repos/${owner}/${repo}`);
if (repository.status === 404) {
  repository = await github('/user/repos', 'POST', { name: repo, description: 'Bolão entre amigos dos NBA Awards 2026–2027', private: false, auto_init: false });
  if (repository.status !== 201) throw new Error('Não foi possível criar o repositório: ' + (repository.result?.message || repository.status));
  console.log('Repositório público criado: ' + repository.result.html_url);
} else if (repository.status !== 200) throw new Error('Não foi possível consultar o repositório.');
const remote = `https://github.com/${owner}/${repo}.git`;
git(['rev-parse', '--git-dir']);
const configuredRemote = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
if (configuredRemote.status !== 0) git(['remote', 'add', 'origin', remote]);
else if (configuredRemote.stdout.trim() !== remote) throw new Error('O origin local aponta para outro repositório.');
// O push comum recusa sobrescrever um histórico remoto diferente.
git(['push', '-u', 'origin', 'main']);
console.log('Arquivos publicados no GitHub.');
let pages = await github(`/repos/${owner}/${repo}/pages`);
if (pages.status === 404) {
  pages = await github(`/repos/${owner}/${repo}/pages`, 'POST', { build_type: 'workflow' });
  if (pages.status !== 201 && pages.status !== 409) throw new Error('Ative Pages em Settings → Pages → GitHub Actions. API: ' + (pages.result?.message || pages.status));
} else if (pages.status === 200 && pages.result.build_type !== 'workflow') {
  pages = await github(`/repos/${owner}/${repo}/pages`, 'PUT', { build_type: 'workflow' });
  if (pages.status !== 204 && pages.status !== 200) throw new Error('Configure Pages para GitHub Actions.');
} else if (pages.status !== 200) throw new Error('Não foi possível verificar GitHub Pages.');
const dispatch = await github(`/repos/${owner}/${repo}/actions/workflows/pages.yml/dispatches`, 'POST', { ref: 'main' });
if (dispatch.status !== 204) console.log('A publicação foi enviada por push. Se necessário, execute o workflow Pages no GitHub.');
else console.log('Publicação no GitHub Pages iniciada.');
