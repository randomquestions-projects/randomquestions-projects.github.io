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
assert.equal(byName('NBA','Bobby Jones').career_summary.games,774);
assert.equal(byName('NBA','Bobby Jones').historical_draft.year,1974);
assert.equal(byName('NBA','Bobby Jones').career_summary.points,8911);
assert(!h.hallScope({p:{league:'NBA'},history:byName('NBA','Lauren Gale')}));
assert.equal(byName('NBA','Nathaniel "Sweetwater" Clifton').career_summary.games,544);
assert.equal(byName('NFL','Alan Page').career_summary.games,218);
assert.equal(byName('NFL','Antonio Gates').career_summary.games,236);
assert.equal(byName('NFL','Kurt Warner').career_summary.passing_yards,32344);
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

const nbaInductees=d.players.filter(p=>p.league==='NBA'&&p.induction_year&&h.hallScope({p:{league:'NBA'},history:p}));
assert.equal(nbaInductees.filter(p=>!p.draft_id&&!p.career_summary).length,0);
for(const [name,games] of [["Charlie Scott",560],["Cliff Hagan",745],["Connie Hawkins",499],["Dan Issel",718],["Louie Dampier",232],["Mel Daniels",11],["Spencer Haywood",760]]){const p=byName('NBA',name);assert.equal(p.career_summary.games,games);assert(p.career_data_source.scope.includes('excluding ABA'));}
console.log('NBA Hall career coverage:',nbaInductees.length,'inductees, none without a career summary or linked draft profile');

const guideRows=d.players.filter(p=>p.career_data_source?.kind==='official_hall_media_guide');
assert.equal(guideRows.length,213);
for(const p of guideRows){assert.equal(p.league,'NFL');assert(p.induction_year);assert(p.career_summary.games>0);assert(p.career_summary.seasons_played>0);assert(p.career_data_source.source.startsWith('https://static.clubs.nfl.com/'));}
assert.equal(byName('NFL','Don Hutson').career_summary.games,116);
assert.equal(byName('NFL','Deacon Jones').career_summary.games,191);
assert.equal(byName('NFL','Jim Thorpe').career_summary.games,52);
console.log('NFL historical media-guide career baselines:',guideRows.length);

const officialAwardRows=d.players.filter(p=>p.historical_award_facts?.pro_bowl_selections);
assert(officialAwardRows.length>=150);
for(const p of officialAwardRows){const a=p.historical_award_facts.pro_bowl_selections;assert(Number.isInteger(a.value)&&a.value>0);assert(a.source.includes('profootballhof.com'));}
assert.equal(byName('NFL','Don Hutson').career_summary.receiving_yards,7991);
assert.equal(byName('NFL','Warren Moon').career_summary.passing_yards,49325);
assert.equal(byName('NFL','Art Donovan').career_summary.seasons_played,12);
assert.equal(byName('NFL','Bill George').career_summary.seasons_played,15);
assert(!h.hallScope({p:{league:'NFL'},history:byName('NFL','George Halas')}));
const hutson=byName('NFL','Don Hutson');assert.equal(h.historicalProfile({league:'NFL',name:hutson.name},hutson).awards.find(a=>a.label==='Pro Bowl selections').value,4);
console.log('Official historical Pro Bowl counts:',officialAwardRows.length,'; official production facts and role corrections checked');

// Dated official major awards must not duplicate existing count rows.
const mj=byName('NBA','Michael Jordan');
assert.deepEqual(mj.historical_award_facts.finals_mvp.years,[1991,1992,1993,1996,1997,1998]);
assert.equal(mj.historical_award_facts.mvp.value,5);
const jordanProfile=h.historicalProfile({league:'NBA',name:mj.name},mj);
assert.equal(jordanProfile.awards.filter(a=>a.label==='Most Valuable Player').length,1);
assert.deepEqual(byName('NFL','Lawrence Taylor').historical_award_facts.dpoy.years,[1981,1982,1986]);
for(const p of d.players)for(const a of Object.values(p.historical_award_facts||{}))if(a.years){assert.equal(a.value,new Set(a.years).size);assert(a.years.every(y=>y<=p.induction_year));}
console.log('Historical major-award event reconciliation passed');

const mergedNBA=d.players.filter(p=>p.league==='NBA'&&Object.values(p.historical_award_facts||{}).some(a=>a.source.includes('2026-27-NBA-Guide')||a.source.includes('List_of_NBA_All-Stars')));
const mergedNFL=d.players.filter(p=>p.additional_stat_sources?.some(a=>a.license==='CC BY 4.0'));
assert.equal(mergedNBA.length,136);assert.equal(mergedNFL.length,83);
assert.equal(byName('NBA','Alex English').historical_award_facts.all_star.value,8);
assert.equal(byName('NBA','Michael Jordan').historical_award_facts.all_star.value,14);
assert.equal(byName('NBA','Michael Jordan').historical_award_facts.all_nba_first.value,10);
assert.equal(byName('NBA','Bobby Jones').historical_award_facts.all_defense_first.value,8);
for(const p of mergedNFL)assert(p.career_summary.games>0);
const allPicks=[...picks.values()].map(x=>x.p);const depthRows=d.players.filter(p=>p.induction_year&&h.hallScope({p:{league:p.league},history:p})&&!p.draft_id).map(history=>({p:{league:history.league,name:history.name,position:history.position},history:structuredClone(history),historicalOnly:true}));
h.attachHistoricalEstimates(depthRows,allPicks);
for(const row of depthRows){const e=row.history.observed_estimate;if(e){assert(e.coverage>=50&&e.coverage<=65);assert(e.value>=0&&e.value<=100);assert(e.parts.every(p=>p.peers>=30));}}
for(const lg of ['NFL','NBA']){const rows=depthRows.filter(r=>r.p.league===lg);const c=rows.reduce((a,r)=>{const k=h.hallScore(r.p,r.history).kind;a[k]=(a[k]||0)+1;return a;},{});console.log('HISTORICAL_SCORE_COVERAGE '+JSON.stringify({league:lg,total:rows.length,...c}));}
console.log('Depth release: NBA award rows',mergedNBA.length,'NFL career rows',mergedNFL.length);
