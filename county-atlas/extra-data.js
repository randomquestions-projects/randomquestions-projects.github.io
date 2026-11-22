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
let pending=6;
const parse=value=>{if(value==null||value==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;};
const percent=(num,den)=>num==null||den==null||den<=0?null:100*num/den;
const endpoint=(base,params)=>base+'?'+new URLSearchParams(params);
const sourceURLs={
 acs:endpoint('https://api.census.gov/data/2024/acs/acs5/profile',{get:'DP03_0062E,DP02_0059E,DP02_0067E,DP02_0068E,DP02_0069E,DP02_0070E,DP03_0046E',for:'county:*'}),
 self:endpoint('https://api.census.gov/data/2024/acs/acs5',{get:'B24080_001E,B24080_005E,B24080_010E,B24080_015E,B24080_020E',for:'county:*'}),
 cbp:endpoint('https://api.census.gov/data/2023/cbp',{get:'ESTAB',for:'county:*',NAICS2017:'00',LFO:'001',EMPSZES:'212'}),
 nonemp:endpoint('https://api.census.gov/data/2024/nonemp',{get:'NESTAB',for:'county:*',NAICS2022:'00',LFO:'001',RCPSZES:'001'}),
 bds:endpoint('https://api.census.gov/data/timeseries/bds',{get:'ESTABS_ENTRY',for:'county:*',time:'2023',NAICS:'00'}),
 military:endpoint('https://api.census.gov/data/2024/acs/acs5',{get:'B23025_001E,B23025_006E',for:'county:*'})
};
async function fetchRecords(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),50000);
 try{
   const response=await fetch(url,{signal:controller.signal,mode:'cors'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const records=await response.json();
   if(!Array.isArray(records)||records.length<1500||!Array.isArray(records[0]))throw Error('County data absent or incomplete');
   return records;
 }finally{clearTimeout(timer);}
}
function ingest(rows,records,handle){
 const header=records[0],si=header.indexOf('state'),ci=header.indexOf('county');
 if(si<0||ci<0)throw Error('Missing FIPS county keys');
 let matched=0;
 for(const rec of records.slice(1)){
  const id=String(rec[si]).padStart(2,'0')+String(rec[ci]).padStart(3,'0');
  if(!rows.has(id))continue;
  const source=Object.fromEntries(header.map((name,index)=>[name,rec[index]]));
  handle(rows.get(id),source);
  matched++;
 }
 if(matched<1400)throw Error('Insufficient matched counties: '+matched);
 return matched;
}
const ingestByGroup={
 acs:(r,x)=>{
  r.income=parse(x.DP03_0062E);r.adults25=parse(x.DP02_0059E);
  r.hsCount=parse(x.DP02_0067E);r.collegeCount=parse(x.DP02_0068E);
  r.civilianAdults=parse(x.DP02_0069E);r.veterans=parse(x.DP02_0070E);
  r.highschool=percent(r.hsCount,r.adults25);r.college=percent(r.collegeCount,r.adults25);
  r.veteran_share=percent(r.veterans,r.civilianAdults);
 },
 self:(r,x)=>{
  const parts=['B24080_005E','B24080_010E','B24080_015E','B24080_020E'].map(k=>parse(x[k]));
  r.selfEmployedCount=parts.every(n=>n!=null)?parts.reduce((a,b)=>a+b,0):null;
  r.selfWorkers=parse(x.B24080_001E);
  r.self_employed=percent(r.selfEmployedCount,r.selfWorkers);
 },
 cbp:(r,x)=>{r.microbusiness=parse(x.ESTAB);},
 nonemp:(r,x)=>{r.nonemployer=parse(x.NESTAB);},
 bds:(r,x)=>{r.startups=parse(x.ESTABS_ENTRY);},
 military:(r,x)=>{r.population16=parse(x.B23025_001E);r.armed_forces=parse(x.B23025_006E);r.armed_forces_share=percent(r.armed_forces,r.population16);}
};
async function load(rows,render){
 // Optional checked-in public aggregate snapshot from a private ingestion pipeline.
 // API fallbacks are best-effort only and never silently fill missing records with zeros.
 const tasks=Object.keys(ready).map(async(group)=>{
   try{
     const data=await fetchRecords(sourceURLs[group]);
     ingest(rows,data,ingestByGroup[group]);
     ready[group]=true;
   }catch(error){errors[group]=error.message;}
   finally{pending--;render();}
 });
 await Promise.allSettled(tasks);
}
window.CountyExtras={metrics,ready,errors,sourceURLs,load,get pending(){return pending;}};
})();