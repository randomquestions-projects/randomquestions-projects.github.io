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

const estimates=d.players.filter(p=>p.score_kind==='historical_partial_estimate');assert.equal(estimates.length,167);for(const p of estimates){assert(Number.isFinite(p.partial_score)&&p.partial_score>=0&&p.partial_score<=100);assert(p.coverage>=60&&p.coverage<=100);assert(!p.draft_id);}
assert.equal(new Set(d.upcoming.map(p=>p.draft_id)).size,d.upcoming.length);for(const e of d.upcoming){const m=picks.get(e.draft_id);assert(m&&m.p.name===e.name);assert(e.estimated_first_eligible_class>=2027&&e.estimated_first_eligible_class<=2031);assert.equal(e.estimated_first_eligible_class,e.last_observed_season+(m.p.league==='NFL'?6:3));assert.equal(e.status,'estimated_not_confirmed');}
assert.equal(d.players.filter(p=>p.league==='NBA'&&p.induction_verification==='official_name_year').length,247);console.log('Historical estimates',estimates.length,'Upcoming',d.upcoming.length);

// Regression checks for cross-era name collisions, official record corrections, and scope.
const byName=(league,name)=>d.players.find(p=>p.league===league&&p.name===name);
assert.equal(byName('NFL','Reggie White').career_summary.games,232);
assert.equal(byName('NFL','Reggie White').career_summary.sacks,198);
assert.equal(byName('NFL','Johnny Robinson').career_summary.games,164);
assert.equal(byName('NFL','Johnny Robinson').partial_score,undefined);
assert.equal(byName('NFL','Reggie White').partial_score,undefined);
assert.equal(byName('NFL','Kellen Winslow').career_summary.receptions,541);
assert.equal(byName('NFL','Adrian Peterson').position,'RB');
assert.equal(byName('NBA',"John 'Cat' Thompson").career_data_status,'non_nba_historical_player');
assert(!byName('NBA',"John 'Cat' Thompson").career_summary);
assert(!byName('NBA','Bobby Jones').career_summary);
assert.equal(byName('NBA','George Mikan').career_summary.games,439);
assert.equal(d.players.filter(p=>p.career_data_source?.kind==='existing_career_comparison').length,23);
assert(d.players.every(p=>!('starts' in (p.career_summary||{}))));

// Historical leaderboard regression: data coverage is not the same as draft status.
const rowFor=name=>{const history=byName('NBA',name);return {p:{league:'NBA',name,position:history.position},history};};
for(const [name,draft,position,score] of [['Andrei Kirilenko','1999 · #24','F','93.6 est.'],['Andres Nocioni','Undrafted','F','69.3 est.'],['Andrew Gaze','Undrafted','G','22.3 est.']]){
 const r=rowFor(name);assert.equal(h.historicalDraftLabel(r.p,r.history),draft);assert.equal(h.positionLabel(r.p,r.history),position);assert.equal(h.hallScore(r.p,r.history).label,score);assert(h.hallScope(r,'career'));
}
for(const name of ['Alline Banks Sprouse','Amaury Pasos','Amaya Valdemore']){
 const r=rowFor(name);assert(!h.hallScope(r,'career'));assert(!h.hallScope(r,'directory'));assert.equal(h.hallScore(r.p,r.history).kind,'not_applicable');
}
assert.equal(h.hallScore({quality_score:95},{partial_score:99}).kind,'full');
assert.equal(h.hallScore({},{}).kind,'missing');
assert.equal(h.historicalDraftLabel({},{}),'Draft not verified');
assert.equal(h.historicalDraftLabel({year:2003,overall:1},{}),'2003 · #1');

assert(h.hallScope({p:{league:'NBA'},history:byName('NBA','Dino Rađa')}));
assert(!h.hallScope({p:{league:'NBA'},history:byName('NBA','Oscar Schmidt')}));
assert(!h.hallScope({p:{league:'NFL'},history:{official_role:'coach'}}));
assert(h.hallScope({p:{league:'NFL'},history:{official_role:'player'}}));
assert.equal(byName('NFL','Charley Conerly').position,'QB');

// Real-data regression: historical profiles do not require a modern draft ID.
const history=byName('NBA','Alex English');
const alex={p:{id:history.id,league:'NBA',name:history.name,position:history.position},history:structuredClone(history),historicalOnly:true};
h.attachHistoricalEstimates([alex],[...picks.values()].map(x=>x.p));
const score=h.hallScore(alex.p,alex.history);
assert.equal(score.kind,'observed');assert(score.value>80&&score.value<=100);
assert.equal(alex.history.observed_estimate.coverage,50);
const profile=h.historicalProfile(alex.p,alex.history);
assert.equal(profile.inductionYear,1997);
assert.equal(profile.stats.find(x=>x.label==='Career points').value,25613);
assert.equal(profile.stats.find(x=>x.label==='Games played').value,1193);
assert.equal(profile.awards.find(x=>x.label==='All-Star selections').value,8);
assert.equal(profile.score.value,score.value);
const excluded=rowFor('Alline Banks Sprouse');
assert.equal(h.observedHistoricalEstimate(excluded.p,excluded.history,h.historicalReference([...picks.values()].map(x=>x.p))),null);
const insufficient={...alex.history,career_summary:{games:1193,minutes:38063},observed_estimate:undefined};
assert.equal(h.observedHistoricalEstimate(alex.p,insufficient,h.historicalReference([...picks.values()].map(x=>x.p))),null);
const nflHistory=byName('NFL','Reggie White');
assert.equal(h.historicalProfile({league:'NFL',name:nflHistory.name},nflHistory).stats.find(x=>x.label==='Games played').value,232);
const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
assert(app.includes('historicalOnly?showHistoricalProfile(p,history):showProfile(p)'));
assert(app.includes("if(!$('player-dialog').open)$('player-dialog').showModal()"));
assert(!app.includes("safeText('a','hall-player'"));
console.log('Historical profile regression: Alex English',score.value,'(50% coverage); in-site historical profiles and missing-data guards passed');
