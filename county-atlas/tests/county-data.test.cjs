const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'extra-data.js'), 'utf8');
function sample() {
 const counties = Array.from({length:3100}, (_,i)=>({
  fips:String(i+10000).padStart(5,'0'),
  income:63000, adults25:1000,hsCount:800,collegeCount:400,
  highschool:80,college:40,civilianAdults:850,veterans:85,veteran_share:10
 }));
 return {
  version:1,dataset:'CountyScope verified Census county aggregates',
  sources:{acs:'2024 ACS 5-year Data Profiles'},counties
 };
}
function env(response) {
 const window = {};
 let lastRequest;
 const context = {
  window,AbortController,setTimeout,clearTimeout,
  fetch:async (url,options)=>{lastRequest={url,options};return response;}
 };
 vm.runInNewContext(source,context,{filename:'extra-data.js'});
 const rows=new Map(Array.from({length:3100},(_,i)=>[String(i+10000).padStart(5,'0'),{}]));
 return {api:window.CountyExtras,rows,get lastRequest(){return lastRequest;}};
}
test('approved local snapshot populates county ACS without any browser Census API request',async()=>{
 const fixture=sample();
 const world=env({ok:true,json:async()=>fixture});
 let renderCount=0;
 await world.api.load(world.rows,()=>renderCount++);
 assert.equal(world.api.ready.acs,true);
 assert.equal(world.api.pending,0);
 assert.equal(renderCount,1);
 assert.equal(world.rows.get('10000').income,63000);
 assert.equal(world.rows.get('10000').highschool,80);
 assert.equal(world.lastRequest.url,'data/county-metrics.json');
});
test('missing local snapshot fails without creating fake values or leaving loading indefinitely',async()=>{
 const world=env({ok:false,status:404});
 let rendered=false;
 await world.api.load(world.rows,()=>rendered=true);
 assert.equal(world.api.pending,0);
 assert.equal(world.api.ready.acs,false);
 assert.equal(world.rows.get('10000').income,undefined);
 assert.ok(world.api.errors.snapshot);
 assert.ok(rendered);
});
test('duplicate county FIPS invalidates the whole snapshot',async()=>{
 const fixture=sample();fixture.counties[1].fips=fixture.counties[0].fips;
 const world=env({ok:true,json:async()=>fixture});
 await world.api.load(world.rows,()=>{});
 assert.equal(world.api.ready.acs,false);
 assert.equal(world.rows.get('10000').income,undefined);
 assert.match(world.api.errors.snapshot,/duplicate/i);
});
test('snapshot with no verified ACS source does not activate data',async()=>{
 const fixture=sample();fixture.sources={nonemp:'2024 nonemp'};
 const world=env({ok:true,json:async()=>fixture});
 await world.api.load(world.rows,()=>{});
 assert.equal(world.api.ready.acs,false);
 assert.ok(world.api.errors.snapshot);
});
