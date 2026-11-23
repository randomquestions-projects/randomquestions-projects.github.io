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
 startups:{title:'New employer establishments in the last 12 months',label:'New employer establishments',kind:'count',year:'2023 BDS',group:'bds'},
// ACS non-overlapping categories: all Hispanic residents are counted once,
// regardless of race; all other categories are non-Hispanic.
race_white_nh:{title:'Non-Hispanic White population share',label:'White, non-Hispanic (%)',kind:'percent',year:'2024 ACS · B03002',group:'race'},
race_black_nh:{title:'Non-Hispanic Black population share',label:'Black, non-Hispanic (%)',kind:'percent',year:'2024 ACS · B03002',group:'race'},
race_native_nh:{title:'Non-Hispanic American Indian / Alaska Native population share',label:'AIAN, non-Hispanic (%)',kind:'percent',year:'2024 ACS · B03002',group:'race'},
race_asian_nh:{title:'Non-Hispanic Asian population share',label:'Asian, non-Hispanic (%)',kind:'percent',year:'2024 ACS · B03002',group:'race'},
race_pacific_nh:{title:'Non-Hispanic Pacific Islander population share',label:'Pacific Islander, non-Hispanic (%)',kind:'percent',year:'2024 ACS · B03002',group:'race'},
race_other_nh:{title:'Non-Hispanic other race share',label:'Other race, non-Hispanic (%)',kind:'percent',year:'2024 ACS · B03002',group:'race'},
race_multiracial_nh:{title:'Non-Hispanic multiracial population share',label:'Multiracial, non-Hispanic (%)',kind:'percent',year:'2024 ACS · B03002',group:'race'},
ethnicity_hispanic:{title:'Hispanic or Latino share, of any race',label:'Hispanic / Latino · any race (%)',kind:'percent',year:'2024 ACS · B03002',group:'race'},
// Model-based 2025 CDC PLACES estimates for adults, not directly observed diagnoses.
health_obesity:{title:'Estimated adult obesity prevalence by county',label:'Obesity among adults (%)',kind:'percent',year:'CDC PLACES 2025 · modeled',group:'places'},
health_diabetes:{title:'Estimated diagnosed diabetes prevalence by county',label:'Diagnosed diabetes among adults (%)',kind:'percent',year:'CDC PLACES 2025 · modeled',group:'places'},
health_depression:{title:'Estimated diagnosed depression prevalence by county',label:'Diagnosed depression among adults (%)',kind:'percent',year:'CDC PLACES 2025 · modeled',group:'places'},
health_smoking:{title:'Estimated current smoking prevalence by county',label:'Current smoking among adults (%)',kind:'percent',year:'CDC PLACES 2025 · modeled',group:'places'},
health_inactivity:{title:'Estimated no leisure-time physical activity prevalence by county',label:'No leisure-time exercise (%)',kind:'percent',year:'CDC PLACES 2025 · modeled',group:'places'},
health_short_sleep:{title:'Estimated short sleep duration prevalence by county',label:'Short sleep among adults (%)',kind:'percent',year:'CDC PLACES 2025 · modeled',group:'places'},
health_poor_mental:{title:'Estimated frequent mental distress prevalence by county',label:'Frequent poor mental health (%)',kind:'percent',year:'CDC PLACES 2025 · modeled',group:'places'},
health_binge_drinking:{title:'Estimated binge drinking prevalence by county',label:'Binge drinking among adults (%)',kind:'percent',year:'CDC PLACES 2025 · modeled',group:'places'},
health_food_insecurity:{title:'Estimated adult food insecurity prevalence by county',label:'Food insecurity (%)',kind:'percent',year:'CDC PLACES 2025 · modeled where available',group:'places'},
// Unlike crime reports, these are deaths among county residents. Bayesian
// mortality rates may be modeled in small counties to preserve privacy.
mortality_homicide:{title:'Homicide deaths by county of residence',label:'Homicide deaths / 100K residents',kind:'rate',year:'CDC NVSS · annual, sometimes modeled',group:'mortality'},
mortality_firearm_homicide:{title:'Firearm homicide deaths by county of residence',label:'Firearm homicide deaths / 100K',kind:'rate',year:'CDC NVSS · annual, sometimes modeled',group:'mortality'},
mortality_suicide:{title:'Suicide deaths by county of residence',label:'Suicide deaths / 100K residents',kind:'rate',year:'CDC NVSS · annual, sometimes modeled',group:'mortality'},
mortality_overdose:{title:'Drug overdose deaths by county of residence',label:'Drug overdose deaths / 100K',kind:'rate',year:'CDC NVSS · annual, sometimes modeled',group:'mortality'},
mortality_firearm:{title:'Firearm injury deaths by county of residence',label:'All firearm deaths / 100K',kind:'rate',year:'CDC NVSS · annual, sometimes modeled',group:'mortality'},
};
const ready={acs:false,self:false,cbp:false,nonemp:false,bds:false,military:false,race:false,places:false,mortality:false};
const errors={};
const sourceLabels={};
let pending=1;
const GROUP_FIELDS={
 acs:['income','adults25','hsCount','collegeCount','highschool','college','civilianAdults','veterans','veteran_share'],
 military:['population16','armed_forces','armed_forces_share'],
 self:['selfWorkers','selfEmployedCount','self_employed'],
 cbp:['microbusiness'],
 nonemp:['nonemployer'],
 bds:['startups'],
 race:['race_white_nh','race_black_nh','race_native_nh','race_asian_nh','race_pacific_nh','race_other_nh','race_multiracial_nh','ethnicity_hispanic'],
 places:['health_obesity','health_diabetes','health_depression','health_smoking','health_inactivity','health_short_sleep','health_poor_mental','health_binge_drinking','health_food_insecurity'],
 mortality:['mortality_homicide','mortality_firearm_homicide','mortality_suicide','mortality_overdose','mortality_firearm']
};
const PERCENT_FIELDS=new Set(['highschool','college','veteran_share','armed_forces_share','self_employed',...GROUP_FIELDS.race,...GROUP_FIELDS.places]);
const COUNTY_LIMITS={acs:2900,military:1800,self:1800,cbp:1800,nonemp:1800,bds:1800,race:2900,places:2800,mortality:1500};
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
  accepted.forEach(group=>{ready[group]=true;sourceLabels[group]=String(data.sources[group]);delete errors[group];});
 }catch(error){
  errors.snapshot=error?.message||'Unable to load county metrics';
 }finally{
  clearTimeout(timer);
  pending=0;
  render();
 }
}
window.CountyExtras={metrics,ready,errors,sourceLabels,load,get pending(){return pending;}};
})();