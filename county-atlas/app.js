(() => {
'use strict';
const $ = id => document.getElementById(id);
const E=window.CountyExtras;if(!E)throw Error('Census enrichment module missing');
const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—';
const sources = {
  public: 'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Public_School_Locations_Current/FeatureServer/0',
  private: 'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Private_School_Locations_Current/FeatureServer/0',
  worship: 'https://services.arcgis.com/rD2ylXRs80UroD90/ArcGIS/rest/services/US_All_Places_of_Worship/FeatureServer/0',
  shape: 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json',
  population: 'https://api.census.gov/data/2020/dec/pl?get=NAME%2CP1_001N&for=county%3A%2A'
};
const titles={churches:'Religious congregations by county',schools:'All K–12 schools by county',public:'Public K–12 schools by county',private:'Private K–12 schools by county',ratio:'K–12 schools per 100 congregations',congregations_ratio:'Congregations per 100 K–12 schools'};
const names={churches:'Reported congregations',schools:'Recorded K–12 schools',public:'Public K–12 schools',private:'Private K–12 schools',ratio:'Schools per 100 congregations',congregations_ratio:'Congregations per 100 schools'};
const colors=['#e4f2eb','#bfdfd2','#9bcdbd','#76b5a4','#519b8b','#277d6f','#165b50'];
for(const [key,meta] of Object.entries(E.metrics)){titles[key]=meta.title;names[key]=meta.label;}
const countTypes=new Set(['churches','schools','public','private','veterans','microbusiness','nonemployer','startups']);
const canNormalize=()=>countTypes.has(S.variable),isExtra=()=>Object.hasOwn(E.metrics,S.variable);
const S={features:[], stateFeatures:[],stateNames:new Map(),rows:new Map(),selected:null,variable:'churches',mode:'count',stateId:'',search:'',rankLimit:30,dirKind:'public',dirItems:[],dirLimit:35,dirCache:new Map(),dirTicket:0,ready:{public:false,private:false,churches:false,population:false},pending:4,errors:[]};
let svg,projection,path,zoom,topology,countyGroup;
const fips = v => String(v==null?'':v).replace(/\D/g,'').padStart(5,'0').slice(-5);
function row(id) { if(!S.rows.has(id))S.rows.set(id,{public:null,private:null,churches:null,population:null});return S.rows.get(id); }
const title = f => (f.properties&&f.properties.name)||('County '+f.id);
const region = f => S.stateNames.get(String(f.id).slice(0,2))?.name || 'United States';
const full = f => title(f)+', '+region(f);
const schoolTotal = r => !r || r.public==null || r.private==null ? null : r.public+r.private;
const isRatio = () => S.variable==='ratio'||S.variable==='congregations_ratio';
// "Churches" in the source is the US Religion Census count of participating congregations,
// not a count of Christian church buildings. Do not interpret missing or zero denominators as 0.
const schoolsPer100 = r => {
 const schools=schoolTotal(r);
 return schools==null || r?.churches==null || r.churches<=0 ? null : schools*100/r.churches;
};
const congregationsPer100Schools = r => {
 const schools=schoolTotal(r);
 return schools==null || schools<=0 || r?.churches==null ? null : r.churches*100/schools;
};
const compare = r => !r?null:S.variable==='schools'?schoolTotal(r):S.variable==='ratio'?schoolsPer100(r):S.variable==='congregations_ratio'?congregationsPer100Schools(r):r[S.variable];
function val(r) { if(!r)return null;const n=compare(r);return n==null||!Number.isFinite(n)?null:canNormalize()&&S.mode==='rate'?(r.population>0?n*10000/r.population:null):n; }
const presentation=n=>n==null||!Number.isFinite(n)?'—':E.metrics[S.variable]?.kind==='money'?'$'+fmt(n):E.metrics[S.variable]?.kind==='percent'?n.toFixed(1)+'%':isRatio()||(canNormalize()&&S.mode==='rate')?n.toFixed(1):fmt(n);
function acceptable(f) { return (!S.stateId||String(f.id).startsWith(S.stateId))&&(!S.search||(full(f)+' '+f.id).toLowerCase().includes(S.search)); }
async function fetchData(url,timeout=35000) {
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
 try { const r=await fetch(url,{signal:c.signal,mode:'cors'});if(!r.ok)throw Error('HTTP '+r.status);return await r.json(); }
 finally{clearTimeout(t);}
}
async function service(base,params) {
 const url=base+'/query?'+new URLSearchParams(Object.assign({f:'json'},params));
 const data=await fetchData(url,45000);
 if(data.error)throw Error(data.error.message||'ArcGIS query failed');
 if(!Array.isArray(data.features))throw Error('ArcGIS response does not contain features');
 return data.features;
}
async function counts(kind) {
 const outStats=JSON.stringify([{statisticType:'count',onStatisticField:'OBJECTID',outStatisticFieldName:'cnt'}]);
 let offset=0,pages=0,matched=new Map();
 while(true){
  const rows=await service(sources[kind],{where:'1=1',groupByFieldsForStatistics:'STFIP,CNTY',outStatistics:outStats,orderByFields:'STFIP,CNTY',returnGeometry:'false',resultOffset:String(offset),resultRecordCount:'2000'});
  rows.forEach(f=>{const a=f.attributes||{},county=String(a.CNTY||''),st=String(a.STFIP||'');if(/^\d{1,5}$/.test(county)){const code=county.length<=3&&/^\d{1,2}$/.test(st)?st.padStart(2,'0')+county.padStart(3,'0'):fips(county);matched.set(code,Number(a.cnt));}});
  offset+=rows.length;pages++;
  if(rows.length<2000||pages>=10)break;
 }
 if(matched.size<2800)throw Error('Incomplete '+kind+' county aggregation: '+matched.size);
 S.features.forEach(f=>row(String(f.id))[kind]=matched.get(String(f.id))??0);
 S.ready[kind]=true;
}
async function population(){
 const rec=await fetchData(sources.population,40000),head=rec[0],v=head.indexOf('P1_001N'),s=head.indexOf('state'),c=head.indexOf('county');
 if(v<0||s<0||c<0)throw Error('Census schema mismatch');
 let n=0;
 rec.slice(1).forEach(a=>{const id=String(a[s]).padStart(2,'0')+String(a[c]).padStart(3,'0');if(S.rows.has(id)&&Number.isFinite(+a[v])){row(id).population=+a[v];n++;}});
 if(n<3000)throw Error('Census county population incomplete');
 S.ready.population=true;
}
async function published(){
 try{
  const obj=await fetchData('data/county-counts.json?v=1',10000);
  if(obj.version!==1||!Array.isArray(obj.counties)||obj.counties.length<3000)return;
  obj.counties.forEach(a=>{const id=fips(a.fips);if(!S.rows.has(id))return;for(const k of ['public','private','churches','population'])if(Number.isFinite(a[k])&&a[k]>=0)row(id)[k]=a[k];});
  for(const k of Object.keys(S.ready))if(S.features.filter(f=>row(String(f.id))[k]!=null).length>3000)S.ready[k]=true;
 }catch(e){ /* Live NCES and Census fallback below. */ }
}
function renderMap(){
 const vals=S.features.filter(acceptable).map(f=>val(row(String(f.id)))).filter(n=>n!=null&&n>0);
 const q=d3.scaleQuantile().domain(vals.length?vals:[1]).range(colors);
 countyGroup.selectAll('path').attr('fill',f=>{const n=val(row(String(f.id)));return n==null?'#edf0ef':n===0?'#f3f8f4':q(n);})
 .style('opacity',f=>acceptable(f)?1:.17);
 $('legend-mid').textContent=presentation(d3.median(vals)||0);
 $('legend-high').textContent=presentation(d3.max(vals)||0);
 $('map-title').textContent=titles[S.variable];

 const ratio=isRatio();
 $('measurement').disabled=!canNormalize(); // Ratios, income and shares have fixed units.
 if(!canNormalize()){S.mode='count';$('measurement').value='count';}
 $('map-subtitle').textContent=isExtra()?E.metrics[S.variable].year+' · '+E.metrics[S.variable].label:ratio
  ? (S.variable==='ratio'
      ? '2024–25 public + 2023–24 private K–12 schools ÷ 2020 USRC congregations × 100'
      : '2020 USRC congregations ÷ (2024–25 public + 2023–24 private K–12 schools) × 100')
  : (S.variable==='churches'?'2020 U.S. Religion Census':S.variable==='private'?'2023–24 NCES':S.variable==='public'?'2024–25 NCES':'2024–25 public + 2023–24 private')+' · '+(S.mode==='rate'?'per 10,000 residents':'recorded location counts');
 $('source-year').textContent=isExtra()?E.metrics[S.variable].year:ratio?'NCES / USRC':S.variable==='churches'?'2020':'NCES';
 const rows=S.features.filter(acceptable).map(f=>row(String(f.id)));
 $('summary-heading').textContent=ratio?(S.variable==='ratio'?'SCHOOLS / CONGREGATIONS':'CONGREGATIONS / SCHOOLS'):isExtra()?'SELECTED METRIC':'NATIONAL TOTAL';
 if(isExtra() && E.metrics[S.variable].kind==='percent'){
  const metric=E.metrics[S.variable],complete=rows.filter(r=>r[metric.numerator]!=null&&r[metric.denominator]>0);
  const numerator=complete.reduce((n,r)=>n+r[metric.numerator],0);
  const denominator=complete.reduce((n,r)=>n+r[metric.denominator],0);
  $('total').textContent=denominator>0?(100*numerator/denominator).toFixed(1)+'%':'—';
  $('total-label').textContent=names[S.variable]+' · pooled share of reporting counties';
  $('county-coverage').textContent=fmt(complete.length)+' counties reporting';
 }else if(isExtra() && E.metrics[S.variable].kind==='money'){
  const values=rows.map(r=>r.income).filter(n=>n!=null&&Number.isFinite(n));
  $('total').textContent=values.length?'$'+fmt(d3.median(values)):'—';
  $('total-label').textContent='Median of county medians · not national household median';
  $('county-coverage').textContent=fmt(values.length)+' counties reporting';
 }else if(ratio) {
  // Weighted national or filtered ratio from pooled counts, not an average of county ratios.
  // Include counties with valid reported zeros; only an aggregate zero denominator is undefined.
  const complete=rows.filter(r=>schoolTotal(r)!=null && r.churches!=null);
  const schools=complete.reduce((n,r)=>n+schoolTotal(r),0);
  const congregations=complete.reduce((n,r)=>n+r.churches,0);
  const numerator=S.variable==='ratio'?schools:congregations;
  const denominator=S.variable==='ratio'?congregations:schools;
  $('total').textContent=denominator>0?(numerator*100/denominator).toFixed(1):'—';
  $('total-label').textContent=names[S.variable]+(S.stateId||S.search?' · filtered':' · nationwide');
  $('county-coverage').textContent=fmt(rows.filter(r=>val(r)!=null).length)+' counties with defined ratio';
 } else {
  const values=rows.map(compare).filter(n=>n!=null&&Number.isFinite(n));
  $('total').textContent=values.length?fmt(values.reduce((a,b)=>a+b,0)):'—';
  $('total-label').textContent=names[S.variable]+(S.stateId||S.search?' · filtered':' · nationwide');
  $('county-coverage').textContent=fmt(values.length)+' counties covered';
 }
 $('rank-column').textContent=isExtra()?names[S.variable]:ratio?(S.variable==='ratio'?'Schools per 100':'Congregations per 100'):S.mode==='rate'?'Per 10K':S.variable==='churches'?'Congregations':'Schools';
 renderSide();rankings();
 const available=isExtra()?E.ready[E.metrics[S.variable].group]:(S.variable==='schools'||isRatio())?S.ready.public&&S.ready.private&&(!isRatio()||S.ready.churches):S.ready[S.variable];
 const waiting=isExtra()?E.pending:S.pending;
 const status=waiting?'Loading national data…':available?'Official datasets · loaded':'Data source unavailable'+(isExtra()?' · Census API may require a key':'');
 $('data-state').textContent=status;
 $('data-state').classList.toggle('warning',!waiting&&!available);
}
function renderSide(){
 const f=S.selected,r=f?row(String(f.id)):null;
 $('selected-name').textContent=f?title(f):'Select a county';
 $('selected-state').textContent=f?region(f)+' · FIPS '+f.id:'Click a county on the map or in the rankings.';
 $('selected-metric-label').textContent=names[S.variable]+(canNormalize()&&S.mode==='rate'?' per 10K':'');
 $('selected-value').textContent=f?presentation(val(r)):'—';
 $('selected-public').textContent=fmt(r?.public);$('selected-private').textContent=fmt(r?.private);
 $('selected-churches').textContent=fmt(r?.churches);$('selected-pop').textContent=fmt(r?.population);
 for(const [id,value] of [
 ['selected-income',r?.income==null?'—':'$'+fmt(r.income)],
 ['selected-hs',r?.highschool==null?'—':r.highschool.toFixed(1)+'%'],
 ['selected-college',r?.college==null?'—':r.college.toFixed(1)+'%'],
 ['selected-veterans',fmt(r?.veterans)],
 ['selected-self',r?.self_employed==null?'—':r.self_employed.toFixed(1)+'%'],
 ['selected-nonemp',fmt(r?.nonemployer)]]){const element=$(id);if(element)element.textContent=value;}
 $('open-directory').disabled=!f;
 d3.select('#selected-outline').attr('d',f?path(f):null);
}
function rankings(){
 const list=S.features.filter(acceptable).map(f=>({f,n:val(row(String(f.id)))})).filter(x=>x.n!=null)
 .sort((a,b)=>b.n-a.n||full(a.f).localeCompare(full(b.f)));
 $('ranking-status').textContent=fmt(list.length)+' counties with data';
 const body=$('rankings');body.replaceChildren();
 if(!list.length){body.innerHTML='<tr><td colspan="5" class="loading">No county totals available with these filters.</td></tr>';return;}
 for(const x of list.slice(0,S.rankLimit)){
  const tr=document.createElement('tr');
  [title(x.f),region(x.f),presentation(x.n),fmt(row(String(x.f.id)).public==null||row(String(x.f.id)).private==null?null:row(String(x.f.id)).public+row(String(x.f.id)).private)].forEach((t,i)=>{const td=document.createElement('td');td.textContent=t;if(i>1)td.className='num';tr.append(td);});
  const td=document.createElement('td'),b=document.createElement('button');b.type='button';b.className='rank-link';b.textContent='Inspect ↗';b.addEventListener('click',()=>select(x.f));td.append(b);tr.append(td);body.append(tr);
 }
 $('show-more').hidden=list.length<=S.rankLimit;
}
function zoomTo(f,cap=7) {
 const b=path.bounds(f);const dx=b[1][0]-b[0][0],dy=b[1][1]-b[0][1];
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||dx<.001||dy<.001)return;
 const scale=Math.min(cap,Math.max(1,.85/Math.max(dx/1060,dy/655)));
 const x=(b[0][0]+b[1][0])/2,y=(b[0][1]+b[1][1])/2;
 svg.transition().duration(400).call(zoom.transform,d3.zoomIdentity.translate(530-scale*x,327.5-scale*y).scale(scale));
}
function resetZoom(){svg.transition().duration(400).call(zoom.transform,d3.zoomIdentity);}
function select(f){
 S.selected=f;S.dirCache.clear();S.dirItems=[];S.dirLimit=35;
 $('directory-title').textContent=title(f)+' directory';$('directory-search').value='';
 renderSide();zoomTo(f);loadDirectory();
}
function renderDirectory(){
 const q=$('directory-search').value.trim().toLowerCase();
 const list=S.dirItems.filter(a=>!q||String(a.NAME||'').toLowerCase().includes(q)||String(a.CITY||'').toLowerCase().includes(q));
 $('directory-status').textContent=fmt(list.length)+' reported locations';
 const parent=$('directory-list');parent.replaceChildren();
 if(!list.length){parent.innerHTML='<div class="directory-placeholder">No locations in this source for these filters.</div>';}
 for(const a of list.slice(0,S.dirLimit)){
  const div=document.createElement('div');div.className='location';
  const h=document.createElement('h4');h.textContent=a.NAME||'Unnamed location';
  const p=document.createElement('p');p.textContent=[a.STREET,a.CITY,a.STATE,a.ZIP].filter(Boolean).join(', ');
  div.append(h,p);
  if(a.NCESSCH||a.PPIN){const small=document.createElement('p');small.textContent='NCES ID '+(a.NCESSCH||a.PPIN);div.append(small);}
  parent.append(div);
 }
 $('directory-more').hidden=list.length<=S.dirLimit;
}
async function loadDirectory(){
 const ticket=++S.dirTicket;if(!S.selected)return;
 const key=S.selected.id+':'+S.dirKind;
 $('directory-status').textContent='Loading…';
 $('directory-list').innerHTML='<div class="directory-placeholder">Searching the national source for county locations…</div>';
 if(S.dirCache.has(key)){S.dirItems=S.dirCache.get(key);renderDirectory();return;}
 try {
  let fields, limit=S.dirKind==='worship'?1000:2000;
  if(S.dirKind==='worship'){
   const b=d3.geoBounds(S.selected);
   fields={where:'1=1',geometry:JSON.stringify({xmin:b[0][0],ymin:b[0][1],xmax:b[1][0],ymax:b[1][1],spatialReference:{wkid:4326}}),geometryType:'esriGeometryEnvelope',spatialRel:'esriSpatialRelIntersects',inSR:'4326',outSR:'4326',returnGeometry:'true',outFields:'NAME,STREET,CITY,STATE,ZIP,FID'};
  } else {
   fields={where:"(CNTY='"+fips(S.selected.id)+"' OR (STFIP='"+String(S.selected.id).slice(0,2)+"' AND CNTY='"+String(S.selected.id).slice(2)+"'))",returnGeometry:'false',outFields:S.dirKind==='public'?'NAME,STREET,CITY,STATE,ZIP,NCESSCH':'NAME,STREET,CITY,STATE,ZIP,PPIN'};
  }
  let list=[],offset=0;
  for(let page=0;page<20;page++){
    const records=await service(sources[S.dirKind],Object.assign({},fields,{resultOffset:String(offset),resultRecordCount:String(limit),orderByFields:'NAME'}));
    if(ticket!==S.dirTicket)return;
    records.forEach(rec=>{
      if(S.dirKind==='worship'&&rec.geometry?.x!=null&&!d3.geoContains(S.selected,[rec.geometry.x,rec.geometry.y]))return;
      list.push(rec.attributes||{});
    });
    offset+=records.length;if(records.length<limit)break;
  }
  S.dirCache.set(key,list);S.dirItems=list;renderDirectory();
 }catch(e){
  if(ticket!==S.dirTicket)return;
  $('directory-status').textContent='Source unavailable';
  $('directory-list').innerHTML='<div class="directory-placeholder">Could not retrieve this live directory. Please retry later.</div>';
  $('directory-more').hidden=true;
 }
}
function mapInit(){
 const features=topojson.feature(topology,topology.objects.counties).features;
 S.features=features.filter(f=>!['60','66','69','72','78'].includes(String(f.id).slice(0,2)));
 S.features.forEach(f=>row(String(f.id)));
 const states=topojson.feature(topology,topology.objects.states).features;
 S.stateFeatures=states.filter(f=>!['60','66','69','72','78'].includes(String(f.id).padStart(2,'0')));
 S.stateFeatures.forEach(f=>S.stateNames.set(String(f.id).padStart(2,'0'),{name:f.properties?.name||String(f.id),feature:f}));
 [...S.stateNames].sort((a,b)=>a[1].name.localeCompare(b[1].name)).forEach(([id,s])=>{const o=document.createElement('option');o.value=id;o.textContent=s.name;$('state').append(o);});
 svg=d3.select('#map');projection=d3.geoAlbersUsa().fitExtent([[25,18],[1035,638]],{type:'FeatureCollection',features:S.features});
 path=d3.geoPath(projection);
 const viewport=svg.append('g');
 ['counties','state-lines','selected-outline'].forEach(id=>viewport.node().appendChild($(id)));
 countyGroup=d3.select('#counties');
 const tip=$('tooltip'),parent=$('map').parentElement;
 countyGroup.selectAll('path').data(S.features).join('path')
   .attr('class','county').attr('d',path).attr('fill','#edf0ef').attr('role','button').attr('tabindex',0)
   .attr('aria-label',d=>'View '+full(d)).on('click',(e,d)=>{e.stopPropagation();select(d);})
   .on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(d);}})
   .on('mousemove',(e,d)=>{
      tip.replaceChildren();
      const b=document.createElement('strong');b.textContent=full(d);
      const n=document.createElement('span');n.textContent=names[S.variable]+': '+presentation(val(row(String(d.id))))+(canNormalize()&&S.mode==='rate'?' per 10K':'');
      tip.append(b,n);tip.hidden=false;
      const rect=parent.getBoundingClientRect();
      tip.style.left=Math.min(Math.max(8,e.clientX-rect.left+14),Math.max(8,rect.width-210))+'px';
      tip.style.top=Math.min(Math.max(8,e.clientY-rect.top+12),Math.max(8,rect.height-70))+'px';
   }).on('mouseleave',()=>tip.hidden=true);
 d3.select('#state-lines').attr('d',path(topojson.mesh(topology,topology.objects.states,(a,b)=>a!==b)));
 zoom=d3.zoom().scaleExtent([1,15]).on('zoom',e=>viewport.attr('transform',e.transform));
 svg.call(zoom).on('dblclick.zoom',null);
 $('zoom-in').addEventListener('click',()=>svg.transition().duration(300).call(zoom.scaleBy,1.5));
 $('zoom-out').addEventListener('click',()=>svg.transition().duration(300).call(zoom.scaleBy,1/1.5));
 $('zoom-reset').addEventListener('click',resetZoom);
}
function controls(){
 $('variable').addEventListener('change',e=>{S.variable=e.target.value;if(!canNormalize())S.mode='count';renderMap();});
 $('measurement').addEventListener('change',e=>{S.mode=e.target.value;renderMap();});
 $('state').addEventListener('change',e=>{S.stateId=e.target.value;S.rankLimit=30;const st=S.stateNames.get(S.stateId);if(st)zoomTo(st.feature,5);else resetZoom();renderMap();});
 let timer;
 $('county-search').addEventListener('input',e=>{clearTimeout(timer);timer=setTimeout(()=>{S.search=e.target.value.trim().toLowerCase();S.rankLimit=30;renderMap();},160);});
 $('reset').addEventListener('click',()=>{
  $('variable').value='churches';$('measurement').value='count';$('state').value='';$('county-search').value='';
  Object.assign(S,{variable:S.ready.churches?'churches':'schools',mode:'count',stateId:'',search:'',rankLimit:30,selected:null});$('variable').value=S.variable;
  renderMap();resetZoom();
 });
 $('clear-selection').addEventListener('click',()=>{S.selected=null;S.dirTicket++;S.dirItems=[];renderSide();$('directory-title').textContent='County directory';$('directory-status').textContent='Select a county';$('directory-list').innerHTML='<div class="directory-placeholder">Select a county to see reported locations.</div>';resetZoom();});
 $('show-more').addEventListener('click',()=>{S.rankLimit+=50;rankings();});
 $('open-directory').addEventListener('click',()=>$('directory').scrollIntoView({behavior:'smooth',block:'start'}));
 document.querySelectorAll('[data-list]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-list]').forEach(b=>b.classList.toggle('active',b===button));
  S.dirKind=button.dataset.list;S.dirLimit=35;loadDirectory();
 }));
 $('directory-search').addEventListener('input',()=>{S.dirLimit=35;renderDirectory();});
 $('directory-more').addEventListener('click',()=>{S.dirLimit+=50;renderDirectory();});
}
async function main(){
 controls();
 if(!window.d3||!window.topojson){$('data-state').textContent='Visualization library unavailable';return;}
 try{topology=await fetchData(sources.shape,45000);mapInit();renderMap();}
 catch(e){$('data-state').textContent='County boundaries unavailable';return;}
 await published();renderMap();
 const tasks=[];
 for(const k of ['public','private']){
  if(S.ready[k]){S.pending--;continue;}
  tasks.push(counts(k).catch(e=>S.errors.push(k+': '+e.message)).finally(()=>{S.pending--;renderMap();}));
 }
 if(S.ready.population)S.pending--;
 else tasks.push(population().catch(e=>S.errors.push('Census: '+e.message)).finally(()=>{S.pending--;renderMap();}));
 S.pending--;if(!S.ready.churches)S.errors.push('USRC county summary not yet published');
 renderMap();
 await Promise.allSettled([...tasks,E.load(S.rows,()=>renderMap())]);
 if(!S.ready.churches&&(S.ready.public||S.ready.private)){
  $('variable').value='schools';S.variable='schools';renderMap();
 }
}
main().catch(e=>{$('data-state').textContent='Map unavailable';console.error(e);});
})();