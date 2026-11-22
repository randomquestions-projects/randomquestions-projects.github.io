/**
 * Optional SEDA 6.0 performance measures.
 * No Stanford source data are included in this code. Stanford's Data Use
 * Agreement restricts publishing the source files, in full or part, without
 * explicit permission. A real-score artifact is not committed by default.
 */
(() => {
'use strict';
const E=window.CountyExtras;if(!E)return;
const metrics={
  seda_achievement:{title:'SEDA 6.0 · Overall public-school test achievement',label:'SEDA achievement · SD from national reference',kind:'signed',year:'2009–2019 · SEDA 6.0',group:'seda'},
  seda_math:{title:'SEDA 6.0 · Math achievement',label:'SEDA math · SD from national reference',kind:'signed',year:'2009–2019 · SEDA 6.0',group:'seda'},
  seda_reading:{title:'SEDA 6.0 · Reading achievement',label:'SEDA reading · SD from national reference',kind:'signed',year:'2009–2019 · SEDA 6.0',group:'seda'}
};
Object.assign(E.metrics,metrics);E.ready.seda=false;
const originalLoad=E.load;
const parse=v=>typeof v==='number'&&Number.isFinite(v)&&v>=-5&&v<=5?v:null;
const setOptions=enabled=>{
 for(const opt of document.querySelectorAll('option[value^="seda_"]')){
   opt.disabled=!enabled;
   opt.title=enabled?'SEDA 6.0 county data':'Needs verified Stanford publication permission and imported source data';
 }
};
async function loadSeda(rows,render){
 setOptions(false);
 try{
   const response=await fetch('data/seda6-derived-approved.json',{cache:'no-store'});
   if(!response.ok)throw Error('SEDA publication artifact not available');
   const data=await response.json();
   if(data.release!=='SEDA 6.0'||data.scale!=='CS'||
      data.aggregation!=='pooled 2009-2019 grades 3-8'||
      data.public_display_approved!==true||
      typeof data.permission_reference!=='string'||data.permission_reference.trim().length<12||
      data.permission_reference.includes('REQUIRED')||!Array.isArray(data.counties)){
     throw Error('SEDA artifact missing release provenance or explicit publication permission');
   }
   const seen=new Set(),updates=[];
   for(const rec of data.counties){
      if(!rec||typeof rec.fips!=='string'||!(/^\d{5}$/).test(rec.fips)||seen.has(rec.fips)){
        throw Error('SEDA contains invalid or duplicate county FIPS');
      }
      seen.add(rec.fips);
      const overall=parse(rec.achievement_sd),math=parse(rec.math_sd),reading=parse(rec.reading_sd);
      if(!rows.has(rec.fips)||[overall,math,reading].every(v=>v===null))continue;
      updates.push([rec.fips,overall,math,reading]);
   }
   if(updates.length<1000)throw Error('SEDA county coverage below validation threshold');
   // Apply data only after the entire artifact passes validation.
   for(const [id,overall,math,reading] of updates){
     const row=rows.get(id);
     row.seda_achievement=overall;row.seda_math=math;row.seda_reading=reading;
   }
   E.ready.seda=true;setOptions(true);
 }catch(error){E.errors.seda=error.message;setOptions(false);}
 finally{render();}
}
E.load=(rows,render)=>Promise.allSettled([originalLoad(rows,render),loadSeda(rows,render)]);
window.CountySeda={metrics,loadSeda,setOptions};
})();