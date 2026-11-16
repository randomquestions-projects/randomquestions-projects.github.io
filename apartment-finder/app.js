/* Homekind 2 — no access keys or public downloadable rental data.
   UI and preference heuristics are public. Private data lives behind a bounded API.
   Browser preferences are not uploaded/stored; a minimal preference vector is sent to rank search responses. */
(() => {
'use strict';
const ROOT='https://randomquestions-projects.github.io/apartment-finder/';
const API=String(window.HOMEKIND_API_BASE||'').replace(/\/$/,'');
const STORE='homekind.v1.'; // preserve existing taste choices, favorites, dislikes
const ORIGIN={lat:42.34216,lng:-71.12130};
const CITIES=['Brookline','Boston','Cambridge','Somerville','Newton','Watertown','Medford','Waltham','Quincy','Arlington','Belmont','Malden','Everett','Chelsea','Revere'];
const MODES=[
{id:'sunny-modern',name:'Bright & contemporary',desc:'Light finishes and lots of daylight',tags:['bright','modern'],img:'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=400&q=70'},
{id:'warm-organic',name:'Warm & organic',desc:'Earth tones and natural wood',tags:['wood','cozy'],img:'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=400&q=70'},
{id:'classic-character',name:'Historic character',desc:'Original details and moldings',tags:['historic','wood'],img:'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=400&q=70'},
{id:'industrial-loft',name:'Industrial loft',desc:'Exposed brick and big spaces',tags:['brick','loft'],img:'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&q=70'},
{id:'minimal-light',name:'Clean & minimalist',desc:'Airy, calm, uncluttered',tags:['minimal','bright'],img:'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=400&q=70'},
{id:'vintage-cozy',name:'Vintage & cozy',desc:'Personality, warmth and charm',tags:['vintage','warm'],img:'https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=400&q=70'},
{id:'urban-luxe',name:'Urban luxury',desc:'Modern kitchens and polished interiors',tags:['luxury','modern'],img:'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=70'},
{id:'dark-drama',name:'Moody & dramatic',desc:'Deep, contrasting finishes',tags:['dark','dramatic'],img:'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=400&q=70'},
];
const PROFILE_DEFAULT={budget:4500,beds:2,minSqft:0,maxMiles:0,areas:['Brookline','Boston'],amenities:[],styles:{},weights:{location:35,affordability:30,space:20,freshness:15},preferredCore:true,completed:false};
const FILTER_DEFAULT={query:'',city:'',neighborhood:'',beds:'',maxRent:'',minSqft:'',core:false,photos:false,hideRejected:true,sort:'match'};
const S={view:'discover',profile:stored('profile',PROFILE_DEFAULT),ratings:stored('ratings',{}),notes:stored('notes',{}),photoResults:stored('photoResults',{}),comparison:stored('comparison',[]),filters:structuredClone(FILTER_DEFAULT),
         current:[],known:{},result:null,page:1,market:null,map:null,markers:null,mapInit:false,
         wizardStep:0,loading:false,error:'',connected:false,visionFile:null,visionId:'',requestNumber:0};
const $=id=>document.getElementById(id);
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const num=x=>x==null||x===''||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('en-US',{maximumFractionDigits:0});
const money=x=>x==null||x===''?'Price unknown':'$'+num(x);
function stored(k,fallback){try{const s=localStorage.getItem(STORE+k);return s?JSON.parse(s):structuredClone(fallback);}catch{return structuredClone(fallback);}}
function save(k,v){try{localStorage.setItem(STORE+k,JSON.stringify(v));}catch{notify('Cannot save: browser storage full.');}}
function notify(t){const n=$('toast');n.textContent=t;n.classList.add('show');clearTimeout(notify.id);notify.id=setTimeout(()=>n.classList.remove('show'),3700);}
function origin(){return !!API;}
async function request(path,body){if(!API)throw new Error('The private listing service has not been connected yet. The Apartment DNA quiz is ready now.');
 const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),15000);
 try{const r=await fetch(API+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:ctl.signal,cache:'no-store',credentials:'omit'});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`Listing service returned ${r.status}`);return data;
 }catch(e){throw new Error(e.name==='AbortError'?'Search service timed out. Please retry.':e.message);}finally{clearTimeout(timeout);}}
function profileVector(){const p=S.profile;const good=Object.entries(S.ratings).filter(([,v])=>v===1).map(([id])=>S.known[id]).filter(Boolean);
 const learned={};if(good.length>=2){const counts={};for(const r of good){counts[r.city]=(counts[r.city]||0)+1;}learned.cities=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
 const rents=good.map(x=>x.rent).filter(x=>x!=null).sort((a,b)=>a-b);if(rents.length>1)learned.targetRent=rents[Math.floor(rents.length/2)];}
 return {budget:p.budget,beds:p.beds,minSqft:p.minSqft,areas:p.areas,weights:p.weights,preferredCore:p.preferredCore,learned};}
function remember(rows){for(const r of rows||[])if(r?.id)S.known[r.id]=r;}
function header(){const n=Object.values(S.ratings).filter(x=>x===1).length;$('saved-count').textContent=n;$('compare-count').textContent=S.comparison.length;
 $('sidebar-data-status').textContent=S.connected?'Listing service connected':'Listing service not connected';$('status-light').classList.toggle('active',S.connected);
 const count=$('nav-count');if(count)count.textContent=S.result?.total!=null?num(S.result.total):'—';
 $('top-data-label').textContent=S.connected?'Data status':'Service status';}
function view(name){S.view=name;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+name));document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===name));
 const titles={discover:'Discover',taste:'Apartment DNA',map:'Neighborhood map',saved:'Saved homes',compare:'Compare',market:'Market intelligence',vision:'Visual analysis'};
 $('crumb-view').textContent=titles[name]||name;window.scrollTo(0,0);
 if(name==='discover')renderDiscover();if(name==='taste')renderWizard();if(name==='saved')renderSaved();if(name==='compare')renderCompare();if(name==='map')renderMap();if(name==='market')renderMarket();if(name==='vision')renderVision();}
function modal(title,body){$('modal-title').textContent=title;$('modal-body').innerHTML=body;$('modal-backdrop').hidden=false;}
function closeModal(){$('modal-backdrop').hidden=true;$('modal-body').replaceChildren();}
function statusPanel(){const connected=S.connected;
 modal('Data and privacy',`<div class="panel"><h3>${connected?'Connected to private listing service':'Private listing service not connected'}</h3>
 <p class="desc">${connected?'Rental records are queried in small result pages. The full private dataset is never included in website files.':'The website is live and your taste assessment works now. The AWS search backend must be deployed before real listings can appear without a key.'}</p>
 <p class="desc">Your likes, dislikes, notes and Apartment DNA are saved in this browser. Search ranking sends only the minimum structured preferences to the private query service; no image files or notes are uploaded.</p>
 <p class="desc">Listing information can be viewed and copied one item at a time. No public site can make screen-visible information impossible to copy; this implementation prevents the unrestricted raw database download and limits repeated searches.</p>
 <p class="desc">Provider photos appear only with appropriate display rights. Currently, RentCast supplies no usable interior photos.</p>
 <button class="outline-button" id="retry-service">Retry connection</button></div>`);
 $('retry-service').onclick=async()=>{closeModal();await connect();};}
async function connect(){if(!origin()){S.connected=false;S.error='Private backend deployment required';header();renderDiscover();return;}
 try{await request('/health');S.connected=true;S.error='';header();await Promise.all([refresh(),loadMarket()]);}
 catch(e){S.connected=false;S.error=e.message;header();renderDiscover();}}
function empty(title,description,button='Take the Apartment DNA quiz'){return `<div class="empty-state"><div style="font-size:37px;color:#93ac9b">⌂</div><h3>${esc(title)}</h3><p>${esc(description)}</p><button type="button" class="primary-button" data-action="quiz">${esc(button)}</button></div>`;}
function filtersPayload(){const f=S.filters;const p=S.profile;
 return {page:S.page,limit:24,query:f.query,city:f.city,neighborhood:f.neighborhood,beds:f.beds!==''?Number(f.beds):(p.completed?p.beds:null),maxRent:f.maxRent!==''?Number(f.maxRent):(p.completed?p.budget:null),minSqft:f.minSqft!==''?Number(f.minSqft):(p.completed&&p.minSqft?p.minSqft:null),core:f.core,photos:f.photos,sort:f.sort,profile:profileVector()};}
async function refresh(){if(!S.connected){renderDiscover();return;}
 const seq=++S.requestNumber;S.loading=true;renderDiscoverResults();
 try{const data=await request('/v1/search',filtersPayload());if(seq!==S.requestNumber)return;
 S.result=data;S.current=data.items||[];remember(S.current);S.error='';}
 catch(e){if(seq!==S.requestNumber)return;S.error=e.message;S.result=null;S.current=[];}
 finally{if(seq===S.requestNumber){S.loading=false;renderDiscover();}}}
function learnedBoost(r){let delta=0;const user=S.ratings[r.id];if(user===-1)return -100;if(user===1)return 7;
 const likes=Object.entries(S.ratings).filter(([,v])=>v===1).map(([id])=>S.known[id]).filter(Boolean);
 const dislikes=Object.entries(S.ratings).filter(([,v])=>v===-1).map(([id])=>S.known[id]).filter(Boolean);
 if(likes.length<2)return 0;
 const cityLikes=likes.filter(x=>x.city===r.city).length;const cityDislikes=dislikes.filter(x=>x.city===r.city).length;
 delta+=Math.min(7,cityLikes*2)-Math.min(5,cityDislikes*2);
 return delta;}
function fit(r){return Math.max(1,Math.min(99,Math.round((r.matchScore??60)+learnedBoost(r))))}
function card(r){const rating=S.ratings[r.id]||0;const photo=r.photos?.[0];const score=fit(r);return `<article class="listing-card" data-id="${esc(r.id)}"><div class="listing-image">${photo?`<img loading="lazy" alt="Authorized listing interior" referrerpolicy="no-referrer" src="${esc(photo)}">`:'<div class="photo-placeholder"><span>⌂</span><small>Listing photo not provided</small></div>'}<div class="photo-chip">${r.area==='core'?'Coolidge Corner':r.area==='nearby'?'Near Coolidge Corner':esc(r.city)}</div></div>
 <div class="listing-body"><div class="listing-price">${money(r.rent)} <small>/month</small><b class="match-score" title="Personalized structured-data match, not a photo quality score">${score}% match</b></div>
 <h3>${esc(r.address||'Address unavailable')}${r.unit?' · '+esc(r.unit):''}</h3><p>${esc(r.city||'Greater Boston')} · ${r.distance==null?'Unknown distance':Number(r.distance).toFixed(1)+' mi from Coolidge'}</p>
 <div class="listing-specs"><span>${r.beds==null?'Beds unknown':r.beds+' beds'}</span><span>${r.baths==null?'Baths unknown':r.baths+' baths'}</span><span>${r.sqft==null?'Size unknown':num(r.sqft)+' sqft'}</span></div>
 <div class="listing-actions"><button type="button" data-save="${esc(r.id)}" class="${rating===1?'is-saved':''}">${rating===1?'♥ Saved':'♡ Save'}</button><button type="button" data-reject="${esc(r.id)}">${rating===-1?'↺ Undo':'✕ Pass'}</button><button type="button" data-compare="${esc(r.id)}" class="${S.comparison.includes(r.id)?'is-saved':''}">Compare</button><button type="button" data-detail="${esc(r.id)}">Details ↗</button></div></div></article>`;}
function summary(){const totals=S.result?.total;if(totals==null)return[['Inventory','—'],['Coolidge core','—'],['Saved homes',Object.values(S.ratings).filter(x=>x===1).length],['Source photos','—']];
 return [['Matching results',totals],['Page',S.page],['Saved homes',Object.values(S.ratings).filter(x=>x===1).length],['Photos on page',S.current.filter(x=>x.photos?.length).length]];}
function renderStats(){$('summary').innerHTML=summary().map(([name,x])=>`<div class="stat"><span>${esc(name)}</span><strong>${esc(num(x))}</strong><small>${name==='Photos on page'?'Licensed photos only':'Source-backed records'}</small></div>`).join('');header();}
function renderFilters(){const f=S.filters;const cities=CITIES.map(c=>`<option value="${c}" ${f.city===c?'selected':''}>${c}</option>`).join('');const neigh=['','coolidge','back-bay','fenway','south-end','downtown'];const labels=['All neighborhoods','Coolidge Corner','Back Bay','Fenway / Kenmore','South End','Downtown'];
 $('filters-container').innerHTML=`<div class="filter-panel"><div class="field"><label for="filter-query">Search street / ZIP / city</label><input id="filter-query" type="search" value="${esc(f.query)}" placeholder="Beacon St, 02446..."></div>
 <div class="field"><label for="filter-city">City</label><select id="filter-city"><option value="">All Greater Boston</option>${cities}</select></div>
 <div class="field"><label for="filter-neighborhood">Neighborhood</label><select id="filter-neighborhood">${neigh.map((v,i)=>`<option value="${v}" ${f.neighborhood===v?'selected':''}>${labels[i]}</option>`).join('')}</select></div>
 <div class="field"><label for="filter-beds">Minimum beds</label><select id="filter-beds"><option value="">${S.profile.completed?'Your preference ('+S.profile.beds+'+)':'Any'}</option>${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${f.beds!==''&&+f.beds===n?'selected':''}>${n===0?'Studio+':n+'+'}</option>`).join('')}</select></div>
 <div class="field"><label for="filter-budget">Max monthly rent</label><input id="filter-budget" type="number" min="0" value="${esc(f.maxRent)}" placeholder="${S.profile.completed?'Your budget: '+money(S.profile.budget):'No maximum'}"></div>
 <div class="field"><label for="filter-size">Minimum sqft</label><input id="filter-size" type="number" min="0" value="${esc(f.minSqft)}" placeholder="Any"></div></div>
 <div class="filter-extra"><label><input type="checkbox" id="filter-core" ${f.core?'checked':''}> Coolidge Corner core</label><label><input type="checkbox" id="filter-photo" ${f.photos?'checked':''}> With photos</label><label><input type="checkbox" id="filter-hide" ${f.hideRejected?'checked':''}> Hide disliked</label><span style="margin-left:auto">Missing features remain unknown. No fake photos or amenities.</span></div>`;
 const bindings=[['filter-query','query'],['filter-city','city'],['filter-neighborhood','neighborhood'],['filter-beds','beds'],['filter-budget','maxRent'],['filter-size','minSqft'],['filter-core','core'],['filter-photo','photos'],['filter-hide','hideRejected']];
 for(const [id,k] of bindings){$(id).addEventListener(k==='query'?'input':'change',e=>{S.filters[k]=e.target.type==='checkbox'?e.target.checked:e.target.value;S.page=1;
 if(k==='hideRejected')renderDiscoverResults();else if(k==='query'){clearTimeout(renderFilters.timer);renderFilters.timer=setTimeout(refresh,420)}else refresh();});}}
function renderDiscover(){renderStats();renderFilters();$('sort-by').value=S.filters.sort;$('ranking-message').textContent=S.profile.completed?'Recommended based on your Apartment DNA, with additional signals from your likes and dislikes. Visual fit requires verified listing photos.':'Build your Apartment DNA to personalize the ranking.';renderDiscoverResults();}
function renderDiscoverResults(){const grid=$('listing-grid');if(!S.connected){grid.innerHTML=empty('Personalize first. Listings connect next',S.error||'The private listing API has not been activated. Your assessment, saved preferences, and visual quiz still work.');$('result-counter').textContent='Not connected';$('result-page-status').textContent='No unlock key required';$('pagination').innerHTML='';return;}
 if(S.loading){grid.innerHTML='<div class="empty-state"><h3>Finding your best matches...</h3></div>';return;}
 if(S.error){grid.innerHTML=empty('Search is temporarily unavailable',S.error);return;}
 const rows=S.current.filter(r=>!S.filters.hideRejected||S.ratings[r.id]!==-1).sort((a,b)=>S.filters.sort==='match'?fit(b)-fit(a):0);
 grid.innerHTML=rows.length?rows.map(card).join(''):empty('No matching homes found','Try removing one filter, expanding the search area, or updating your Apartment DNA.');
 $('result-counter').textContent= num(S.result?.total||0)+' matches';$('result-page-status').textContent=`Showing ${rows.length} of ${num(S.result?.total||0)} matching records (page ${S.page})`;
 const p=S.result?.totalPages||0;$('pagination').innerHTML=p>1?`<button type="button" data-page="prev" ${S.page<=1?'disabled':''}>← Previous</button><span>Page ${S.page} of ${p}${S.result?.totalPages===20?' (browse window limited)':''}</span><button type="button" data-page="next" ${S.page>=p?'disabled':''}>Next →</button>`:'';}
function rate(id,value){S.ratings[id]=S.ratings[id]===value?0:value;if(S.ratings[id]===0)delete S.ratings[id];save('ratings',S.ratings);header();
 if(S.view==='discover')renderDiscoverResults();else if(S.view==='saved')renderSaved();else if(S.view==='compare')renderCompare();notify(value===1?'Saved to your shortlist':'Feedback saved. We will use it to refine recommendations.');}
function compare(id){if(S.comparison.includes(id))S.comparison=S.comparison.filter(x=>x!==id);else if(S.comparison.length<4)S.comparison.push(id);else{notify('Compare up to four homes.');return;}
 save('comparison',S.comparison);header();if(S.view==='compare')renderCompare();else renderDiscoverResults();}
async function ensureSaved(){if(!S.connected)return;const ids=[...new Set([...Object.keys(S.ratings).filter(id=>S.ratings[id]===1),...S.comparison])].filter(id=>!S.known[id]);for(let i=0;i<ids.length;i+=12){try{const d=await request('/v1/lookup',{ids:ids.slice(i,i+12)});remember(d.items);}catch(e){S.error=e.message;break;}}}
async function renderSaved(){const root=$('saved-list');root.innerHTML='<p class="muted">Loading saved homes...</p>';await ensureSaved();const rows=Object.keys(S.ratings).filter(id=>S.ratings[id]===1).map(id=>S.known[id]).filter(Boolean);
 root.innerHTML=rows.length?rows.map(card).join(''):empty('Your shortlist is waiting','Save homes from Discover and they will appear here. Your favorites stay on this device.');}
async function renderCompare(){const root=$('comparison-view');await ensureSaved();const rows=S.comparison.map(id=>S.known[id]).filter(Boolean);
 if(!rows.length){root.innerHTML=empty('Pick up to four apartments','Use Compare on a result card to study tradeoffs side by side.');return;}
 root.innerHTML=`<div class="tablewrap"><table class="compare-table"><thead><tr><th>Feature</th>${rows.map(r=>`<th>${esc(r.address)}</th>`).join('')}</tr></thead><tbody>
 ${[['Monthly rent',r=>money(r.rent)],['Your match',r=>fit(r)+'%'],['City',r=>r.city],['Bedrooms',r=>r.beds??'Unknown'],['Bathrooms',r=>r.baths??'Unknown'],['Sq ft',r=>r.sqft?num(r.sqft):'Unknown'],['Distance from Coolidge',r=>r.distance==null?'Unknown':r.distance+' mi'],['Parking',r=>r.parking??'Not supplied'],['Photos',r=>r.photos?.length||'Not provided'],['Source last seen',r=>r.providerSeen?.slice(0,10)||'Unknown']].map(([label,get])=>`<tr><th>${label}</th>${rows.map(r=>`<td>${esc(get(r))}</td>`).join('')}</tr>`).join('')}
 </tbody></table></div><div class="detail-actions" style="margin-top:15px">${rows.map(r=>`<button class="outline-button" data-detail="${r.id}">View ${esc(r.address)} →</button>`).join('')}</div>`;}
async function loadMarket(){if(!S.connected)return;try{S.market=await request('/v1/market');if(S.view==='market')renderMarket();}catch(e){S.error=e.message;}}
function renderMarket(){const root=$('market-content');if(!S.market){root.innerHTML=empty('Market intelligence is connecting','When the private serving API is available, see area-level rents and historical Brookline benchmarks.');return;}
 const city=S.market.cityStats||[];const benchmark=(S.market.benchmarks||[]).slice(0,25);const max=Math.max(...city.map(x=>x.median||0),1);
 root.innerHTML=`<div class="grid2"><div class="panel"><h3>Median listed rent by city</h3><p class="desc">Observed asking rents in our current snapshot, not a full housing census.</p>
 ${city.slice(0,10).map(x=>`<div class="market-row"><span>${esc(x.city)} <small>(${num(x.count)})</small></span><div class="market-bar"><i style="width:${Math.round(x.median/max*100)}%"></i></div><b>${money(x.median)}</b></div>`).join('')}</div>
 <div class="panel"><h3>Coolidge Corner / Brookline benchmarks</h3><p class="desc">Spot Easy monthly benchmark series (not specific vacancies).</p><div class="tablewrap"><table><tr><th>Area</th><th>Month</th><th>Beds</th><th>Average</th></tr>${benchmark.map(x=>`<tr><td>${esc(x.area)}</td><td>${esc(x.period)}</td><td>${esc(x.beds)}</td><td>${money(x.mean)}</td></tr>`).join('')}</table></div></div></div>
 <div class="hint">${num(S.market.inventoryCount)} records as of ${esc((S.market.updatedAt||'').slice(0,10))}. Prices are source observations; verify current availability before applying.</div>`;}
let leafletPromise=null;
async function leaflet(){if(window.L)return; if(leafletPromise)return leafletPromise;leafletPromise=new Promise((ok,bad)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(link);const js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.onload=ok;js.onerror=()=>bad(new Error('Map library unavailable'));document.head.append(js)});return leafletPromise;}
async function renderMap(){const root=$('geo-map');const right=$('map-results');if(!S.connected){root.innerHTML='<div class="map-loading">Listing map connects after the private API is set up.</div>';right.innerHTML='<p>Take your apartment DNA quiz now.</p>';return;}
 root.innerHTML='<div class="map-loading">Loading area map...</div>';try{await leaflet();const data=await request('/v1/map',{...filtersPayload(),limit:100});root.replaceChildren();if(S.map){S.map.remove();S.map=null;}
 S.map=window.L.map(root,{zoomControl:true}).setView([ORIGIN.lat,ORIGIN.lng],12);
 window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18}).addTo(S.map);
 window.L.circleMarker([ORIGIN.lat,ORIGIN.lng],{radius:9,color:'#174936',weight:2,fillColor:'#44a27a',fillOpacity:.9}).addTo(S.map).bindTooltip('Coolidge Corner');
 for(const p of data.points||[]){const icon=window.L.circleMarker([p.lat,p.lng],{radius:5,color:'#2d7461',weight:1,fillColor:'#67b19b',fillOpacity:.75}).addTo(S.map);
 icon.bindTooltip(`${money(p.rent)} · ${esc(p.city)}`);icon.on('click',()=>detail(p.id));}
 right.innerHTML=`<p class="muted">${num(data.totalMatching)} results in this search. ${num(data.shown)} mapped points shown to protect the data feed.</p>`+S.current.slice(0,7).map(r=>`<button class="small-result" data-detail="${r.id}"><b>${esc(r.address)}</b><br>${money(r.rent)} · ${esc(r.city)}</button>`).join('');setTimeout(()=>S.map?.invalidateSize(),100);
 }catch(e){root.innerHTML=`<div class="map-loading">${esc(e.message)}</div>`;right.innerHTML='<p class="muted">The normal listing search remains available.</p>';}}
function detail(id){const r=S.known[id];if(!r){if(!S.connected)return;request('/v1/listings/'+encodeURIComponent(id)).then(x=>{remember([x]);detail(id)}).catch(e=>notify(e.message));return;}
 const url=r.url?.startsWith('https://')?r.url:'https://www.google.com/search?q='+encodeURIComponent([r.address,r.city,'MA apartment rent'].filter(Boolean).join(' '));const label=r.url?'Open provider listing ↗':'Search property name and address ↗';
 modal(r.address||'Apartment details',`<div class="detail-grid"><div class="detail-cover">${r.photos?.length?`<img src="${esc(r.photos[0])}" alt="Licensed listing interior">`:'<div class="photo-placeholder"><span>⌂</span><small>No listing photos supplied</small></div>'}</div><div><div class="detail-price">${money(r.rent)} /mo</div><p class="muted">${esc(r.city)} · ${esc(r.zip)} · ${esc(r.unit||'Unit unknown')}</p>
 <div class="metric-row"><span>Beds / baths</span><b>${r.beds??'Unknown'} / ${r.baths??'Unknown'}</b></div><div class="metric-row"><span>Square feet</span><b>${r.sqft?num(r.sqft):'Unknown'}</b></div><div class="metric-row"><span>From Coolidge Corner</span><b>${r.distance==null?'Unknown':r.distance+' mi'}</b></div><div class="metric-row"><span>Parking</span><b>${esc(r.parking||'Not supplied')}</b></div><div class="metric-row"><span>Provider last seen</span><b>${esc(r.providerSeen?.slice(0,10)||'Unknown')}</b></div>
 <div class="hint warn">No availability guarantee. Match estimates reflect structured facts, not a visual review of this unit.</div><a href="${esc(url)}" rel="noopener noreferrer" target="_blank" class="outline-button">${label}</a></div></div>
 <div class="field" style="margin-top:20px"><label for="listing-note">Your private note</label><textarea id="listing-note" rows="3" placeholder="Why this one works (or doesn't)">${esc(S.notes[id]||'')}</textarea></div>
 <div class="detail-actions"><button class="primary-button" data-save="${id}">${S.ratings[id]===1?'♥ Saved':'♡ Save this home'}</button><button class="outline-button" data-compare="${id}">Compare</button><button class="outline-button" data-reject="${id}">✕ Not my style</button></div>`);
 $('listing-note').addEventListener('input',e=>{S.notes[id]=e.target.value.slice(0,2000);save('notes',S.notes);});}
function wizard(){S.wizardStep=0;view('taste')}
function renderWizard(){const root=$('taste-content');const p=S.profile;const step=S.wizardStep;
 const sections=['Choose your neighborhoods','Your non-negotiables','Find your visual vibe','Make your tradeoffs','Your Apartment DNA'];
 const progress=`<div class="wizard-progress">${sections.map((x,i)=>`<span class="${i<=step?'active':''}"></span>`).join('')}</div><div class="wizard-top"><strong>STEP ${step+1} OF 5</strong><span>${sections[step]}</span></div>`;
 let body='';
 if(step===0)body=`<div class="panel"><h3>Where would you be happy living?</h3><p class="desc">Coolidge Corner comes first, but we won't rule out a home you love elsewhere.</p><div class="chip-group">${CITIES.slice(0,10).map(c=>`<button data-area="${c}" class="chip ${p.areas.includes(c)?'selected':''}">${c}</button>`).join('')}</div><label class="choice-row"><input id="taste-core" type="checkbox" ${p.preferredCore?'checked':''}> Prefer Coolidge Corner whenever possible</label></div>`;
 if(step===1)body=`<div class="panel"><h3>What must the apartment have?</h3><div class="wizard-form"><label>Comfortable monthly rent ceiling ($)<input id="taste-budget" type="number" min="0" max="25000" value="${esc(p.budget)}"></label><label>Minimum bedrooms<input id="taste-beds" type="number" min="0" max="10" value="${esc(p.beds)}"></label><label>Ideal minimum square feet (optional)<input id="taste-sqft" type="number" min="0" max="10000" value="${esc(p.minSqft)}"></label></div><p class="muted">Preferences are adjustable later. Missing amenities won't be falsely reported as present.</p></div>`;
 if(step===2)body=`<div class="panel"><h3>Which interiors feel like home?</h3><p class="desc">Like or pass on visual examples. These are style references—not photos from actual available apartments.</p><div class="mood-grid">${MODES.map(m=>`<div class="mood-card"><img src="${esc(m.img)}" loading="lazy" alt="${esc(m.name)} illustration"><div class="mood-body"><strong>${esc(m.name)}</strong><p>${esc(m.desc)}</p><div class="buttons"><button class="${p.styles[m.id]===1?'selected':''}" data-mood="${m.id}:1">♡ Love</button><button class="${p.styles[m.id]===-1?'disliked':''}" data-mood="${m.id}:-1">✕ Pass</button></div></div></div>`).join('')}</div></div>`;
 if(step===3)body=`<div class="panel"><h3>What should the model prioritize?</h3><p class="desc">Adjust the importance of each factor. Your preferences control ranking; no proprietary model assumptions are hidden.</p>${[['location','Location & neighborhood'],['affordability','Value for rent'],['space','Size and layout'],['freshness','Listing freshness']].map(([key,label])=>`<label class="weight-slider">${label}<input data-weight="${key}" type="range" min="0" max="100" value="${p.weights[key]??20}"><strong id="weight-${key}">${p.weights[key]??20}</strong></label>`).join('')}</div>`;
 if(step===4){const liked=MODES.filter(m=>p.styles[m.id]===1).map(m=>m.name);const passed=MODES.filter(m=>p.styles[m.id]===-1).map(m=>m.name);
 body=`<div class="panel"><h3>Your apartment DNA</h3><p class="desc">Recommendations will prioritize what you actually need. Visual fit is shown only after a listing photo has been analyzed.</p><div class="metric-row"><span>Preferred cities</span><b>${esc(p.areas.join(', ')||'Any')}</b></div><div class="metric-row"><span>Monthly budget</span><b>${money(p.budget)}</b></div><div class="metric-row"><span>Minimum bedrooms</span><b>${esc(p.beds)}</b></div><div class="metric-row"><span>Interior styles you love</span><b>${esc(liked.join(', ')||'Not specified')}</b></div><div class="metric-row"><span>Styles to avoid</span><b>${esc(passed.join(', ')||'Not specified')}</b></div><p class="muted">These are preferences, not proof that any specific available listing has those finishes.</p></div>`;}
 root.innerHTML=`<div class="wizard-shell">${progress}${body}<div class="wizard-actions"><button data-wizard-back class="outline-button" ${step===0?'disabled':''}>← Back</button><button data-wizard-next class="primary-button">${step===4?'✧ Find my matches →':'Continue →'}</button></div></div>`;
 root.querySelectorAll('[data-weight]').forEach(x=>x.oninput=e=>{p.weights[e.target.dataset.weight]=Number(e.target.value);$('weight-'+e.target.dataset.weight).textContent=e.target.value;save('profile',p)});}
function wizardInputs(){const p=S.profile;if($('taste-core'))p.preferredCore=$('taste-core').checked;
 for(const [key,id] of [['budget','taste-budget'],['beds','taste-beds'],['minSqft','taste-sqft']])if($(id)){const n=Number($(id).value);if(Number.isFinite(n)&&n>=0)p[key]=n;}
 save('profile',p);}
function wizardNext(){wizardInputs();if(S.wizardStep<4){S.wizardStep++;renderWizard();}else{S.profile.completed=true;save('profile',S.profile);S.page=1;view('discover');refresh();notify('Apartment DNA saved. Recommendations updated.');}}
function wizardBack(){wizardInputs();S.wizardStep=Math.max(0,S.wizardStep-1);renderWizard();}
function setStyle(id,v){const p=S.profile;p.styles[id]=p.styles[id]===v?0:v;save('profile',p);renderWizard();}
function switchArea(city){const arr=new Set(S.profile.areas);arr.has(city)?arr.delete(city):arr.add(city);S.profile.areas=[...arr];save('profile',S.profile);renderWizard();}
function renderVision(){const root=$('vision-content');const options=Object.values(S.known).slice(0,200).map(x=>`<option value="${x.id}">${esc(x.address)} · ${money(x.rent)}</option>`).join('');
 root.innerHTML=`<div class="grid2"><div class="panel"><h3>Analyze an apartment photo locally</h3><p class="desc">You can use a photo from a listing that you have permission to analyze. Files stay on your device; they aren't uploaded to Homekind.</p><label>Choose an interior image<input id="vision-image" type="file" accept="image/jpeg,image/png,image/webp"></label><div id="vision-preview"></div><label>Associate with a listing on this page (optional)<select id="vision-apartment"><option value="">No specific listing</option>${options}</select></label><button id="vision-run" type="button" class="primary-button" style="margin-top:12px">Analyze brightness and warmth</button><div id="vision-results" aria-live="polite"></div></div>
 <div class="panel"><h3>What the model knows today</h3><div class="metric-row"><span>Source-backed listings returned</span><b>${num(S.result?.total||0)}</b></div><div class="metric-row"><span>Source photo galleries on this page</span><b>${S.current.filter(r=>r.photos?.length).length}</b></div><div class="metric-row"><span>Photos assessed locally</span><b>${Object.keys(S.photoResults).length}</b></div><div class="hint warn">Brightness and warmth are not a reliable complete style assessment. Automated style matching for all apartments is blocked by the current provider's missing photos and licensing requirements.</div></div></div>`;
 $('vision-image').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>12000000||!/^image\/(jpeg|png|webp)$/.test(f.type)){notify('Use JPG/PNG/WebP under 12 MB.');return;}S.visionFile=f;const blob=URL.createObjectURL(f);$('vision-preview').innerHTML=`<img src="${blob}" class="thumbnail" alt="Selected room">`;};
 $('vision-run').onclick=scan;}
async function scan(){const f=S.visionFile;if(!f){notify('Select a photo first.');return;}try{const img=await createImageBitmap(f);const cv=document.createElement('canvas');cv.width=96;cv.height=96;const x=cv.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,96,96);const pix=x.getImageData(0,0,96,96).data;img.close?.();let lum=0,warm=0;const size=pix.length/4;for(let i=0;i<pix.length;i+=4){lum+=(.2126*pix[i]+.7152*pix[i+1]+.0722*pix[i+2])/255;warm+=(pix[i]-pix[i+2])/255;}const bright=Math.round(lum/size*100),warmth=Math.round(warm/size*100);const tags=[bright>63?'bright':bright<35?'dark':'medium-light',warmth>6?'warm':warmth< -5?'cool':'neutral'];
 const id=$('vision-apartment').value;if(id){S.photoResults[id]={method:'Local brightness/warmth scan',brightness:bright,warmth,tags,date:new Date().toISOString()};save('photoResults',S.photoResults);}
 $('vision-results').innerHTML=`<div class="hint"><strong>Measured: ${bright}% brightness, ${warmth}% warm/cool balance.</strong><p>Tags: ${esc(tags.join(', '))}. This does not identify the layout, renovation quality or precise rental unit.</p></div>`;
 }catch(e){notify('Unable to analyze this photo: '+e.message);}}
function wire(){document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
 if(t.dataset.view){view(t.dataset.view);return;}
 if(t.dataset.action==='quiz'){wizard();return;}
 if(t.dataset.action==='jump-results'){$('results-anchor').scrollIntoView({behavior:'smooth'});return;}
 if(t.dataset.save){rate(t.dataset.save,1);if(!$('modal-backdrop').hidden){closeModal();}return;}
 if(t.dataset.reject){rate(t.dataset.reject,-1);if(!$('modal-backdrop').hidden)closeModal();return;}
 if(t.dataset.compare){compare(t.dataset.compare);if(!$('modal-backdrop').hidden)closeModal();return;}
 if(t.dataset.detail){detail(t.dataset.detail);return;}
 if(t.dataset.page){S.page=Math.max(1,Math.min(20,S.page+(t.dataset.page==='next'?1:-1)));refresh();$('results-anchor').scrollIntoView({behavior:'smooth'});return;}
 if(t.hasAttribute('data-wizard-next')){wizardNext();return;}if(t.hasAttribute('data-wizard-back')){wizardBack();return;}
 if(t.dataset.area){switchArea(t.dataset.area);return;}
 if(t.dataset.mood){const [id,v]=t.dataset.mood.split(':');setStyle(id,Number(v));return;}
 });
 $('top-quiz').onclick=wizard;$('open-data').onclick=statusPanel;$('top-data').onclick=statusPanel;
 $('modal-close').onclick=closeModal;$('modal-backdrop').onclick=e=>{if(e.target.id==='modal-backdrop')closeModal()};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal-backdrop').hidden)closeModal();});
 $('reset-filters').onclick=()=>{S.filters=structuredClone(FILTER_DEFAULT);S.page=1;refresh();};
 $('sort-by').onchange=e=>{S.filters.sort=e.target.value;S.page=1;refresh();};
}
function boot(){wire();renderDiscover();header();connect();}
boot();
})();