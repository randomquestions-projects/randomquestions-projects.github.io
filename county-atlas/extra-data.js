/* CountyScope: source-aware, county-FIPS-enriched census metrics.
 * Requests can fail when Census requires an API key. Never interpret missing as 0.
 * No API credentials are embedded in the public site.
 */
(() => {
'use strict';
const metrics={
 income:{title:'Median household income by county',label:'Median household income',kind:'money',year:'2024 ACS',group:'acs'},
 highschool:{title:'Adults 25+ with a high school diploma or higher',label:'HS diploma or higher · adults 25+',kind:'percent',year:'2024 ACS',group:'acs',numerator:'hsCount',denominator:'adults25'},
 college:{title:"Adults 25+ with a bachelor's degree or higher",label:"Bachelor's degree or higher · adults 25+",kind:'percent',year:'2024 ACS',group:'acs',numerator:'collegeCount',denominator:'adults25'},
 veterans:{title:'Civilian veterans by county',label:'Civilian veterans · number',kind:'count',year:'2024 ACS',group:'acs'},
 veteran_share:{title:'Civilian veterans as a share of civilian adults',label:'Veterans · % of civilian adults 18+',kind:'percent',year:'2024 ACS',group:'acs',numerator:'veterans',denominator:'civilianAdults'},
 armed_forces:{title:'Residents serving in the Armed Forces',label:'Armed Forces residents · number',kind:'count',year:'2024 ACS',group:'military'},
 armed_forces_share:{title:'Residents in the Armed Forces as share of residents 16+',label:'Armed Forces · % of residents 16+',kind:'percent',year:'2024 ACS',group:'military',numerator:'armed_forces',denominator:'population16'},
 self_employed:{title:'Self-employed residents as a share of employed adults',label:'Self-employed · % of employed 16+',kind:'percent',year:'2024 ACS',group:'self',numerator:'selfEmployedCount',denominator:'selfWorkers'},
 microbusiness:{title:'Employer establishments with 1–4 employees',label:'Establishments with 1–4 employees',kind:'count',year:'2023 CBP',group:'cbp'},
 nonemployer:{title:'Businesses without paid employees',label:'Nonemployer businesses',kind:'count',year:'2024 NES',group:'nonemp'},
 startups:{title:'New employer establishments in the last 12 months',label:'New employer establishments',kind:'count',year:'2023 BDS',group:'bds'}
};
const ready={acs:false,self:false,cbp:false,nonemp:false,bds:false,military:false};
const errors={};
let pending=1;
const GROUP_FIELDS={
 acs:['income','adults25','hsCount','collegeCount','highschool','college','civilianAdults','veterans','veteran_share'],
 military:['population16','armed_forces','armed_forces_share'],
 self:['selfWorkers','selfEmployedCount','self_employed'],
 cbp:['microbusiness'],
 nonemp:['nonemployer'],
 bds:['startups']
};
const PERCENT_FIELDS=new Set(['highschool','college','veteran_share','armed_forces_share','self_employed']);
const COUNTY_LIMITS={acs:2900,military:1800,self:1800,cbp:1800,nonemp:1800,bds:1800};
function validValue(field,value){
 if(value===null)return null;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)return undefined;
 if(PERCENT_FIELDS.has(field)&&value>100)return undefined;
 if(field==='income'&&value>1_000_000)return undefined;
 return value;
}
async function load(rows,render){
 const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
 try{
  // Intentionally no browser-side Census API calls: all Census data queries
  // require an API key as of 2026. No credentials may be placed in public JS.
  const response=await fetch('data/county-metrics.json',{signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw Error('Validated county metrics snapshot has not been published');
  const data=await response.json();
  if(data.version!==1||data.dataset!=='CountyScope verified Census county aggregates'||!Array.isArray(data.counties)||data.counties.length<3050||!data.sources||typeof data.sources!=='object')
     throw Error('County metrics snapshot schema or national coverage invalid');
  const seen=new Set(), staging=new Map();
  for(const entry of data.counties){
   if(!entry||typeof entry.fips!=='string'||!/^\d{5}$/.test(entry.fips)||seen.has(entry.fips))
      throw Error('Invalid or duplicate county FIPS');
   seen.add(entry.fips);
   if(!rows.has(entry.fips))continue;
   const values={};
   for(const fields of Object.values(GROUP_FIELDS)){
    for(const field of fields){
     if(!Object.prototype.hasOwnProperty.call(entry,field))continue;
     const value=validValue(field,entry[field]);
     if(value===undefined)throw Error('Invalid metric '+field+' at FIPS '+entry.fips);
     values[field]=value;
    }
   }
   staging.set(entry.fips,values);
  }
  // Do not partially show any data from an invalid file.
  if(staging.size<2900)throw Error('Insufficient geographic matches');
  const accepted=[];
  for(const [group,fields] of Object.entries(GROUP_FIELDS)){
    if(!Object.prototype.hasOwnProperty.call(data.sources,group))continue;
    const mainField=group==='acs'?'highschool':group==='military'?'armed_forces':group==='self'?'self_employed':fields[0];
    const coverage=[...staging.values()].filter(x=>x[mainField]!=null).length;
    if(coverage<COUNTY_LIMITS[group]){errors[group]='Source coverage below threshold ('+coverage+')';continue;}
    accepted.push(group);
  }
  if(!accepted.includes('acs'))throw Error('Validated 2024 ACS source not available');
  // Only use named, validated fields from source groups actually present.
  for(const [fips,values] of staging){
   const target=rows.get(fips);
   for(const group of accepted){
    for(const field of GROUP_FIELDS[group])
      if(Object.prototype.hasOwnProperty.call(values,field))target[field]=values[field];
   }
  }
  accepted.forEach(group=>{ready[group]=true;delete errors[group];});
 }catch(error){
  errors.snapshot=error?.message||'Unable to load county metrics';
 }finally{
  clearTimeout(timer);
  pending=0;
  render();
 }
}
window.CountyExtras={metrics,ready,errors,load,get pending(){return pending;}};
})();