'use strict';
const CONFERENCE_FIELDS=[['east_champion','Campeão do Leste','east','team'],['east_mvp','MVP da final do Leste','east','player'],['west_champion','Campeão do Oeste','west','team'],['west_mvp','MVP da final do Oeste','west','player']];
const EAST_TEAMS=new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NYK','ORL','PHI','TOR','WAS']);
const WEST_TEAMS=new Set(['DAL','DEN','GSW','HOU','LAC','LAL','MEM','MIN','NOP','OKC','PHX','POR','SAC','SAS','UTA']);
const conferenceDefaults=()=>Object.fromEntries(CONFERENCE_FIELDS.map(([id])=>[id,'']));
const conferencePoints=()=>Object.fromEntries(CONFERENCE_FIELDS.map(([id])=>[id,10]));
function conferenceName(id,value){return id.endsWith('champion')?NBA_DATA.players.find(p=>p.team===value)?.teamName||'—':lookup.get(value)?.name||'—';}
const TEAM_IDS={ATL:1610612737,BOS:1610612738,BKN:1610612751,CHA:1610612766,CHI:1610612741,CLE:1610612739,DAL:1610612742,DEN:1610612743,DET:1610612765,GSW:1610612744,HOU:1610612745,IND:1610612754,LAC:1610612746,LAL:1610612747,MEM:1610612763,MIA:1610612748,MIL:1610612749,MIN:1610612750,NOP:1610612740,NYK:1610612752,OKC:1610612760,ORL:1610612753,PHI:1610612755,PHX:1610612756,POR:1610612757,SAC:1610612758,SAS:1610612759,TOR:1610612761,UTA:1610612762,WAS:1610612764};
function teamLogo(team){return '<span class="avatar team-logo"><span class="avatar-fallback">'+esc(team)+'</span><img src="assets/teams/'+team+'.svg" alt="" class="player-photo"></span>';}
function conferenceList(id){const definition=CONFERENCE_FIELDS.find(([key])=>key===id),teams=definition[2]==='east'?EAST_TEAMS:WEST_TEAMS;return(definition[3]==='team'?[...new Map(NBA_DATA.players.filter(p=>teams.has(p.team)).map(p=>[p.team,{id:p.team,name:p.teamName}])).values()]:NBA_DATA.players.filter(p=>teams.has(p.team))).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));}
function conferenceSection(field){
  const values=state[field].conferences||conferenceDefaults();
  return '<section class="conference-section"><h2>Finais de conferência</h2><p>Escolha o campeão e o MVP das finais de cada conferência.</p><div class="grid">'+['east','west'].map(side=>{
    const teams=side==='east'?EAST_TEAMS:WEST_TEAMS;
    return '<article class="card"><h3>Conferência '+(side==='east'?'Leste':'Oeste')+'</h3>'+CONFERENCE_FIELDS.filter(([, ,s])=>s===side).map(([id,label,,kind])=>{
      const value=values[id],selected=conferenceList(id).find(p=>p.id===value);
      return '<div class="conference-field"><span>'+label+'</span><button class="conference-pick pick" data-conference="'+id+'" data-field="'+field+'" aria-label="'+label+'">'+(selected?(kind==='team'?teamLogo(value):portrait(selected)):'<span class="empty-avatar">+</span>')+'<span class="pick-text"><b>'+(selected?esc(selected.name):'Escolher '+(kind==='team'?'time':'jogador'))+'</b><small>'+(kind==='team'?'Ver times e escudos':'Pesquisar jogador')+'</small></span><span class="plus">⌄</span></button></div>';
    }).join('')+'</article>';
  }).join('')+'</div></section>';
}
function conferencePointsSection(){return '<section class="conference-section"><h2>Pontuação das conferências</h2><p>Cada escolha certa recebe os pontos definidos abaixo.</p><div class="grid">'+CONFERENCE_FIELDS.map(([id,label])=>'<label class="card conference-field">'+label+'<input type="number" min="0" max="1000000" data-conference-points="'+id+'" value="'+(state.points.conferences?.[id]??10)+'"></label>').join('')+'</div></section>';}
const originalChoices=renderChoices;
renderChoices=function(){
  if(!active?.conference)return originalChoices();
  const id=active.conference,kind=CONFERENCE_FIELDS.find(([key])=>key===id)[3],term=normalized($('#search').value);
  const list=conferenceList(id).filter(p=>normalized(p.name+' '+(p.teamName||'')+' '+(p.team||p.id)).includes(term));
  $('#choices').innerHTML=list.length?list.map(p=>'<button class="candidate" data-conference-choice="'+p.id+'">'+(kind==='team'?teamLogo(p.id):portrait(p))+'<span><b>'+esc(p.name)+'</b><small>'+esc(kind==='team'?p.id:p.teamName)+'</small></span></button>').join(''):'<p class="muted">Nenhum nome encontrado.</p>';
};
$('#search').oninput=()=>renderChoices();
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-conference]');
  if(button&&!button.disabled&&window.bolaoCanEditConference?.(button.dataset.field)){
    const id=button.dataset.conference,definition=CONFERENCE_FIELDS.find(([key])=>key===id);active={conference:id,field:button.dataset.field};
    $('#picker-context').textContent=definition[1];$('.dialog-top h2').textContent=definition[3]==='team'?'Escolha o time campeão':'Escolha o MVP da conferência';
    $('#search').value='';$('#rookie-label').hidden=true;$('#rookie-label').style.display='none';renderChoices();$('#picker').showModal();$('#search').focus();
  }
  const candidate=event.target.closest('[data-conference-choice]');
  if(candidate&&active?.conference&&window.bolaoCanEditConference?.(active.field)){
    state[active.field].conferences||=conferenceDefaults();state[active.field].conferences[active.conference]=candidate.dataset.conferenceChoice;save();$('#picker').close();render();
  }
});
