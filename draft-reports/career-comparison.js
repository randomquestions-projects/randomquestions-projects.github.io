(function(root){
'use strict';
const $=id=>document.getElementById(id);
const metrics={NFL:{passing_yards:'Passing yards',passing_tds:'Passing TDs',passing_interceptions:'Passing interceptions',scrimmage_yards:'Scrimmage yards',scrimmage_tds:'Scrimmage TDs',rushing_yards:'Rushing yards',rushing_tds:'Rushing TDs',receiving_yards:'Receiving yards',receiving_tds:'Receiving TDs',receptions:'Receptions',def_sacks:'Sacks',def_interceptions:'Defensive interceptions',def_tackles_solo:'Solo tackles',fg_made:'Field goals made'},NBA:{points:'Points',rebounds:'Rebounds',assists:'Assists',steals:'Steals',blocks:'Blocks',minutes:'Minutes'}};
const nflGroup={QB:['passing_yards','passing_tds','passing_interceptions','rushing_yards'],RB:['scrimmage_yards','scrimmage_tds','rushing_yards','rushing_tds','receiving_yards','receiving_tds','receptions'],WR:['receiving_yards','receiving_tds','receptions'],TE:['receiving_yards','receiving_tds','receptions'],DL:['def_sacks','def_tackles_solo'],LB:['def_tackles_solo','def_sacks','def_interceptions'],DB:['def_interceptions','def_tackles_solo'],ST:['fg_made']};
const cache=new Map(),states=new Map(),loading=new Map(),errors=new Map();
let active=null,wired=false;
const el=(tag,s)=>{const x=document.createElement(tag);if(s!==undefined)x.textContent=s;return x;};
const opt=(value,label)=>{const x=el('option',label);x.value=value;return x;};
const fmt=n=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:1}):'—';
function checkpoint(p,b,n){return p?.[b]?.find(x=>x.n===n)?.stats||null;}
function suggest(d,p,b,n){return d.players.filter(q=>q.id!==p.id&&(d.league!=='NFL'||q.position===p.position)&&checkpoint(q,b,n)&&(q.hof_source_flag||Number.isFinite(q.quality)&&q.quality>=85)).sort((a,b)=>(Number(b.hof_source_flag||false)-Number(a.hof_source_flag||false))||((b.quality??-1)-(a.quality??-1))||a.name.localeCompare(b.name)).slice(0,4).map(q=>q.id);}
function fill(select,items,value){select.replaceChildren(...items.map(x=>opt(x[0],x[1])));if(items.some(x=>x[0]===String(value)))select.value=String(value);}
function getState(d){if(!states.has(d.league)){const name=d.league==='NFL'?'Justin Jefferson':'Victor Wembanyama';const p=d.players.find(x=>x.name===name)||d.players[0];states.set(d.league,{focus:p.id,basis:'seasons',stage:p.seasons.at(-1)?.n||1,metric:d.league==='NFL'?'receiving_yards':'points',peers:[]});const s=states.get(d.league);s.peers=suggest(d,p,s.basis,s.stage);}return states.get(d.league);}
function update(){if(active&&cache.has(active))paint(cache.get(active));}
function wire(){if(wired)return;wired=true;
 $('compare-player').onchange=()=>{const d=cache.get(active),s=getState(d);s.focus=$('compare-player').value;const p=d.players.find(x=>x.id===s.focus);s.stage=p[s.basis].at(-1)?.n||p.seasons.at(-1)?.n||1;s.peers=suggest(d,p,s.basis,s.stage);update();};
 $('compare-basis').onchange=()=>{const d=cache.get(active),s=getState(d);s.basis=$('compare-basis').value;s.stage=d.players.find(p=>p.id===s.focus)[s.basis].at(-1)?.n||1;update();};
 $('compare-stage').onchange=()=>{getState(cache.get(active)).stage=Number($('compare-stage').value);update();};
 $('compare-metric').onchange=()=>{getState(cache.get(active)).metric=$('compare-metric').value;update();};
 $('compare-add').onclick=()=>{const s=getState(cache.get(active)),id=$('compare-peer').value;if(id&&id!==s.focus&&!s.peers.includes(id)&&s.peers.length<5)s.peers.push(id);update();};
 $('compare-greats').onclick=()=>{const d=cache.get(active),s=getState(d),p=d.players.find(x=>x.id===s.focus);s.peers=suggest(d,p,s.basis,s.stage);update();};
}
function paint(d){const s=getState(d),p=d.players.find(x=>x.id===s.focus),sorted=[...d.players].sort((a,b)=>a.name.localeCompare(b.name));if(!p)return;
 fill($('compare-player'),sorted.map(q=>[q.id,q.name+' · '+q.position]),s.focus);
 if(!p.games.length&&s.basis==='games')s.basis='seasons';$('compare-basis').value=s.basis;$('compare-basis').querySelector('option[value=games]').disabled=!p.games.length;
 const stages=p[s.basis];if(!stages.some(x=>x.n===s.stage))s.stage=stages.at(-1)?.n||1;
 fill($('compare-stage'),stages.map(x=>[String(x.n),'First '+x.n+' '+s.basis]),s.stage);
 const focusStats=checkpoint(p,s.basis,s.stage)||{}, keys=(d.league==='NFL'?(nflGroup[p.position]||Object.keys(metrics.NFL)):Object.keys(metrics.NBA)).filter(k=>Number.isFinite(focusStats[k]));
 if(!keys.includes(s.metric))s.metric=keys[0]||'';
 fill($('compare-metric'),keys.map(k=>[k,metrics[d.league][k]]),s.metric);
 fill($('compare-peer'),[['','Choose a player'],...sorted.filter(q=>q.id!==p.id&&!s.peers.includes(q.id)&&(d.league!=='NFL'||q.position===p.position)&&checkpoint(q,s.basis,s.stage)).map(q=>[q.id,q.name])],'');
 $('compare-add').disabled=s.peers.length>=5;
 const people=[p,...s.peers.map(id=>d.players.find(q=>q.id===id)).filter(Boolean)];const status=$('compare-status');status.textContent=d.players.length.toLocaleString()+' players · '+d.audit.game_verified_players.toLocaleString()+' with verified game milestones · '+(p.games.length?'Exact game checkpoints available for '+p.name:'Game milestones unavailable for '+p.name+'; seasons only.');
 const selected=$('compare-selected');selected.replaceChildren();for(const q of people.slice(1)){let b=el('button',q.name+' ×');b.type='button';b.className='view-toggle';b.onclick=()=>{s.peers=s.peers.filter(id=>id!==q.id);update();};selected.appendChild(b);}
 const head=$('compare-head'),body=$('compare-rows');head.replaceChildren();body.replaceChildren();let tr=el('tr');for(const name of ['PLAYER','GAMES (IF KNOWN)',...keys.map(k=>metrics[d.league][k]),'Δ '+(metrics[d.league][s.metric]||'STAT')+' VS FOCUS'])tr.appendChild(el('th',name));head.appendChild(tr);
 for(const q of people){let st=checkpoint(q,s.basis,s.stage),row=el('tr');row.appendChild(el('td',q.name+(q.id===p.id?' (focus)':'')));row.appendChild(el('td',st?fmt(s.basis==='games'?s.stage:st.games):'Not reached'));for(const k of keys)row.appendChild(el('td',fmt(st?.[k])));let delta=st?.[s.metric]-focusStats[s.metric];row.appendChild(el('td',q.id===p.id?'—':Number.isFinite(delta)?(delta>0?'+':'')+fmt(delta):'—'));body.appendChild(row);}
 chart(people,s,metrics[d.league][s.metric]||'Statistic');
}
function chart(people,s,label){const host=$('compare-chart');host.replaceChildren();const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 640 300');svg.setAttribute('role','img');svg.setAttribute('aria-label','Cumulative '+label+' by '+s.basis);svg.style.cssText='width:100%;min-width:320px;max-height:360px';
 const series=people.map(p=>({name:p.name,points:p[s.basis].filter(x=>x.n<=s.stage&&Number.isFinite(x.stats[s.metric])).map(x=>[x.n,x.stats[s.metric]])}));const max=Math.max(1,...series.flatMap(x=>x.points.map(p=>p[1]))),min=Math.min(0,...series.flatMap(x=>x.points.map(p=>p[1]))),colors=['#158f77','#d49a35','#5c91d8','#b986c9','#d76c69','#8b9e5b'];const X=n=>60+555*n/Math.max(1,s.stage),Y=v=>235-200*(v-min)/(max-min||1);
 function node(tag,attr,txt){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attr))e.setAttribute(k,v);if(txt)e.textContent=txt;svg.appendChild(e);}
 for(let i=0;i<=4;i++){let v=min+(max-min)*i/4;node('line',{x1:60,x2:615,y1:Y(v),y2:Y(v),stroke:'currentColor','stroke-opacity':.15});node('text',{x:54,y:Y(v)+4,'text-anchor':'end',fill:'currentColor','font-size':11},fmt(v));}
 for(let i=0;i<=4;i++){let n=Math.round(s.stage*i/4);node('text',{x:X(n),y:255,'text-anchor':'middle',fill:'currentColor','font-size':11},String(n));}
 series.forEach((a,i)=>{if(!a.points.length)return;node('polyline',{points:[[0,0],...a.points].map(x=>X(x[0])+','+Y(x[1])).join(' '),fill:'none',stroke:colors[i],'stroke-width':i===0?3:2});const last=a.points.at(-1);node('circle',{cx:X(last[0]),cy:Y(last[1]),r:4,fill:colors[i]});});
 node('text',{x:60,y:20,fill:'currentColor','font-size':13},'Cumulative '+label);node('text',{x:335,y:283,'text-anchor':'middle',fill:'currentColor','font-size':12},'Career '+s.basis);host.appendChild(svg);
 const legend=el('div');legend.style.cssText='display:flex;gap:12px;flex-wrap:wrap;font-size:12px';series.forEach((a,i)=>{let span=el('span','● '+a.name+(a.points.length?'':' · no data'));span.style.color=colors[i];legend.appendChild(span);});host.appendChild(legend);
}
async function render(league){active=league;wire();if(cache.has(league)){paint(cache.get(league));return;}const status=$('compare-status');status.textContent='Loading verified career comparison data…';$('compare-chart').replaceChildren();$('compare-rows').replaceChildren();if(!loading.has(league)){loading.set(league,fetch('./data/career-compare-'+league.toLowerCase()+'.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Comparison dataset unavailable');return r.json();}).then(d=>{if(d.schema_version!==1||d.league!==league||!Array.isArray(d.shards)||!d.shards.length)throw Error('Invalid comparison dataset');return Promise.all(d.shards.map(name=>fetch('./data/'+name,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Missing comparison shard');return r.json();}))).then(parts=>{d.players=parts.flat();if(d.players.length!==d.player_count||new Set(d.players.map(p=>p.id)).size!==d.player_count)throw Error('Comparison player count mismatch');cache.set(league,d);return d;});}).finally(()=>loading.delete(league)));}try{const d=await loading.get(league);if(active===league)paint(d);}catch(e){if(active===league)status.textContent=e.message+' · reopen the tab to retry.';}}
root.DraftCompare={render,checkpoint,suggest};
if(typeof module==='object'&&module.exports)module.exports={checkpoint,suggest};
})(typeof globalThis!=='undefined'?globalThis:this);
