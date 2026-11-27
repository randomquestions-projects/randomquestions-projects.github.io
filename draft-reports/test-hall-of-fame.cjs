const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const h=require('./hall-of-fame.js');
const p={name:'Test',league:'NFL',year:2010,overall:1,pace:{seasons:16,score:95},rating:{quality:90}};
const m=h.models.NFL;
assert.equal(h.classify({...p,rating:{quality:h.thresholds.NFL.high}},m).tier,'high');
assert.equal(h.classify({...p,rating:{quality:h.thresholds.NFL.medium}},m).tier,'medium');
assert.equal(h.classify({...p,rating:{quality:h.thresholds.NFL.low}},m).tier,'low');
assert.equal(h.classify({...p,rating:{quality:h.thresholds.NFL.low-.1}},m),null);
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

// Hall filters handle modern codes, historical labels, dual positions and missing positions.
const group=(league,position)=>h.positionGroups(league,position);
assert(group('NFL','WR').has('WR'));
assert(group('NFL','Wide receiver/return specialist').has('WR'));
assert(group('NFL','Wide receiver/return specialist').has('RET'));
assert(group('NFL','Cornerback/safety').has('CB'));
assert(group('NFL','Cornerback/safety').has('S'));
assert(group('NFL','Cornerback/safety').has('DB'));
assert(group('NFL','Defensive middle guard').has('DT'));
assert(!group('NFL','Defensive middle guard').has('OL'));
assert(group('NFL','Center/guard').has('OL'));
assert(group('NBA','F-C').has('F')&&group('NBA','F-C').has('C'));
assert(group('NBA','PG').has('G'));
assert(group('NBA','nan').has('other'));
assert(h.matchesPosition({league:'NFL',position:'WR'},null,'all'));
assert(!h.matchesPosition({league:'NFL',position:'WR'},null,'QB'));
assert(h.matchesPosition({league:'NBA',position:''},{position:'G-F'},'F'));
assert(h.matchesPosition({league:'NBA',id:'nba-2003-5',name:'Dwyane Wade',position:''},null,'G'));
assert(h.matchesPosition({league:'NBA',id:'nba-2003-5',name:'Wrong identity',position:''},null,'other'));
