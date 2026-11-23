/* CountyScope Relationships Explorer.
 * Linked scatterplot / bivariate county map / statistical table.
 * County-level correlations are descriptive and do not measure enlistment.
 * Uses only the existing, validated, public CountyScope county rows.
 */
(() => {
'use strict';
const engine=window.CountyRelationshipStats;
const E=window.CountyExtras;
if(!engine||!E)return;
const $=id=>document.getElementById(id);
const valid=n=>typeof n==='number'&&Number.isFinite(n);
const normal=n=>valid(n)?Number(n).toLocaleString('en-US',{maximumFractionDigits:1}):'—';
const fmt=(id,n)=>{
 if(!valid(n))return '—';
 const field=METRICS[id];
 if(field?.unit==='money')return '$'+Math.round(n).toLocaleString('en-US');
 if(field?.unit==='percent')return n.toFixed(1)+'%';
 if(field?.unit==='sd')return (n>0?'+':'')+n.toFixed(2)+' SD';
 if(field?.unit==='rate')return n.toFixed(1);
 return normal(n);
};
const METRICS={
 college:{label:"Bachelor's degree+ (25+)",unit:'percent',year:'2024 ACS 5-year',get:r=>r.college},
 highschool:{label:'High-school diploma+ (25+)',unit:'percent',year:'2024 ACS 5-year',get:r=>r.highschool},
 armed_forces_share:{label:'Armed Forces residents (% age 16+)',unit:'percent',year:'2024 ACS 5-year',get:r=>r.armed_forces_share},
 veteran_share:{label:'Civilian veterans (% adults)',unit:'percent',year:'2024 ACS 5-year',get:r=>r.veteran_share},
 income:{label:'Median household income',unit:'money',year:'2024 ACS 5-year',get:r=>r.income},
 self_employed:{label:'Self-employed workers (%)',unit:'percent',year:'2024 ACS 5-year',get:r=>r.self_employed},
 schools_per_10k:{label:'K–12 schools / 10K residents',unit:'rate',year:'2023–25 NCES / 2020 Census',get:r=>r.public!=null&&r.private!=null&&r.population>0?(r.public+r.private)*10000/r.population:null},
 congregations_per_10k:{label:'Congregations / 10K residents',unit:'rate',year:'2020 USRC / 2020 Census',get:r=>r.churches!=null&&r.population>0?r.churches*10000/r.population:null},
 schools_per_100:{label:'Schools per 100 congregations',unit:'rate',year:'NCES / 2020 USRC',get:r=>r.public!=null&&r.private!=null&&r.churches>0?(r.public+r.private)*100/r.churches:null},
 congregations_per_100:{label:'Congregations per 100 schools',unit:'rate',year:'2020 USRC / NCES',get:r=>r.public!=null&&r.private!=null&&r.public+r.private>0&&r.churches!=null?r.churches*100/(r.public+r.private):null},
 nonemployer_per_10k:{label:'Nonemployer firms / 10K residents',unit:'rate',year:'2024 NES / 2020 Census',get:r=>r.nonemployer!=null&&r.population>0?r.nonemployer*10000/r.population:null},
 armed_forces_per_10k:{label:'Armed Forces residents / 10K',unit:'rate',year:'2024 ACS / 2020 Census',get:r=>r.armed_forces!=null&&r.population>0?r.armed_forces*10000/r.population:null},
 veterans_per_10k:{label:'Veterans / 10K residents',unit:'rate',year:'2024 ACS / 2020 Census',get:r=>r.veterans!=null&&r.population>0?r.veterans*10000/r.population:null},
 microbusiness_per_10k:{label:'1–4 employee establishments / 10K',unit:'rate',year:'2023 CBP / 2020 Census',get:r=>r.microbusiness!=null&&r.population>0?r.microbusiness*10000/r.population:null},
 startups_per_10k:{label:'New employer locations / 10K',unit:'rate',year:'2023 BDS / 2020 Census',get:r=>r.startups!=null&&r.population>0?r.startups*10000/r.population:null}
};
for(const [id,key] of [['seda_achievement','seda_achievement'],['seda_math','seda_math'],['seda_reading','seda_reading']]){
 METRICS[id]={label:(E.metrics[id]?.label||id),unit:'sd',year:'SEDA 6.0 · 2009–2019',get:r=>r[key]};
}
// All verified new county metrics participate in scatterplots, bivariate maps,
 // adjusted regression and correlation matrices alongside existing measures.
for(const [id,info] of Object.entries(E.metrics)){
 if(!['race','places','mortality','chrr'].includes(info.group))continue;
 METRICS[id]={label:info.label,unit:info.kind==='percent'?'percent':'rate',
              year:info.year,get:r=>r[id]};
}
const pColors=[
 ['#e8e8e8','#b5c0da','#6c83b5'],
 ['#b8d6be','#90b2b3','#567994'],
 ['#73ae80','#529a80','#346974']
];
const state={features:[],topology:null,rows:null,selectCounty:null,selected:null,initialized:false,
 x:'college',y:'armed_forces_share',color:'income',mode:'scatter',state:'',minimum:0,weight:false,
 control:'income',control2:'',moderator:'',showPop:true,points:[],lastAssess:null,scatter:null,map:null};
const get=f=>(state.rows&&state.rows.get(String(f.id)))||{};
const name=f=>(f.properties?.name||'County')+', '+(state.stateNames?.get(String(f.id).slice(0,2))?.name||'Unknown state');
const available=id=>{
 if(!id||!METRICS[id])return false;
 if(id.startsWith('seda_'))return E.ready.seda===true;
 if(E.metrics[id]&&['race','places','mortality','chrr'].includes(E.metrics[id].group))return E.ready[E.metrics[id].group]===true && (!E.fieldCoverage||E.fieldCoverage[id]>0);
 if(['college','highschool','income','veteran_share','veterans_per_10k'].includes(id))return E.ready.acs===true;
 if(id.startsWith('armed_forces'))return E.ready.military===true;
 if(id==='self_employed')return E.ready.self===true;
 if(id==='nonemployer_per_10k')return E.ready.nonemp===true;
 if(id==='microbusiness_per_10k')return E.ready.cbp===true;
 if(id==='startups_per_10k')return E.ready.bds===true;
 return true;
};
const metric=(r,id)=>{if(!r||!METRICS[id])return null;const n=METRICS[id].get(r);return valid(n)?n:null;};
const lookup=f=>Object.fromEntries(Object.keys(METRICS).map(k=>[k,metric(get(f),k)]));
function rows(){
 return state.features.filter(f=>!state.state||String(f.id).startsWith(state.state))
 .filter(f=>(get(f).population||0)>=state.minimum)
 .map(f=>{
   const values=lookup(f);
   return {feature:f,fips:String(f.id),label:name(f),values, x:values[state.x],y:values[state.y],
     color:state.color==='none'?null:values[state.color],population:get(f).population,
     xKey:state.x,yKey:state.y};
 }).filter(p=>valid(p.x)&&valid(p.y)&&valid(p.population));
}
function setNode(id,text){const el=$(id);if(el)el.textContent=text;}
function mkOpt(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
function populate(){
 const opts=Object.entries(METRICS);
 for(const id of ['rel-x','rel-y','rel-color','rel-control','rel-control2','rel-moderator']){
   const el=$(id);if(!el)continue;
   el.replaceChildren();
   if(['rel-color','rel-control','rel-control2','rel-moderator'].includes(id))el.append(mkOpt('','None'));
   for(const [key,info] of opts){
     const opt=mkOpt(key,info.label);
     opt.disabled=!available(key);
     el.append(opt);
   }
 }
 const def={'rel-x':state.x,'rel-y':state.y,'rel-color':state.color,
   'rel-control':state.control,'rel-control2':state.control2,'rel-moderator':state.moderator};
 for(const [id,val] of Object.entries(def))$(id).value=id==='rel-color'&&val==='none'?'':val;
 const sel=$('rel-state');
 sel.replaceChildren(mkOpt('','All states'));
 [...state.stateNames].sort((a,b)=>a[1].name.localeCompare(b[1].name)).forEach(([id,item])=>sel.append(mkOpt(id,item.name)));
}
function updateOptions(){
 for(const id of ['rel-x','rel-y','rel-color','rel-control','rel-control2','rel-moderator']){
   const el=$(id);if(!el)continue;
   for(const opt of el.options){
     opt.disabled=!!opt.value && (!available(opt.value) ||
       (['rel-control','rel-control2','rel-moderator'].includes(id)&&[state.x,state.y].includes(opt.value)));
   }
 }
}
function extent(a){
 const bounds=d3.extent(a);if(!valid(bounds[0]))return [0,1];
 const range=bounds[1]-bounds[0],margin=range>0?range*.045:Math.max(1,Math.abs(bounds[0])*.1);
 return [bounds[0]-margin,bounds[1]+margin];
}
function colorFor(p,scale){return state.color!=='none'&&valid(p.color)&&scale?scale(p.color):'#3b8677';}
function tooltip(content,x,y,container){
 const t=$('rel-tooltip');t.replaceChildren();
 for(const [txt,bold] of content){
   const part=document.createElement(bold?'strong':'span');part.textContent=txt;t.append(part);
 }
 const frame=container.getBoundingClientRect();
 t.hidden=false;
 t.style.left=Math.min(Math.max(6,x-frame.left+15),Math.max(8,frame.width-220))+'px';
 t.style.top=Math.min(Math.max(7,y-frame.top+12),Math.max(8,frame.height-108))+'px';
}
function hideTooltip(){const t=$('rel-tooltip');if(t)t.hidden=true;}
function selectedPoint(points){return points.find(p=>p.fips===state.selected);}
function renderScatter(points,assessment){
 const svg=d3.select('#rel-scatter');svg.selectAll('*').remove();
 const W=980,H=520,left=88,right=40,top=25,bottom=70;
 if(points.length<4){
  $('rel-color-legend').hidden=true;
  svg.append('text').attr('x',W/2).attr('y',H/2).attr('text-anchor','middle').attr('fill','#71817b').text('Select two measures with available county data.');
  return;
 }
 const xx=d3.scaleLinear().domain(extent(points.map(p=>p.x))).range([left,W-right]).nice();
 const yy=d3.scaleLinear().domain(extent(points.map(p=>p.y))).range([H-bottom,top]).nice();
 const g=svg.append('g');
 const colorValues=points.map(p=>p.color).filter(valid);
 const colorRange=d3.extent(colorValues);
 const color=state.color!=='none'&&colorValues.length?d3.scaleSequential().domain(colorRange).interpolator(d3.interpolateRgb('#c8e1d6','#246e63')):null;
 const legend=$('rel-color-legend');legend.hidden=!color;
 if(color){setNode('rel-color-name',METRICS[state.color].label);setNode('rel-color-min',fmt(state.color,colorRange[0]));setNode('rel-color-max',fmt(state.color,colorRange[1]));}
 g.append('g').attr('transform','translate(0,'+(H-bottom)+')').call(d3.axisBottom(xx).ticks(7).tickFormat(d=>formatTick(state.x,d))).call(x=>x.selectAll('text').attr('font-size',12));
 g.append('g').attr('transform','translate('+left+',0)').call(d3.axisLeft(yy).ticks(6).tickFormat(d=>formatTick(state.y,d))).call(x=>x.selectAll('text').attr('font-size',12));
 g.append('g').attr('class','scatter-grid').attr('transform','translate('+left+',0)').call(d3.axisLeft(yy).tickSize(-(W-right-left)).tickFormat('')).select('.domain').remove();
 g.append('text').attr('x',(W+left-right)/2).attr('y',H-15).attr('text-anchor','middle').attr('fill','#59756b').attr('font-size',13).text(METRICS[state.x].label);
 g.append('text').attr('x',-H/2).attr('y',22).attr('transform','rotate(-90)').attr('text-anchor','middle').attr('fill','#59756b').attr('font-size',13).text(METRICS[state.y].label);
 if(valid(assessment.slope)&&valid(assessment.intercept)){
   const domain=xx.domain();
   g.append('line').attr('x1',xx(domain[0])).attr('x2',xx(domain[1]))
     .attr('y1',yy(assessment.intercept+assessment.slope*domain[0]))
     .attr('y2',yy(assessment.intercept+assessment.slope*domain[1]))
     .attr('stroke','#db9467').attr('stroke-width',2.5).attr('stroke-dasharray','6 5').attr('pointer-events','none');
 }
 const frame=$('rel-plot-wrap');
 const radius=p=>state.showPop?Math.max(2.4,Math.min(8,Math.sqrt(p.population)/170)):3.5;
 const dots=g.selectAll('circle.rel-dot').data(points,d=>d.fips).join('circle')
   .attr('class','rel-dot').attr('cx',p=>xx(p.x)).attr('cy',p=>yy(p.y))
   .attr('r',radius).attr('fill',p=>colorFor(p,color)).attr('fill-opacity','.64')
   .attr('stroke',p=>p.fips===state.selected?'#172d2b':'#fff')
   .attr('stroke-width',p=>p.fips===state.selected?2.8:.55)
   .attr('tabindex',0).attr('role','button').attr('aria-label',p=>p.label+' · '+METRICS[state.x].label+': '+fmt(state.x,p.x)+' · '+METRICS[state.y].label+': '+fmt(state.y,p.y))
   .on('click',(event,p)=>{event.stopPropagation();choose(p);})
   .on('keydown',(event,p)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(p);}})
   .on('mousemove',(event,p)=>tooltip([[p.label,true],[METRICS[state.x].label+': '+fmt(state.x,p.x),false],[METRICS[state.y].label+': '+fmt(state.y,p.y),false],...(state.color!=='none'?[[METRICS[state.color].label+': '+fmt(state.color,p.color),false]]:[])],event.clientX,event.clientY,frame))
   .on('mouseleave',hideTooltip);
 // Draw selected dot above others, independent of sort.
 dots.filter(p=>p.fips===state.selected).raise();
 setNode('rel-plot-note','Each dot represents a county · orange dashed line = unweighted least-squares trend · dot size '+(state.showPop?'reflects population':'is constant'));
}
function formatTick(id,n){
 if(!valid(n))return '';
 if(METRICS[id].unit==='money')return '$'+d3.format('.2s')(n);
 if(METRICS[id].unit==='percent')return d3.format('.1f')(n)+'%';
 return d3.format('.2~s')(n);
}
function quantile3(values){
 const sorted=values.filter(valid).sort((a,b)=>a-b);
 if(!sorted.length)return [null,null];
 return [d3.quantileSorted(sorted,1/3),d3.quantileSorted(sorted,2/3)];
}
const rank3=(v,breaks)=>!valid(v)?null:v<=breaks[0]?0:v<=breaks[1]?1:2;
function renderBivariate(points){
 const svg=d3.select('#rel-bivariate-map');svg.selectAll('*').remove();
 const W=1000,H=610;
 if(points.length<4){
  svg.append('text').attr('x',W/2).attr('y',H/2).attr('text-anchor','middle').text('No paired county data for this comparison.');
  return;
 }
 const projection=d3.geoAlbersUsa().fitExtent([[20,18],[980,590]],{type:'FeatureCollection',features:state.features});
 const path=d3.geoPath(projection);
 const bx=quantile3(points.map(p=>p.x)),by=quantile3(points.map(p=>p.y));
 const values=new Map(points.map(p=>[p.fips,p]));
 const layer=svg.append('g').attr('class','rel-bivar-layer');
 const frame=$('rel-plot-wrap');
 layer.selectAll('path.rel-county').data(state.features).join('path').attr('class','rel-county')
   .attr('d',path).attr('fill',f=>{
    const point=values.get(String(f.id));
    return point?pColors[rank3(point.y,by)][rank3(point.x,bx)]:'#eef0ef';
   }).attr('fill-opacity',f=>{
    const id=String(f.id);return values.has(id)?1:(state.state&&!id.startsWith(state.state)?0.14:0.75);
   }).attr('stroke',f=>String(f.id)===state.selected?'#132a28':'#fff')
   .attr('stroke-width',f=>String(f.id)===state.selected?2:.22)
   .attr('vector-effect','non-scaling-stroke').attr('role','button').attr('tabindex',0)
   .attr('aria-label',f=>'Inspect '+name(f))
   .on('click',(event,f)=>{event.stopPropagation();choose({fips:String(f.id),feature:f,label:name(f),x:values.get(String(f.id))?.x,y:values.get(String(f.id))?.y});})
   .on('keydown',(event,f)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose({fips:String(f.id),feature:f,label:name(f),x:values.get(String(f.id))?.x,y:values.get(String(f.id))?.y});}})
   .on('mousemove',(event,f)=>{
    const p=values.get(String(f.id));
    tooltip([[name(f),true],[METRICS[state.x].label+': '+(p?fmt(state.x,p.x):'No paired data'),false],[METRICS[state.y].label+': '+(p?fmt(state.y,p.y):'No paired data'),false]],event.clientX,event.clientY,frame);
   }).on('mouseleave',hideTooltip);
 if(state.topology){
  svg.append('path').attr('d',path(topojson.mesh(state.topology,state.topology.objects.states,(a,b)=>a!==b)))
  .attr('fill','none').attr('stroke','#fff').attr('stroke-width',1.05).attr('pointer-events','none');
 }
 // 3 by 3 bivariate key: rows from high y at top to low y at bottom.
 const legend=$('rel-bivar-legend');legend.replaceChildren();
 for(let y=2;y>=0;y--)for(let x=0;x<3;x++){
  const sw=document.createElement('span');sw.style.background=pColors[y][x];sw.title=['Low','Middle','High'][x]+' '+METRICS[state.x].label+'; '+['Low','Middle','High'][y]+' '+METRICS[state.y].label;legend.append(sw);
 }
 setNode('rel-bivar-x',METRICS[state.x].label+' →');
 setNode('rel-bivar-y','↑ '+METRICS[state.y].label);
 setNode('rel-bivar-note','County groups use the lower and upper terciles of the currently selected paired counties. Light gray = missing or excluded. Bins are relative, not fixed national thresholds.');
}
function cell(rowA,label,value,format=true){
 const tr=document.createElement('tr');const k=document.createElement('th');k.scope='row';k.textContent=label;const td=document.createElement('td');td.textContent=format&&valid(value)?value.toFixed(3):String(value??'—');tr.append(k,td);rowA.append(tr);
}
function addTextRow(tbody,name,value,description){
 const tr=document.createElement('tr');
 for(const [val,tag] of [[name,'th'],[value,'td'],[description,'td']]){
  const node=document.createElement(tag);node.textContent=val;
  if(tag==='th')node.scope='row';tr.append(node);
 }
 tbody.append(tr);
}
function readable(n,digits=3){return valid(n)?n.toFixed(digits):'—';}
function renderStats(points,a){
 const tbl=$('rel-stat-table');tbl.replaceChildren();
 const b=engine.adjusted(points,validatedControls(),validatedModerator());
 const rows=[
  ['Counties analyzed',String(a.n),'Complete observations for both selected metrics'],
  ['Pearson correlation',readable(a.pearson),'Unweighted linear relationship across counties'],
  ['Spearman correlation',readable(a.spearman),'Rank-based association, with averaged ranks for ties'],
  ['Population-weighted Pearson',readable(a.weightedPearson),'Counties weighted by their 2020 Census population'],
  ['Unadjusted R²',readable(a.r2),'Share of county-to-county Y variance explained by a linear X trend'],
  ['Slope',valid(a.slope)?readable(a.slope,4):'—','Units of Y for a one-unit change in X (descriptive)']
 ];
 rows.forEach(r=>addTextRow(tbl,...r));
 const reg=$('rel-regression-table');reg.replaceChildren();
 if(b.error){
  addTextRow(reg,'Adjusted regression unavailable','—',b.error);
 }else{
  addTextRow(reg,'Complete-case counties',String(b.n),'Matched observations for both axes and selected controls');
  addTextRow(reg,'Adjusted standardized X effect',readable(b.beta),'Change in Y SD for a one-SD change in X, holding included controls fixed');
  addTextRow(reg,'Partial Pearson correlation',readable(b.partial),'Linear association between X and Y after removing the selected controls');
  addTextRow(reg,'Adjusted-model R²',readable(b.r2),'Descriptive explained variance in Y; not adjusted R² penalized for regressors');
  if(validatedModerator()){
   if(b.interaction){
    addTextRow(reg,'X × moderator coefficient',readable(b.interaction.betaXZ),'Difference in standardized X slope per +1 SD of moderator');
    addTextRow(reg,'X effect at moderator −1 SD',readable(b.interaction.slopeLow),'Conditional standardized slope at a moderator 1 SD below average');
    addTextRow(reg,'X effect at moderator +1 SD',readable(b.interaction.slopeHigh),'Conditional standardized slope at a moderator 1 SD above average');
    addTextRow(reg,'Interaction model R²',readable(b.interaction.r2),'Variance explained by the full regression including interaction');
   }else addTextRow(reg,'X × moderator','—','Regression collinear or not estimable with these controls');
   for(const g of b.groups||[])addTextRow(reg,g.name+' subgroup Pearson',readable(g.r),String(g.n)+' counties; moderator median split');
  }
 }
 const cov=$('rel-coverage');
 const missing=state.features.filter(f=>!state.state||String(f.id).startsWith(state.state)).filter(f=>(get(f).population||0)>=state.minimum).length-points.length;
 cov.textContent=normal(points.length)+' counties in comparison · '+normal(missing)+' missing one or both selected measures';
 const matrixList=[state.x,state.y,'income','college','highschool','armed_forces_share','veteran_share','self_employed'];
 const keys=[...new Set(matrixList)].filter(id=>available(id)).slice(0,6);
 // Pairwise matrix uses every county in the active geographic/population scope.
 // Each cell then filters to non-missing observations for its own two metrics.
 const matrixUniverse=state.features.filter(f=>(!state.state||String(f.id).startsWith(state.state))&&(get(f).population||0)>=state.minimum)
   .map(f=>({values:lookup(f)}));
 const matrix=engine.correlationMatrix(matrixUniverse,keys);
 const head=$('rel-matrix-head');head.replaceChildren();
 for(const label of ['Variable',...keys.map(k=>METRICS[k].label)]){
  const cell=document.createElement('th');cell.textContent=label;head.append(cell);
 }
 const body=$('rel-matrix-body');body.replaceChildren();
 matrix.forEach((row,i)=>{
  const tr=document.createElement('tr'),first=document.createElement('th');first.scope='row';first.textContent=METRICS[keys[i]].label;tr.append(first);
  row.forEach(item=>{
   const td=document.createElement('td');td.textContent=readable(item.r,2);
   td.title=normal(item.n)+' paired counties for this matrix cell';
   if(valid(item.r))td.style.background=item.r>=0?'rgba(38,119,97,'+(Math.abs(item.r)*.2).toFixed(2)+')':'rgba(178,79,89,'+(Math.abs(item.r)*.16).toFixed(2)+')';
   tr.append(td);
  });body.append(tr);
 });
 const directory=$('rel-county-table');directory.replaceChildren();
 const sorted=points.slice().sort((a,b)=>b.y-a.y).slice(0,25);
 sorted.forEach(p=>{
  const tr=document.createElement('tr');
  const info=[p.label,fmt(state.x,p.x),fmt(state.y,p.y),normal(p.population)];
  info.forEach(text=>{
   const td=document.createElement('td');td.textContent=text;tr.append(td);
  });
  const td=document.createElement('td'),button=document.createElement('button');
  button.type='button';button.className='rel-link';button.textContent='Inspect';
  button.addEventListener('click',()=>choose(p));td.append(button);tr.append(td);directory.append(tr);
 });
 setNode('rel-model-spec',validatedControls().length?'Controls: '+validatedControls().map(k=>METRICS[k].label).join(' + '):'No additional controls');
}
function validatedControls(){
 return [...new Set([state.control,state.control2])].filter(k=>k&&k!==state.x&&k!==state.y&&available(k));
}
function validatedModerator(){
 return state.moderator&&state.moderator!==state.x&&state.moderator!==state.y&&available(state.moderator)?state.moderator:null;
}
function choose(point){
 if(!point)return;
 state.selected=point.fips;
 const feature=point.feature||state.features.find(f=>String(f.id)===point.fips);
 if(feature&&state.selectCounty)state.selectCounty(feature);
 else highlightCounty(point.fips);
}
function highlightCounty(id){
 state.selected=String(id??'');
 setNode('rel-selected-county',state.selected?(state.features.find(f=>String(f.id)===state.selected)?.properties?.name||'Selected county'):'No county selected');
 if(!state.initialized||$('relationships-view')?.hidden)return;
 const row=state.points.find(p=>p.fips===state.selected);
 setNode('rel-selected-values',row?METRICS[state.x].label+': '+fmt(state.x,row.x)+' · '+METRICS[state.y].label+': '+fmt(state.y,row.y):'Choose a county to inspect its measures');
 const current=state.mode;
 if(current==='scatter')renderScatter(state.points,state.lastAssess||engine.assess(state.points));
 if(current==='map')renderBivariate(state.points);
}
function render(){
 if(!state.initialized)return;
 // Avoid creating thousands of SVG elements while the user is on County map.
 if($('relationships-view')?.hidden)return;
 updateOptions();
 const points=rows(),a=engine.assess(points);
 state.points=points;state.lastAssess=a;
 setNode('rel-counties',normal(points.length));
 setNode('rel-pearson-label',state.weight?'POPULATION-WEIGHTED PEARSON':'PEARSON CORRELATION');
 setNode('rel-pearson',readable(state.weight?a.weightedPearson:a.pearson));
 setNode('rel-spearman',readable(a.spearman));
 setNode('rel-r2',readable(a.r2));
 const wait=E.pending>0;
 setNode('rel-status',wait?'Loading verified county metrics…':points.length===0?'No paired county data available':normal(points.length)+' paired counties · real source data');
 setNode('rel-source',METRICS[state.x].year+' × '+METRICS[state.y].year+'. 2020 county population for weights and minimum-size filters.');
 for(const mode of ['scatter','map','stats']){
  $(mode==='scatter'?'rel-panel-scatter':mode==='map'?'rel-panel-map':'rel-panel-stats').hidden=mode!==state.mode;
 }
 $('rel-point-size-label').hidden=state.mode!=='scatter';
 $('rel-color-label').hidden=state.mode!=='scatter';
 $('rel-control-block').hidden=state.mode!=='stats';
 $('rel-moderator-block').hidden=state.mode!=='stats';
 hideTooltip();
 if(state.mode==='scatter')renderScatter(points,a);
 if(state.mode==='map')renderBivariate(points);
 if(state.mode==='stats')renderStats(points,a);
 highlightLabel();
}
function highlightLabel(){
 const row=state.points.find(p=>p.fips===state.selected);
 const selectedFeature=state.features.find(f=>String(f.id)===state.selected);
 setNode('rel-selected-county',row?row.label:selectedFeature?name(selectedFeature):'Select a county');
 setNode('rel-selected-values',row?METRICS[state.x].label+': '+fmt(state.x,row.x)+' · '+METRICS[state.y].label+': '+fmt(state.y,row.y):selectedFeature?'No complete X/Y pair for this county':'Click a dot or county to inspect its values');
}
function activeTab(tab){
 const relationships=tab==='relationships';
 $('relationships-view').hidden=!relationships;
 $('county-map-view').hidden=relationships;
 $('cs-tab-map').setAttribute('aria-selected',String(!relationships));
 $('cs-tab-relationships').setAttribute('aria-selected',String(relationships));
 if(relationships)render();
}
function bind(){
 const tabs=[['cs-tab-map','map'],['cs-tab-relationships','relationships']];
 tabs.forEach(([id,tab])=>$(id).addEventListener('click',()=>{
  activeTab(tab);
  if(window.history?.replaceState)window.history.replaceState(null,'',tab==='relationships'?'#relationships':'#county-map-view');
 }));
 const map={
  'rel-mode':['mode',v=>v],
  'rel-x':['x',v=>v],
  'rel-y':['y',v=>v],
  'rel-color':['color',v=>v||'none'],
  'rel-state':['state',v=>v],
  'rel-minpop':['minimum',v=>Number(v)||0],
  'rel-weight':['weight',v=>v==='population'],
  'rel-control':['control',v=>v],
  'rel-control2':['control2',v=>v],
  'rel-moderator':['moderator',v=>v],
  'rel-size':['showPop',v=>v==='population']
 };
 for(const [id,[key,transform]] of Object.entries(map)){
  $(id).addEventListener('change',e=>{state[key]=transform(e.target.value);render();});
 }
 $('rel-swap').addEventListener('click',()=>{
  [state.x,state.y]=[state.y,state.x];
  $('rel-x').value=state.x;$('rel-y').value=state.y;render();
 });
 $('rel-reset').addEventListener('click',()=>{
  Object.assign(state,{x:'college',y:'armed_forces_share',color:'income',mode:'scatter',state:'',minimum:0,weight:false,control:'income',control2:'',moderator:'',showPop:true,selected:null});
  populate();$('rel-mode').value='scatter';$('rel-minpop').value='0';$('rel-weight').value='county';$('rel-size').value='population';render();
 });
 $('rel-weight').addEventListener('change',()=>{ // Primary cards use chosen weight for Pearson
   setNode('rel-weight-hint',state.weight?'Population-weighted r is shown in the leading card; regression remains county-unweighted.':'Each county contributes equally to the leading correlation. Population-weighted r appears in the statistical table.');
 });
}
function init({features,rows:rowMap,topology,stateNames,selectCounty}){
 if(state.initialized)return;
 state.features=features||[];state.rows=rowMap;state.topology=topology;state.stateNames=stateNames;
 state.selectCounty=selectCounty;state.initialized=true;
 populate();bind();
 if(location.hash==='#relationships')activeTab('relationships');
 else activeTab('map');
 render();
}
function refresh(){
 if(!state.initialized)return;
 updateOptions();render();
}
window.CountyRelationships={init,refresh,highlightCounty,metrics:METRICS};
})();