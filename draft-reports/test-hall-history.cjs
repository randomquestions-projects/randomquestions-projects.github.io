const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const d=JSON.parse(fs.readFileSync(path.join(__dirname,'data/hall-history.json'),'utf8'));
assert.equal(d.schema_version,2);
assert.equal(new Set(d.players.map(p=>p.id)).size,d.players.length);
assert(d.players.filter(p=>p.league==='NFL'&&p.induction_year).length>=330);
assert(d.players.filter(p=>p.league==='NBA'&&p.induction_year).length>=240);
for(const p of d.players){assert(['NFL','NBA'].includes(p.league));assert(p.name);assert(p.source.startsWith('https://'));assert(!('quality_score' in p));assert(!['nba-2006-37','nba-2008-43','nfl-2023-234','nfl-2004-6','nfl-2018-148'].includes(p.draft_id));}
assert.equal(d.players.filter(p=>p.league==='NFL'&&p.ballots.some(b=>b.year===2027)).length,52);
console.log('Historical directory contract passed',d.players.length);

const h=require('./hall-of-fame.js');
const norm=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const picks=new Map();
for(const league of ['NFL','NBA'])for(let y=2000;y<=2026;y++){
 const doc=JSON.parse(fs.readFileSync(path.join(__dirname,'data',league.toLowerCase(),y+'.json'),'utf8'));
 for(const p of doc.picks)picks.set(p.id,{p,model:doc.model_version});
}
const mapped=new Set();
for(const entry of d.players){
 if(!entry.draft_id)continue;
 assert(!mapped.has(entry.draft_id),'Duplicate linked draft identity '+entry.draft_id);
 mapped.add(entry.draft_id);
 const match=picks.get(entry.draft_id);
 assert(match,'Missing linked draft identity '+entry.draft_id);
 assert.equal(match.p.league,entry.league);
 assert.equal(norm(match.p.name),norm(entry.name));
 if(entry.induction_year){const status=h.classify(match.p,match.model);assert.equal(status?.tier,'inducted',entry.name);assert.equal(status.year,entry.induction_year);}
}
console.log('Verified modern draft linkages:',mapped.size);

const estimates=d.players.filter(p=>p.score_kind==='historical_partial_estimate');assert.equal(estimates.length,169);for(const p of estimates){assert(Number.isFinite(p.partial_score)&&p.partial_score>=0&&p.partial_score<=100);assert(p.coverage>=60&&p.coverage<=100);assert(!p.draft_id);}
assert.equal(new Set(d.upcoming.map(p=>p.draft_id)).size,d.upcoming.length);for(const e of d.upcoming){const m=picks.get(e.draft_id);assert(m&&m.p.name===e.name);assert(e.estimated_first_eligible_class>=2027&&e.estimated_first_eligible_class<=2031);assert.equal(e.estimated_first_eligible_class,e.last_observed_season+(m.p.league==='NFL'?6:3));assert.equal(e.status,'estimated_not_confirmed');}
assert.equal(d.players.filter(p=>p.league==='NBA'&&p.induction_verification==='official_name_year').length,247);console.log('Historical estimates',estimates.length,'Upcoming',d.upcoming.length);
