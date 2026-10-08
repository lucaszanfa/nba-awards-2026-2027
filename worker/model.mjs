import players from '../dist/players.json' with { type: 'json' };

export const awards = ['mvp', 'roy', 'coy', 'clutch', 'sixth', 'mip'];
const playerList = Array.isArray(players) ? players : players.players;
const playerIDs = new Set(playerList.map(p => p.id));
const coachIDs = new Set(playerList.map(p => `coach-${p.team}`));
export function validatePicks(input, complete = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Seleções inválidas.');
  const clean = {};
  for (const id of awards) {
    const values = input[id], allowed = id === 'coy' ? coachIDs : playerIDs;
    if (!Array.isArray(values) || values.length !== 3 ||
        values.some(v => typeof v !== 'string' || (v === '' ? complete : !allowed.has(v))) ||
        new Set(values.filter(Boolean)).size !== values.filter(Boolean).length) {
      throw new Error('Escolha três nomes diferentes e válidos em cada prêmio.');
    }
    clean[id] = [...values];
  }
  return clean;
}
export function validatePoints(input) {
  const clean = {};
  for (const id of awards) {
    const p = input?.[id];
    if (!p || !Array.isArray(p.exact) || p.exact.length !== 3 ||
        [...p.exact, p.wrong].some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1000000)) {
      throw new Error('Pontuação inválida.');
    }
    clean[id] = { exact: [...p.exact], wrong: p.wrong };
  }
  return clean;
}
export function score(picks, results, points) {
  if (!picks) return 0;
  return awards.reduce((total, id) => total + picks[id].reduce((sum, value, i) => {
    if (!value) return sum;
    return sum + (results[id][i] === value ? points[id].exact[i] : results[id].includes(value) ? points[id].wrong : 0);
  }, 0), 0);
}
