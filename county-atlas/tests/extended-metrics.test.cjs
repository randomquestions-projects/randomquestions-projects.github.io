// National county enrichment contract tests; no network and no credentials.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const extraSrc=fs.readFileSync(path.join(__dirname,'..','extra-data.js'),'utf8');
const relSrc=fs.readFileSync(path.join(__dirname,'..','relationships.js'),'utf8');

function snapshot(){
 const counties=Array.from({length:3100},(_,i)=>({
  fips:String(i+10000).padStart(5,'0'),
  income:65000,adults25:1000,hsCount:800,collegeCount:430,
  highschool:80,college:43,civilianAdults:950,veterans:95,veteran_share:10,
  race_white_nh:60,race_black_nh:20,race_native_nh:0.5,
  race_asian_nh:7,race_pacific_nh:0.5,race_other_nh:0.5,
  race_multiracial_nh:2.5,ethnicity_hispanic:9,
  health_obesity:29.3,health_diabetes:10.2,health_depression:22.4,
  health_smoking:14.6,health_inactivity:24.4,health_short_sleep:32.8,
  health_poor_mental:17.2,health_binge_drinking:14.4,
  health_food_insecurity:11.3,
  mortality_homicide:6.2,mortality_firearm_homicide:4.4,
  mortality_suicide:16.2,mortality_overdose:25.8,mortality_firearm:21.7,
  juvenile_delinquency_rate:12.6
 }));
 return {version:1,dataset:'CountyScope verified Census county aggregates',
  sources:{acs:'2024 ACS 5-year',race:'2024 ACS B03002',
   places:'2025 CDC PLACES crude',mortality:'2024 CDC NVSS annual',
   chrr:'2024 County Health Rankings archive'},
  counties};
}
function environment(result){
 const window={};
 const ctx={window,AbortController,setTimeout,clearTimeout,
  fetch:async()=>({ok:true,json:async()=>result})};
 vm.runInNewContext(extraSrc,ctx,{filename:'extra-data.js'});
 const rows=new Map(result.counties.map(x=>[x.fips,{}]));
 return {window,rows,ctx};
}
test('verified multi-source county import feeds new demographic, health and injury layers',async()=>{
 const json=snapshot(),env=environment(json);
 let n=0;
 await env.window.CountyExtras.load(env.rows,()=>n++);
 assert.equal(n,1);
 const e=env.window.CountyExtras;
 for(const group of ['acs','race','places','mortality','chrr'])
  assert.equal(e.ready[group],true,group);
 const first=env.rows.get('10000');
 assert.equal(first.race_black_nh,20);
 assert.equal(first.health_diabetes,10.2);
 assert.equal(first.mortality_homicide,6.2);
 assert.equal(first.juvenile_delinquency_rate,12.6);
 assert.match(e.sourceLabels.chrr,/2024/);
 assert.equal(e.fieldCoverage.juvenile_delinquency_rate,3100);
 env.ctx.window.CountyRelationshipStats={};
 vm.runInNewContext(relSrc,env.ctx,{filename:'relationships.js'});
 for(const key of ['race_white_nh','health_diabetes','mortality_homicide',
                   'juvenile_delinquency_rate'])
  assert.ok(env.window.CountyRelationships.metrics[key],key);
});
test('unverified source fields are excluded even if data snapshot contains them',async()=>{
 const json=snapshot();
 delete json.sources.chrr;
 const env=environment(json);
 await env.window.CountyExtras.load(env.rows,()=>{});
 assert.equal(env.window.CountyExtras.ready.chrr,false);
 assert.equal(env.rows.get('10000').juvenile_delinquency_rate,undefined);
 assert.equal(env.window.CountyExtras.ready.places,true);
});
test('insufficient juvenile court-case coverage does not activate the archive metric',async()=>{
 const json=snapshot();
 json.counties.slice(0,2900).forEach(x=>{x.juvenile_delinquency_rate=null;});
 const env=environment(json);
 await env.window.CountyExtras.load(env.rows,()=>{});
 assert.equal(env.window.CountyExtras.ready.chrr,false);
 assert.equal(env.rows.get('12999').juvenile_delinquency_rate,undefined);
 assert.equal(env.window.CountyExtras.ready.acs,true);
});
test('invalid suppressed/negative or implausible county health values are not published',async()=>{
 const json=snapshot();
 json.counties[0].health_obesity=101;
 const env=environment(json);
 await env.window.CountyExtras.load(env.rows,()=>{});
 assert.equal(env.window.CountyExtras.ready.places,false);
 assert.equal(env.window.CountyExtras.ready.acs,false);
 assert.equal(env.rows.get('10000').health_obesity,undefined);
 assert.match(env.window.CountyExtras.errors.snapshot,/Invalid metric/);
});
