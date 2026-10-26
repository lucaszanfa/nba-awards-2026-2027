import {readFileSync} from 'node:fs';
import {buildModels,validateInput} from '../dist/forecast-engine.mjs';
// Each record must contain an archived pre-result input, never a reconstructed final-season input.
export function evaluate(records) {
  if(!Array.isArray(records)||!records.length)throw Error('Histórico vazio.');
  const summaries={};
  for(const record of records){
    if(!Number.isFinite(Date.parse(record.forecastAt))||!Number.isFinite(Date.parse(record.decidedAt))||Date.parse(record.forecastAt)>=Date.parse(record.decidedAt))throw Error('Use previsões arquivadas antes do resultado.');
    const input=validateInput(record.input);
    if(Object.values(input.categories).some(c=>Date.parse(c.source.updatedAt)>Date.parse(record.forecastAt)))throw Error('Fonte posterior à previsão: risco de vazamento temporal.');
    const models=buildModels(input);
    for(const [id,winner] of Object.entries(record.winners)) {
      const rows=models[id]?.candidates;if(!rows?.some(c=>c.id===winner))throw Error('Vencedor ausente da base histórica: '+id);
      const total=rows.reduce((s,c)=>s+c.strength,0);
      const p=rows.find(c=>c.id===winner).strength/total;
      const summary=summaries[id]||={samples:0,brier:0,logLoss:0,uniformLogLoss:0};summary.samples++;
      summary.brier+=rows.reduce((s,c)=>s+(c.strength/total-+(c.id===winner))**2,0);
      summary.logLoss-=Math.log(p);summary.uniformLogLoss+=Math.log(rows.length);
    }
  }
  return Object.fromEntries(Object.entries(summaries).map(([id,s])=>[id,{samples:s.samples,brier:s.brier/s.samples,logLoss:s.logLoss/s.samples,uniformLogLoss:s.uniformLogLoss/s.samples,calibrated:false}]));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/scripts/evaluate-forecasts.mjs')){
  try{console.log(JSON.stringify(evaluate(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
