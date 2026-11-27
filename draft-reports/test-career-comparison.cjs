const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {checkpoint,suggest}=require('./career-comparison.js');
const datasets={};
for(const league of ['NFL','NBA']){
 const d=JSON.parse(fs.readFileSync(path.join(__dirname,'data','career-compare-'+league.toLowerCase()+'.json'),'utf8'));
 d.players=d.shards.flatMap(f=>JSON.parse(fs.readFileSync(path.join(__dirname,'data',f),'utf8')));
 assert.equal(d.players.length,d.player_count);
 assert.equal(new Set(d.players.map(p=>p.id)).size,d.player_count);
 assert.equal(d.players.filter(p=>p.games.length).length,d.audit.game_verified_players);
 for(const p of d.players){for(const basis of ['games','seasons']){let last=0;for(const x of p[basis]){assert(Number.isInteger(x.n)&&x.n>last);assert.equal(x.n%(basis==='games'?d.game_step:1),0);assert(Object.values(x.stats).every(Number.isFinite));last=x.n;}}}
 datasets[league]=d;
}
const d=datasets.NFL,by=name=>d.players.find(p=>p.name===name);
const j=by('Justin Jefferson'),g=by('Jahmyr Gibbs');
assert.equal(checkpoint(j,'seasons',6).receiving_yards,8480);assert.equal(checkpoint(j,'seasons',6).games,94);assert(checkpoint(j,'games',90));
assert.equal(checkpoint(g,'seasons',3).scrimmage_yards,5029);assert.equal(checkpoint(g,'seasons',3).scrimmage_tds,49);assert(checkpoint(g,'games',45));
assert.equal(checkpoint(by('Jerry Rice'),'seasons',20).receiving_yards,22895);
assert.equal(checkpoint(by('Barry Sanders'),'seasons',10).rushing_yards,15269);
assert.equal(checkpoint(by('Jerry Rice'),'games',50),null);
assert(suggest(d,j,'seasons',6).every(id=>d.players.find(p=>p.id===id).position==='WR'));
assert(suggest(d,g,'games',45).length>0);
assert.equal(checkpoint(datasets.NBA.players.find(p=>p.name==='Michael Jordan'),'seasons',15).points,32292);
console.log('Comparison checkpoints verified:',Object.values(datasets).map(d=>[d.league,d.player_count,d.audit.game_verified_players]));

// Official Hall historical players: season checkpoints only, not exact game checkpoints.
for(const [name,n,k,v] of [['Wayne Millner',7,'receiving_yards',1578],['Johnny Robinson',12,'def_interceptions',57],['Reggie White',15,'def_sacks',198]]){const p=by(name);assert(p&&p.hof_source_flag);assert.equal(p.quality,null);assert.equal(checkpoint(p,'seasons',n)[k],v);assert.equal(p.games.length,0);assert.equal(checkpoint(p,'games',50),null);}
console.log('Verified historical NFL comparison additions: 3');

const history=JSON.parse(fs.readFileSync(path.join(__dirname,'data/hall-history.json'),'utf8'));
for(const a of history.historical_nfl_final_integration.comparison_audit){const p=d.players.find(x=>x.id===a.comparison_id);const row=history.players.find(x=>x.id===a.id);assert(p&&row);assert(p.hof_source_flag);assert.equal(p.seasons.at(-1).stats.games,row.career_summary.games);assert.equal(p.seasons.length,row.historical_nfl_reconciled_seasons.seasons.length);if(a.kind==='new'){assert.equal(p.quality,null);assert.equal(p.games.length,0);}}
for(const [name,k,v] of [['Johnny Unitas','passing_yards',40239],['Joe Montana','passing_yards',40551],['Jim Brown','rushing_yards',12312],['Andre Reed','receiving_yards',13198]]){const p=d.players.find(x=>x.name===name&&x.hof_source_flag);assert(p,name);assert.equal(p.seasons.at(-1).stats[k],v);}
assert.equal(d.players.filter(x=>x.name==='Jason Taylor').length,2);assert(d.players.some(x=>x.id==='hof:NFL:jasontaylor'&&x.position==='DL'));
assert.equal(d.players.filter(x=>x.name==='Marcus Allen').length,2);assert(d.players.some(x=>x.id==='hof:NFL:marcusallen'&&x.position==='RB'));
console.log('FINAL_COMPARISONS '+JSON.stringify({total:d.player_count,...d.audit.historical_release}));
