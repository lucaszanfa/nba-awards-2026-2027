// Shared by the browser worker and the offline daily job. No network or storage.
export const awardIDs = ['mvp','roy','coy','clutch','sixth','mip','dpoy'];
export const conferenceIDs = ['east_champion','east_mvp','west_champion','west_mvp'];
export const MODEL_VERSION = 'pl-v1';
export const weights = {
  mvp:{pts: .22,ast:.12,reb:.10,efficiency:.20,winPct:.16,games:.10,rank:.10},
  roy:{pts:.25,ast:.15,reb:.10,efficiency:.15,minutes:.10,games:.10,rank:.15},
  coy:{winPct:.45,winImprovement:.25,aboveExpectation:.15,rank:.15},
  clutch:{clutchPts:.35,clutchEfficiency:.25,clutchWins:.25,rank:.15},
  sixth:{pts:.30,ast:.10,reb:.10,efficiency:.20,impact:.15,rank:.15},
  mip:{ptsImprovement:.30,efficiencyImprovement:.25,impactImprovement:.20,minutesImprovement:.10,rank:.15},
  dpoy:{defensiveImpact:.40,stl:.15,blk:.20,teamDefense:.15,rank:.10}
};
export function score(picks, results, points) {
  if (!picks) return 0;
  return awardIDs.reduce((total,id)=>total+(picks[id]??[]).reduce((sum,value,i)=>sum+(!value?0:results[id]?.[i]===value?points[id].exact[i]:results[id]?.includes(value)?points[id].wrong:0),0),0)
    +conferenceIDs.reduce((total,key)=>total+(picks.conferences?.[key]&&picks.conferences[key]===results.conferences?.[key]?(points.conferences?.[key]??10):0),0);
}
export function randomSeed(seed=202627) {
  let a=seed>>>0;
  return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
const finite = value=>typeof value==='number'&&Number.isFinite(value);
export function validateInput(input) {
  if(!input||input.season!=='2026-27'||!input.categories||typeof input.categories!=='object')throw Error('Informe season 2026-27 e categories.');
  if(JSON.stringify(input).length>400000)throw Error('Dados excedem 400 KB.');
  for(const [id,cat] of Object.entries(input.categories)) {
    if(![...awardIDs,...conferenceIDs].includes(id))throw Error('Categoria desconhecida: '+id);
    if(!cat.source||['name','url','permission','updatedAt'].some(k=>typeof cat.source[k]!=='string'||!cat.source[k].trim()||cat.source[k].length>2048)||!/^https:\/\//.test(cat.source.url)||!Number.isFinite(Date.parse(cat.source.updatedAt))||Date.parse(cat.source.updatedAt)>Date.now()+300000)throw Error('Fonte, URL HTTPS, autorização de uso e data válida são obrigatórias: '+id);
    if(!Array.isArray(cat.candidates)||cat.candidates.length>80||new Set(cat.candidates.map(c=>c.id)).size!==cat.candidates.length)throw Error('Use até 80 candidatos únicos por categoria.');
    if(cat.temperature!==undefined&&(!finite(cat.temperature)||cat.temperature<.2||cat.temperature>5))throw Error('Temperatura deve estar entre 0,2 e 5.');
    if(cat.sampleGames!==undefined&&(!finite(cat.sampleGames)||cat.sampleGames<0||cat.sampleGames>82))throw Error('Amostra de jogos inválida.');
    if(cat.weights&&Object.entries(cat.weights).some(([k,v])=>!Object.hasOwn(weights[id]||{strength:1},k)||!finite(v)||v<0||v>10))throw Error('Pesos inválidos.');
    if(cat.weights&&!Object.values(cat.weights).some(v=>v>0))throw Error('Ao menos um peso positivo é necessário.');
    for(const c of cat.candidates) {
      if(typeof c.id!=='string'||!c.id||!c.metrics||typeof c.metrics!=='object'||Object.values(c.metrics).some(v=>!finite(v)))throw Error('IDs e métricas numéricas são obrigatórios.');
      if(c.eligibility!==undefined&&!['eligible','pending','ineligible'].includes(c.eligibility))throw Error('Elegibilidade inválida.');
      if(c.metrics.rank!==undefined&&c.metrics.rank<1)throw Error('Ranking começa em 1.');
      if(['games','starts','remainingGames','qualifyingGames','qualifyingGames18'].some(k=>c.metrics[k]!==undefined&&(!Number.isInteger(c.metrics[k])||c.metrics[k]<0)))throw Error('Contagens de jogos inválidas.');
      if(c.metrics.starts>c.metrics.games)throw Error('Titularidades excedem jogos.');
    }
  }
  return structuredClone(input);
}
function eligibility(id,c) {
  const m=c.metrics;
  if(c.eligibility==='ineligible')return false;
  if(id==='roy'&&c.rookie!==true)return false;
  if(id==='sixth'&&finite(m.games)&&finite(m.starts)&&finite(m.remainingGames)&&m.games-m.starts+m.remainingGames<=m.starts)return false;
  // Game-count exceptions and minute thresholds require an explicit verified decision.
  if(['mvp','mip','dpoy'].includes(id)&&c.eligibility!=='eligible'&&finite(m.qualifyingGames)&&finite(m.remainingGames)&&m.qualifyingGames+m.remainingGames+Math.min(2,m.qualifyingGames18||0)<65)return false;
  return true;
}
export function buildModels(input={categories:{}}) {
  const models={};
  for(const [id,cat] of Object.entries(input.categories)) {
    const candidates=cat.candidates.filter(c=>eligibility(id,c));
    const w=cat.weights||weights[id]||{strength:1}, entries=Object.entries(w).filter(([,v])=>v>0), total=entries.reduce((s,[,v])=>s+v,0);
    const ranges=Object.fromEntries(entries.map(([key])=>{const a=candidates.map(c=>c.metrics[key]).filter(finite);return[key,[Math.min(...a),Math.max(...a)]];}));
    const rows=candidates.map(c=>{
      let coverage=0;
      const factors=entries.map(([key,weight])=>{
        const v=c.metrics[key],[lo,hi]=ranges[key],available=finite(v);
        if(available)coverage+=weight/total;
        let z=(!available||hi===lo) ? .5 : (v-lo)/(hi-lo);
        if(key==='rank'&&available&&hi!==lo)z=1-z;
        return {key,value:available?v:null,weight:weight/total,contribution:(z-.5)*weight/total};
      });
      const evidence=factors.reduce((s,f)=>s+f.contribution,0);
      const reliability=Math.min(1,(c.metrics.games??cat.sampleGames??10)/40);
      // Missing inputs shrink toward a flat prior, never toward a confident guess.
      const strength=Math.exp(4*evidence*(.25+.75*reliability)/(cat.temperature||1));
      return {...c,factors,coverage,strength,confidence:coverage>=.85&&reliability>=.8&&c.eligibility==='eligible'?'moderada':'baixa'};
    });
    models[id]={candidates:rows.filter(c=>c.coverage>0),source:cat.source,weights:w,calibrated:false};
  }
  return models;
}
// Enumerate Plackett–Luce ordered outcomes for exact conditioning and marginals.
export function distribution(model, fixed=[], size=3) {
  const rows=model?.candidates||[], ids=rows.map(c=>c.id), ws=rows.map(c=>c.strength), total=ws.reduce((a,b)=>a+b,0);
  if(rows.length<size||ws.some(w=>!finite(w)||w<=0))throw Error('Candidatos ou forças insuficientes.');
  if(new Set(fixed.filter(Boolean)).size!==fixed.filter(Boolean).length)throw Error('Cenário repete candidato.');
  const marginals=Object.fromEntries(ids.map(id=>[id,Array(size).fill(0)]));
  const outcomes=[];let mass=0;
  function visit(order,used,remaining,p) {
    const pos=order.length;
    if(pos===size){mass+=p;for(let k=0;k<size;k++)marginals[ids[order[k]]][k]+=p;if(fixed.some(Boolean))outcomes.push({ids:order.map(i=>ids[i]),cumulative:mass});return;}
    for(let i=0;i<rows.length;i++)if(!used.has(i)&&(!fixed[pos]||fixed[pos]===ids[i])){used.add(i);visit([...order,i],used,remaining-ws[i],p*ws[i]/remaining);used.delete(i);}
  }
  visit([],new Set(),total,1);
  if(!mass)throw Error('Cenário impossível ou resultado oficial ausente da base.');
  for(const a of Object.values(marginals))for(let k=0;k<size;k++)a[k]/=mass;
  return {mass,marginals,sample(rng){
    if(outcomes.length){const r=rng()*mass;let l=0,h=outcomes.length-1;while(l<h){const mid=(l+h)>>>1;if(outcomes[mid].cumulative<r)l=mid+1;else h=mid;}return [...outcomes[l].ids];}
    const available=rows.slice(),answer=[];for(let k=0;k<size;k++){let r=rng()*available.reduce((s,c)=>s+c.strength,0),i=0;while(i<available.length-1&&(r-=available[i].strength)>=0)i++;answer.push(available.splice(i,1)[0].id);}return answer;
  }};
}
export function simulate({models,participants,settings,iterations=100000,seed=202627,scenario={}}) {
  if(!Number.isInteger(iterations)||iterations<100||iterations>500000)throw Error('Use entre 100 e 500.000 simulações.');
  if(Object.keys(scenario).some(k=>![...awardIDs,...conferenceIDs].includes(k)))throw Error('Categoria de cenário inválida.');
  const samplers={},races={},missing=[];
  const official=settings.results;
  let allOfficial=true;
  for(const id of [...awardIDs,...conferenceIDs]) {
    const award=awardIDs.includes(id),size=award?3:1;
    const actual=award?(official[id]||['','','']):[official.conferences?.[id]||''];
    const condition=scenario[id]||[];
    if(!Array.isArray(condition)||condition.length>size||condition.some(v=>typeof v!=='string'))throw Error('Posições inválidas no cenário.');
    const fixed=Array.from({length:size},(_,k)=>{if(actual[k]&&condition[k]&&actual[k]!==condition[k])throw Error('Cenário contradiz resultado oficial.');return actual[k]||condition[k]||'';});
    const required=award?settings.points[id].exact.some(v=>v>0)||settings.points[id].wrong>0:(settings.points.conferences?.[id]??10)>0;
    if(actual.every(Boolean)){samplers[id]=()=>[...actual];races[id]=Object.fromEntries(actual.map((v,i)=>[v,Array.from({length:size},(_,j)=>+(i===j))]));continue;}
    allOfficial=false;
    if(!required&&!models[id]){samplers[id]=()=>actual;continue;}
    try {
      let model=models[id];
      // Official candidates remain in the pool even after a provider's eligibility filter.
      if(model){model={...model,candidates:[...model.candidates]};for(const v of actual.filter(Boolean))if(!model.candidates.some(c=>c.id===v))model.candidates.push({id:v,strength:1});}
      const d=distribution(model,fixed,size);samplers[id]=d.sample;races[id]=d.marginals;
    }catch(e){if(condition.some(Boolean))throw e;missing.push(id);}
  }
  if(!participants.length)return {status:'empty',participants:[],iterations:0,races,missing};
  if(missing.length)return {status:'insufficient',missing,participants:[],races,iterations:0};
  const rng=randomSeed(seed),stats=participants.map(p=>({...p,picks:undefined,currentScore:score(p.picks,official,settings.points),title:0,soleWins:0,tiedFirst:0,top3:0,sum:0,hist:new Map(),conditions:{}}));
  const winnerCounts={};
  for(let n=0;n<iterations;n++) {
    const results={conferences:{}};
    for(const id of awardIDs)results[id]=samplers[id](rng);
    for(const id of conferenceIDs)results.conferences[id]=samplers[id](rng)[0];
    const scores=participants.map(p=>score(p.picks,results,settings.points)),max=Math.max(...scores),ties=scores.filter(s=>s===max).length;
    for(const id of awardIDs){const key=id+':'+results[id][0];winnerCounts[key]=(winnerCounts[key]||0)+1;}
    for(let i=0;i<stats.length;i++) {
      const s=stats[i],v=scores[i],share=v===max?1/ties:0,above=scores.filter(x=>x>v).length,equal=scores.filter(x=>x===v).length;
      s.title+=share;s.soleWins+=+(v===max&&ties===1);s.tiedFirst+=+(v===max&&ties>1);s.top3+=Math.min(1,Math.max(0,3-above)/equal);s.sum+=v;s.hist.set(v,(s.hist.get(v)||0)+1);
      for(const id of awardIDs){const key=id+':'+results[id][0];s.conditions[key]=(s.conditions[key]||0)+share;}
    }
  }
  for(const s of stats) {
    const quantile=q=>{let count=0;for(const [v,n] of [...s.hist].sort((a,b)=>a[0]-b[0])){count+=n;if(count>=iterations*q)return v;}};
    s.winProbability=s.title/iterations;s.top3Probability=s.top3/iterations;s.meanScore=s.sum/iterations;s.scoreInterval=[quantile(.05),quantile(.95)];
    s.monteCarloSE=Math.sqrt(s.winProbability*(1-s.winProbability)/iterations);
    s.impacts=Object.entries(s.conditions).filter(([key])=>winnerCounts[key]>=100).map(([key,share])=>({key,samples:winnerCounts[key],probability:share/winnerCounts[key],delta:share/winnerCounts[key]-s.winProbability})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,8);
    s.currentRank=1+stats.filter(t=>t.currentScore>s.currentScore).length;
    delete s.hist;delete s.conditions;delete s.sum;
  }
  return {status:allOfficial?'official':'estimated',version:MODEL_VERSION,iterations,seed,races,missing:[],participants:stats.sort((a,b)=>b.winProbability-a.winProbability),tieRule:'Crédito de título dividido igualmente entre empatados; Top 3 divide vagas restantes entre empatados. O ranking real mantém empates.',assumption:'Prêmios independentes entre si; posições relacionadas pelo modelo Plackett–Luce. Estimativas não calibradas.'};
}
