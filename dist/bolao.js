'use strict';
(() => {
  const apiUrl = (window.BOLAO_CONFIG?.apiUrl || '').replace(/\/$/, '');
  let session=null, config=null, participants=[], dirty=false, busy=false, adminLogin=false, name='', offset=0, expiredFetched=false, loading=true;
  const originalRender=render;
  const panel=document.createElement('section'); panel.id='bolao-panel'; panel.className='bolao-panel'; panel.setAttribute('aria-label','Participar do bolão'); $('header').after(panel);
  $('.sidebar-bottom small').textContent='Preencha seu nome e clique em Enviar palpites.';
  const nav=document.createElement('button'); nav.dataset.view='bolao'; nav.innerHTML='♜ <span>Ranking</span>'; $('nav').append(nav);
  const stamp=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Ainda não enviado';
  const timeLeft=()=>Math.max(0,Date.parse(config?.deadline||'2026-10-20T17:00:00Z')-(Date.now()+offset));
  const closed=()=>loading||!config||config.closed||timeLeft()===0;
  function applySettings(next){config=next;offset=Date.parse(next.serverNow)-Date.now();state.results=structuredClone(next.results);state.points=structuredClone(next.points);}
  async function request(path,method='GET',payload){
    if(!apiUrl)throw Error('O bolão ainda não foi publicado.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(apiUrl+path,{method,signal:controller.signal,cache:'no-store',headers:{...(session?.token?{Authorization:`Bearer ${session.token}`} : {}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível acessar o bolão.');return data;
    }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('Não foi possível conectar ao bolão. Tente novamente; suas escolhas ainda não foram enviadas.');throw e;}finally{clearTimeout(timer);}
  }
  function remember(){try{if(session&&!session.admin)localStorage.setItem('nba-bolao-entry',JSON.stringify({token:session.token}));}catch{}}
  async function load(preserve=false){
    if(session?.admin){const data=await request('/admin/dashboard');participants=data.participants;applySettings(data.settings);}
    else{
      const data=await request('/public');participants=data.participants;applySettings(data.settings);
      if(session?.token&&!preserve){const own=await request('/me');session.participant=own.participant;state.picks=own.participant.picks||defaults().picks;name=own.participant.name;applySettings(own.settings);}
    }
    loading=false;
  }
  function table(){
    const rows=participants.filter(p=>p.picks||p.updatedAt);let rank=0,previous=null;
    return '<div class="table-wrap"><table><thead><tr><th>POSIÇÃO</th><th>NOME</th><th>PONTOS</th><th>ENVIADO EM</th><th>PALPITES</th></tr></thead><tbody>'+rows.map((p,i)=>{
      if(p.score!==previous)rank=i+1;previous=p.score;
      const detail=p.picks?'<details><summary>Ver palpites</summary>'+AWARDS.map(([id,code])=>'<p><b>'+code+'</b>: '+p.picks[id].map((v,n)=>(n+1)+'º '+esc(lookup.get(v)?.name||'—')).join(' · ')+'</p>').join('')+'</details>':'Disponíveis após o prazo';
      return '<tr><td>'+rank+'º</td><td>'+esc(p.name)+'</td><td>'+p.score+'</td><td>'+esc(stamp(p.updatedAt))+'</td><td>'+detail+'</td></tr>';
    }).join('')+(rows.length?'':'<tr><td colspan="5">Ninguém enviou palpites ainda.</td></tr>')+'</tbody></table></div>';
  }
  function tick(){const node=$('#bolao-timer');if(!node)return;const s=Math.ceil(timeLeft()/1000);node.textContent=s?`${Math.floor(s/86400)}d ${String(Math.floor(s%86400/3600)).padStart(2,'0')}h ${String(Math.floor(s%3600/60)).padStart(2,'0')}m ${String(s%60).padStart(2,'0')}s`:'Prazo encerrado';}
  function controls(){
    document.querySelectorAll('[data-view=resultados],[data-view=pontuacao]').forEach(b=>b.hidden=!session?.admin);
    panel.innerHTML='<div class="bolao-deadline"><strong>Envios até 20/10/2026, às 14h (Brasília)</strong><span id="bolao-timer" role="timer"></span></div>'+(session?.admin?
      `<strong>Painel do administrador</strong><p>Publique as regras e os resultados para atualizar o ranking.</p><div class="bolao-actions"><button data-bolao="settings">Publicar regras e resultados</button><button data-bolao="toggle">${config?.manuallyClosed?'Reabrir envios antes do prazo':'Encerrar envios antecipadamente'}</button><button data-bolao="refresh">Atualizar</button><button data-bolao="logout">Sair do admin</button></div>`:
      `<p>${loading?'Carregando bolão…':closed()?'Envios encerrados. '+(config?.expired?'Veja todos os palpites no ranking.':'Os palpites serão revelados ao fim do prazo.'):session?.participant?'Seu palpite foi enviado. Você pode alterar e enviar novamente até o prazo.':'Coloque seu nome, escolha os 18 nomes e clique em Enviar palpites.'}</p><label class="bolao-name">Seu nome<input id="participant-name" maxlength="60" placeholder="Seu nome completo" value="${esc(name)}" ${closed()||session?.participant?'disabled':''}></label><div class="bolao-actions"><button data-bolao="submit" ${closed()?'disabled':''}>${session?.participant?'Enviar alterações':'Enviar palpites'}</button><button data-bolao="refresh">Atualizar ranking</button><button data-bolao="admin">Acesso admin</button></div>${adminLogin?'<form id="bolao-login" class="bolao-form"><label>Código do administrador<input name="code" type="password" autocomplete="off" required maxlength="256"></label><button>Entrar como admin</button></form>':''}`);
    panel.querySelectorAll('button').forEach(b=>{if(busy)b.disabled=true;});
    document.querySelectorAll('[data-pick],[data-clear],[data-points]').forEach(e=>{e.disabled=busy||(session?.admin?e.dataset.field==='picks':e.dataset.field==='results'||e.matches('[data-points]')||closed());});
    $('#save-state').textContent=busy?'Enviando…':dirty?'Alterações não enviadas':session?.admin?'Administrador':session?.participant?'Palpites enviados':'Envie para participar';tick();
  }
  render=function(){
    if(!session?.admin&&['resultados','pontuacao'].includes(view))view='palpites';originalRender();
    if(view==='bolao'){$('#section-label').textContent='RANKING';$('#app').innerHTML=heading('Ranking do bolão.','Todos que enviaram aparecem aqui. A pontuação segue os resultados publicados pelo administrador.')+table();}
    else if(view==='palpites')$('#app').insertAdjacentHTML('beforeend','<section class="bolao-ranking"><h2>Ranking do bolão</h2><p>Os palpites de todos ficam disponíveis após o prazo.</p>'+table()+'</section>');
    controls();
  };
  // Escolhas apenas na memória; o banco só muda ao clicar em Enviar.
  save=function(){dirty=true;$('#save-state').textContent='Alterações não enviadas';};
  window.bolaoImport=next=>{if(!session?.admin&&closed())throw Error('O prazo para preencher está encerrado.');return session?.admin?{...next,picks:state.picks}:{...next,results:state.results,points:state.points};};
  async function perform(action){if(busy)return;busy=true;controls();try{await action();}catch(e){toast(e.message);}finally{busy=false;render();}}
  document.addEventListener('input',e=>{if(e.target.id==='participant-name')name=e.target.value;});
  document.addEventListener('submit',e=>{
    if(e.target.id!=='bolao-login')return;e.preventDefault();const token=String(new FormData(e.target).get('code')).trim();
    perform(async()=>{const previous=session;session={token,admin:true};try{await load();dirty=false;view='bolao';location.hash=view;adminLogin=false;}catch(error){session=previous;throw error;}});
  });
  document.addEventListener('click',e=>{
    const action=e.target.closest('[data-bolao]')?.dataset.bolao;if(!action)return;
    if(action==='admin'){adminLogin=!adminLogin;controls();return;}
    if(action==='logout'){if(dirty&&!confirm('Sair sem publicar as alterações?'))return;session=null;state=defaults();dirty=false;view='palpites';location.hash=view;perform(async()=>{await load();});return;}
    perform(async()=>{
      if(action==='refresh'){if(session?.admin&&dirty&&!confirm('Descartar alterações locais e atualizar?'))return;await load(true);if(session?.admin)dirty=false;return;}
      if(action==='submit'){
        if(closed())throw Error('O prazo para enviar está encerrado.');if(!name.trim())throw Error('Coloque seu nome antes de enviar.');if(AWARDS.some(([id])=>state.picks[id].some(v=>!v)))throw Error('Complete as 18 escolhas antes de enviar.');
        if(session?.participant){const result=await request('/picks','PUT',{picks:state.picks,revision:session.participant.revision});Object.assign(session.participant,result,{picks:structuredClone(state.picks)});}
        else{const result=await request('/entries','POST',{name,picks:state.picks});session={token:result.token,participant:result.participant,admin:false};name=result.participant.name;remember();}
        dirty=false;await load(true);toast('Palpites enviados! Seu nome está no ranking.');return;
      }
      if(action==='settings'||action==='toggle'){
        const manual=action==='toggle'?!config.manuallyClosed:config.manuallyClosed;if(action==='toggle'&&!confirm(manual?'Encerrar os envios antecipadamente?':'Reabrir os envios? O prazo de 20/10 às 14h continuará valendo.'))return;
        const result=await request('/admin/settings','PUT',{results:state.results,points:state.points,closed:manual,revision:config.revision});applySettings(result.settings);dirty=false;await load();toast('Bolão atualizado.');
      }
    });
  });
  document.addEventListener('click',e=>{const target=e.target.closest('[data-pick],[data-clear],[data-candidate]');if(!target)return;const field=target.dataset.field||active?.field;if(busy||(session?.admin?field==='picks':field==='results'||closed())){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('hashchange',()=>{if(location.hash==='#bolao'){view='bolao';render();}});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  setInterval(()=>{tick();if(config&&timeLeft()===0&&!expiredFetched&&!busy){expiredFetched=true;config.closed=true;$('#picker').close();render();perform(async()=>{try{await load(true);}catch(e){expiredFetched=false;throw e;}});}},1000);
  if(location.hash==='#bolao')view='bolao';state=defaults();
  try{const saved=localStorage.getItem('nba-bolao-entry')||sessionStorage.getItem('nba-bolao-session');if(saved)session={...JSON.parse(saved),admin:false};}catch{}
  render();perform(async()=>{try{await load();}catch(e){if(session){session=null;await load();}else throw e;}});
})();
