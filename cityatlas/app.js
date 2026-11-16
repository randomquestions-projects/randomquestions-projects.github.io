(function(){
"use strict";
const $=id=>document.getElementById(id);
const num=v=>v==null?"—":Math.round(v).toLocaleString("en-US");
const usd=v=>v==null?"—":"$"+Math.round(v).toLocaleString("en-US");
const pct=v=>v==null?"—":(v>0?"+":"")+Number(v).toFixed(1)+"%";
const nice=v=>v==null?"—":Number(v).toFixed(1);
const e=s=>String(s==null?"":s).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const fields=["id","n","s","lat","lon","pop","g1","g5","inc","ar","age","edu","cost","h","h1","h5","h10","h20","rent","r5","f3","tags"];
let cities=[],shortlist=[],selectedTab="explore",snapshot="featured",filtered=[],migration=null,migrationScope="featured";
const eastern=new Set("ME NH VT MA RI CT NY NJ PA DE MD DC VA WV NC SC GA FL".split(" "));
const southern=new Set("TX OK AR LA MS AL TN KY NC SC GA FL VA WV MD DE DC".split(" "));
const western=new Set("WA OR CA ID MT WY UT NV AZ NM CO AK HI".split(" "));
const warm=new Set("FL GA SC NC AL MS LA TX AZ NV NM OK AR TN".split(" "));
const cool=new Set("ME NH VT MA NY MN WI MI MT WY ID ND SD WA".split(" "));
function bykey(k){return cities.find(c=>c.id===k);}
function diff(v){return v==null?"":v>=0?"pos":"neg";}
function empty(t){return '<div class="empty">'+e(t)+'</div>';}
function selectCity(id){if(!bykey(id))return;if(!shortlist.includes(id)){shortlist.push(id);if(shortlist.length>4)shortlist.shift();}showTab("compare");renderCompare();}
function showTab(tab){
 selectedTab=tab;
 document.querySelectorAll(".tab").forEach(n=>n.hidden=n.id!==tab);
 document.querySelectorAll("#nav button").forEach(n=>n.classList.toggle("active",n.dataset.tab===tab));
 const headlines={
 explore:["Where America<br><em>is going.</em>","Understand how cities are changing, and which places might fit your future.","NATIONAL OVERVIEW"],
 migration:["Follow the<br><em>movement.</em>","Explore net domestic migration and actual origin–destination flows.","MIGRATION FLOWS"],
 housing:["The housing<br><em>story.</em>","Track historical appreciation and affordability using observed housing and Census data.","REAL ESTATE"],
 emerging:["Spot early<br><em>momentum.</em>","Explore observed changes before building predictive conclusions.","EMERGING MARKETS"],
 compare:["Compare<br><em>your options.</em>","Look beyond headline growth and study the tradeoffs between cities.","CITY COMPARISON"],
 matcher:["Find your next<br><em>home base.</em>","Make your relocation priorities explicit and uncover candidate places.","PERSONAL CITY MATCH"],
 methodology:["Understand<br><em>the evidence.</em>","Understand every dataset, definition, and limitation.","METHODOLOGY"]
 };
 const [title,subtitle,crumb]=headlines[tab]||headlines.explore;
 $("title").innerHTML=title;$("subtitle").textContent=subtitle;$("crumb").textContent=crumb;
 window.scrollTo({top:0,behavior:"instant"});
 if(tab==="migration")renderMigration();
 if(tab==="housing")renderHousing();
 if(tab==="emerging")renderEmerging();
 if(tab==="compare")renderCompare();
 if(tab==="matcher")renderMatch();
}
async function loadData(){
 let doc;
 try{
  const resp=await fetch("./data/cities.json",{cache:"no-cache"});
  if(resp.ok){doc=await resp.json();snapshot="national";}
 }catch(err){}
 if(!doc){
  const b64=window.CITYATLAS_PREVIEW_BASE64;
  if(!b64||typeof DecompressionStream!=="function")throw new Error("Featured-city snapshot could not be loaded in this browser.");
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  doc=JSON.parse(await new Response(stream).text());
  snapshot="featured";
 }
 const names=doc.fields||fields;
 if(!Array.isArray(doc.cities)||doc.cities.length<10||!names.includes("id"))throw new Error("City dataset is missing required fields");
 cities=doc.cities.map(row=>Object.fromEntries(names.map((key,i)=>[key,row[i]])));
 const ids=new Set();
 cities.forEach(c=>{if(!/^\d{7}$/.test(c.id)||ids.has(c.id))throw new Error("Invalid city GEOID");ids.add(c.id);});
 cities.sort((a,b)=>b.pop-a.pop);
 $("sample-count").textContent=num(cities.length);
 $("scope").textContent=snapshot==="national"?
   "Nationwide published city aggregate snapshot. Source vintages and coverage vary by indicator; missing values stay blank.":
   "PUBLIC PREVIEW · "+num(cities.length)+" featured, source-backed cities. The private warehouse covers 19,483 places; this published preview is a curated selection, not a complete national ranking.";
 setup();
 loadMigration().catch(err=>{console.warn("Migration source unavailable",err);});
}
function setup(){
 const states=[...new Set(cities.map(c=>c.s))].sort();
 $("state").innerHTML='<option value="">All states</option>'+states.map(s=>'<option value="'+e(s)+'">'+e(s)+'</option>').join("");
 const cityPicker=[...cities].sort((a,b)=>a.n.localeCompare(b.n));
 $("city-picker").innerHTML=cityPicker.map(c=>'<option value="'+e(c.id)+'">'+e(c.n)+', '+e(c.s)+'</option>').join("");
 $("nav").addEventListener("click",ev=>{const n=ev.target.closest("[data-tab]");if(n)showTab(n.dataset.tab);});
 ["search","state","population","sort"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",renderExplore));
 ["housing-sort","housing-search"].forEach(id=>$(id).addEventListener(id==="housing-search"?"input":"change",renderHousing));
 $("add-city").addEventListener("click",()=>selectCity($("city-picker").value));
 $("clear-cities").addEventListener("click",()=>{shortlist=[];renderCompare();});
 $("matcher-form").addEventListener("submit",ev=>{ev.preventDefault();renderMatch();});
 document.body.addEventListener("click",ev=>{
  const add=ev.target.closest("[data-add]");if(add){selectCity(add.dataset.add);return;}
  const remove=ev.target.closest("[data-remove]");if(remove){shortlist=shortlist.filter(x=>x!==remove.dataset.remove);renderCompare();}
 });
 document.body.addEventListener("keydown",ev=>{
  if(ev.key==="Enter"&&ev.target.matches("[data-add]"))selectCity(ev.target.dataset.add);
 });
 renderMethods();renderExplore();renderHousing();renderEmerging();renderCompare();renderMatch();
 ["migration-state","migration-year","migration-direction"].forEach(id=>$(id).addEventListener("change",renderMigration));
}
function queryRows(){
 const state=$("state").value,term=$("search").value.trim().toLowerCase(),min=Number($("population").value),sort=$("sort").value;
 let r=cities.filter(c=>(!state||c.s===state)&&c.pop>=min&&(!term||(c.n+" "+c.s).toLowerCase().includes(term)));
 r.sort((a,b)=>Number(b[sort]??-1e12)-Number(a[sort]??-1e12));
 return r;
}
function renderExplore(){
 filtered=queryRows();
 $("row-count").textContent=num(filtered.length)+" cities";
 const rows=filtered.slice(0,180);
 $("rankings").innerHTML=rows.length?rows.map(c=>
 '<tr><td><button class="clickcity" data-add="'+c.id+'">'+e(c.n)+', '+e(c.s)+'</button></td><td class="right">'+num(c.pop)+'</td>'+
 '<td class="right '+diff(c.g1)+'">'+pct(c.g1)+'</td><td class="right '+diff(c.g5)+'">'+pct(c.g5)+'</td>'+
 '<td class="right '+diff(c.h5)+'">'+pct(c.h5)+'</td><td class="right">'+usd(c.h)+'</td>'+
 '<td><button class="add-mini" data-add="'+c.id+'">+ Compare</button></td></tr>').join(""):empty("No cities match these filters");
 const leaders=[...filtered].filter(c=>c.g5!=null).sort((a,b)=>b.g5-a.g5).slice(0,8);
 $("leaders").innerHTML=leaders.length?leaders.map((c,i)=>
 '<button class="leader" data-add="'+c.id+'"><span class="leader-num">'+String(i+1).padStart(2,"0")+'</span>'+
 '<span><b>'+e(c.n)+', '+e(c.s)+'</b><small>'+num(c.pop)+' residents</small></span>'+
 '<span class="grow">'+pct(c.g5)+'</span></button>').join(""):empty("No rankings for the current filters");
 renderMap(filtered);
}
function renderMap(rows){
 const ns="http://www.w3.org/2000/svg",svg=$("map"),g=$("mapdots"),grid=$("grid");
 g.replaceChildren();grid.replaceChildren();
 const p= (lat,lon)=>[65+(lon+126)/61*800,70+(50-lat)/26*350];
 const outline=document.createElementNS(ns,"path");
 outline.setAttribute("class","map-shape");
 outline.setAttribute("d","M83 84 L167 109 L227 98 L292 115 L352 123 L426 125 L483 109 L538 120 L612 106 L668 99 L727 111 L782 85 L839 121 L846 166 L804 191 L799 237 L769 257 L749 299 L702 313 L686 349 L646 370 L619 395 L598 451 L561 402 L515 373 L459 360 L409 371 L363 351 L304 344 L270 322 L242 281 L207 261 L181 214 L141 197 L122 153 L86 136 Z");
 grid.append(outline);
 for(let i=0;i<7;i++){
  const line=document.createElementNS(ns,"line");line.setAttribute("class","map-grid");
  line.setAttribute("x1",String(68+i*125));line.setAttribute("x2",String(68+i*125));line.setAttribute("y1","75");line.setAttribute("y2","450");grid.append(line);
 }
 for(const c of rows.slice(0,1300)){
  if(c.lon==null||c.lat==null||c.lon< -126||c.lon> -65||c.lat<24||c.lat>50)continue;
  const [x,y]=p(c.lat,c.lon);
  const dot=document.createElementNS(ns,"circle");
  dot.setAttribute("cx",String(x));dot.setAttribute("cy",String(y));
  dot.setAttribute("r",String(Math.max(3,Math.min(8,Math.log10(c.pop||10)))));
  dot.setAttribute("fill",c.g5==null?"#7faaa2":c.g5>=0?"#16846c":"#c58b73");
  dot.setAttribute("class","map-dot");dot.setAttribute("role","button");dot.setAttribute("tabindex","0");
  dot.setAttribute("aria-label",c.n+", "+c.s+", population growth "+pct(c.g5));
  dot.dataset.add=c.id;
  const title=document.createElementNS(ns,"title");title.textContent=c.n+", "+c.s+" · "+pct(c.g5)+" growth";dot.append(title);g.append(dot);
 }
}
function renderHousing(){
 const sort=$("housing-sort").value,term=$("housing-search").value.trim().toLowerCase();
 const r=cities.filter(c=>(c.n+" "+c.s).toLowerCase().includes(term));
 const asc=sort==="cost";r.sort((a,b)=>asc?Number(a[sort]??1e12)-Number(b[sort]??1e12):Number(b[sort]??-1e12)-Number(a[sort]??-1e12));
 $("housing-table").innerHTML=r.slice(0,230).map(c=>
  '<tr><td><button class="clickcity" data-add="'+c.id+'">'+e(c.n)+', '+e(c.s)+'</button></td>'+
  ['h1','h5','h10','h20'].map(k=>'<td class="right '+diff(c[k])+'">'+pct(c[k])+'</td>').join("")+
  '<td class="right">'+usd(c.h)+'</td><td class="right">'+usd(c.inc)+'</td><td class="right">'+pct(c.cost)+'</td></tr>').join("")||empty("No available cities");
}
function acceleration(c){if(c.g5==null||c.g1==null||c.g5<=-99)return null;return c.g1-(Math.pow(1+c.g5/100,.2)-1)*100;}
function renderEmerging(){
 const r=cities.filter(c=>c.pop>=25000&&acceleration(c)!=null);
 r.sort((a,b)=>acceleration(b)-acceleration(a));
 $("emerging-table").innerHTML=r.slice(0,110).map(c=>
 '<tr><td><button data-add="'+c.id+'" class="clickcity">'+e(c.n)+', '+e(c.s)+'</button></td>'+
 '<td class="right">'+num(c.pop)+'</td><td class="right">'+pct(c.g5)+'</td><td class="right">'+pct(c.g1)+'</td>'+
 '<td class="right '+diff(acceleration(c))+'">'+(acceleration(c)>0?"+":"")+nice(acceleration(c))+'</td>'+
 '<td class="right '+diff(c.h5)+'">'+pct(c.h5)+'</td></tr>').join("")||empty("No matching records");
}
function renderCompare(){
 const chips=$("chips"),pane=$("compare-table");
 chips.innerHTML=shortlist.map(id=>{const c=bykey(id);return c?'<span class="chip">'+e(c.n)+', '+e(c.s)+' <button data-remove="'+id+'" aria-label="Remove '+e(c.n)+'">×</button></span>':"";}).join("");
 if(!shortlist.length){pane.innerHTML=empty("Choose a city above, or select + Compare anywhere in the app. Add up to four cities.");return;}
 const shown=shortlist.map(bykey).filter(Boolean);
 const specs=[["2025 population","pop",num],["Population growth 1Y","g1",pct],["Population growth 5Y","g5",pct],
 ["Typical home-value index*","h",usd],["Home appreciation 1Y","h1",pct],["Home appreciation 5Y","h5",pct],
 ["Home appreciation 10Y","h10",pct],["Home appreciation 20Y","h20",pct],
 ["Typical rent index*","rent",usd],["Rental index growth 5Y","r5",pct],["ACS median household income","inc",usd],
 ["ACS median contract rent","ar",usd],["ACS contract rent / income","cost",pct],
 ["ACS median age","age",nice],["Adults with BA+","edu",pct]];
 pane.innerHTML='<div class="compare-table"><table><thead><tr><th>Measure</th>'+shown.map(c=>'<th>'+e(c.n)+', '+e(c.s)+'</th>').join("")+'</tr></thead><tbody>'+
 specs.map(([label,key,fmt])=>'<tr><td>'+e(label)+'</td>'+shown.map(c=>'<td>'+fmt(c[key])+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>'+
 '<div class="fineprint">* Zillow model-based city indexes, not sales or actual listed rentals. Source: Census PEP 2025, ACS 2024 5-year, Zillow Research. Different source periods are not directly interchangeable.</div>';
}
function rankMatch(c,options){
 let score=0,why=[];
 const tags=c.tags||[];
 const reg=options.region;
 if(reg==="east"&&!eastern.has(c.s))return null;
 if(reg==="south"&&!southern.has(c.s))return null;
 if(reg==="west"&&!western.has(c.s))return null;
 if(!tags.length)return null;
 if(options.nature==="any")score+=15;
 else if(tags.includes(options.nature)){score+=40;why.push("Matches preferred landscape (editorial tag)");}
 if(options.arts==="yes"&&tags.includes("arts")){score+=18;why.push("Creative/arts community candidate");}
 let cost=c.cost;
 if(cost!=null){
  const v=options.affordability;
  if(v==="flexible")score+=12;
  else if(v==="lower")score+=Math.max(0,25-Math.max(0,cost-14)*2);
  else score+=Math.max(0,25-Math.abs(cost-22)*1.2);
  if(cost<=24)why.push("Median contract rent / income: "+pct(cost)+" (citywide proxy)");
 }else why.push("Affordability coverage not available");
 if(options.climate==="warm"&&warm.has(c.s)||options.climate==="cool"&&cool.has(c.s)){
  score+=6;why.push("Broad regional climate preference (not a climate model)");
 }
 if(options.nature!=="any"&&!tags.includes(options.nature))score-=14;
 return {c,score:Math.round(score),why};
}
function renderMatch(){
 const prefs=Object.fromEntries(new FormData($("matcher-form")).entries());
 const candidates=cities.map(c=>rankMatch(c,prefs)).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,20);
 $("match-results").innerHTML='<div class="match-list">'+(candidates.length?candidates.map((x,i)=>{
  const c=x.c;
  return '<article class="match-card"><div class="match-head"><h3><small>OPTION '+(i+1)+'</small><br>'+e(c.n)+', '+e(c.s)+'</h3><span class="score">'+x.score+' pts*</span></div>'+
  '<p>'+num(c.pop)+' residents · ACS household income '+usd(c.inc)+' · housing index '+usd(c.h)+'</p>'+
  '<div>'+c.tags.map(t=>'<span class="tag">'+e(t)+'</span>').join("")+'</div>'+
  '<p>'+x.why.map(e).join(' · ')+'</p><button data-add="'+c.id+'">Compare this city ↗</button></article>';
 }).join(""):empty("No curated candidates match these filters. Try Anywhere or a different landscape."))+'</div>';
}
function renderMethods(){
 const blocks=[
 ["What is this public dataset?","The current preview is a curated subset of 63 real U.S. incorporated places selected to span large cities, high-growth markets and relocation candidates. It is NOT a comprehensive national ranking yet. The private research warehouse contains 19,483 places. Full geographic coverage will be published only through a validated, restricted aggregate export."],
 ["Population and migration","City population and 2020–2025 growth come from the U.S. Census Bureau Population Estimates Program (2025 vintage). Simple city growth is NOT proof that residents moved in from other areas: births, deaths, and boundaries matter. The private warehouse also contains IRS county tax-return flows and Census county net domestic migration."],
 ["Historical geography","The warehouse contains 2000–2009, 2010–2019, and 2020–2025 Census place histories. Each decade has its own estimate vintage and potentially different boundaries. We do not splice them into a misleading continuous 25-year percentage change."],
 ["Housing values and rents","ZHVI/ZORI are Zillow statistical indexes, not median sale prices, realized investment returns, or rental offers. The 1-, 5-, 10-, and 20-year percentages are observed nominal changes based on source availability, not predictions. Data provided by Zillow Group. <a href='https://www.zillow.com/research/data/' target='_blank' rel='noopener'>Zillow Research</a>."],
 ["Cost of living and income","2024 ACS 5-year median household income and median contract rent are separate citywide medians. Their ratio is an imperfect descriptive housing-cost indicator, not a household budget or a full cost-of-living index. BEA metropolitan price parity data, taxes and insurance will improve this section after validation."],
 ["Emerging-city predictions","The emerging-market tab currently sorts observed recent population acceleration relative to the five-year annualized growth rate. The private warehouse contains a backtested Zillow momentum benchmark, but that does not establish that migration causes appreciation or that this market ranking will predict future housing prices. Forecast claims will require out-of-time model comparisons."],
 ["Personalized city matching","Recommendations score a curated editorial list using your selected geography, landscapes, culture preference and ACS housing affordability proxy. They are exploratory and do not yet contain verified school quality, park accessibility, hazard exposure, commute times or nationally measured culture metrics."],
 ["Data provenance and privacy","Research code, source dumps, model training, raw research tables, credentials, and the secure S3 warehouse remain private. Only constrained derived aggregates are used on this public site. No trackers, user accounts or stored preference data are required. All preference matching runs locally in your browser."]
 ];
 $("methods").innerHTML=blocks.map(([title,body])=>'<article class="method-card"><h3>'+e(title)+'</h3><p>'+body+'</p></article>').join("");
}
async function loadMigration(){
 let data;
 try{const response=await fetch("./data/migration.json",{cache:"no-cache"});if(response.ok){data=await response.json();migrationScope="national";}}catch(err){}
 if(!data){
  const b64=window.CITYATLAS_MIGRATION_PREVIEW_BASE64;
  if(!b64||typeof DecompressionStream!=="function")return;
  const raw=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
  data=JSON.parse(await new Response(stream).text());migrationScope="featured";
 }
 const counties=(data.counties||[]).map(x=>Array.isArray(x)?{id:x[0],name:x[1],state:x[2],pop:x[3],domestic:x[4],international:x[5],rate:x[6]}:x);
 const flows=(data.state_flows||[]).map(x=>Array.isArray(x)?{orig:x[0],dest:x[1],returns:x[2],persons:x[3],year:x[4]}:x);
 migration={counties,flows};
 const states=[...new Set([...counties.map(x=>x.state),...flows.map(x=>x.orig),...flows.map(x=>x.dest)])].filter(Boolean).sort();
 $("migration-state").innerHTML='<option value="">All states</option>'+states.map(x=>'<option value="'+e(x)+'">'+e(x)+'</option>').join("");
 renderMigration();
}
function renderMigration(){
 if(!migration){$("flow-table").innerHTML='<tr><td colspan="5">Loading migration research…</td></tr>';return;}
 const st=$("migration-state").value,year=Number($("migration-year").value),dir=$("migration-direction").value;
 const flow=migration.flows.filter(x=>x.year===year&&(!st||(dir==="inbound"?x.dest===st:x.orig===st)))
     .sort((a,b)=>b.returns-a.returns);
 $("flow-count").textContent=num(flow.length)+" routes";
 $("flow-table").innerHTML=flow.length?flow.slice(0,180).map(x=>
 '<tr><td>'+e(x.orig)+'</td><td>'+e(x.dest)+'</td><td class="right">'+num(x.returns)+'</td>'+
 '<td class="right">'+num(x.persons)+'</td><td class="right">'+e(x.year)+'</td></tr>').join(""):
 '<tr><td colspan="5" class="empty">No released flow records for this selection in the '+e(migrationScope)+' public snapshot.</td></tr>';
 const count=migration.counties.filter(x=>!st||x.state===st)
     .sort((a,b)=>dir==="outbound"?a.rate-b.rate:b.rate-a.rate);
 $("county-count").textContent=num(count.length)+" counties";
 $("county-table").innerHTML=count.length?count.slice(0,180).map(x=>
 '<tr><td>'+e(x.name)+'</td><td>'+e(x.state)+'</td><td class="right">'+num(x.pop)+'</td>'+
 '<td class="right '+diff(x.domestic)+'">'+num(x.domestic)+'</td><td class="right">'+num(x.international)+'</td>'+
 '<td class="right '+diff(x.rate)+'">'+nice(x.rate)+'</td></tr>').join(""):
 '<tr><td colspan="6" class="empty">No published counties match this selection in the '+e(migrationScope)+' preview.</td></tr>';
}
loadData().catch(err=>{$("scope").textContent="CityAtlas data unavailable: "+err.message;console.error(err);});
})();