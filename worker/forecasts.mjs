import players from '../dist/players.json' with {type:'json'};
import {validateInput,buildModels,awardIDs,conferenceIDs,MODEL_VERSION} from '../dist/forecast-engine.mjs';
import {forecastIdentity} from './github-oidc.mjs';
const east=new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NYK','ORL','PHI','TOR','WAS']);
const playerList=players.players||players;
function fail(status,message){throw Object.assign(Error(message),{status});}
export async function forecastRoute(request,env,{auth,settings,body,hash}) {
  const path=new URL(request.url).pathname;
  if(!['/forecasts','/admin/forecast-state','/admin/forecast-input','/admin/forecasts'].includes(path))return;
  const admin=path.startsWith('/admin/');
  if(admin&&!await forecastIdentity(request,env))await auth(request,env,true);
  const config=await settings(env.DB,env);
  const row=await env.DB.prepare('SELECT * FROM forecast_input WHERE id = 1').first();
  const input=row?JSON.parse(row.payload):{season:'2026-27',categories:{}};
  const {results:rows}=await env.DB.prepare('SELECT id, name, picks, updated_at FROM participants WHERE picks IS NOT NULL ORDER BY id').all();
  const participants=rows.map(p=>({...p,picks:JSON.parse(p.picks)}));
  const fingerprint=await hash(JSON.stringify({version:MODEL_VERSION,input,participants,results:config.results,points:config.points}));
  if(path==='/admin/forecast-input'&&request.method==='PUT') {
    const payload=await body(request,450000);let clean;
    try{clean=validateInput(payload.input);}catch(e){fail(400,e.message);}
    if(!Number.isSafeInteger(payload.revision)||payload.revision<0)fail(400,'Versão inválida.');
    for(const [id,cat] of Object.entries(clean.categories))for(const c of cat.candidates){
      const isConference=conferenceIDs.includes(id),side=id.startsWith('east')?east:new Set(playerList.map(p=>p.team).filter(t=>!east.has(t)));
      const valid=id==='coy'?playerList.some(p=>'coach-'+p.team===c.id):isConference&&id.endsWith('champion')?side.has(c.id):playerList.some(p=>p.id===c.id&&(!isConference||side.has(p.team)));
      if(!valid)fail(400,'Candidato incompatível com a base/categoria: '+c.id);
    }
    const now=new Date().toISOString();
    if(row){
      const updated=await env.DB.prepare('UPDATE forecast_input SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?').bind(JSON.stringify(clean),now,payload.revision).run();
      if(!updated.meta.changes)fail(409,'Os dados mudaram. Atualize antes de importar.');
    }else{
      if(payload.revision!==0)fail(409,'Versão inválida para criação.');
      const inserted=await env.DB.prepare('INSERT OR IGNORE INTO forecast_input (id,payload,revision,updated_at) VALUES (1,?,1,?)').bind(JSON.stringify(clean),now).run();
      if(!inserted.meta.changes)fail(409,'Os dados mudaram. Atualize antes de importar.');
    }
    return {ok:true};
  }
  if(path==='/admin/forecast-state'&&request.method==='GET')return {input,inputRevision:row?.revision||0,participants,settings:config,fingerprint};
  if(path==='/admin/forecasts'&&request.method==='POST') {
    const payload=await body(request,550000);
    if(payload.fingerprint!==fingerprint)fail(409,'Palpites, resultados ou fontes mudaram; recalcule.');
    const report=payload.report;
    if(!report||!['estimated','official','insufficient','empty'].includes(report.status)||!Array.isArray(report.participants)||JSON.stringify(report).length>500000||JSON.stringify(report).includes('token'))fail(400,'Relatório inválido ou maior que 500 KB.');
    if(report.participants.some(p=>!participants.some(x=>x.id===p.id)||!Number.isFinite(p.winProbability)||p.winProbability<0||p.winProbability>1||p.picks))fail(400,'Participantes inválidos.');
    await env.DB.prepare('INSERT INTO forecast_history (fingerprint,report,created_at) VALUES (?,?,?)').bind(fingerprint,JSON.stringify(report),new Date().toISOString()).run();
    await env.DB.prepare('DELETE FROM forecast_history WHERE id NOT IN (SELECT id FROM forecast_history ORDER BY id DESC LIMIT 370)').run();
    return {ok:true};
  }
  if(path==='/forecasts'&&request.method==='GET') {
    const {results:history}=await env.DB.prepare('SELECT id, fingerprint, report, created_at FROM forecast_history ORDER BY id DESC LIMIT 370').all();
    const latest=history[0];
    const staleSources=Object.entries(input.categories).filter(([,c])=>Date.now()-Date.parse(c.source.updatedAt)>48*3600000).map(([id])=>id);
    return {input,models:buildModels(input),inputUpdatedAt:row?.updated_at||null,staleSources,collection:latest?JSON.parse(latest.report).collection:null,
      baselineRaces:history[latest?.fingerprint===fingerprint?1:0]?JSON.parse(history[latest?.fingerprint===fingerprint?1:0].report).races:null,
      locked:!config.expired,stale:!latest||latest.fingerprint!==fingerprint,
      report:config.expired&&latest?JSON.parse(latest.report):null,updatedAt:latest?.created_at||null,
      history:config.expired?history.map(h=>({date:h.created_at,participants:JSON.parse(h.report).participants.map(p=>({id:p.id,name:p.name,winProbability:p.winProbability}))})).reverse():[]};
  }
  fail(405,'Método não permitido.');
}
