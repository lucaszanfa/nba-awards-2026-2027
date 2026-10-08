import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.mjs';
import { awards, validatePicks, validatePoints, score } from '../worker/model.mjs';
import players from '../dist/players.json' with { type: 'json' };

const origin = 'https://lucaszanfa.github.io';
const admin = 'test-only-organizer-secret-'.padEnd(64, 'a');
const picks = Object.fromEntries(awards.map(id => [id, id === 'coy' ? ['coach-BOS', 'coach-BKN', 'coach-NYK'] : players.players.slice(0, 3).map(p => p.id)]));
// Executa o SQL real da API num SQLite em memória com a interface do D1.
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_bolao.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0002_public_entries.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql); let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return statement.get(...params) || null; },
        async all() { return { results: statement.all(...params) }; },
        async run() { const info = statement.run(...params); return { meta: { changes: info.changes } }; }
      };
    }
  };
  return { DB, ALLOWED_ORIGIN: origin, ADMIN_KEY: admin, DEADLINE: '2099-10-20T17:00:00.000Z', sqlite };
}
async function call(env, path, { token, method = 'GET', data, from = origin } = {}) {
  const headers = { Origin: from };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data) headers['Content-Type'] = 'application/json';
  const response = await worker.fetch(new Request('https://bolao.test' + path, { method, headers, ...(data ? { body: JSON.stringify(data) } : {}) }), env);
  return { status: response.status, data: response.status === 204 ? null : await response.json(), headers: response.headers };
}
async function invite(env, name) {
  const response = await call(env, '/admin/participants', { token: admin, method: 'POST', data: { name } });
  assert.equal(response.status, 200); return response.data;
}
test('convites, isolamento entre participantes, persistência e painel do organizador', async () => {
  const env = environment();
  const ana = await invite(env, 'Ana'), bruno = await invite(env, 'Bruno');
  assert.notEqual(ana.token, bruno.token);
  assert.equal(env.sqlite.prepare('SELECT token_hash FROM participants WHERE id = ?').get(ana.id).token_hash.length, 64);
  assert.notEqual(env.sqlite.prepare('SELECT token_hash FROM participants WHERE id = ?').get(ana.id).token_hash, ana.token);
  assert.equal((await call(env, '/me', { token: ana.token })).data.participant.picks, null);
  const sent = await call(env, '/picks', { token: ana.token, method: 'PUT', data: { picks, revision: 0 } });
  assert.equal(sent.status, 200); assert.equal(sent.data.revision, 1); assert.ok(sent.data.updatedAt);
  assert.deepEqual((await call(env, '/me', { token: ana.token })).data.participant.picks, picks);
  assert.equal((await call(env, '/me', { token: bruno.token })).data.participant.picks, null);
  const dashboard = await call(env, '/admin/dashboard', { token: admin });
  assert.equal(dashboard.data.participants.length, 2);
  assert.deepEqual(dashboard.data.participants.find(p => p.id === ana.id).picks, picks);
  assert.equal(JSON.stringify(dashboard.data).includes(ana.token), false);
  assert.equal((await call(env, '/admin/dashboard', { token: ana.token })).status, 401);
  assert.equal((await call(env, '/me')).status, 401);
  assert.equal((await call(env, '/me', { token: 'invalido' })).status, 401);
  env.sqlite.close();
});
test('encerramento e conflitos são protegidos no servidor, pontuação segue os resultados centrais', async () => {
  const env = environment(), user = await invite(env, 'Ana');
  await call(env, '/picks', { token: user.token, method: 'PUT', data: { picks, revision: 0 } });
  assert.equal((await call(env, '/picks', { token: user.token, method: 'PUT', data: { picks, revision: 0 } })).status, 409);
  const settings = (await call(env, '/me', { token: user.token })).data.settings;
  const central = { ...settings, results: picks, closed: true };
  assert.equal((await call(env, '/admin/settings', { token: user.token, method: 'PUT', data: central })).status, 401);
  assert.equal((await call(env, '/admin/settings', { token: admin, method: 'PUT', data: central })).status, 200);
  assert.equal((await call(env, '/picks', { token: user.token, method: 'PUT', data: { picks, revision: 1 } })).status, 423);
  assert.equal((await call(env, '/admin/settings', { token: admin, method: 'PUT', data: central })).status, 409);
  assert.equal((await call(env, '/admin/dashboard', { token: admin })).data.participants[0].score, 108);
  const reopen = { ...central, closed: false, revision: 1 };
  assert.equal((await call(env, '/admin/settings', { token: admin, method: 'PUT', data: reopen })).status, 200);
  assert.equal((await call(env, '/picks', { token: user.token, method: 'PUT', data: { picks, revision: 1 } })).status, 200);
  env.sqlite.close();
});
test('valida nomes, IDs, duplicatas, palpites incompletos, regras, origem e tamanho', async () => {
  const env = environment(), user = await invite(env, 'Ana');
  for (const bad of [{ ...picks, mvp: ['', '', ''] }, { ...picks, mvp: [picks.mvp[0], picks.mvp[0], picks.mvp[2]] }, { ...picks, mvp: ['inventado', ...picks.mvp.slice(1)] }, { ...picks, coy: picks.mvp }]) {
    assert.equal((await call(env, '/picks', { token: user.token, method: 'PUT', data: { picks: bad, revision: 0 } })).status, 400);
  }
  assert.equal((await call(env, '/admin/participants', { token: admin, method: 'POST', data: { name: '' } })).status, 400);
  assert.equal((await call(env, '/me', { token: user.token, from: 'https://other.test' })).status, 403);
  assert.equal((await call(env, '/me', { token: user.token })).headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal((await call(env, '/me', { method: 'OPTIONS' })).status, 204);
  assert.equal((await call(env, '/admin/participants', { token: admin, method: 'POST', data: { name: 'a'.repeat(17000) } })).status, 413);
  const settings = (await call(env, '/me', { token: user.token })).data.settings;
  assert.throws(() => validatePoints({ ...settings.points, mvp: { exact: [-1, 5, 3], wrong: 0 } }));
  assert.throws(() => validatePicks({ ...picks, mvp: [1, 2, 3] }));
  assert.equal((await call({ ...env, ADMIN_KEY: undefined }, '/admin/dashboard', { token: admin })).status, 503);
  env.sqlite.close();
});
test('pontuação parcial, posição diferente e posição exata não se somam', () => {
  const points = Object.fromEntries(awards.map(id => [id, { exact: [10, 5, 3], wrong: 2 }]));
  const blank = Object.fromEntries(awards.map(id => [id, ['', '', '']]));
  assert.equal(score(picks, blank, points), 0);
  assert.equal(score(picks, { ...blank, mvp: [picks.mvp[0], '', ''] }, points), 10);
  assert.equal(score(picks, { ...blank, mvp: [picks.mvp[1], picks.mvp[0], ''] }, points), 4);
  assert.equal(score(picks, picks, points), 108);
});
test('envio pelo nome sem código, ranking público e revelação somente depois do prazo', async () => {
  const env = environment();
  const empty = await call(env, '/public');
  assert.equal(empty.status, 200); assert.equal(empty.data.participants.length, 0);
  assert.equal(empty.data.settings.closed, false);
  const sent = await call(env, '/entries', { method: 'POST', data: { name: '  Ana  Silva ', picks } });
  assert.equal(sent.status, 200); assert.equal(sent.data.participant.name, 'Ana Silva');
  assert.equal((await call(env, '/entries', { method: 'POST', data: { name: 'ana silva', picks } })).status, 409);
  const before = await call(env, '/public');
  assert.equal(before.data.participants.length, 1);
  assert.equal(before.data.participants[0].name, 'Ana Silva');
  assert.equal('picks' in before.data.participants[0], false);
  assert.equal('token' in before.data.participants[0], false);
  assert.deepEqual((await call(env, '/me', { token: sent.data.token })).data.participant.picks, picks);
  const ended = { ...env, DEADLINE: '2000-10-20T17:00:00.000Z' };
  const after = await call(ended, '/public');
  assert.equal(after.data.settings.closed, true); assert.equal(after.data.settings.expired, true);
  assert.deepEqual(after.data.participants[0].picks, picks);
  assert.equal((await call(ended, '/entries', { method: 'POST', data: { name: 'Bruno', picks } })).status, 423);
  assert.equal((await call(ended, '/picks', { token: sent.data.token, method: 'PUT', data: { picks, revision: 1 } })).status, 423);
  const config = after.data.settings;
  await call(ended, '/admin/settings', { token: admin, method: 'PUT', data: { ...config, closed: false } });
  assert.equal((await call(ended, '/entries', { method: 'POST', data: { name: 'Bruno', picks } })).status, 423);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM participants').get().n, 1);
  env.sqlite.close();
});
