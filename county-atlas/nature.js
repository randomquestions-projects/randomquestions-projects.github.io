/* CountyScope: interactive map of real National Park Service units and
 * related parks. Places are Park Atlas CC0 snapshots derived from NPS metadata.
 * Dots are park reference coordinates, not road directions or trailheads.
 */
(() => {
'use strict';
const $=id=>document.getElementById(id);
let parkData=[], projection, svg, group, selected=null, ready=false, initialized=false;
const num=n=>Number.isFinite(n)?n.toLocaleString('en-US'):'Not reported';
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;};
const active=()=>{
 const term=($('nature-search')?.value||'').trim().toLowerCase();
 const filter=$('nature-category')?.value||'national';
 const state=$('nature-state')?.value||'';
 return parkData.filter(p=>{
  if(filter==='national'&&p.category!=='National Parks')return false;
  if(filter==='units'&&p.nps_status!=='unit')return false;
  if(filter==='monuments'&&!/monument/i.test(p.designation))return false;
  if(filter==='coastal'&&!/seashore|lakeshore|island|coast/i.test(p.designation+' '+p.name))return false;
  if(filter==='historic'&&!/history|historical|memorial|battlefield/i.test(p.designation))return false;
  if(state&&!String(p.states).split(',').map(x=>x.trim()).includes(state))return false;
  if(term&&!(p.name+' '+p.states+' '+p.designation).toLowerCase().includes(term))return false;
  return true;
 });
};
function detail(p){
 selected=p;
 const panel=$('nature-selected');
 if(!panel)return;
 panel.replaceChildren();
 if(!p){panel.append(make('p','Select a park marker or an entry in the list.'));return;}
 panel.append(make('h3',p.name));
 const desc=make('p',p.designation+(p.states?' · '+p.states:''),'nature-place-type');
 panel.append(desc);
 const items=[
  ['2025 recreation visits',num(p.visitors_2025)],
  ['Recorded bird species',num(p.bird_species)],
  ['Certified dark-sky area',p.dark_sky_certified?'Yes':'Not listed'],
  ['Entrance',p.fee_free?'Listed fee-free':'Verify current fees'],
 ];
 for(const [title,value] of items){const line=make('div',null,'nature-detail-row');line.append(make('span',title),make('strong',value));panel.append(line);}
 panel.append(make('p','Coordinates are NPS park reference points, not a trailhead or entrance. Verify access, closures and fees with the NPS.'));
 const link=make('a','Official NPS park details ↗','nature-nps-link');
 link.href=p.nps_url;link.target='_blank';link.rel='noopener noreferrer';panel.append(link);
 // Also highlight the selected map marker and accessible directory entry.
 group?.selectAll('circle.nature-dot').attr('stroke',d=>d.code===p.code?'#082a22':'#ffffff')
  .attr('stroke-width',d=>d.code===p.code?2.8:0.8)
  .attr('r',d=>d.code===p.code?9.2:d.category==='National Parks'?5.1:3.8);
}
function render(){
 if(!ready||!group)return;
 const filtered=active();
 const projected=filtered.map(p=>({item:p,pt:projection([p.longitude,p.latitude])})).filter(x=>x.pt);
 const sel=group.selectAll('circle.nature-dot').data(projected.map(x=>Object.assign({},x.item,{point:x.pt})),d=>d.code)
  .join('circle').attr('class','nature-dot')
  .attr('cx',d=>d.point[0]).attr('cy',d=>d.point[1])
  .attr('r',d=>selected?.code===d.code?9.2:d.category==='National Parks'?5.1:3.8)
  .attr('fill',d=>d.category==='National Parks'?'#e0a14b':'#347d70')
  .attr('stroke',d=>selected?.code===d.code?'#082a22':'#ffffff')
  .attr('stroke-width',d=>selected?.code===d.code?2.8:0.8)
  .attr('role','button').attr('tabindex',0)
  .attr('aria-label',d=>d.name+', '+d.states)
  .on('click',(_,p)=>detail(p))
  .on('keydown',(event,p)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();detail(p);}});
 sel.append('title').text(d=>d.name+' · '+d.designation);
 const list=$('nature-results');list.replaceChildren();
 const count=$('nature-count');if(count)count.textContent=filtered.length.toLocaleString()+' matching sites';
 for(const p of filtered.slice(0,140)){
  const btn=make('button',null,'nature-place');
  btn.type='button';btn.append(make('strong',p.name),make('span',(p.states||'US')+' · '+p.designation));
  btn.addEventListener('click',()=>detail(p));
  list.append(btn);
 }
 if(filtered.length>140)list.append(make('p','Showing first 140 entries; search by name or filter by state to narrow your selection.'));
 if(selected&&!filtered.some(p=>p.code===selected.code))detail(null);
}
async function init(){
 if(initialized)return;
 initialized=true;
 const status=$('nature-status');
 try{
  const response=await fetch('data/parks.json',{cache:'no-store'});
  if(!response.ok)throw Error('National park catalogue has not yet been published');
  const data=await response.json();
  if(data.version!==1||data.dataset!=='CountyScope NPS parks locator (Park Atlas CC0)'||!Array.isArray(data.parks)||data.parks.length<400)throw Error('Invalid park catalogue');
  const codes=new Set();
  for(const p of data.parks){
   if(!p||!/^[a-z0-9]{4}$/.test(p.code)||codes.has(p.code)||typeof p.name!=='string'
      ||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180)
     throw Error('Invalid or duplicate NPS unit entry');
   codes.add(p.code);
  }
  parkData=data.parks;
  const topo=await d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json');
  const features=topojson.feature(topo,topo.objects.states).features;
  projection=d3.geoAlbersUsa().fitSize([980,585],{type:'FeatureCollection',features});
  svg=d3.select('#nature-svg');
  const path=d3.geoPath(projection);
  svg.selectAll('path.state').data(features).join('path').attr('class','nature-state')
    .attr('d',path).attr('fill','#e4efea').attr('stroke','#fafbf9').attr('stroke-width',1.2);
  group=svg.append('g').attr('class','nature-points');
  const states=new Set();
  parkData.forEach(p=>String(p.states).split(',').forEach(x=>{const code=x.trim();if(/^[A-Z]{2}$/.test(code))states.add(code);}));
  const stateEl=$('nature-state');
  [...states].sort().forEach(x=>{const o=make('option',x);o.value=x;stateEl.append(o);});
  for(const id of ['nature-search','nature-category','nature-state']){
   $(id).addEventListener(id==='nature-search'?'input':'change',render);
  }
  ready=true;
  $('nature-data-unavailable').hidden=true;
  $('nature-svg').hidden=false;
  status.textContent='Verified park catalogue · '+parkData.length+' sites · source: Park Atlas / NPS';
  detail(null);
  render();
 }catch(e){
  status.textContent='Unavailable on public GitHub Pages';
  const missing=$('nature-data-unavailable');
  if(missing)missing.hidden=false;
  $('nature-svg').hidden=true;
  for(const id of ['nature-category','nature-state','nature-search']){
   const el=$(id);
   if(el)el.disabled=true;
  }
  $('nature-count').textContent='Private dataset';
  const result=$('nature-results');
  if(result)result.textContent='The verified park catalogue is preserved in the private repository. The authenticated site is not yet deployed.';
 }
}
window.CountyNature={init};
})();