import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awardIDs,conferenceIDs,score,distribution,randomSeed,buildModels,simulate,validateInput} from '../dist/forecast-engine.mjs';
import {readAuthorizedSource,update} from '../scripts/update-forecasts.mjs';
import {evaluate} from '../scripts/evaluate-forecasts.mjs';
// Artificial data exclusively for mathematical tests, never shipped as NBA data.
const model={candidates:['a','b','c','d'].map((id,i)=>({id,strength:4-i}))};
const points=Object.fromEntries(awardIDs.map(id=>[id,{exact:[10,5,3],wrong:2}]));
points.conferences=Object.fromEntries(conferenceIDs.map(id=>[id,10]));
const picks=Object.fromEntries(awardIDs.map(id=>[id,['a','b','c']]));picks.conferences=Object.fromEntries(conferenceIDs.map(id=>[id,'a']));
const settings={points,results:{}};
const models=Object.fromEntries([...awardIDs,...conferenceIDs].map(id=>[id,model]));
const participants=[{id:'1',name:'One',picks},{id:'2',name:'Two',picks:{...picks,mvp:['d','b','c']}}];
const source={name:'Test fixture only',url:'https://example.org/test',permission:'Test-only synthetic data',updatedAt:new Date().toISOString()};
test('shared scoring: exact, wrong position, partial, legacy, conferences and configurable rules',()=>{
  assert.equal(score(picks,picks,points),166);
  assert.equal(score({mvp:['b','a','d']},{mvp:['a','b','c']},points),4);
  assert.equal(score({mvp:['a','','']},{mvp:['a','','']},points),10);
  assert.equal(score(null,picks,points),0);
  assert.equal(score(picks,picks,{...points,mvp:{exact:[20,5,3],wrong:0}}),176);
});
test('ordered probabilities normalize; no repeats; weighted joint samples match exact distribution',()=>{
  const d=distribution(model),rng=randomSeed(18),count={};
  for(let i=0;i<50000;i++){const top=d.sample(rng);assert.equal(new Set(top).size,3);count[top[0]]=(count[top[0]]||0)+1;}
  assert.ok(Math.abs(count.a/50000-.4)<.01);
  for(let k=0;k<3;k++)assert.ok(Math.abs(Object.values(d.marginals).reduce((s,p)=>s+p[k],0)-1)<1e-12);
  assert.equal(d.marginals.a[0],.4);
  const equal=distribution({candidates:['a','b','c'].map(id=>({id,strength:1}))});
  assert.ok(Math.abs(equal.marginals.a[2]-1/3)<1e-12);
});
test('second/third-place scenarios condition the full joint distribution, not forced sequential draws',()=>{
  const base=distribution(model),d=distribution(model,['','a','']),rng=randomSeed();
  assert.equal(d.marginals.a[1],1);
  const expected=(3/10*4/7)/base.marginals.a[1];
  assert.ok(Math.abs(d.marginals.b[0]-expected)<1e-12);
  for(let n=0;n<100;n++)assert.equal(d.sample(rng)[1],'a');
  assert.throws(()=>distribution(model,['a','a','']));
  assert.throws(()=>distribution(model,['unknown','','']));
});
test('100,000 simulations: conservation, reproducibility, intervals and incomplete picks',()=>{
  const result=simulate({models,participants:[...participants,{id:'3',name:'Empty',picks:{}}],settings,iterations:100000});
  assert.ok(Math.abs(result.participants.reduce((s,p)=>s+p.winProbability,0)-1)<1e-10);
  assert.ok(Math.abs(result.participants.reduce((s,p)=>s+p.top3Probability,0)-3)<1e-10);
  const empty=result.participants.find(p=>p.id==='3');assert.equal(empty.meanScore,0);
  for(const p of result.participants){assert.ok(p.scoreInterval[0]<=p.scoreInterval[1]);assert.ok(Number.isFinite(p.meanScore));}
  const args={models,participants,settings,iterations:1000,seed:7};assert.deepEqual(simulate(args),simulate(args));
});
test('ties split title credit and podium slots without adding real tiebreaks',()=>{
  const same=Array.from({length:4},(_,i)=>({id:String(i),name:String(i),picks}));
  const r=simulate({models,participants:same,settings,iterations:100});
  for(const p of r.participants){assert.equal(p.winProbability,.25);assert.equal(p.top3Probability,.75);assert.equal(p.soleWins,0);assert.equal(p.tiedFirst,100);}
});
test('official full/partial positions override models; final classification matches scoring',()=>{
  const official={points,results:picks};
  const r=simulate({models:{},participants,settings:official,iterations:100});
  assert.equal(r.status,'official');assert.equal(r.participants[0].meanScore,score(picks,picks,points));assert.equal(r.participants[0].winProbability,1);
  const partial=simulate({models,participants,settings:{points,results:{mvp:['','a','']}},iterations:100});assert.equal(partial.races.mvp.a[1],1);
  assert.throws(()=>simulate({models,participants,settings:official,scenario:{mvp:['d','','']},iterations:100}));
  const changed=simulate({models:{},participants,settings:{...official,points:{...points,mvp:{exact:[100,5,3],wrong:0}}},iterations:100});assert.equal(changed.participants[0].meanScore,256);
});
test('missing scoring categories block overall projection, including DPOY and conferences',()=>{
  const absent={...models};delete absent.dpoy;delete absent.east_mvp;
  const r=simulate({models:absent,participants,settings,iterations:100});assert.equal(r.status,'insufficient');assert.deepEqual(r.missing,['dpoy','east_mvp']);
  assert.equal(simulate({models,participants:[],settings,iterations:100}).status,'empty');
  assert.throws(()=>simulate({models,participants,settings,iterations:0}));
});
test('normalization resists units; missing fields reduce confidence; eligibility includes verified exceptions',()=>{
  const input={season:'2026-27',categories:{mvp:{source,weights:{pts:1},candidates:[{id:'a',metrics:{pts:10,games:40}},{id:'b',metrics:{pts:20,games:40}},{id:'c',metrics:{pts:30,games:40}}]}}};
  const a=buildModels(validateInput(input)).mvp;
  const scaled=structuredClone(input);scaled.categories.mvp.candidates.forEach(c=>c.metrics.pts*=1000);
  assert.deepEqual(a.candidates.map(c=>c.strength),buildModels(scaled).mvp.candidates.map(c=>c.strength));
  assert.equal(a.calibrated,false);assert.equal(a.candidates[0].confidence,'baixa');
  const eligibility={season:'2026-27',categories:{roy:{source,candidates:[{id:'a',rookie:false,metrics:{pts:10}},{id:'b',rookie:true,metrics:{pts:20}}]},sixth:{source,candidates:[{id:'a',metrics:{pts:10,games:82,starts:42,remainingGames:0}},{id:'b',metrics:{pts:20,games:82,starts:30,remainingGames:0}}]},mvp:{source,candidates:[{id:'a',metrics:{pts:10,qualifyingGames:60,remainingGames:0}},{id:'b',eligibility:'eligible',metrics:{pts:20,qualifyingGames:60,remainingGames:0}}]}}};
  const eligible=buildModels(validateInput(eligibility));for(const id of ['roy','sixth','mvp'])assert.deepEqual(eligible[id].candidates.map(c=>c.id),['b']);
  const noMetrics=buildModels({categories:{mvp:{source,candidates:[{id:'a',metrics:{}}]}}});assert.equal(noMetrics.mvp.candidates.length,0);
});
test('source validation rejects missing dates, unauthorized metadata and invalid weights',()=>{
  assert.throws(()=>validateInput({season:'2026-27',categories:{mvp:{source:{},candidates:[]}}}));
  assert.throws(()=>validateInput({season:'2026-27',categories:{mvp:{source,weights:{pts:-1},candidates:[]}}}));
});
test('historical evaluation calculates proper scores and rejects temporal leakage',()=>{
  const input={season:'2026-27',categories:{mvp:{source:{...source,updatedAt:'2026-01-01T00:00:00Z'},weights:{pts:1},candidates:['a','b','c'].map(id=>({id,metrics:{pts:20}}))}}};
  const record={input,forecastAt:'2026-02-01T00:00:00Z',decidedAt:'2026-05-01T00:00:00Z',winners:{mvp:'a'}};
  const result=evaluate([record]).mvp;assert.ok(Math.abs(result.brier-2/3)<1e-12);assert.ok(Math.abs(result.logLoss-Math.log(3))<1e-12);assert.equal(result.calibrated,false);
  assert.throws(()=>evaluate([{...record,forecastAt:'2025-01-01'}]));assert.throws(()=>evaluate([{...record,decidedAt:'2026-01-01'}]));
});
test('provider timeouts/HTTP failures preserve D1 last-valid data and still publish a report',async()=>{
  const snapshot={input:{season:'2026-27',categories:{}},participants:[],settings,fingerprint:'test',inputRevision:0};let writes=0;
  const fetcher=async(url,init)=>{
    if(url==='https://source.test')return new Response('',{status:429});
    if(url.endsWith('/admin/forecast-state'))return Response.json(snapshot);
    if(url.endsWith('/admin/forecasts')){writes++;assert.equal(JSON.parse(init.body).report.status,'empty');return Response.json({ok:true});}
    throw Error('Unexpected write');
  };
  await update({apiUrl:'https://api.test',adminKey:'test',sourceUrl:'https://source.test',fetcher});assert.equal(writes,1);
  assert.deepEqual(await readAuthorizedSource('https://source.test',{fetcher:async()=>new Response(null,{status:304})}),{unchanged:true});
  await assert.rejects(readAuthorizedSource('https://source.test',{fetcher:async()=>Response.json({garbage:true})}));
});
