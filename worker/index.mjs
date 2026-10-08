import { validatePicks, validatePoints, score } from './model.mjs';

class HTTPError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const encoder = new TextEncoder();
export async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
async function sameSecret(a, b) {
  const x = await hash(a), y = await hash(b);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return difference === 0;
}
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HTTPError(415, 'Envie JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new HTTPError(400, 'Requisição vazia.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) { await reader.cancel(); throw new HTTPError(413, 'Requisição muito grande.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HTTPError(400, 'JSON inválido.'); }
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new HTTPError(400, 'Versão inválida.');
  return value;
}
async function settings(db) {
  const row = await db.prepare('SELECT * FROM settings WHERE id = 1').first();
  if (!row) throw new HTTPError(503, 'Banco ainda não configurado.');
  return { results: JSON.parse(row.results), points: JSON.parse(row.points), closed: Boolean(row.closed), revision: row.revision };
}
async function auth(request, env, admin = false) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || token.length > 256) throw new HTTPError(401, 'Código de acesso inválido.');
  if (admin) {
    if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 32) throw new HTTPError(503, 'Acesso do organizador ainda não configurado.');
    if (!await sameSecret(token, env.ADMIN_KEY)) throw new HTTPError(401, 'Código do organizador inválido.');
    return;
  }
  const user = await env.DB.prepare('SELECT * FROM participants WHERE token_hash = ?').bind(await hash(token)).first();
  if (!user) throw new HTTPError(401, 'Convite inválido. Peça seu código ao organizador.');
  return user;
}
async function route(request, env) {
  const path = new URL(request.url).pathname, method = request.method;
  if (path === '/health' && method === 'GET') {
    await settings(env.DB);
    return { ok: true };
  }
  if (path === '/me' && method === 'GET') {
    const user = await auth(request, env);
    return { participant: { id: user.id, name: user.name, picks: user.picks ? JSON.parse(user.picks) : null, revision: user.revision, updatedAt: user.updated_at }, settings: await settings(env.DB) };
  }
  if (path === '/picks' && method === 'PUT') {
    const user = await auth(request, env), input = await body(request);
    let picks;
    try { picks = validatePicks(input.picks, true); } catch (e) { throw new HTTPError(400, e.message); }
    const changed = await env.DB.prepare(`UPDATE participants SET picks = ?, revision = revision + 1,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND revision = ?
      AND (SELECT closed FROM settings WHERE id = 1) = 0 RETURNING revision, updated_at`).bind(JSON.stringify(picks), user.id, revision(input.revision)).first();
    if (!changed) {
      if ((await settings(env.DB)).closed) throw new HTTPError(423, 'Os envios do bolão estão encerrados.');
      throw new HTTPError(409, 'Seu palpite mudou em outro dispositivo. Atualize antes de enviar novamente.');
    }
    return { revision: changed.revision, updatedAt: changed.updated_at };
  }
  if (path.startsWith('/admin/')) {
    await auth(request, env, true);
    if (path === '/admin/participants' && method === 'POST') {
      const input = await body(request), name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name || name.length > 60) throw new HTTPError(400, 'Nome deve ter de 1 a 60 caracteres.');
      const token = [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO participants (id, name, token_hash) VALUES (?, ?, ?)').bind(id, name, await hash(token)).run();
      return { id, name, token };
    }
    if (path === '/admin/settings' && method === 'PUT') {
      const input = await body(request);
      if (typeof input.closed !== 'boolean') throw new HTTPError(400, 'Estado dos envios inválido.');
      let results, points;
      try { results = validatePicks(input.results); points = validatePoints(input.points); }
      catch (e) { throw new HTTPError(400, e.message); }
      const changed = await env.DB.prepare('UPDATE settings SET results = ?, points = ?, closed = ?, revision = revision + 1 WHERE id = 1 AND revision = ?')
        .bind(JSON.stringify(results), JSON.stringify(points), Number(input.closed), revision(input.revision)).run();
      if (!changed.meta.changes) throw new HTTPError(409, 'As regras mudaram em outra sessão. Atualize antes de salvar.');
      return { settings: await settings(env.DB) };
    }
    if (path === '/admin/dashboard' && method === 'GET') {
      const config = await settings(env.DB);
      const { results } = await env.DB.prepare('SELECT id, name, picks, updated_at FROM participants ORDER BY name').all();
      const participants = results.map(row => {
        const picks = row.picks ? JSON.parse(row.picks) : null;
        return { id: row.id, name: row.name, picks, updatedAt: row.updated_at, score: score(picks, config.results, config.points) };
      }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'pt-BR'));
      return { settings: config, participants };
    }
  }
  throw new HTTPError(404, 'Rota não encontrada.');
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
    const headers = { 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    if (origin && !allowed.includes(origin)) return Response.json({ error: 'Origem não autorizada.' }, { status: 403, headers });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try { return Response.json(await route(request, env), { headers }); }
    catch (e) {
      if (!e.status) console.error('Falha interna no bolão:', e.message);
      return Response.json({ error: e.status ? e.message : 'Serviço indisponível. Tente novamente.' }, { status: e.status || 500, headers });
    }
  }
};
