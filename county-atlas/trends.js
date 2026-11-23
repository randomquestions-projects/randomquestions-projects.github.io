/* CountyScope history: real Census ACS five-year county vintages. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
let data=null,started=false,records=new Map();
const fmt=(n,k)=>!Number.isFinite(n)?'—':k==='income'?'$'+Math.round(n).toLocaleString('en-US'):n.toFixed(1)+'%';
function metricRows(field,from,to,st){
 const rows=[];
 for(const [fips,obs] of records){
  if(st&&!fips.startsWith(st))continue;
  const before=obs[String(from)]?.[field],after=obs[String(to)]?.[field];
  if(!Number.isFinite(before)||!Number.isFinite(after))continue;
  rows.push({fips,before,after,delta:after-before});
 }
 return rows;
}
function render(){
 if(!data)return;
 const field=$('trend-metric').value,from=Number($('trend-from').value),
  to=Number($('trend-to').value),state=$('trend-state').value,sort=$('trend-sort').value;
 const meta=data.fields[field],notice=$('trend-warning');
 if(!meta||from>=to){notice.textContent='Choose a valid chronological year pair.';return;}
 const rows=metricRows(field,from,to,state);
 if(!rows.length){notice.textContent='No comparable county observations for this choice.';return;}
 notice.textContent=data.comparable_note+' · '+
  (meta.direction==='neutral'?'Demographic shifts are not inherently good or bad.':'Higher values count as improvement for this metric.');
 rows.sort((a,b)=>sort==='rise'?b.delta-a.delta:sort==='fall'?a.delta-b.delta:Math.abs(b.delta)-Math.abs(a.delta));
 const tbody=$('trend-rankings');tbody.replaceChildren();
 for(const row of rows.slice(0,100)){
  const tr=document.createElement('tr');
  for(const value of [row.fips,fmt(row.before,field),fmt(row.after,field),
   (row.delta>0?'+':'')+(field==='income'?'$'+Math.round(row.delta).toLocaleString('en-US'):row.delta.toFixed(2)+' pp')]){
   const td=document.createElement('td');td.textContent=value;tr.append(td);
  }
  tbody.append(tr);
 }
 $('trend-coverage').textContent=rows.length.toLocaleString()+' counties';
 $('trend-measure').textContent=field==='income'?'Nominal USD':'Percentage points';
 $('trend-years').textContent=from+' → '+to;
 const vals=new Map(rows.map(r=>[r.fips,r]));
 const abs=rows.map(r=>Math.abs(r.delta)).sort((a,b)=>a-b),limit=Math.max(1e-6,d3.quantile(abs,.95)||1);
 d3.select('#trend-svg').selectAll('path.trend-county').attr('fill',f=>{
  const v=vals.get(String(f.id).padStart(5,'0'));
  return v?d3.interpolateRdBu(Math.max(0,Math.min(1,.5+v.delta/(limit*2)))):'#edf0ed';
 }).attr('opacity',f=>state&&!String(f.id).startsWith(state)?0.22:1)
   .select('title').text(f=>{
    const item=vals.get(String(f.id).padStart(5,'0'));
    return (f.properties?.name||String(f.id))+': '+
      (item?(fmt(item.before,field)+' to '+fmt(item.after,field)):'No comparable data');
   });
 $('trend-legend').textContent='Red indicates a negative change; blue a positive change. Grey means no comparable data. Change direction is not always a quality judgment.';
}
async function init(){
 if(started)return;started=true;
 const status=$('trend-status');
 try{
  const response=await fetch('data/county-history.json',{cache:'no-store'});
  if(!response.ok)throw Error('Historical county data has not been published');
  const incoming=await response.json();
  if(incoming.version!==1||incoming.dataset!=='CountyScope validated ACS 5-year county history'||
    !Array.isArray(incoming.counties)||incoming.counties.length<3050)throw Error('Invalid historical snapshot');
  data=incoming;
  for(const row of incoming.counties){
   if(!/^\d{5}$/.test(row.fips)||records.has(row.fips))throw Error('Invalid county FIPS');
   records.set(row.fips,row.observations);
  }
  for(const [name,meta] of Object.entries(incoming.fields)){
   if(!/^[a-z_]+$/.test(name)||!['percent','USD'].includes(meta.unit))continue;
   const o=document.createElement('option');o.value=name;
   o.textContent=name.replaceAll('_',' ').replace(/^\w/,x=>x.toUpperCase())+(meta.unit==='USD'?' ($)':' (%)');
   $('trend-metric').append(o);
  }
  for(const year of incoming.years){
   for(const id of ['trend-from','trend-to']){
    const option=document.createElement('option');option.value=year;option.textContent=year+' ACS 5-year';
    $(id).append(option);
   }
  }
  $('trend-from').value='2019';$('trend-to').value='2024';$('trend-metric').value='college';
  const topology=await d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json');
  const features=topojson.feature(topology,topology.objects.counties).features;
  const projection=d3.geoAlbersUsa().fitSize([985,595],{type:'FeatureCollection',features});
  d3.select('#trend-svg').selectAll('path.trend-county').data(features).join('path')
   .attr('class','trend-county').attr('d',d3.geoPath(projection))
   .attr('stroke','#fff').attr('stroke-width',.3).append('title');
  for(const state of [...new Set([...records.keys()].map(x=>x.slice(0,2)))].sort()){
   const option=document.createElement('option');option.value=state;option.textContent=state;
   $('trend-state').append(option);
  }
  for(const id of ['trend-metric','trend-from','trend-to','trend-state','trend-sort'])
   $(id).addEventListener('change',render);
  $('trend-data-unavailable').hidden=true;
  $('trend-svg').hidden=false;
  status.textContent='ACS history: '+incoming.years.join(', ')+' · '+records.size.toLocaleString()+' county identities';
  render();
 }catch(e){
  status.textContent='Unavailable on public GitHub Pages';
  const missing=$('trend-data-unavailable');
  if(missing)missing.hidden=false;
  $('trend-svg').hidden=true;
  $('trend-warning').textContent='The 2014, 2019 and 2024 ACS history is stored in the private CountyScope repository; the public site cannot load it.';
  for(const id of ['trend-metric','trend-from','trend-to','trend-state','trend-sort']){
   const el=$(id);
   if(el)el.disabled=true;
  }
  $('trend-coverage').textContent='Private dataset';
  $('trend-rankings').replaceChildren();
  const row=document.createElement('tr'),cell=document.createElement('td');
  cell.colSpan=4;
  cell.textContent='Historical metrics are unavailable on this public site; no estimates or rankings are fabricated.';
  row.append(cell);
  $('trend-rankings').append(row);
  data=null;
 }
}
window.CountyTrends={init};
})();