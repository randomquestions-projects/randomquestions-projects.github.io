(function(){
"use strict";
const $=id=>document.getElementById(id);
const num=v=>v==null?"—":Math.round(v).toLocaleString("en-US");
const usd=v=>v==null?"—":"$"+Math.round(v).toLocaleString("en-US");
const pct=v=>v==null?"—":(v>0?"+":"")+Number(v).toFixed(1)+"%";
const nice=v=>v==null?"—":Number(v).toFixed(1);
const e=s=>String(s==null?"":s).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const fields=["id","n","s","lat","lon","pop","g1","g5","inc","ar","age","edu","cost","h","h1","h5","h10","h20","rent","r5","f3","tags"];
let cities=[],shortlist=[],selectedTab="explore",snapshot="featured",filtered=[],migration=null,migrationScope="featured",economy=null,stateBorders=null,geoAccess=null,models=null;
const annualHistoryCache=new Map();
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
 economy:["Jobs drive<br><em>the movement.</em>","Understand growing industries, household incomes and regional cost-of-living differences.","JOBS & ECONOMY"],
 amenities:["Schools, trails<br><em>and place.</em>","Explore independently measured access to public schools and NPS trailheads.","SCHOOLS & OUTDOORS"],
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
 if(tab==="economy"){renderEconomy();renderDailyLife();}
 if(tab==="amenities")renderAmenities();
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
 loadEconomy().catch(err=>{console.warn("Economy source unavailable",err);});
 loadBoundaries().catch(err=>{console.warn("State geography unavailable",err);});
 loadAmenities().catch(err=>{console.warn("Geographic-access source unavailable",err);});
 loadModels().catch(err=>{console.warn("Forecast validation unavailable",err);});
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
 $("history-city").addEventListener("change",()=>renderCityHistory().catch(err=>console.warn(err)));
 $("matcher-form").addEventListener("submit",ev=>{ev.preventDefault();renderMatch();});
 document.body.addEventListener("click",ev=>{
  const add=ev.target.closest("[data-add]");if(add){selectCity(add.dataset.add);return;}
  const remove=ev.target.closest("[data-remove]");if(remove){shortlist=shortlist.filter(x=>x!==remove.dataset.remove);renderCompare();}
 });
 document.body.addEventListener("keydown",ev=>{
  if(ev.key==="Enter"&&ev.target.matches("[data-add]"))selectCity(ev.target.dataset.add);
 });
 renderMethods();renderExplore();renderHousing();renderEmerging();renderCompare();renderMatch();
 ["migration-state","migration-year","migration-county-year","migration-direction"].forEach(id=>$(id).addEventListener("change",renderMigration));
 ["jobs-state","jobs-sector"].forEach(id=>$(id).addEventListener("change",()=>{renderEconomy();renderDailyLife();}));
 ["bea-rpp-year","bea-rpp-kind"].forEach(id=>$(id).addEventListener("change",renderEconomy));
 ["amenity-state","amenity-sort","amenity-search"].forEach(id=>$(id).addEventListener(id==="amenity-search"?"input":"change",renderAmenities));
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
 if(stateBorders&&Array.isArray(stateBorders.rings)&&stateBorders.rings.length){
   for(const ring of stateBorders.rings){
     if(!Array.isArray(ring)||ring.length<3)continue;
     const path=document.createElementNS(ns,"path");
     const projected=ring.map(pt=>p(pt[1],pt[0]));
     path.setAttribute("d",projected.map((xy,i)=>(i?"L":"M")+xy[0].toFixed(1)+" "+xy[1].toFixed(1)).join(" ")+" Z");
     path.setAttribute("class","map-shape");
     grid.append(path);
   }
 }else{
   // Conservative fallback while official Census state outlines are unpublished.
   const outline=document.createElementNS(ns,"path");
   outline.setAttribute("class","map-shape");
   outline.setAttribute("d","M83 84 L167 109 L227 98 L292 115 L352 123 L426 125 L483 109 L538 120 L612 106 L668 99 L727 111 L782 85 L839 121 L846 166 L804 191 L799 237 L769 257 L749 299 L702 313 L686 349 L646 370 L619 395 L598 451 L561 402 L515 373 L459 360 L409 371 L363 351 L304 344 L270 322 L242 281 L207 261 L181 214 L141 197 L122 153 L86 136 Z");
   grid.append(outline);
 }
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
 if(!shortlist.length){
  pane.innerHTML=empty("Choose a city above, or select + Compare anywhere in the app. Add up to four cities.");
  $("history-city").replaceChildren();
  $("history-body").innerHTML=empty("Add a city to view 2000–2025 population and Zillow histories.");
  return;
 }
 const shown=shortlist.map(bykey).filter(Boolean);
 const specs=[["2025 population","pop",num],["Population growth 1Y","g1",pct],["Population growth 5Y","g5",pct],
 ["Typical home-value index*","h",usd],["Home appreciation 1Y","h1",pct],["Home appreciation 5Y","h5",pct],
 ["Home appreciation 10Y","h10",pct],["Home appreciation 20Y","h20",pct],
 ["Typical rent index*","rent",usd],["Rental index growth 5Y","r5",pct],["ACS median household income","inc",usd],
 ["ACS median contract rent","ar",usd],["ACS contract rent / income","cost",pct],
 ["ACS median age","age",nice],["Adults with BA+","edu",pct],
 ["Schools within 15 km","school_access",num],["NPS trailheads within 50 km","nps_access",num],
 ["Metro BEA regional price index","metro_rpp",nice]];
 pane.innerHTML='<div class="compare-table"><table><thead><tr><th>Measure</th>'+shown.map(c=>'<th>'+e(c.n)+', '+e(c.s)+'</th>').join("")+'</tr></thead><tbody>'+
 specs.map(([label,key,fmt])=>'<tr><td>'+e(label)+'</td>'+shown.map(c=>{
   const access=geoAccess?.get(c.id);
   const value=key==="school_access"?access?.schools_15km:
     key==="nps_access"?access?.nps_trailheads_50km:
     key==="metro_rpp"?access?.metro_price_index:c[key];
   return '<td>'+fmt(value)+'</td>';
 }).join("")+'</tr>').join("")+'</tbody></table></div>'+
 '<div class="fineprint">* Zillow model-based city indexes, not sales or actual listed rentals. Source: Census PEP 2025, ACS 2024 5-year, Zillow Research. Different source periods are not directly interchangeable.</div>';
 const selector=$("history-city"),prior=selector.value;
 selector.innerHTML=shown.map(c=>'<option value="'+e(c.id)+'">'+e(c.n)+', '+e(c.s)+'</option>').join("");
 selector.value=shown.some(c=>c.id===prior)?prior:shown[0].id;
 renderCityHistory().catch(err=>{console.warn(err);$("history-body").innerHTML=empty("Annual-history files are currently unavailable.");});
}
async function stateHistory(state){
 if(!/^[A-Z]{2}$/.test(state))throw Error("Invalid state code");
 if(annualHistoryCache.has(state))return annualHistoryCache.get(state);
 const promise=(async()=>{
   const resp=await fetch("./data/history/"+state+".json",{cache:"no-cache"});
   if(!resp.ok)throw Error("State historical data has not been published");
   const doc=await resp.json();
   if(doc.state!==state||!Array.isArray(doc.places))throw Error("Historic city file mismatch");
   return new Map(doc.places.map(x=>[x.id,x]));
 })();
 annualHistoryCache.set(state,promise);
 return promise;
}
function historyChart(series,type,range){
 const years=series.map(x=>Number(x[0])),values=series.map(x=>Number(x[1]));
 if(years.length<2)return empty("Insufficient historical records.");
 const minYear=range?.[0]??Math.min(...years),maxYear=range?.[1]??Math.max(...years);
 const minY=Math.min(...values),maxY=Math.max(...values),span=Math.max(1,maxY-minY);
 const path=series.map((x,i)=>{
   const px=46+((x[0]-minYear)/Math.max(1,maxYear-minYear))*680;
   const py=163-((x[1]-minY)/span)*131;
   return (i?"L":"M")+px.toFixed(2)+","+py.toFixed(2);
 }).join(" ");
 return '<svg class="city-history-chart" viewBox="0 0 770 200" role="img" aria-label="'+e(type)+' annual history from '+minYear+' to '+maxYear+'">'+
 '<line x1="46" y1="165" x2="730" y2="165" stroke="#cbded1"/>'+
 '<line x1="46" y1="30" x2="46" y2="165" stroke="#cbded1"/>'+
 '<path d="'+e(path)+'" fill="none" stroke="#12846b" stroke-width="3" stroke-linecap="round"/>'+
 '<text x="46" y="187" font-size="11" fill="#667d76">'+minYear+'</text>'+
 '<text x="709" y="187" font-size="11" fill="#667d76">'+maxYear+'</text>'+
 '<text x="46" y="21" font-size="11" fill="#667d76">'+num(maxY)+'</text>'+
 '<text x="46" y="160" font-size="11" fill="#667d76">'+num(minY)+'</text>'+
 '</svg>';
}
async function renderCityHistory(){
 const id=$("history-city")?.value;
 const body=$("history-body");if(!body||!id)return;
 const c=bykey(id);if(!c)return;
 body.innerHTML=empty("Loading approved city history…");
 try{
   const byGeo=await stateHistory(c.s);
   if($("history-city")?.value!==id)return; // ignore stale responses after selection
   const d=byGeo.get(id);
   if(!d)throw Error("Missing source-backed place history");
   let html='<div class="history-graphs">';
   const pop=d.p||[];
   const vintages=[2009,2019,2025];
   html+='<article class="history-plot"><h3>Population · three separate Census estimate vintages</h3>';
   for(const vintage of vintages){
     const rows=pop.filter(v=>v[0]===vintage).map(v=>[v[1],v[2]]);
     if(rows.length>1){
       html+='<h4>'+vintage+' estimate vintage ('+rows.length+' annual readings)</h4>'+
             historyChart(rows,"Census "+vintage+" population");
     }
   }
   html+='</article>';
   for(const [key,name] of [["zh","Home value index · Zillow ZHVI"],["zr","Rental index · Zillow ZORI"]]){
     const values=d[key]||[];
     html+='<article class="history-plot"><h3>'+e(name)+'</h3>'+
       (values.length>1?historyChart(values,name):empty("No matching annual Zillow index history."))+
       '<p class="sample-note">Annual January values. Indexes are not transactions; absent years are never interpolated.</p></article>';
   }
   const model=(models?.conditionally_published_forecasts||[]).filter(m=>m.id===id);
   if(model.length){
     html+='<article class="history-plot"><h3>Conditionally validated housing outlook</h3>'+
       model.map(x=>'<p class="sample-note">'+e(x.horizon)+'-year predicted index change: '+
          pct(x.predicted_change_pct)+' · 90th-percentile absolute error '+nice(x.error_bound_pp)+' percentage points</p>').join("")+
       '<p class="sample-note">Not investment advice. Based on current-revised historical data, not a complete point-in-time archive.</p></article>';
   }
   html+='</div><p class="fineprint">Census 2009, 2019 and 2025 vintages are deliberately shown separately, because geographic definitions and revisions differ. Zillow values are source-model indexes with variable coverage.</p>';
   body.innerHTML=html;
 }catch(err){
   body.innerHTML=empty("Annual city histories are not yet published for this state. The approved national summary remains available.");
 }
}
function rankMatch(c,options){
 let score=0,why=[];
 const tags=c.tags||[];
 const access=geoAccess?.get(c.id)||null;
 const size=options.population||"any";
 if(size==="small"&&c.pop>=100000)return null;
 if(size==="medium"&&(c.pop<100000||c.pop>500000))return null;
 if(size==="large"&&c.pop<=500000)return null;
 const ceiling=options.rent_budget==="any"?null:Number(options.rent_budget);
 if(ceiling!=null&&c.ar!=null&&c.ar>ceiling)return null;
 if(ceiling!=null&&c.ar==null)return null;
 const priority=options.nature_priority||"medium";
 if(priority==="essential"&&options.nature!=="any"&&!tags.includes(options.nature))return null;
 const reg=options.region;
 if(reg==="east"&&!eastern.has(c.s))return null;
 if(reg==="south"&&!southern.has(c.s))return null;
 if(reg==="west"&&!western.has(c.s))return null;
 if(!tags.length&&options.nature!=="any")return null;
 if(options.nature==="any")score+=15;
 else if(tags.includes(options.nature)){score+=priority==="high"?55:priority==="essential"?65:40;why.push("Matches preferred landscape (editorial tag)");}
 if(options.arts==="yes"&&tags.includes("arts")){score+=18;why.push("Creative/arts community candidate");}
 let cost=c.cost;
 if(cost!=null){
  const v=options.affordability;
  if(v==="flexible")score+=12;
  else if(v==="lower")score+=Math.max(0,25-Math.max(0,cost-14)*2);
  else score+=Math.max(0,25-Math.abs(cost-22)*1.2);
  if(cost<=24)why.push("Median contract rent / income: "+pct(cost)+" (citywide proxy)");
  if(access?.metro_price_index!=null){
    const index=access.metro_price_index;
    if(options.affordability==="lower")score+=Math.max(0,12-(index-90)*.8);
    if(options.affordability==="medium")score+=Math.max(0,10-Math.abs(index-100)*.45);
    why.push("BEA metro price parity "+nice(index)+" (U.S.=100; regional, not city)");
  }
  if(ceiling!=null)why.push("ACS median contract rent "+usd(c.ar)+" / month within your ceiling");
 }else why.push("Affordability coverage not available");
 if(options.climate==="warm"&&warm.has(c.s)||options.climate==="cool"&&cool.has(c.s)){
  score+=6;why.push("Broad regional climate preference (not a climate model)");
 }
 if(options.nature!=="any"&&!tags.includes(options.nature))score-=priority==="high"?30:14;
 // Do NOT substitute official public school proximity for school quality.
 if(options.schools!=="any"){
   if(access?.schools_15km!=null){
     const count=access.schools_15km;
     const value=options.schools==="many"?Math.min(15,count/5):Math.min(15,count/2);
     score+=value;
     why.push(num(count)+" NCES public-school locations within 15 km");
   } else why.push("No verified nearby-school coverage");
 }
 if(options.trails!=="any"){
   if(access?.nps_trailheads_50km!=null){
     const count=access.nps_trailheads_50km;
     score+=options.trails==="many"?Math.min(15,count*1.5):Math.min(15,count*4);
     why.push(num(count)+" NPS trailheads within 50 km");
   } else why.push("No verified NPS trailhead coverage");
 }
 return {c,score:Math.round(score),why};
}
function renderMatch(){
 const prefs=Object.fromEntries(new FormData($("matcher-form")).entries());
 const candidates=cities.map(c=>rankMatch(c,prefs)).filter(Boolean).sort((a,b)=>b.score-a.score||b.c.pop-a.c.pop).slice(0,20);
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
 ["What is this public dataset?",snapshot==="national"?
    "This published national aggregate contains all 19,483 2025 Census incorporated places. It includes only allowlisted derived indicators, not raw data or research models. Individual measures have varying geographic coverage and missing data remain absent.":
    "The current preview is a curated set of 63 real U.S. incorporated places. It is NOT a comprehensive national ranking yet. The private research warehouse contains 19,483 places. Full geographic coverage is generated as a validated, restricted aggregate export, awaiting publication permission."],
 ["Population and migration","City population and 2020–2025 growth come from the U.S. Census Bureau Population Estimates Program (2025 vintage). Simple city growth is NOT proof that residents moved in from other areas: births, deaths, and boundaries matter. The private warehouse also contains IRS county tax-return flows and Census county net domestic migration."],
 ["Historical geography","The warehouse contains 2000–2009, 2010–2019, and 2020–2025 Census place histories. Each decade has its own estimate vintage and potentially different boundaries. We do not splice them into a misleading continuous 25-year percentage change."],
 ["Housing values and rents","ZHVI/ZORI are Zillow statistical indexes, not median sale prices, realized investment returns, or rental offers. The 1-, 5-, 10-, and 20-year percentages are observed nominal changes based on source availability, not predictions. Data provided by Zillow Group. <a href='https://www.zillow.com/research/data/' target='_blank' rel='noopener'>Zillow Research</a>."],
 ["Cost of living and income","2024 ACS 5-year median household income and median contract rent are separate citywide medians. Their ratio is an imperfect descriptive housing-cost indicator, not a household budget or a full cost-of-living index. BEA metropolitan price parity data, taxes and insurance will improve this section after validation."],
 ["Emerging-city predictions","The emerging-market tab currently sorts observed recent population acceleration relative to the five-year annualized growth rate. The private warehouse contains a backtested Zillow momentum benchmark, but that does not establish that migration causes appreciation or that this market ranking will predict future housing prices. Forecast claims will require out-of-time model comparisons."],
 ["Schools and outdoor access","The U.S. Department of Education NCES EDGE 2024–25 public school point locations are counted within 15 km of each city representative point. NPS trailheads within 50 km use official NPS geolocated points. They are straight-line distances, not assigned schools, school quality, commute time, comprehensive recreation, or school-district catchments. Missing provider records are withheld."],
 ["Geographic mapping and regional prices","2025 Census place representative points are overlaid on generalized Census county polygons and 2023 CBSA metropolitan/micropolitan boundaries. This does not identify every county that a large city spans. BEA metropolitan price parities (U.S. 100) describe average metro price levels and must not be interpreted as city-specific household expenses."],
 ["Multivariate housing research","A new private rolling-origin ridge regression uses trailing Zillow housing indexes, lagged IRS state tax-return migration balances and prior-vintage ACS affordability. Predictions are published only where held-out mean absolute error beats BOTH simple price momentum and zero-change baselines. This is not a fully independently archived point-in-time source history, causal migration estimate or investment recommendation."],
 ["Personalized city matching","City recommendations combine an editorial landscape/culture candidate set with measured ACS cost data, city population, and (where available) NCES school locations, NPS trailhead access and metro BEA price levels. These are exploratory choices, not audited nationwide rankings for school quality, climate, hazard exposure or commutes."],
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
 const counties=(data.counties||[]).map(x=>Array.isArray(x)?{id:x[0],name:x[1],state:x[2],pop:x[3],domestic:x[4],international:x[5],rate:x[6],year:2025}:x);
 const flows=(data.state_flows||[]).map(x=>Array.isArray(x)?{orig:x[0],dest:x[1],returns:x[2],persons:x[3],year:x[4]}:x);
 migration={counties,flows};
 const irsYears=[...new Set(flows.map(x=>x.year))].sort((a,b)=>b-a);
 const censusYears=[...new Set(counties.map(x=>x.year||2025))].sort((a,b)=>b-a);
 $("migration-year").innerHTML=irsYears.map(y=>'<option value="'+y+'">'+y+' IRS tax filing year</option>').join("");
 $("migration-county-year").innerHTML=censusYears.map(y=>'<option value="'+y+'">'+y+' Census county migration</option>').join("");
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
 const countyYear=Number($("migration-county-year").value||"2025");
 const count=migration.counties.filter(x=>(x.year||2025)===countyYear&&(!st||x.state===st))
     .sort((a,b)=>dir==="outbound"?a.rate-b.rate:b.rate-a.rate);
 $("county-count").textContent=num(count.length)+" counties";
 $("county-table").innerHTML=count.length?count.slice(0,180).map(x=>
 '<tr><td>'+e(x.name)+'</td><td>'+e(x.state)+'</td><td class="right">'+num(x.pop)+'</td>'+
 '<td class="right '+diff(x.domestic)+'">'+num(x.domestic)+'</td><td class="right">'+num(x.international)+'</td>'+
 '<td class="right '+diff(x.rate)+'">'+nice(x.rate)+'</td></tr>').join(""):
 '<tr><td colspan="6" class="empty">No published counties match this selection in the '+e(migrationScope)+' preview.</td></tr>';
}
async function loadBoundaries(){
 try{
   const res=await fetch("./data/states.json",{cache:"no-cache"});
   if(!res.ok)return;
   const data=await res.json();
   if(data.vintage!==2025||!Array.isArray(data.rings)||data.rings.length<40)
     throw new Error("Invalid official Census geometry");
   stateBorders=data;
   if(selectedTab==="explore")renderMap(filtered);
 }catch(err){
   console.warn("Using simplified map until official published boundaries load",err);
 }
}
async function loadEconomy(){
 let doc=null;
 try {
   const res=await fetch("./data/economy.json",{cache:"no-cache"});
   if(res.ok)doc=await res.json();
 } catch(err){}
 if(!doc){
   economy={workplace_jobs:[],regional_price_parities:[]};
   renderEconomy(); return;
 }
 if(!Array.isArray(doc.workplace_jobs)||!Array.isArray(doc.regional_price_parities))
   throw new Error("Malformed published economy aggregate data");
 economy=doc;
 const years=[...new Set(doc.regional_price_parities.map(r=>r.year))].sort((a,b)=>b-a);
 $("bea-rpp-year").innerHTML=years.map(y=>'<option value="'+y+'">'+y+' regional price level</option>').join("");
 $("bea-rpp-year").value=years.includes(2024)?"2024":String(years[0]||2024);
 renderEconomy();
}
function renderEconomy(){
 const state=$("jobs-state");
 if(!state)return;
 if(state.options.length<=1){
  const states=[...new Set(cities.map(c=>c.s))].sort();
  state.innerHTML='<option value="">All states</option>'+states.map(st=>'<option value="'+e(st)+'">'+e(st)+'</option>').join("");
 }
 const st=state.value,sector=$("jobs-sector").value;
 const records=(economy?.workplace_jobs||[]).filter(x=>(!st||x.state===st)&&x.sector===sector);
 const keyed=new Map();
 for(const record of records){
  const key=record.state+"|"+record.sector;
  if(!keyed.has(key))keyed.set(key,{state:record.state,sector:record.sector});
  keyed.get(key)["y"+record.year]=record;
 }
 const items=[...keyed.values()];
 items.sort((a,b)=>(b.y2025?.jobs||b.y2024?.jobs||0)-(a.y2025?.jobs||a.y2024?.jobs||0));
 $("jobs-table").innerHTML=items.length?items.slice(0,130).map(x=>{
   const first=x.y2015?.jobs,latest=(x.y2025||x.y2024)?.jobs;
   const growth=first>0&&latest!=null?100*(latest-first)/first:null;
   return '<tr><td>'+e(x.state)+'</td><td>'+e(x.sector)+'</td>'+
   '<td class="right">'+num(first)+'</td><td class="right">'+num(latest)+'</td>'+
   '<td class="right '+diff(growth)+'">'+pct(growth)+'</td>'+
   '<td class="right">'+usd((x.y2025||x.y2024)?.weekly_wage)+'</td></tr>';
 }).join(""):'<tr><td colspan="6" class="empty">National industry employment export has not been published yet. City income indicators below use the verified preview and remain available.</td></tr>';
 const city=cities.filter(c=>(!st||c.s===st)&&c.inc!=null)
   .sort((a,b)=>b.inc-a.inc).slice(0,200);
 $("income-table").innerHTML=city.map(c=>'<tr><td><button class="clickcity" data-add="'+c.id+'">'+e(c.n)+', '+e(c.s)+'</button></td>'+
  '<td class="right">'+num(c.pop)+'</td><td class="right">'+usd(c.inc)+'</td>'+
  '<td class="right">'+nice(c.age)+'</td><td class="right">'+pct(c.edu)+'</td></tr>').join("")||
  '<tr><td colspan="5" class="empty">No ACS city records match this state.</td></tr>';
 const requestedYear=Number($("bea-rpp-year").value||"2024"),kind=$("bea-rpp-kind").value;
 const latest=(economy?.regional_price_parities||[]).filter(x=>x.year===requestedYear&&x.geography===kind&&(!st||(x.geography==="state"&&x.geo_id===st)));
 const usable=latest;
 usable.sort((a,b)=>b.index_value-a.index_value);
 $("rpp-table").innerHTML=usable.length?usable.slice(0,150).map(x=>
   '<tr><td>'+e(x.geography)+'</td><td>'+e(x.geo_name)+'</td>'+
   '<td class="right">'+num(x.year)+'</td><td class="right">'+nice(x.index_value)+'</td>'+
   '<td class="right '+diff(x.index_value-100)+'">'+pct(x.index_value-100)+'</td></tr>').join(""):
   '<tr><td colspan="5" class="empty">BEA regional price parity import is still under validation. An unavailable index is not a zero-cost region.</td></tr>';
}

async function loadAmenities(){
 let doc=null;
 try{
   const response=await fetch("./data/amenities.json",{cache:"no-cache"});
   if(response.ok)doc=await response.json();
 }catch(err){}
 if(!doc){geoAccess=new Map();renderAmenities();return;}
 if(!Array.isArray(doc.places)||doc.places.length<19000)throw Error("Invalid school/outdoor public source coverage");
 geoAccess=new Map(doc.places.map(row=>[row.id,row]));
 renderAmenities();renderDailyLife();renderMatch();if(selectedTab==="compare")renderCompare();
}
function renderAmenities(){
 const node=$("amenity-table");if(!node)return;
 if($("amenity-state").options.length<=1){
   $("amenity-state").innerHTML='<option value="">All states</option>'+
     [...new Set(cities.map(c=>c.s))].sort().map(s=>'<option value="'+e(s)+'">'+e(s)+'</option>').join("");
 }
 const state=$("amenity-state").value,term=$("amenity-search").value.trim().toLowerCase(),
       sort=$("amenity-sort").value;
 const keys={schools:"schools_15km",nearest_school:"nearest_school_km",
    trails:"nps_trailheads_50km",nearest_trail:"nearest_nps_trailhead_km",
    county_migration:"county_domestic_net_migration_per_1000"};
 let rows=cities.filter(c=>(!state||c.s===state)&&(!term||(c.n+" "+c.s).toLowerCase().includes(term)));
 const key=keys[sort]||keys.schools;
 const ascending=sort==="nearest_school"||sort==="nearest_trail";
 rows.sort((a,b)=>{
   const x=geoAccess?.get(a.id)?.[key],y=geoAccess?.get(b.id)?.[key];
   if(x==null&&y==null)return b.pop-a.pop;
   if(x==null)return 1;if(y==null)return -1;
   return ascending?x-y:y-x;
 });
 $("amenity-count").textContent=num(rows.length)+" cities";
 node.innerHTML=rows.slice(0,250).map(c=>{
   const d=geoAccess?.get(c.id);
   const fmt=v=>v==null?"—":nice(v);
   return '<tr><td><button class="clickcity" data-add="'+c.id+'">'+e(c.n)+', '+e(c.s)+'</button></td>'+
   '<td>'+e(d?.county_name||"—")+'</td><td>'+e(d?.metro_name||"—")+'</td>'+
   '<td class="right">'+(d?.metro_price_index==null?"—":nice(d.metro_price_index))+'</td>'+
   '<td class="right">'+num(d?.schools_15km)+'</td>'+
   '<td class="right">'+fmt(d?.nearest_school_km)+'</td>'+
   '<td class="right">'+num(d?.nps_trailheads_50km)+'</td>'+
   '<td class="right">'+fmt(d?.nearest_nps_trailhead_km)+'</td>'+
   '<td class="right '+diff(d?.county_domestic_net_migration_per_1000)+'">'+
    fmt(d?.county_domestic_net_migration_per_1000)+'</td></tr>';
 }).join("")||'<tr><td colspan="9" class="empty">No cities match these geographic filters.</td></tr>';
}
function renderDailyLife(){
 const slot=$("daily-life-table");if(!slot)return;
 const state=$("jobs-state")?.value||"";
 const rows=cities.filter(c=>!state||c.s===state)
   .filter(c=>geoAccess?.get(c.id)?.remote_work_pct!=null)
   .sort((a,b)=>(geoAccess.get(b.id)?.homes_built_2020_plus_pct??-1)-
                (geoAccess.get(a.id)?.homes_built_2020_plus_pct??-1)).slice(0,200);
 slot.innerHTML=rows.length?rows.map(c=>{
   const d=geoAccess.get(c.id);
   return '<tr><td><button class="clickcity" data-add="'+c.id+'">'+e(c.n)+', '+e(c.s)+'</button></td>'+
     ['remote_work_pct','transit_commute_pct','commute_over_45_pct',
       'homes_built_2020_plus_pct','vacant_for_rent_share_pct'].map(x=>
         '<td class="right">'+pct(d[x])+'</td>').join("")+'</tr>';
 }).join(""):'<tr><td colspan="6" class="empty">2024 ACS commuting and housing-stock indicators have not been populated in the latest approved release.</td></tr>';
}
async function loadModels(){
 let doc;
 try{
  const response=await fetch("./data/models.json",{cache:"no-cache"});
  if(response.ok)doc=await response.json();
 }catch(err){}
 if(!doc){models={holdout:[],conditionally_published_forecasts:[]};renderModels();return;}
 if(!Array.isArray(doc.holdout)||!Array.isArray(doc.conditionally_published_forecasts))
   throw Error("Invalid published housing model diagnostics");
 models=doc;renderModels();
}
function renderModels(){
 const node=$("model-metrics");
 if(!node)return;
 const tests=models?.holdout||[];
 const good=tests.filter(t=>t.better_than_both===1);
 node.innerHTML=tests.length?tests.map(t=>{
   const valid=t.better_than_both===1;
   return '<article><span>'+e(t.horizon)+'-YEAR HOUSING CHANGE</span>'+
    '<h3>'+nice(t.model_mae_pp)+' pp model MAE</h3>'+
    '<p>Momentum: '+nice(t.momentum_mae_pp)+' pp · Zero-change: '+nice(t.zero_mae_pp)+' pp</p>'+
    '<p>'+num(t.test_count)+' historical test observations · '+(valid?
      'Passed both baseline gates':'Did not beat both baselines; predictions withheld')+'</p></article>';
 }).join(""):'<article><h3>Validation pending</h3><p>New model results have not been published yet. The descriptive city momentum watchlist remains available.</p></article>';
 if(models){
   const longHorizon=tests.find(t=>t.horizon===5);
   const origins=longHorizon?JSON.parse(longHorizon.test_cutoffs||"[]"):[];
   $("model-warning").textContent=
     "Model validation is retrospective, using current-revised Zillow histories and lagged IRS state tax-return data. "+
     good.length+" of "+tests.length+" horizons beat both simple benchmarks. "+
     (origins.length<3?"The 5-year model has only "+origins.length+" historical forecast-origin years; treat it as preliminary. ":"")+
     "No causal migration effect is established and error bands are empirical, not guaranteed.";
 }
}
loadData().catch(err=>{$("scope").textContent="CityAtlas data unavailable: "+err.message;console.error(err);});
})();