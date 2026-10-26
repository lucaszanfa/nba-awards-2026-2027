'use strict';
(()=>{
  const nav=document.createElement('button');nav.dataset.view='previsoes';nav.innerHTML='↗ <span>Previsões do Campeonato</span>';$('nav').append(nav);
  const previousRender=render;
  let data=null,publicData=null,report=null,error='',busy=false,selected='',scenario={},scenarioActive=false,worker=null,job=0,loaded=false,iterations=100000;
  const pct=v=>(100*v).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  const number=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1});
  const stamp=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Sem atualização';
  const label=id=>AWARDS.find(a=>a[0]===id)?.[1]||CONFERENCE_FIELDS.find(a=>a[0]===id)?.[1]||id;
  const candidate=id=>lookup.get(id)?.name||NBA_DATA.players.find(p=>p.team===id)?.teamName||id;
  async function api(path,method='GET',payload){
    if(window.bolaoForecastRequest)return window.bolaoForecastRequest(path,method,payload);
    throw Error('Conexão com o bolão indisponível.');
  }
  function run(snapshot,conditions={}){
    return new Promise((resolve,reject)=>{
      worker?.terminate();worker=new Worker('forecast-worker.js?v=1');const id=++job;
      worker.onmessage=({data:message})=>{if(message.id!==id)return;worker.terminate();worker=null;message.error?reject(Error(message.error)):resolve(message.report);};
      worker.onerror=()=>{worker?.terminate();worker=null;reject(Error('Não foi possível executar o simulador.'));};
      worker.postMessage({id,input:snapshot.input,settings:snapshot.settings,participants:snapshot.participants,scenario:conditions,iterations});
    });
  }
  async function refresh(){
    if(busy)return;busy=true;error='';draw();
    try{
      [data,publicData]=await Promise.all([api('/forecasts'),api('/public')]);
      loaded=true;scenarioActive=false;scenario={};report=data.report;
      if(!data.locked&&(data.stale||!report))report=await run({...publicData,input:data.input});
    }catch(e){error=e.message;}finally{busy=false;draw();}
  }
  function titleTable(){
    if(data?.locked)return '<p class="forecast-notice">As projeções dos participantes serão exibidas após o prazo de revelação dos palpites.</p>';
    if(!report)return '<p>Nenhuma previsão disponível.</p>';
    if(report.status==='empty')return '<p>Aguardando participantes com palpites enviados.</p>';
    if(report.status==='insufficient')return '<p class="forecast-notice">Dados insuficientes para estimar o campeão geral. Faltam: '+report.missing.map(id=>esc(label(id))).join(', ')+'. Os palpites e resultados reais continuam preservados.</p>';
    const history=data.history||[],last=(data.stale||scenarioActive)?history.at(-1):history.at(-2);
    return '<p>'+esc(report.status==='official'?'Classificação pelos resultados oficiais.':'Estimativas independentes, não calibradas. Intervalo de pontos: percentis 5–95.')+'</p><div class="table-wrap"><table><thead><tr><th>PARTICIPANTE</th><th>CHANCE DE TÍTULO</th><th>PONTOS PROJETADOS</th><th>POSIÇÃO ATUAL</th><th>TOP 3</th><th>VARIAÇÃO</th></tr></thead><tbody>'+report.participants.map(p=>{
      const old=last?.participants.find(x=>x.id===p.id),delta=old?p.winProbability-old.winProbability:null;
      return '<tr><td><button class="forecast-person" data-person="'+esc(p.id)+'">'+esc(p.name)+'</button></td><td><strong>'+pct(p.winProbability)+'</strong><progress max="1" value="'+p.winProbability+'" aria-label="Chance de '+esc(p.name)+'"></progress></td><td>'+number(p.meanScore)+' <small>('+p.scoreInterval.map(number).join(' – ')+')</small></td><td>'+p.currentRank+'º · '+number(p.currentScore)+' pts</td><td>'+pct(p.top3Probability)+'</td><td>'+(delta===null?'Sem comparação':(delta>=0?'+':'')+number(delta*100)+' p.p.')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  }
  function races(){
    return '<div class="forecast-grid">'+AWARDS.map(([id,code,title])=>{
      const model=data?.models?.[id],rows=report?.races?.[id];
      const actual=publicData?.settings.results[id]||[];
      const candidates=rows?Object.keys(rows).map(key=>({id:key,prob:rows[key],details:model?.candidates.find(c=>c.id===key)})).sort((a,b)=>b.prob[0]-a.prob[0]).slice(0,5):[];
      return '<article class="forecast-card"><span class="award-code">'+code+'</span><h3>'+esc(title)+'</h3><p class="muted">'+esc(stamp(model?.source?.updatedAt))+(actual.every(Boolean)&&actual.length===3?' · Oficial':'')+'</p>'+(candidates.length?'<ol class="forecast-candidates">'+candidates.map(c=>{
        const p=lookup.get(c.id),d=c.details,old=data?.baselineRaces?.[id]?.[c.id]?.[0];
        const trend=old===undefined?'sem série comparável':(c.prob[0]>=old?'+':'')+number((c.prob[0]-old)*100)+' p.p. desde a previsão anterior';
        return '<li>'+portrait(p)+'<div><b>'+esc(candidate(c.id))+'</b><small>'+esc(p?.teamName||'')+'</small><strong>'+pct(c.prob[0])+' <small>1º</small></strong><small>2º '+pct(c.prob[1]||0)+' · 3º '+pct(c.prob[2]||0)+'</small><details><summary>Estatísticas e fatores</summary><p>Confiança '+esc(d?.confidence||'oficial')+' · Tendência: '+esc(trend)+'</p>'+[...(d?.factors||[])].sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).map(f=>'<p>'+esc(f.key)+': '+(f.value===null?'ausente':number(f.value))+' · peso '+pct(f.weight)+' · contribuição '+(f.contribution>=0?'+':'')+number(f.contribution)+'</p>').join('')+'</details></div></li>';
      }).join('')+'</ol>':'<p>Sem distribuição disponível. Importe dados verificáveis para esta categoria.</p>')+(model?'<p><a href="'+esc(model.source.url)+'" target="_blank" rel="noopener">'+esc(model.source.name)+'</a></p>':'')+'</article>';
    }).join('')+'</div>';
  }
  function historyChart(){
    const history=data?.history||[];
    if(history.length<2)return '<p>O gráfico aparecerá após duas atualizações persistidas. Nenhum histórico é inventado.</p>';
    const ids=[...new Set(history.flatMap(h=>h.participants.map(p=>p.id)))],colors=['#1565c0','#ce1640','#00846e','#813eb5','#a45500','#547000'];
    return '<div class="forecast-chart"><svg viewBox="0 0 800 260" role="img" aria-label="Evolução das chances de título em cada atualização"><text x="0" y="18">100%</text><text x="10" y="224">0%</text><path d="M50 20V220H780" fill="none" stroke="#aab8cb"/>'+ids.map((id,i)=>{
      const pts=history.map((h,k)=>{const p=h.participants.find(p=>p.id===id);return p?`${50+k/(history.length-1)*730},${220-p.winProbability*200}`:null;});
      return '<polyline fill="none" stroke="'+colors[i%colors.length]+'" stroke-width="2" points="'+pts.filter(Boolean).join(' ')+'"><title>'+esc(history.flatMap(h=>h.participants).find(p=>p.id===id)?.name)+'</title></polyline>';
    }).join('')+'</svg><p>'+esc(stamp(history[0].date))+' → '+esc(stamp(history.at(-1).date))+'</p><div class="forecast-legend">'+ids.map((id,i)=>'<span style="border-color:'+colors[i%colors.length]+'">'+esc(history.flatMap(h=>h.participants).find(p=>p.id===id)?.name)+'</span>').join('')+'</div></div><details><summary>Dados por atualização</summary>'+history.map(h=>'<p>'+esc(stamp(h.date))+': '+h.participants.map(p=>esc(p.name)+' '+pct(p.winProbability)).join(' · ')+'</p>').join('')+'</details>';
  }
  function individual(){
    const person=publicData?.participants.find(p=>p.id===selected),projection=report?.participants.find(p=>p.id===selected);
    if(!person?.picks)return '<p>Selecione um nome na tabela para analisar seus palpites.</p>';
    return '<h3>'+esc(person.name)+'</h3><div class="forecast-grid">'+AWARDS.map(([id,code])=>'<article class="forecast-card"><b>'+code+'</b><ol>'+[0,1,2].map(k=>{
      const pick=person.picks[id]?.[k],prob=report?.races?.[id]?.[pick]?.[k];
      return '<li>'+esc(candidate(pick||'Não informado'))+' · '+(prob===undefined?'sem estimativa':pct(prob)+' de acerto exato'+(prob<.15?' · maior risco relativo':''))+'</li>';
    }).join('')+'</ol></article>').join('')+'</div><h4>Resultados que influenciam a chance de título</h4>'+(projection?.impacts?.length?projection.impacts.map(v=>{const [id,pick]=v.key.split(':');return '<p>Se '+esc(candidate(pick))+' vencer '+esc(label(id))+': '+pct(v.probability)+' de título ('+(v.delta>=0?'+':'')+number(v.delta*100)+' p.p.; '+v.samples+' simulações).</p>';}).join(''):'<p>Amostra insuficiente para medir dependências.</p>')+'<p>Uma chance baixa ou nenhum triunfo simulado não comprova eliminação matemática.</p>'+(projection?'<p>Vitórias sem empate: '+projection.soleWins+' · Empates em primeiro: '+projection.tiedFirst+' · Crédito de vitórias: '+number(projection.title)+' · Erro Monte Carlo aproximado: ±'+number(196*projection.monteCarloSE)+' p.p. (95%, não inclui erro do modelo).</p>':'');
  }
  function draw(){
    if(view!=='previsoes')return;
    $('#section-label').textContent='PREVISÕES DO CAMPEONATO';
    $('#app').innerHTML=heading('Previsões do Campeonato.','A corrida pelos prêmios e o que cada resultado significa para o seu bolão.')+'<section class="forecast-page"><div class="forecast-toolbar"><button data-forecast="refresh" '+(busy?'disabled':'')+'>Atualizar previsões</button><label>Simulações <select id="forecast-iterations"><option value="100000">100.000</option><option value="10000">10.000</option><option value="250000">250.000</option></select></label><span role="status">'+(busy?'Processando…':esc(stamp(data?.updatedAt)))+'</span></div>'+(error?'<p role="alert" class="forecast-notice">'+esc(error)+'</p>':'')+(data?.staleSources?.length?'<p class="forecast-notice">Últimos dados válidos, desatualizados há mais de 48 horas: '+data.staleSources.map(id=>esc(label(id))).join(', ')+'.</p>':'')+(data?.stale?'<p>O relatório persistido precisa ser atualizado. O cálculo local usa os dados e regras atuais; o histórico muda ao publicar uma atualização.</p>':'')+(scenarioActive?'<p class="forecast-notice">Cenário hipotético ativo. Palpites e resultados oficiais permanecem preservados.</p>':'')+'<h2>Probabilidade de título</h2>'+titleTable()+'<h2>Corrida das premiações</h2>'+races()+'<h2>Evolução das probabilidades</h2>'+historyChart()+'<h2>Cenários de campeonato</h2><p>Fixe uma ou mais posições. Posições em branco continuam aleatórias; os resultados oficiais sempre prevalecem.</p><form id="forecast-scenario"><div class="forecast-grid">'+AWARDS.map(([id,code])=>'<fieldset><legend>'+code+'</legend>'+[0,1,2].map(k=>'<label>'+(k+1)+'º <select name="'+id+':'+k+'"><option value="">Sem condição</option>'+(data?.models?.[id]?.candidates||[]).map(c=>'<option value="'+esc(c.id)+'" '+(scenario[id]?.[k]===c.id?'selected':'')+'>'+esc(candidate(c.id))+'</option>').join('')+'</select></label>').join('')+'</fieldset>').join('')+'</div><button '+(busy||data?.locked?'disabled':'')+'>Calcular cenário</button> <button type="button" data-forecast="reset" '+(busy?'disabled':'')+'>Restaurar previsão</button></form><h2>Análise individual</h2>'+individual()+'<details class="forecast-method"><summary>Como calculamos as probabilidades?</summary><p>Estimativas independentes, não oficiais da NBA e ainda sem calibração histórica. Cada métrica é normalizada entre candidatos; pesos por prêmio combinam estatísticas e ranking complementar. Dados ausentes aproximam as forças de uma distribuição uniforme. A amostra de jogos reduz a confiança no início da temporada. Elegibilidade pendente deve ser confirmada pelo administrador.</p><p>O modelo Plackett–Luce sorteia posições sem repetir candidatos. Os prêmios e as conferências são considerados independentes entre si; essa hipótese pode subestimar relações reais. O modelo considera apenas os candidatos fornecidos. Rankings e pesos não são probabilidades calibradas.</p><p>'+esc(report?.tieRule||'Empates dividem igualmente o crédito estatístico de título e as vagas disponíveis no Top 3.')+'</p><p>'+number(report?.iterations||0)+' simulações. Intervalo de pontos de 90%; erro amostral não mede a incerteza do modelo.</p><details><summary>Pesos e fontes desta atualização</summary><pre>'+esc(JSON.stringify(Object.fromEntries(Object.entries(data?.models||{}).map(([id,m])=>[id,{weights:m.weights,source:m.source}])),null,2))+'</pre></details></details>'+(window.bolaoForecastIsAdmin?.()?'<details class="forecast-method"><summary>Administração das previsões</summary><p>Importe JSON no formato documentado em PREVISOES.md. Inclua somente dados reais com uso autorizado. Publicar grava uma fotografia no D1.</p><label>Arquivo de dados <input id="forecast-import" type="file" accept="application/json"></label><button data-forecast="publish" '+(busy?'disabled':'')+'>Recalcular e publicar no histórico</button></details>':'')+'</section>';
    $('#forecast-iterations').value=String(iterations);
    if(data?.collection?.status==='failed')$('#app .forecast-toolbar').insertAdjacentHTML('afterend','<p class="forecast-notice">A última coleta automática falhou em '+esc(stamp(data.collection.attemptedAt))+'. Exibindo os últimos dados válidos.</p>');
  }
  render=function(){previousRender();draw();if(view==='previsoes'&&!loaded&&!busy)refresh();};
  document.addEventListener('click',e=>{
    const p=e.target.closest('[data-person]');if(p){selected=p.dataset.person;draw();return;}
    const action=e.target.closest('[data-forecast]')?.dataset.forecast;
    if(action==='refresh'||action==='reset')refresh();
    if(action==='publish')publish();
  });
  async function publish(input){
    if(busy)return;busy=true;error='';draw();
    try{
      let snapshot=await api('/admin/forecast-state');
      if(input){await api('/admin/forecast-input','PUT',{input,revision:snapshot.inputRevision});snapshot=await api('/admin/forecast-state');}
      const result=await run(snapshot);
      await api('/admin/forecasts','POST',{fingerprint:snapshot.fingerprint,report:result});
      loaded=false;
    }catch(e){error=e.message;}finally{busy=false;if(!error)await refresh();else draw();}
  }
  document.addEventListener('change',async e=>{if(e.target.id==='forecast-iterations'){iterations=Number(e.target.value);return;}if(e.target.id!=='forecast-import')return;const file=e.target.files[0];if(!file)return;try{if(file.size>400000)throw Error('Arquivo deve ter até 400 KB.');await publish(JSON.parse(await file.text()));}catch(e){error=e.message;draw();}});
  document.addEventListener('submit',async e=>{
    if(e.target.id!=='forecast-scenario')return;e.preventDefault();if(busy)return;
    const conditions={};for(const [key,value]of new FormData(e.target)){if(!value)continue;const [id,k]=key.split(':');conditions[id]||=['','',''];conditions[id][Number(k)]=value;}
    busy=true;error='';draw();
    try{const current=await api('/public');if(!current.settings.expired)throw Error('Aguarde a revelação dos palpites.');publicData=current;report=await run({...current,input:data.input},conditions);scenario=conditions;scenarioActive=Object.keys(conditions).length>0;}catch(e){error=e.message;}finally{busy=false;draw();}
  });
  window.addEventListener('hashchange',()=>{if(location.hash==='#previsoes'){view='previsoes';render();}});
  window.addEventListener('bolao-updated',()=>{loaded=false;if(view==='previsoes')refresh();});
  if(location.hash==='#previsoes')view='previsoes';render();
})();
