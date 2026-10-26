import players from '../dist/players.json' with { type: 'json' };

export const awards = ['mvp', 'roy', 'coy', 'clutch', 'sixth', 'mip', 'dpoy'];
const playerList = Array.isArray(players) ? players : players.players;
const playerIDs = new Set(playerList.map(p => p.id));
const coachIDs = new Set(playerList.map(p => `coach-${p.team}`));
export const conferenceFields = ['east_champion', 'east_mvp', 'west_champion', 'west_mvp'];
const east = new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NYK','ORL','PHI','TOR','WAS']);
const west = new Set(['DAL','DEN','GSW','HOU','LAC','LAL','MEM','MIN','NOP','OKC','PHX','POR','SAC','SAS','UTA']);
export function validateConferences(input = {}, complete = false) {
  const result = {};
  for (const key of conferenceFields) {
    const value = input[key] ?? '', teams = key.startsWith('east') ? east : west;
    if (typeof value !== 'string' || (value === '' ? complete : key.endsWith('champion') ? !teams.has(value) : !playerList.some(p => p.id === value && teams.has(p.team)))) throw Error('Selecione um time e um MVP válidos para cada conferência.');
    result[key] = value;
  }
  return result;
}
export function validatePicks(input, complete = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Seleções inválidas.');
  const clean = {};
  for (const id of awards) {
    const values = input[id] ?? (id === 'dpoy' && !complete ? ['', '', ''] : undefined), allowed = id === 'coy' ? coachIDs : playerIDs;
    if (!Array.isArray(values) || values.length !== 3 ||
        values.some(v => typeof v !== 'string' || (v === '' ? complete : !allowed.has(v))) ||
        new Set(values.filter(Boolean)).size !== values.filter(Boolean).length) {
      throw new Error('Escolha três nomes diferentes e válidos em cada prêmio.');
    }
    clean[id] = [...values];
  }
  clean.conferences = validateConferences(input.conferences, complete);
  return clean;
}
export function validatePoints(input) {
  const clean = {};
  for (const id of awards) {
    const p = input?.[id] ?? (id === 'dpoy' ? { exact: [10, 5, 3], wrong: 0 } : undefined);
    if (!p || !Array.isArray(p.exact) || p.exact.length !== 3 ||
        [...p.exact, p.wrong].some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1000000)) {
      throw new Error('Pontuação inválida.');
    }
    clean[id] = { exact: [...p.exact], wrong: p.wrong };
  }
  clean.conferences = {};
  for (const key of conferenceFields) {
    const value = input?.conferences?.[key] ?? 10;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw Error('Pontuação da conferência inválida.');
    clean.conferences[key] = value;
  }
  return clean;
}
export { score } from '../dist/forecast-engine.mjs';
