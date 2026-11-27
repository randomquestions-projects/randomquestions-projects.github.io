const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const h=require('./hall-of-fame.js');
const p={name:'Test',league:'NFL',year:2010,overall:1,pace:{seasons:16,score:95},rating:{quality:90}};
const m=h.models.NFL;
assert.equal(h.classify(p,m).tier,'high');
assert.equal(h.classify({...p,rating:{quality:85}},m).tier,'medium');
assert.equal(h.classify({...p,rating:{quality:80}},m).tier,'low');
assert.equal(h.classify({...p,rating:{quality:79.9}},m),null);
assert.equal(h.classify({...p,year:2023,pace:{seasons:3,score:90},rating:null},m).tier,'early');
assert.equal(h.classify({...p,year:2025,pace:{seasons:1,score:99}},m),null);
assert.equal(h.classify({...p,year:2021,pace:{seasons:5,score:89}},m),null);
assert.equal(h.classify(p,'unknown'),null);
for(const league of ['NFL','NBA']){
 let n=0,ids=new Set(),tiers={};
 for(let y=2000;y<=2026;y++){
   const d=JSON.parse(fs.readFileSync(path.join(__dirname,'data',league.toLowerCase(),y+'.json'),'utf8'));
   assert.equal(d.model_version,h.models[league]);
   for(const p of d.picks){
     const entry=h.classify(p,d.model_version);
     if(!entry)continue;
     assert(!ids.has(p.id));ids.add(p.id);
     tiers[entry.tier]=(tiers[entry.tier]||0)+1;
     if(entry.tier==='inducted')n++;
     else assert(!p.career?.awards?.hall_of_fame);
   }
 }
 assert.equal(n,Object.keys(h.ledger[league]).length);
 assert.equal(n,league==='NFL'?19:8);
 console.log(league,tiers);
}
