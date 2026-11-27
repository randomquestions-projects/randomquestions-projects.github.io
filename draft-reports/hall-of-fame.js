/* Derived Hall of Fame watchlist, 2000–2026 drafted players.
Verified individual player enshrinements as of 2026-11-26.
Sources: https://www.profootballhof.com/hall-of-famers/years
https://www.hoophall.com/hall-of-famers
Draft identities checked against published yearly player exports.
*/
(function(root){
  'use strict';
  const ledger = {
    NFL:{
      '2000-9':['Brian Urlacher',2018],
      '2001-5':['LaDainian Tomlinson',2017],
      '2001-6':['Richard Seymour',2022],
      '2001-17':['Steve Hutchinson',2020],
      '2001-32':['Drew Brees',2026],
      '2002-2':['Julius Peppers',2024],
      '2002-11':['Dwight Freeney',2024],
      '2002-24':['Ed Reed',2019],
      '2003-3':['Andre Johnson',2024],
      '2003-16':['Troy Polamalu',2020],
      '2004-3':['Larry Fitzgerald',2026],
      '2004-126':['Jared Allen',2025],
      '2005-11':['DeMarcus Ware',2023],
      '2006-57':['Devin Hester',2024],
      '2007-2':['Calvin Johnson',2021],
      '2007-3':['Joe Thomas',2023],
      '2007-11':['Patrick Willis',2024],
      '2007-14':['Darrelle Revis',2023],
      '2012-9':['Luke Kuechly',2026]
    },
    NBA:{
      '2001-3':['Pau Gasol',2023],
      '2001-28':['Tony Parker',2023],
      '2002-1':['Yao Ming',2016],
      '2002-9':["Amar'e Stoudemire",2026],
      '2003-3':['Carmelo Anthony',2025],
      '2003-4':['Chris Bosh',2021],
      '2003-5':['Dwyane Wade',2023],
      '2004-1':['Dwight Howard',2025]
    }
  };
  const labels={inducted:'Hall of Famer',high:'High likelihood',medium:'Medium likelihood',low:'Low likelihood',early:'On pace · too early to tell'};
  const order=['inducted','high','medium','low','early'];
  const models={NFL:'nfl-draft-v4',NBA:'nba-draft-v3'};
  const thresholds={"NFL":{"high":91,"medium":90,"low":89},"NBA":{"high":89,"medium":87,"low":86}};
  const quality=p=>Number.isFinite(p.quality_score)?p.quality_score:Number.isFinite(p.rating?.quality)?p.rating.quality:null;
  const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function classify(p, model){
    const item=ledger[p.league]?.[p.year+'-'+p.overall];
    if(item && norm(item[0])===norm(p.name))return {tier:'inducted',year:item[1]};
    // Do not silently apply thresholds to a new, uncalibrated scoring model.
    if(model!==models[p.league])return null;
    const q=quality(p), k=p.pace?.seasons ?? (p.league==='NFL'?2026-p.year:2026-p.year);
    if(k<=5){
      return k>=2 && Number.isFinite(p.pace?.score) && p.pace.score>=90 ? {tier:'early'}:null;
    }
    if(q===null)return null;
    if(q>=thresholds[p.league].high)return {tier:'high'};
    if(q>=thresholds[p.league].medium)return {tier:'medium'};
    if(q>=thresholds[p.league].low)return {tier:'low'};
    return null;
  }
  const api={ledger,labels,order,models,thresholds,quality,classify};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DraftHall=api;
})(typeof globalThis!=='undefined'?globalThis:this);
