'use strict';
const CONFERENCE_FIELDS=[['east_champion','Campeão do Leste','east','team'],['east_mvp','MVP da final do Leste','east','player'],['west_champion','Campeão do Oeste','west','team'],['west_mvp','MVP da final do Oeste','west','player']];
const EAST_TEAMS=new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NYK','ORL','PHI','TOR','WAS']);
const WEST_TEAMS=new Set(['DAL','DEN','GSW','HOU','LAC','LAL','MEM','MIN','NOP','OKC','PHX','POR','SAC','SAS','UTA']);
const conferenceDefaults=()=>Object.fromEntries(CONFERENCE_FIELDS.map(([id])=>[id,'']));
const conferencePoints=()=>Object.fromEntries(CONFERENCE_FIELDS.map(([id])=>[id,10]));
function conferenceName(id,value){return id.endsWith('champion')?NBA_DATA.players.find(p=>p.team===value)?.teamName||'—':lookup.get(value)?.name||'—';}
function conferenceSection(field){
  const values=state[field].conferences||conferenceDefaults();
  return '<section class="conference-section"><h2>Finais de conferência</h2><p>Escolha o campeão e o MVP das finais de cada conferência.</p><div class="grid">'+['east','west'].map(side=>{
    const teams=side==='east'?EAST_TEAMS:WEST_TEAMS;
    return '<article class="card"><h3>Conferência '+(side==='east'?'Leste':'Oeste')+'</h3>'+CONFERENCE_FIELDS.filter(([, ,s])=>s===side).map(([id,label,,kind])=>{
      const list=kind==='team'?[...new Map(NBA_DATA.players.filter(p=>teams.has(p.team)).map(p=>[p.team,{id:p.team,name:p.teamName}])).values()]:NBA_DATA.players.filter(p=>teams.has(p.team));
      list.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      return '<label class="conference-field">'+label+'<select data-conference="'+id+'" data-field="'+field+'"><option value="">Escolher '+(kind==='team'?'time':'jogador')+'</option>'+list.map(p=>'<option value="'+p.id+'" '+(values[id]===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>';
    }).join('')+'</article>';
  }).join('')+'</div></section>';
}
function conferencePointsSection(){return '<section class="conference-section"><h2>Pontuação das conferências</h2><p>Cada escolha certa recebe os pontos definidos abaixo.</p><div class="grid">'+CONFERENCE_FIELDS.map(([id,label])=>'<label class="card conference-field">'+label+'<input type="number" min="0" max="1000000" data-conference-points="'+id+'" value="'+(state.points.conferences?.[id]??10)+'"></label>').join('')+'</div></section>';}
