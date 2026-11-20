"use strict";
const SITES=["ESPN","Sleeper","CBS","NFL","RTSports","Fantrax","Yahoo"];
const SITE_SHORT={"RTSports":"RTS","Fantrax":"FAN"};
const YEARS=[2026,2025,2024,2023,2022,2021,2020];
const store=new Map();
const state={year:2026,tab:"board",pos:"ALL",team:"ALL",search:"",gap:"raw",sort:"avg_adp",asc:true,accuracyMetric:"ppr",accuracyBasis:"value",insightMetric:"ppr"};
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat("en-US",{maximumFractionDigits:1});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const val=v=>v==null||!Number.isFinite(Number(v))?"—":fmt.format(Number(v));
const sign=v=>v==null?"—":(v>0?"+":"")+fmt.format(v);
const isNum=v=>typeof v==="number"&&Number.isFinite(v);
const stdMetric=m=>m==="std"?"Standard":"PPR";
const cleanLink=u=>typeof u==="string"&&/^https:\/\/(github\.com|raw\.githubusercontent\.com|github\.io)\//.test(u)?u:"#";
const current=()=>store.get(state.year);
const outcome=(p,metric,basis="raw")=>p?.stats?.[metric+"_"+(basis==="value"?"value_rank":"rank")]??null;
const gap=(p,metric,basis)=>{const rank=outcome(p,metric,basis);return rank==null?null:Math.round((p.avg_adp-rank)*10)/10;};
const seasonStatus=d=>d?.season_status==="IN_PROGRESS"?"SEASON TO DATE":"FINAL SEASON";
const validData=d=>d&&d.year===state.year&&Array.isArray(d.players)&&d.players.length>100;
function rankCols(){
  const items=[{k:"name",h:"Player"},{k:"avg_adp",h:"Avg. ADP"}];
  for(const k of SITES)items.push({k:"adp_"+k,h:SITE_SHORT[k]||k});
  items.push({k:"std_rank",h:"Actual STD"},{k:"ppr_rank",h:"Actual PPR"},
             {k:"delta_std",h:"Δ STD"},{k:"delta_ppr",h:"Δ PPR"});
  return items;
}
function sortvalue(p,k){
  if(k==="name")return p.name.toLowerCase();
  if(k==="avg_adp")return p.avg_adp;
  if(k.startsWith("adp_"))return p.adp?.[k.slice(4)];
  if(k.endsWith("_rank"))return outcome(p,k.startsWith("ppr")?"ppr":"std",state.gap);
  if(k.startsWith("delta_"))return gap(p,k.endsWith("ppr")?"ppr":"std",state.gap);
  return null;
}
function colored(delta){
  if(!isNum(delta))return "";
  if(delta>=6)return delta>=25?"row-good strong-row":"row-good";
  if(delta<=-6)return delta<=-25?"row-bad strong-row":"row-bad";
  return "";
}
function populateTeams(d){
  const all=[...new Set(d.players.map(p=>p.team).filter(Boolean))].sort();
  const opts=['<option value="ALL">All teams</option>',...all.map(t=>'<option value="'+esc(t)+'">'+esc(t)+'</option>')];
  $("team").innerHTML=opts.join("");
  if(!all.includes(state.team))state.team="ALL";
  $("team").value=state.team;
}
function renderStatus(d){
  $("season-label").textContent=state.year+" SEASON";
  const tag=$("season-status");
  tag.textContent=seasonStatus(d)+(d.season_status==="IN_PROGRESS"&&d.outcome_source?.max_week?" · WK "+d.outcome_source.max_week:"");
  tag.classList.toggle("provisional",d.season_status==="IN_PROGRESS");
  const matched=d.coverage?.matched??d.players.filter(p=>p.stats).length;
  const total=d.players.length;
  const best=d.players.filter(p=>p.stats&&p.avg_adp<=180).sort((a,b)=>(gap(b,"ppr","value")??-99999)-(gap(a,"ppr","value")??-99999))[0];
  const stats=[["Players with ADP",val(total),"Season's archived preseason board"],
               ["Actuals matched",val(matched),total?Math.round(matched/total*100)+"% validated join coverage":"Not available"],
               ["ADP platforms",val(SITES.filter(s=>d.players.some(p=>isNum(p.adp?.[s]))).length),"Missing sites are not imputed"],
               ["Top draft surprise",best?best.name:"—",best?"+"+val(gap(best,"ppr","value"))+" value-rank improvement":"Awaiting actual outcomes"]];
  $("stat-row").innerHTML=stats.map(([label,n,note])=>'<div class="stat"><div class="stat-label">'+esc(label)+'</div><div class="stat-number" title="'+esc(n)+'">'+esc(n)+'</div><div class="stat-note">'+esc(note)+'</div></div>').join("");
}
function renderBoard(d){
  const columns=rankCols();
  $("rank-head").innerHTML="<tr>"+columns.map(c=>'<th scope="col"><button type="button" data-sort="'+esc(c.k)+'" class="'+(state.sort===c.k?"active-sort":"")+'" aria-label="Sort by '+esc(c.h)+'">'+esc(c.h)+' <span class="sort-arrow">'+(state.sort===c.k?(state.asc?"▲":"▼"):"↕")+"</span></button></th>").join("")+"</tr>";
  const q=state.search.trim().toLowerCase();
  const rows=d.players.filter(p=>(state.pos==="ALL"||p.pos===state.pos)&&(state.team==="ALL"||p.team===state.team)&&(!q||p.name.toLowerCase().includes(q)));
  const sort=state.sort,asc=state.asc;
  rows.sort((a,b)=>{
    const x=sortvalue(a,sort),y=sortvalue(b,sort);
    if(x==null)return y==null?a.name.localeCompare(b.name):1;
    if(y==null)return -1;
    if(typeof x==="string")return (asc?1:-1)*x.localeCompare(y);
    return (asc?1:-1)*(x-y)||a.avg_adp-b.avg_adp;
  });
  const colorMetric=state.insightMetric;
  $("rank-body").innerHTML=rows.map(p=>{
    const dlt=gap(p,colorMetric,state.gap),cls=colored(dlt);
    const name='<td><div class="player-cell"><span class="position-icon '+esc(p.pos.toLowerCase())+'">'+esc(p.pos)+'</span><div class="player-names"><span class="player-name">'+esc(p.name)+'</span><span class="player-meta">'+esc(p.team||"Team unknown")+' · '+esc(p.pos)+'</span></div></div></td>';
    const cells=['<td class="adp-cell rank-primary">'+val(p.avg_adp)+'</td>',
      ...SITES.map(s=>'<td class="'+(p.adp?.[s]==null?"empty-cell":"adp-cell")+'">'+val(p.adp?.[s])+'</td>'),
      '<td class="rank-primary">'+(p.stats?"#"+val(outcome(p,"std",state.gap)):"—")+'</td>',
      '<td class="rank-primary">'+(p.stats?"#"+val(outcome(p,"ppr",state.gap)):"—")+'</td>',
      ...["std","ppr"].map(m=>{
        const g=gap(p,m,state.gap);
        return '<td class="delta-val '+(g==null?"empty-cell":g>0?"positive":g<0?"negative":"")+'">'+sign(g)+'</td>';
      })];
    return '<tr class="'+esc(cls)+'">'+name+cells.join("")+"</tr>";
  }).join("");
  if(!rows.length)$("rank-body").innerHTML='<tr><td colspan="12" class="no-data">No players match these filters.</td></tr>';
  $("row-count").textContent=rows.length+" of "+d.players.length+" players";
  $("board-summary").textContent="Sorted by "+columns.find(c=>c.k===state.sort)?.h+" "+(state.asc?"↑":"↓");
}
function compareSites(d,m,basis){
  const candidates=SITES.filter(s=>d.players.filter(p=>p.stats&&p.avg_adp<=150&&isNum(p.adp?.[s])).length>=30);
  const cohort=d.players.filter(p=>p.stats&&p.avg_adp<=150&&candidates.every(s=>isNum(p.adp?.[s])));
  if(cohort.length<20||candidates.length<2)return {sites:[],cohort,reason:"Not enough overlapping preseason observations to rank sites fairly."};
  function summarize(s,adpFor){
    const diffs=cohort.map(p=>adpFor(p)-outcome(p,m,basis));
    return {site:s,mae:diffs.reduce((a,b)=>a+Math.abs(b),0)/diffs.length,
       within:100*diffs.filter(x=>Math.abs(x)<=12).length/diffs.length,
       bias:diffs.reduce((a,b)=>a+b,0)/diffs.length,n:diffs.length};
  }
  const sites=candidates.map(s=>summarize(s,p=>p.adp[s]))
                        .concat([summarize("Consensus",p=>p.avg_adp)])
                        .sort((a,b)=>a.mae-b.mae);
  return {sites,cohort,reason:null};
}
function renderAccuracy(d){
  const m=state.accuracyMetric,basis=state.accuracyBasis,{sites,cohort,reason}=compareSites(d,m,basis);
  $("common-count").textContent=val(cohort.length);
  $("accuracy-body").innerHTML=sites.map((s,i)=>{
    const cls=i===0?"leading":i===sites.length-1?"trailing":"";
    return '<tr class="'+cls+'"><td><span class="site-rank">'+(i+1).toString().padStart(2,"0")+'</span><span class="site-label">'+esc(s.site)+'</span></td>'+
      '<td>'+val(Math.round(s.mae*10)/10)+'</td><td>'+val(Math.round(s.within))+'%</td>'+
      '<td>'+sign(Math.round(s.bias*10)/10)+'</td><td>'+val(s.n)+'</td></tr>';
  }).join("")||'<tr><td colspan="5" class="no-data">Not enough common data for a reliable comparison.</td></tr>';
  const best=sites[0],worst=sites[sites.length-1];
  $("accuracy-callout").innerHTML=best&&!reason?'<strong>'+esc(best.site)+'</strong> had the lowest average absolute ADP-vs-finish gap ('+val(best.mae)+' picks) across '+val(cohort.length)+' commonly covered players in '+state.year+'. '+(worst&&worst.site!==best.site?'<strong>'+esc(worst.site)+'</strong> was furthest off ('+val(worst.mae)+' picks).':""):
    'A fair platform leaderboard needs at least two sites with a sufficient shared player cohort. '+esc(reason||"");
  $("accuracy-explanation").textContent="Every ranked site is evaluated on the exact same "+cohort.length+" players (top 150 by consensus ADP, where every eligible source has a value). Mean absolute error measures distance to "+stdMetric(m)+" "+(basis==="value"?"replacement-adjusted value rank":"all-position points rank")+". Lower is better; the signed gap is ADP minus actual rank. Consensus is a benchmark, not a platform.";
}
function insightList(rows,m,type){
  if(!rows.length)return '<div class="no-data">No verified player results yet.</div>';
  return rows.map((p,i)=>{
    const g=gap(p,m,"raw");
    return '<div class="insight-player"><span class="insight-num">'+String(i+1).padStart(2,"0")+'</span>'+
      '<div><div class="insight-name">'+esc(p.name)+'</div><div class="insight-extra">'+esc(p.team||"")+' · '+esc(p.pos)+' · ADP '+val(p.avg_adp)+' → finish #'+val(outcome(p,m,"raw"))+'</div></div>'+
      '<div><div class="insight-gap '+(type==="good"?"good":"bad")+'">'+sign(g)+'</div><div class="insight-gap-sub">places</div></div></div>';
  }).join("");
}
function renderInsights(d){
  const m=state.insightMetric;
  const eligible=d.players.filter(p=>p.avg_adp<=180&&p.stats&&isNum(outcome(p,m,"raw")));
  const good=[...eligible].sort((a,b)=>gap(b,m,"raw")-gap(a,m,"raw")).filter(p=>gap(p,m,"raw")>0).slice(0,10);
  const bad=[...eligible].sort((a,b)=>gap(a,m,"raw")-gap(b,m,"raw")).filter(p=>gap(p,m,"raw")<0).slice(0,10);
  $("steals-list").innerHTML=insightList(good,m,"good");
  $("busts-list").innerHTML=insightList(bad,m,"bad");
  const beat=eligible.filter(p=>gap(p,m,"raw")>0).length;
  const missed=eligible.filter(p=>gap(p,m,"raw")<0).length;
  const provisional=d.season_status==="IN_PROGRESS";
  $("insight-intro").innerHTML='<strong>'+val(eligible.length)+' verifiable early-draft selections</strong> ('+stdMetric(m)+') · '+val(beat)+' above ADP, '+val(missed)+' below. '+
     (provisional?'<strong>2026 is season-to-date.</strong> These are provisional results, not final bust or steal judgments.':'Finished regular-season rankings; early-round ADP limits the list to players likely drafted in typical leagues.');
  $("insight-footer").textContent="Selection rule: average ADP ≤180, a verified regular-season player match, ranked by the difference between average ADP and actual "+stdMetric(m)+" overall fantasy-points rank. Missing or unmatched outcomes are never counted as busts. Rankings represent full-season totals, so injuries, usage and missed games matter. The roster-adjusted comparison is available in the rankings and accuracy tabs.";
}
function renderSources(d){
  const src=d.source||{},o=d.outcome_source||{};
  const meta=d.coverage||{};
  const adplink=cleanLink(src.url),actual=cleanLink(o.url);
  $("sources").innerHTML='<div class="source-title">DATA & METHODOLOGY · VERIFIABLE SOURCES</div>'+
    '<p><strong>Preseason ADP:</strong> '+esc(src.provider||"Archived multi-source ADP")+
    ' · <a href="'+esc(adplink)+'" target="_blank" rel="noopener noreferrer">Archive provenance ↗</a>. Only available platform observations contribute to the arithmetic mean; no site values are invented. Historical snapshot dates before 2025 have not all been independently verified. Team labels are reconciled against season stats where available.</p>'+
    '<p><strong>Actual finishes:</strong> <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">nflverse NFL player data ↗</a>'+
    ' · '+(actual!=="#"?'<a href="'+esc(actual)+'" target="_blank" rel="noopener noreferrer">Season-specific regular-season CSV ↗</a> · ':"")+
    'Regular-season standard (0 PPR) and full PPR total points, NFL fantasy scoring. '+esc(d.season_status==="IN_PROGRESS"?"2026 actuals reflect the current available season-to-date data.":"Historical seasons use final outcomes.")+
    ' Player matches: '+val(meta.matched)+' of '+val(meta.adp_players)+' archived ADP rows.</p>'+
    '<p><strong>Interpretation:</strong> Δ = average ADP − actual finish rank. Positive is a draft bargain; negative is disappointing. The optional roster-adjusted rank uses replacement baselines for a 12-team, 1QB format (QB12 / RB30 / WR36 / TE12), ranking each player by fantasy points above their positional baseline. ADP varies in scoring format and market timing, so cross-site comparisons are descriptive. The site contains no generated player forecasts or filled-in missing data.</p>';
}
function render(){
  const d=current();
  if(!d)return;
  renderStatus(d);renderBoard(d);renderAccuracy(d);renderInsights(d);renderSources(d);
}
async function load(year){
  state.year=year;
  $("year").value=String(year);
  $("dashboard").hidden=true;$("error").hidden=true;$("loading").hidden=false;
  try{
    if(!store.has(year)){
      const url="./data/"+year+".json";
      const r=await fetch(url,{cache:"no-cache"});
      if(!r.ok)throw new Error("Annual dataset unavailable (HTTP "+r.status+")");
      const d=await r.json();
      if(!validData(d))throw new Error("Annual dataset failed basic validation");
      store.set(year,d);
    }
    const d=store.get(year);
    $("loading").hidden=true;$("dashboard").hidden=false;
    populateTeams(d);
    render();selectTab(state.tab);
  }catch(err){
    $("loading").hidden=true;$("error").hidden=false;
    $("error").textContent="Unable to load verified "+year+" records. "+(err?.message||"Source unavailable")+". Please retry later.";
  }
}
function selectTab(tab){
  state.tab=tab;
  for(const x of ["board","sites","insights"]){
    const active=tab===x;
    const button=$("tab-"+x),panel=$("panel-"+x);
    button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active));panel.hidden=!active;
  }
}
function init(){
  $("year").addEventListener("change",e=>load(+e.target.value));
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>selectTab(b.dataset.tab)));
  $("position").addEventListener("change",e=>{state.pos=e.target.value;renderBoard(current())});
  $("team").addEventListener("change",e=>{state.team=e.target.value;renderBoard(current())});
  $("search").addEventListener("input",e=>{state.search=e.target.value;renderBoard(current())});
  $("gap-basis").addEventListener("change",e=>{state.gap=e.target.value;renderBoard(current())});
  $("accuracy-scoring").addEventListener("change",e=>{state.accuracyMetric=e.target.value;renderAccuracy(current())});
  $("accuracy-basis").addEventListener("change",e=>{state.accuracyBasis=e.target.value;renderAccuracy(current())});
  $("insight-scoring").addEventListener("change",e=>{state.insightMetric=e.target.value;renderInsights(current());renderBoard(current())});
  $("rank-head").addEventListener("click",e=>{
    const b=e.target.closest("button[data-sort]");
    if(!b)return;
    const k=b.dataset.sort;
    if(state.sort===k)state.asc=!state.asc;
    else {state.sort=k;state.asc=!k.startsWith("delta_");}
    renderBoard(current());
  });
  load(2026);
}
document.addEventListener("DOMContentLoaded",init);
