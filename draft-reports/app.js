(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sourceLinks = {
    NFL: 'https://www.profootballhof.com/football-history/nfl-draft-history/1960/2020',
    NBA: 'https://www.nba.com/draft/history'
  };
  const state = { league: 'NFL', year: 2020, round: 1, query: '', sort: 'pick' };
  let picks = [];
  let selectedRow = null;
  let latestLoad = 0;
  let dataUnavailable = false;
  let cohortCatalog = null;
  let cohortUnavailable = false;
  let currentModelVersion = null;
  let honorScope = 'class';
  let honorMetric = null;
  const honorDefinitions = {
    NFL: [
      ['hof_inducted', 'Hall of Famers'],
      ['hof_contender', 'Hall of Fame contenders'],
      ['pro_bowls', 'Pro Bowls'],
      ['total_all_pro', 'All-Pro seasons'],
      ['first_team_all_pro', 'First-team All-Pro'],
      ['mvp', 'MVP'],
      ['opoy', 'Offensive POY'],
      ['dpoy', 'Defensive POY'],
      ['super_bowl_titles', 'Champion-team rosters']
    ],
    NBA: [
      ['hof_inducted', 'Hall of Famers'],
      ['hof_contender', 'Hall of Fame contenders'],
      ['all_star', 'All-Star selections'],
      ['all_nba_total', 'All-NBA teams'],
      ['all_nba_first', 'First-team All-NBA'],
      ['mvp', 'MVP'],
      ['finals_mvp', 'Finals MVP'],
      ['dpoy', 'Defensive POY'],
      ['roy', 'Rookie of the Year'],
      ['all_defense_total', 'All-Defensive teams'],
      ['championship_roster_seasons', 'Champion-team stints']
    ]
  };

  const safeText = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  };
  const fullName = (s) => s || '—';

  function populateYears() {
    $('year-filter').replaceChildren();
    const availableYears = Array.from({length:27},(_,i)=>2026-i);
    if (!availableYears.includes(state.year)) state.year = 2020;
    for (const year of availableYears) {
      const opt = document.createElement('option');
      opt.value = String(year);
      opt.textContent = String(year);
      $('year-filter').appendChild(opt);
    }
    $('year-filter').value = String(state.year);
  }
  function populateRounds() {
    $('round-filter').replaceChildren();
    for (let n = 1; n <= (state.league === 'NBA' ? 2 : 7); n++) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = 'Round ' + n;
      $('round-filter').appendChild(opt);
    }
    state.round = Math.min(state.round, state.league === 'NBA' ? 2 : 7);
    $('round-filter').value = String(state.round);
  }
  function filterPicks() {
    const q = state.query.trim().toLowerCase();
    const rows = picks.filter((p) => p.league === state.league && p.year === state.year && p.round === state.round &&
      (!q || [p.name, p.team, p.position || '', p.college || ''].some((x) => x.toLowerCase().includes(q))));
    rows.sort((a,b) => {
      if (state.sort === 'name') return a.name.localeCompare(b.name) || a.overall - b.overall;
      if (state.sort === 'team') return a.team.localeCompare(b.team) || a.overall - b.overall;
      if (state.sort === 'quality' || state.sort === 'value' || state.sort === 'pace') {
        const key = state.sort;
        const get = p => key === 'pace' ? p.pace?.score : key==='quality'?DraftHall.quality(p):p.rating?.[key];
        const x = Number.isFinite(get(a)) ? get(a) : -1;
        const y = Number.isFinite(get(b)) ? get(b) : -1;
        return y - x || a.overall - b.overall;
      }
      return a.overall - b.overall;
    });
    return rows;
  }
  function cell(row, ...children) {
    const td = document.createElement('td');
    children.forEach((child) => td.appendChild(child));
    row.appendChild(td);
    return td;
  }
  function makeRow(p) {
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', 'Open profile for ' + p.name + ', pick ' + p.overall);
    cell(tr, safeText('span', 'pick-number', '#' + String(p.overall).padStart(2, '0')));
    const player = document.createElement('td');
    player.appendChild(safeText('div', 'player-name', p.name));
    player.appendChild(safeText('div', 'player-detail', p.position ? p.position + (p.college ? ' · ' + p.college : '') : 'Draft selection'));
    tr.appendChild(player);
    cell(tr, safeText('span', 'team-name', p.team));
    const quality = DraftHall.quality(p)?.toFixed(1) ?? null;
    const grade = p.rating && p.rating.grade ? p.rating.grade : null;
    cell(tr, safeText('span', 'score-pending', quality === null ? (p.career_status === 'too_early' ? 'Too early' : 'Not rated') : quality));
    cell(tr, safeText('span', 'score-pending', p.pace && Number.isFinite(p.pace.score) ? p.pace.score.toFixed(1) : '—'));
    cell(tr, safeText('span', 'grade-pending', grade || '—'));
    const btn = safeText('button', 'row-button', '↗');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open ' + p.name + ' profile');
    cell(tr, btn);
    tr.addEventListener('click', () => showProfile(p));
    tr.addEventListener('keydown', (event) => {
      if (event.target === tr && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); showProfile(p);
      }
    });
    return tr;
  }

  function renderNBAProfile(p, career, first, second, detailLine) {
    const addStat=(label,key,digits=0)=>{
      const value=career[key];
      if(value===null || value===undefined || !Number.isFinite(Number(value)))return;
      detailLine(first,label,Number(value).toLocaleString(undefined,{
        minimumFractionDigits:digits,maximumFractionDigits:digits
      }));
    };
    addStat('NBA games played','games');
    if(career.games>0){
      addStat('Games started','games_started');
      addStat('Career minutes','minutes');
      addStat('Career points','points');
      addStat('Points per game','points_per_game',1);
      addStat('Career rebounds','rebounds');
      addStat('Rebounds per game','rebounds_per_game',1);
      addStat('Career assists','assists');
      addStat('Assists per game','assists_per_game',1);
      addStat('Career steals','steals');
      addStat('Career blocks','blocks');
      addStat('Win Shares','win_shares',1);
      addStat('Win Shares per 48','ws_per_48',3);
      addStat('Value Over Replacement (VORP)','vorp',1);
      addStat('Box Plus/Minus (BPM)','bpm',1);
    }
    if(p.year>=2024)first.appendChild(safeText('p','season-disclaimer',
      'Recent class: career outcomes are incomplete. The 2026–27 NBA season is in progress.'));
    if(career.games===0 && p.year<2024)first.appendChild(
      safeText('p','season-disclaimer','No verified NBA regular-season appearances.'));
    const awards=career.awards||{},years=awards.seasons||{};
    const labels=[
      ['mvp','NBA Most Valuable Player'],
      ['finals_mvp','NBA Finals MVP'],
      ['dpoy','Defensive Player of the Year'],
      ['roy','Rookie of the Year'],
      ['all_nba_first','All-NBA First Team'],
      ['all_nba_second','All-NBA Second Team'],
      ['all_nba_third','All-NBA Third Team'],
      ['all_nba_total','Total All-NBA selections'],
      ['all_defense_first','All-Defensive First Team'],
      ['all_defense_second','All-Defensive Second Team'],
      ['all_defense_total','Total All-Defensive selections'],
      ['all_star','All-Star selections'],
      ['championship_roster_seasons','NBA champion-team regular-season stints*']
    ];
    for(const [key,label] of labels) {
      const v=awards[key];
      if(typeof v!=='number')continue;
      if(v===0 && !['all_nba_total','all_defense_total','all_star'].includes(key))continue;
      const ys=Array.isArray(years[key])?years[key]:[];
      detailLine(second,label,String(v)+(ys.length?' ('+ys.join(', ')+')':''));
    }
    if(awards.championship_roster_seasons>0)
      second.appendChild(safeText('p','season-disclaimer',
      '* Regular-season appearance for the eventual champion team; not verified ring or NBA Finals participation.'));
    second.appendChild(safeText('p','season-disclaimer',
      'All-Defensive selections include 2000–2026 first and second teams, including tied selections.'));
    const section=document.querySelector('.profile-columns section:first-child');
    let seasonContainer=document.getElementById('season-summary');
    if(!seasonContainer) {
      seasonContainer=safeText('div','season-summary','');
      seasonContainer.id='season-summary';section.appendChild(seasonContainer);
    }
    seasonContainer.replaceChildren();
    const seasonal=Array.isArray(p.seasonal)?p.seasonal:[];
    if(seasonal.length){
      seasonContainer.appendChild(safeText('h4','season-title','NBA seasons'));
      for(const season of seasonal){
        seasonContainer.appendChild(safeText('span','season-chip',
          String(season.year)+' · '+(season.team||'NBA')+
          ' ('+String(season.games||0)+' GP)'));
      }
    }
  }
  function showHistoricalProfile(p,history){
    selectedRow=document.activeElement;
    const profile=DraftHall.historicalProfile(p,history);
    $('profile-monogram').textContent=p.name.split(/[\s.-]+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase();
    $('profile-name').textContent=profile.name;
    $('profile-subtitle').textContent=p.league+' / HISTORICAL PLAYER';
    $('profile-meta').textContent=[profile.position,profile.draft,profile.inductionYear?'Hall of Fame · '+profile.inductionYear:null].filter(Boolean).join(' · ');
    $('profile-quality').textContent=profile.score.value===null?'—':profile.score.label;
    $('profile-grade').textContent='—';
    $('profile-pace').textContent='—';
    $('profile-pace-note').textContent='Matched historical career-stage inputs not verified';
    const first=document.querySelector('.profile-columns section:first-child .profile-placeholder');
    const second=document.querySelector('.profile-columns section:last-child .profile-placeholder');
    first.replaceChildren();second.replaceChildren();
    const seasons=$('season-summary');if(seasons)seasons.replaceChildren();
    function line(parent,label,value){
      const item=safeText('div','detail-line','');
      item.appendChild(safeText('span','detail-key',label));
      item.appendChild(safeText('strong','detail-value',typeof value==='number'?value.toLocaleString(undefined,{maximumFractionDigits:3}):String(value)));
      parent.appendChild(item);
    }
    for(const item of profile.stats)line(first,item.label,item.value);
    for(const item of profile.awards)line(second,item.label+(item.scope?' ('+item.scope+')':''),item.value);
    if(profile.inductionYear)line(second,'Hall of Fame induction',profile.inductionYear);
    if(profile.ballotYears.length)line(second,'Ballot / finalist years',profile.ballotYears.join(', '));
    if(!first.childElementCount)first.appendChild(safeText('p','detail-empty','Verified career statistics not yet available.'));
    if(!second.childElementCount)second.appendChild(safeText('p','detail-empty','Verified honors not yet available.'));
    if(profile.note)first.appendChild(safeText('p','season-disclaimer',profile.note));
    if(history?.additional_stat_sources?.some(x=>x.license==='CC BY 4.0'))first.appendChild(safeText('p','season-disclaimer','Additional career facts: nflverse (CC BY 4.0), exact name and games match.'));
    if(history?.additional_stat_sources?.some(x=>x.license==='CC BY-SA 4.0'))first.appendChild(safeText('p','season-disclaimer','Additional reported career facts: Wikipedia (CC BY-SA 4.0), matched by name and Hall induction year. Historical league scope and tackle/sack definitions may vary. Reported sacks are not official sack totals.'));
    if(Object.values(history?.historical_award_facts||{}).some(x=>x.license==='CC BY-SA 4.0'))second.appendChild(safeText('p','season-disclaimer','Additional reported award facts: Wikipedia (CC BY-SA 4.0); source and playing scope recorded in historical ledger.'));
    if(history?.score_review)first.appendChild(safeText('p','season-disclaimer',history.score_review));
    if(history?.career_data_status==='legacy_statistics_unreviewed')first.appendChild(safeText('p','season-disclaimer','Legacy statistics not independently reconciled; ambiguous starts field omitted.'));
    const score=profile.score,coverage=score.kind==='observed'?history.observed_estimate.coverage:history?.coverage;
    const sourceNote=document.querySelector('.profile-source > span:nth-child(2)');
    if(sourceNote)sourceNote.textContent=score.kind==='observed'?'Career quality estimate · '+coverage+'% of model weight · mature 2000–2017 reference · observed career components only; not a full score or likelihood tier.':score.kind==='evidence'?'Historical evidence index · '+history.evidence_estimate.coverage+'% of separate evidence weights · not a full quality score; reported honors may differ in selection scope.':score.kind==='partial'?'Historical quality estimate · '+coverage+'% of model weight · missing components excluded.':'Historical career record · full model inputs not yet verified.';
    if(score.kind==='observed'){
      const e=history.observed_estimate;
      const labels={win_shares:'Win Shares',vorp:'VORP',minutes:'Minutes',weighted_av:'Weighted AV',seasons_started:'Seasons started',games:'Games played'};
      first.appendChild(safeText('h4','season-title','Quality estimate components'));
      for(const part of e.parts)line(first,labels[part.key]||part.key,part.percentile.toFixed(1)+' percentile');
    }
    if(score.kind==='evidence'){first.appendChild(safeText('h4','season-title','Historical evidence index components'));for(const part of history.evidence_estimate.parts)line(first,part.domain,part.percentile.toFixed(1)+' percentile · '+part.weight+'% weight');}
    if(history?.historical_season_evidence){const s=history.historical_season_evidence;first.appendChild(safeText('h4','season-title','Reconstructed season milestones'));line(first,'Observed seasons',s.seasons);for(const [k,v] of Object.entries(s.peak||{}))line(first,'Best-three '+k.replaceAll('_',' ')+' per game',v.rate);first.appendChild(safeText('p','season-disclaimer',s.scope));}
    if(history?.historical_dated_seasons){const s=history.historical_dated_seasons;first.appendChild(safeText('h4','season-title','Historical regular-season statistics'));for(const y of s.seasons){const values=[y.games+' GP',...['points','rebounds','assists','minutes'].filter(k=>Number.isFinite(y[k+'_per_game'])).map(k=>y[k+'_per_game']+' '+({points:'PPG',rebounds:'RPG',assists:'APG',minutes:'MPG'}[k]))];line(first,String(y.year),values.join(' · '));}first.appendChild(safeText('p','season-disclaimer',s.scope+' Source: Wikipedia (CC BY-SA 4.0).'));}
    if(history?.historical_playoff_seasons){const s=history.historical_playoff_seasons;first.appendChild(safeText('h4','season-title','Historical playoff statistics'));for(const y of [...s.seasons,{...s.career,year:'Career playoffs'}]){const values=[y.games+' GP',...['points','rebounds','assists','minutes'].filter(k=>Number.isFinite(y[k+'_per_game'])).map(k=>y[k+'_per_game']+' '+({points:'PPG',rebounds:'RPG',assists:'APG',minutes:'MPG'}[k]))];line(first,String(y.year),values.join(' · '));}first.appendChild(safeText('p','season-disclaimer',s.scope+' Source: Wikipedia (CC BY-SA 4.0).'));}
    $('profile-source-link').hidden=true;
    if(!$('player-dialog').open)$('player-dialog').showModal();
  }
  function showProfile(p) {
    $('profile-source-link').hidden=false;
    selectedRow = document.activeElement;
    $('profile-monogram').textContent = p.name.split(/[\s.-]+/).slice(0,2).map((s) => s[0] || '').join('').toUpperCase();
    $('profile-name').textContent = p.name;
    $('profile-subtitle').textContent = p.league + ' / ' + p.year + ' DRAFT CLASS';
    $('profile-meta').textContent = 'Round ' + p.round + ' · Pick #' + p.overall + ' · ' + p.team + (p.position ? ' · ' + p.position : '');
    $('profile-quality').textContent = DraftHall.quality(p)?.toFixed(1) ?? '—';
    $('profile-grade').textContent = p.rating && p.rating.grade ? p.rating.grade : '—';
    $('profile-pace').textContent = p.pace && Number.isFinite(p.pace.score) ? p.pace.score.toFixed(1) : '—';
    $('profile-pace-note').textContent = p.pace ? p.pace.band + ' · ' + p.pace.seasons + ' completed seasons · ' + p.pace.peer_count + ' peers' : 'Insufficient comparable historical seasons or position data';
    $('profile-source-link').href = p.league === 'NFL' ?
      'https://github.com/nflverse/nflverse-data' : sourceLinks.NBA;
    const career = p.career || null;
    const first = document.querySelector('.profile-columns section:first-child .profile-placeholder');
    const second = document.querySelector('.profile-columns section:last-child .profile-placeholder');
    first.replaceChildren();
    second.replaceChildren();
    function detailLine(parent,label,value) {
      const line = safeText('div','detail-line','');
      line.appendChild(safeText('span','detail-key',label));
      line.appendChild(safeText('strong','detail-value',value));
      parent.appendChild(line);
    }
    if (career) {
      if(p.league === 'NBA') {
        renderNBAProfile(p,career,first,second,detailLine);
      } else {
      if (career.games !== null) detailLine(first,'NFL games',String(career.games));
      if (career.weighted_av !== null) detailLine(first,'Weighted career AV',String(career.weighted_av));
      const group = p.position_group || '';
      const allowedByGroup = {
        QB:['passing_yards','passing_tds','passing_interceptions','rushing_yards'],
        RB:['rushing_yards','rushing_tds','receiving_yards','receptions'],
        WR:['receiving_yards','receiving_tds','receptions'],
        TE:['receiving_yards','receiving_tds','receptions'],
        DL:['def_sacks','def_tackles_solo','def_interceptions'],
        LB:['def_tackles_solo','def_sacks','def_interceptions'],
        DB:['def_interceptions','def_tackles_solo','def_sacks'],
        ST:['fg_made','fg_att']
      };
      const statNames={passing_yards:'Passing yards',passing_tds:'Passing touchdowns',
        passing_interceptions:'Interceptions thrown',rushing_yards:'Rushing yards',
        rushing_tds:'Rushing touchdowns',receiving_yards:'Receiving yards',
        receiving_tds:'Receiving touchdowns',receptions:'Receptions',
        def_sacks:'Sacks',def_interceptions:'Defensive interceptions',
        def_tackles_solo:'Solo tackles',fg_made:'Field goals made',fg_att:'Field goals attempted'};
      for(const key of allowedByGroup[group] || []) {
        if(career.stats && career.stats[key] !== null && career.stats[key] !== undefined)
          detailLine(first,statNames[key],Number(career.stats[key]).toLocaleString());
      }
      if(!first.childElementCount) first.appendChild(safeText('p','detail-empty','Career statistics not available'));
      const awards=career.awards || {};
      const hasHonorsV2 = typeof awards.total_all_pro === 'number';
      const awardYears = awards.seasons || {};
      const accoladeLine = (key, label, seasonKey, always=false) => {
        const value=awards[key];
        if(typeof value !== 'number' || (!always && value===0))return;
        const years=Array.isArray(awardYears[seasonKey]) ? awardYears[seasonKey] : [];
        const shown=String(value)+(years.length ? ' ('+years.join(', ')+')' : '');
        detailLine(second,label,shown);
      };
      if(hasHonorsV2) {
        accoladeLine('mvp','NFL MVP','mvp');
        accoladeLine('opoy','Offensive Player of the Year','opoy');
        accoladeLine('dpoy','Defensive Player of the Year','dpoy');
        accoladeLine('super_bowl_titles','Super Bowl champion roster*','super_bowl_seasons');
        accoladeLine('first_team_all_pro','AP first-team All-Pro','all_pro_first_seasons',true);
        accoladeLine('second_team_all_pro','AP second-team All-Pro','all_pro_second_seasons',true);
        accoladeLine('total_all_pro','Total AP All-Pro seasons',null,true);
        accoladeLine('pro_bowls','Pro Bowl selections',null,true);
        if(awards.super_bowl_titles > 0) {
          second.appendChild(safeText('p','season-disclaimer',
            '* Counted by season roster membership with the champion, not independently verified Super Bowl game appearances or individual rings.'));
        }
      } else {
        if(awards.first_team_all_pro !== null && awards.first_team_all_pro !== undefined)
          detailLine(second,'First-team All-Pro',String(awards.first_team_all_pro));
        if(awards.pro_bowls !== null && awards.pro_bowls !== undefined)
          detailLine(second,'Pro Bowl selections',String(awards.pro_bowls));
      }
      if(awards.hall_of_fame) detailLine(second,'Pro Football Hall of Fame','Inducted');
      if(!second.childElementCount)second.appendChild(safeText('p','detail-empty','Verified accolades unavailable'));
      const seasonal = Array.isArray(p.seasonal) ? p.seasonal : [];
      const section=document.querySelector('.profile-columns section:first-child');
      let seasonContainer = document.getElementById('season-summary');
      if(!seasonContainer) {
        seasonContainer=safeText('div','season-summary','');
        seasonContainer.id='season-summary';
        section.appendChild(seasonContainer);
      }
      seasonContainer.replaceChildren();
      if(seasonal.length) {
        seasonContainer.appendChild(safeText('h4','season-title','NFL seasons'));
        for(const year of seasonal) {
          seasonContainer.appendChild(safeText('span','season-chip',
            String(year.year)+(year.partial?'*':'')+' · '+(year.team||'NFL')));
        }
        if(seasonal.some(y=>y.partial))seasonContainer.appendChild(safeText('p','season-disclaimer','* 2026 season in progress'));
      }
      }
    } else {
      first.appendChild(safeText('p','detail-empty','Career data not yet available.'));
      second.appendChild(safeText('p','detail-empty','Honors not yet available.'));
      const seasonContainer=document.getElementById('season-summary');
      if(seasonContainer)seasonContainer.replaceChildren();
    }
    const sourceNote=document.querySelector('.profile-source > span:nth-child(2)');
    if(sourceNote)sourceNote.textContent = career ?
      ('Career scoring ' + (p.rating ? (p.rating.maturity === 'established' ? 'established-career snapshot' : 'provisional') : 'too early to grade')+
       ' · Grade basis: '+(p.rating?.grade_basis === 'career_pace' ? 'tenure-adjusted pace' : 'career quality') + ' · Source: '+(p.league==='NBA'?'NBA Stats / Basketball-Reference':'nflverse')+' · Model '+(p.rating ? p.rating.model_version : 'not assigned')) :
      'Draft selection verified · career measurements pending';

    if (!$('player-dialog').open) $('player-dialog').showModal();
  }

  function awardCount(p, key) {
    if(key==='hof_inducted'||key==='hof_contender'){
      const status=DraftHall.classify(p,currentModelVersion);
      return status && (key==='hof_inducted'?status.tier==='inducted':status.tier!=='inducted')?1:0;
    }
    const value = p.career?.awards?.[key];
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function addCohortCard(parent, title, group, groupPicks) {
    const card = safeText('article', 'cohort-card', '');
    const head = safeText('div', 'cohort-card-header', '');
    const titleBox = safeText('div', '', '');
    titleBox.appendChild(safeText('div', 'cohort-card-name', title));
    titleBox.appendChild(safeText('div', 'cohort-card-subtitle',
      groupPicks.length + ' selections · career performance, not draft slot'));
    head.appendChild(titleBox);
    const status = group?.status || 'unavailable';
    head.appendChild(safeText('span', 'cohort-status',
      status === 'mature' ? 'ESTABLISHED' : status === 'provisional' ? 'PROVISIONAL' :
      status === 'developing' ? 'DEVELOPING' : 'DATA PENDING'));
    card.appendChild(head);
    const pair = safeText('div', 'cohort-score-pair', '');
    for (const [key, name, caption] of [
      ['depth', 'Depth', 'Contributors, starters & longevity'],
      ['greatness', 'Greatness', 'Elite careers, stars & honors']
    ]) {
      const tile = safeText('div', 'cohort-score', '');
      tile.appendChild(safeText('div', 'cohort-score-heading', name));
      const line = safeText('div', 'cohort-score-line', '');
      const score = group?.[key]?.score;
      line.appendChild(safeText('strong', 'cohort-score-number',
        Number.isFinite(score) ? score.toFixed(1) : '—'));
      if (group?.[key]?.grade) {
        line.appendChild(safeText('span', 'cohort-score-grade', group[key].grade));
      }
      tile.appendChild(line);
      tile.appendChild(safeText('p', 'cohort-score-caption', Number.isFinite(score) ?
        caption + ' · historical percentile' :
        (status === 'developing' ? 'Careers too young for a reliable grade' :
          'Waiting for verified cohort summary')));
      pair.appendChild(tile);
    }
    card.appendChild(pair);
    const stats = safeText('div', 'cohort-totals', '');
    if (group?.depth && Number.isInteger(group.depth.contributors)) {
      for (const [key, description] of [
        ['contributors', 'contributors'], ['starters', 'established starters'],
        ['long_careers', 'long careers'], ['quality_players', 'quality players']
      ]) {
        const el = safeText('span', 'cohort-total', '');
        el.appendChild(safeText('strong', '', String(group.depth[key])));
        el.appendChild(document.createTextNode(' ' + description));
        stats.appendChild(el);
      }
      const el = safeText('span', 'cohort-total', '');
      el.appendChild(safeText('strong', '', String(group.greatness?.elite_players || 0)));
      el.appendChild(document.createTextNode(' elite players'));
      stats.appendChild(el);
    } else {
      stats.appendChild(safeText('span', 'cohort-total',
        status === 'developing' ? 'Honors are shown below while careers develop.' :
          'Full-cohort historical benchmark is awaiting verification.'));
    }
    card.appendChild(stats);
    parent.appendChild(card);
  }

  function renderCohortPanel() {
    const allPicks = picks.filter(p => p.league === state.league && p.year === state.year);
    const roundPicks = allPicks.filter(p => p.round === state.round);
    const year = cohortCatalog?.leagues?.[state.league]?.[String(state.year)];
    const verified = Boolean(year && currentModelVersion &&
      cohortCatalog.model_versions?.[state.league] === currentModelVersion &&
      year.draft.picks === allPicks.length &&
      year.rounds?.[state.round - 1]?.picks === roundPicks.length);
    const cards = $('cohort-cards');
    cards.replaceChildren();
    addCohortCard(cards, state.year + ' ' + state.league + ' · Entire class',
      verified ? year.draft : null, allPicks);
    addCohortCard(cards, 'Round ' + state.round,
      verified ? year.rounds[state.round - 1] : null, roundPicks);

    $('honors-round-number').textContent = String(state.round);
    $('honors-class').setAttribute('aria-pressed', String(honorScope === 'class'));
    $('honors-round').setAttribute('aria-pressed', String(honorScope === 'round'));
    const scopedPicks = honorScope === 'class' ? allPicks : roundPicks;
    const categories = honorDefinitions[state.league];
    if (!categories.some(([key]) => key === honorMetric)) {
      honorMetric = 'hof_inducted';
    }
    const metrics = $('honors-metrics');
    metrics.replaceChildren();
    for (const [key, label] of categories) {
      const hof = key.startsWith('hof_');
      const selections = scopedPicks.reduce((s, p) => s + awardCount(p, key), 0);
      const players = scopedPicks.filter(p => awardCount(p, key) > 0).length;
      const btn = safeText('button', 'honor-metric', '');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(honorMetric === key));
      btn.setAttribute('aria-label', label + ': ' + (hof ? players+' players' : selections+' selections, '+players+' players') + '. Show the roster.');
      btn.appendChild(safeText('span', 'honor-metric-count', String(selections)));
      btn.appendChild(safeText('span', 'honor-metric-label', label));
      btn.appendChild(safeText('span', 'honor-metric-extra',
        hof ? (key==='hof_inducted'?'Verified inductees':'Includes early watchlist') : players + (players === 1 ? ' player' : ' players')));
      btn.addEventListener('click', () => {
        honorMetric = key;
        renderCohortPanel();
      });
      metrics.appendChild(btn);
    }
    const roster = $('honors-roster');
    roster.replaceChildren();
    const selectedLabel = categories.find(([key]) => key === honorMetric)?.[1] || 'Honors';
    const people = scopedPicks.filter(p => awardCount(p, honorMetric) > 0)
      .sort((a, b) => awardCount(b, honorMetric) - awardCount(a, honorMetric) ||
        (DraftHall.quality(b) ?? -1) - (DraftHall.quality(a) ?? -1) ||
        a.overall - b.overall);
    roster.appendChild(safeText('h5', 'honors-roster-title', selectedLabel +
      ' · ' + (honorScope === 'class' ? 'entire class' : 'Round ' + state.round) +
      ' · ' + people.length + (people.length === 1 ? ' player' : ' players')));
    if (!people.length) {
      roster.appendChild(safeText('p', 'honors-roster-empty', !scopedPicks.length ?
        'Draft players are loading or unavailable.' :
        honorMetric.startsWith('hof_') ? 'No players in this Hall of Fame category for the selected scope.' : 'No verified recipients from this selection yet. Choose another honor or the entire class.'));
    } else {
      const grid = safeText('div', 'honors-roster-grid', '');
      for (const p of people) {
        const btn = safeText('button', 'honors-person', '');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Open player profile for ' + p.name);
        btn.appendChild(safeText('span', 'honors-person-name', p.name + ' · #' + p.overall));
        const n = awardCount(p, honorMetric);
        btn.appendChild(safeText('span', 'honors-person-detail',
          honorMetric.startsWith('hof_') ? (DraftHall.labels[DraftHall.classify(p,currentModelVersion)?.tier] || '—')+' ↗' : String(n) + (n === 1 ? ' selection' : ' selections') + ' ↗'));
        btn.addEventListener('click', () => showProfile(p));
        grid.appendChild(btn);
      }
      roster.appendChild(grid);
    }
    $('cohort-panel').dataset.summaryStatus = verified ? 'verified' :
      cohortUnavailable ? 'unavailable' : 'pending';
  }

  async function loadCohortCatalog() {
    try {
      const response = await fetch('./data/cohort_summaries.json', {cache: 'no-cache'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.schema_version !== 1 || data.method !== 'cohort-depth-greatness-v1' ||
          !data.leagues?.NFL || !data.leagues?.NBA) throw new Error('Invalid cohort schema');
      cohortCatalog = data;
      cohortUnavailable = false;
    } catch (err) {
      console.warn('Derived cohort scores not available:', err);
      cohortCatalog = null;
      cohortUnavailable = true;
    }
    render();
  }

  function render() {
    const list = filterPicks();
    const all = picks.filter((p) => p.league === state.league && p.year === state.year && p.round === state.round);
    const loaded = all.length > 0;
    const subtitle = state.year + ' ' + state.league + ' Draft';
    $('class-kicker').textContent = state.year + ' / ' + state.league + ' / ROUND ' + state.round;
    $('class-heading').textContent = subtitle + ' — Round ' + state.round;
    $('coverage-note').textContent = loaded ?
      (state.league === 'NFL' ? 'Career performance, historical expectations and draft value · 2026 season partial · Source: nflverse' :
        'NBA career production, impact metrics, honors and draft value · 2026–27 season in progress.') :
      (dataUnavailable ? 'Unable to load this draft class.' : 'Draft selections not yet available for this year and round.');
    renderCohortPanel();
    $('count-picks').textContent = String(list.length);
    $('count-rated').textContent = String(list.filter((p) => p.rating && typeof p.rating.quality === 'number' && p.rating.grade).length);
    $('count-rounds').textContent = state.round + '/' + (state.league === 'NBA' ? 2 : 7);
    $('visible-count').textContent = list.length + (list.length === 1 ? ' pick' : ' picks');
    $('draft-rows').replaceChildren(...list.map(makeRow));
    const empty = list.length === 0;
    $('empty-state').hidden = !empty;
    document.querySelector('.table-scroll').hidden = empty;
    if (empty) {
      $('empty-title').textContent = loaded ? 'No matching players.' : 'This draft class is on the way.';
      $('empty-message').textContent = loaded ? 'Try a different player or team name.' :
        (dataUnavailable ? 'The historical draft data for this class could not be loaded.' :
        'NFL and NBA 2000–2026 draft classes are published. The selected data could not be loaded.');
      $('empty-reset').textContent = loaded ? 'Clear search ↗' : 'View available draft ↗';
    }
    for (const league of ['NFL', 'NBA']) {
      const tab = $('tab-' + league.toLowerCase());
      const active = state.league === league;
      tab.setAttribute('aria-selected', String(active));
      tab.classList.toggle('is-active', active);
      tab.tabIndex = active ? 0 : -1;
    }
    $('draft-content').setAttribute('aria-labelledby', 'tab-' + state.league.toLowerCase());
    updateCollegePosition();
    renderCollege();
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('league', state.league.toLowerCase());
    nextUrl.searchParams.set('year', String(state.year));
    nextUrl.searchParams.set('round', String(state.round));
    window.history.replaceState(null, '', nextUrl.pathname + nextUrl.search + nextUrl.hash);
  }
  function setLeague(league, focus = false) {
    state.league = league;
    state.round = 1;
    state.query = '';
    state.sort = 'pick';
    honorMetric = null;
    honorScope = 'class';
    $('player-search').value = '';
    $('sort-filter').value = 'pick';
    populateYears();
    populateRounds();
    loadDraft();
    if (focus) $('tab-' + league.toLowerCase()).focus();
  }
  function restoreState() {
    const params = new URLSearchParams(window.location.search);
    const league = (params.get('league') || 'nfl').toUpperCase();
    const year = Number(params.get('year'));
    const round = Number(params.get('round'));
    collegeView = ['college','hall','comparison'].includes(params.get('view')) ? params.get('view') : 'draft';
    if (league === 'NFL' || league === 'NBA') state.league = league;
    if (Number.isInteger(year) && year >= 1960 && year <= 2026) state.year = year;
    if (Number.isInteger(round) && round >= 1 && round <= (state.league === 'NFL' ? 7 : 2)) state.round = round;
  }
  function wireEvents() {
    for (const league of ['NFL','NBA']) {
      const tab = $('tab-' + league.toLowerCase());
      tab.addEventListener('click', () => setLeague(league));
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setLeague(league === 'NFL' ? 'NBA' : 'NFL', true);
        }
      });
    }
    $('year-filter').addEventListener('change', (e) => { state.year = Number(e.target.value); loadDraft(); });
    $('round-filter').addEventListener('change', (e) => { state.round = Number(e.target.value); render(); });
    $('player-search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
    $('sort-filter').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
    $('empty-reset').addEventListener('click', () => {
      if (picks.some((p) => p.league === state.league && p.year === state.year && p.round === state.round)) {
        state.query = ''; $('player-search').value = '';
      } else { state.year = 2020; state.round = 1; $('year-filter').value = '2020'; $('round-filter').value = '1'; }
      loadDraft();
    });
    $('honors-class').addEventListener('click', () => {
      honorScope = 'class'; renderCohortPanel();
    });
    $('honors-round').addEventListener('click', () => {
      honorScope = 'round'; renderCohortPanel();
    });
    $('close-dialog').addEventListener('click', () => $('player-dialog').close());
    $('player-dialog').addEventListener('click', (e) => {
      const bounds = $('player-dialog').getBoundingClientRect();
      if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) $('player-dialog').close();
    });
    $('player-dialog').addEventListener('close', () => { if (selectedRow && selectedRow.isConnected) selectedRow.focus(); });
  }
  async function loadDraft() {
    const token = ++latestLoad;
    const league = state.league;
    const year = state.year;
    picks = [];
    dataUnavailable = false;
    currentModelVersion = null;
    $('data-state').textContent = 'Loading verified draft records…';
    render();
    try {
      const url = './data/' + league.toLowerCase() + '/' + year + '.json';
      const response = await fetch(url,{cache:'no-cache'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data = await response.json();
      if(token !== latestLoad)return;
      const expectedMinimum = league === 'NFL' ? 200 : 56;
      if(data.schema_version !== 2 || data.league !== league || data.year !== year ||
          !Array.isArray(data.picks) || data.picks.length < expectedMinimum ||
          data.picks.some((p,i)=>p.league !== league || p.year !== year || p.overall !== i+1))
        throw new Error('Invalid '+league+' export');
      picks = data.picks;
      currentModelVersion = data.model_version;
      $('data-state').textContent = league+' 2000–2026 · career data & grades';
    } catch(err) {
      if(token !== latestLoad)return;
      console.error('Draft data not available',err);
      dataUnavailable=true;
      $('data-state').textContent = 'Draft data unavailable for this selection';
    }
    if(token === latestLoad)render();
  }

  // College View consumes only the allowlisted, derived cross-year release.
  // No raw source datasets, weights, or private model artifacts are required in-browser.
  let collegeCatalog = null;
  let collegeView = 'draft';
  let collegeEra = 'all';
  let collegePosition = 'all';
  let collegeSort = 'picks';
  let collegeSearch = '';
  let selectedCollege = null;
  let collegeRows = [];
  const collegePositions = {
    NFL: [['all','All positions'],['QB','Quarterbacks · QBU'],['WR','Wide receivers · WRU'],
      ['RB','Running backs · RBU'],['TE','Tight ends · TEU'],['OL','Offensive line · OLU'],
      ['DL','Defensive line · DLU'],['LB','Linebackers · LBU'],['DB','Defensive backs · DBU'],
      ['K','Kickers'],['P','Punters']],
    NBA: [['all','All positions']]
  };
  function collegePositionFor(p) {
    const pos = (p.p || '').toUpperCase();
    if (['CB','DB','S','FS','SS'].includes(pos)) return 'DB';
    if (['DE','DT','DL','NT','EDGE'].includes(pos)) return 'DL';
    if (['T','G','C','OL','OT','OG'].includes(pos)) return 'OL';
    if (['RB','FB','HB'].includes(pos)) return 'RB';
    if (['LB','ILB','OLB','MLB'].includes(pos)) return 'LB';
    return pos;
  }
  function matchingCollegePlayer(p) {
    if (collegeEra === 'mature' && p.y > 2017) return false;
    if (collegeEra === 'recent' && p.y < 2018) return false;
    if (collegeEra === 'decade' && p.y < 2010) return false;
    if (collegeEra === 'latest' && p.y < 2020) return false;
    if (state.league === 'NFL' && collegePosition !== 'all' &&
        collegePositionFor(p) !== collegePosition) return false;
    return true;
  }
  function collegeNum(x) { return Number(x || 0).toLocaleString('en-US'); }
  function collegeStats(school) {
    const players = school.players.filter(matchingCollegePlayer);
    if (!players.length) return null;
    let first=0,quality=0,stars=0,superstars=0,contributors=0,starPower=0,depth=0,
      honors=0,allstars=0,mvp=0,yards=0,sumQuality=0,rated=0,championships=0;
    for (const p of players) {
      const q = typeof p.q === 'number' ? p.q : null;
      const a = p.aw || [];
      const good = state.league === 'NFL'
        ? p.g >= 48 && p.w >= 12
        : p.g >= 164 && p.m >= 3000;
      const starting = state.league === 'NFL' ? p.ss >= 3 : p.gs >= 164;
      const durable = state.league === 'NFL' ? p.g >= 96 : p.g >= 410;
      if (p.r === 1) first++;
      if (q !== null) {rated++;sumQuality+=q; if(q>=50)quality++;if(q>=75)stars++;if(q>=85)superstars++;}
      if (good) contributors++;
      depth += (good?1:0)*2 + (starting?1:0)*2 + (durable?1:0) + (q!==null&&q>=50?1:0)*2;
      const allstar = a[0] || 0, allPro = a[1] || 0, firstAllPro = a[2] || 0;
      const mvps = a[3] || 0, secondary = (a[4] || 0)+(a[5] || 0), titles = a[6] || 0;
      allstars+=allstar; mvp+=mvps;championships+=titles;
      honors+=allPro+mvps+secondary;
      starPower+=(q!==null&&q>=75?2:0)+(q!==null&&q>=85?2:0)
        +3.5*mvps+2*secondary+1.5*firstAllPro+0.6*(allPro-firstAllPro)
        +0.45*allstar+0.2*titles;
      yards += state.league === 'NFL'
        ? (collegePosition === 'QB' ? p.pass : collegePosition === 'RB' ? p.rush :
           collegePosition === 'WR'||collegePosition === 'TE' ? p.ry : 0)
        : p.pts;
    }
    const n = players.length;
    return {name:school.name,players,n,first,quality,stars,superstars,contributors,
      depth:Math.round(1000*depth/(7*n))/10, greatness:Math.round(starPower*10)/10,
      honors,allstars,mvp,championships,yards,avg: rated ? Math.round(sumQuality/rated*10)/10:null,
      rate:Math.round(1000*contributors/n)/10,rated};
  }
  function updateCollegePosition() {
    const select=$('college-position'),previous=collegePosition;
    select.replaceChildren();
    for(const [key,label] of collegePositions[state.league]) {
      const option=document.createElement('option');
      option.value=key;option.textContent=label;select.appendChild(option);
    }
    collegePosition=collegePositions[state.league].some(([key])=>key===previous)?previous:'all';
    select.value=collegePosition;
  }
  function collegeSortValue(s) {
    if (collegeSort==='first') return s.first;
    if (collegeSort==='stars') return s.stars;
    if (collegeSort==='depth') return s.depth;
    if (collegeSort==='greatness') return s.greatness;
    if (collegeSort==='contributors') return s.contributors;
    if (collegeSort==='rate') return s.rate;
    if (collegeSort==='quality') return s.avg ?? -1;
    if (collegeSort==='honors') return s.honors;
    if (collegeSort==='allstars') return s.allstars;
    if (collegeSort==='mvp') return s.mvp;
    if (collegeSort==='yards') return s.yards;
    return s.n;
  }
  function collegeMetricCard(title,school,value,desc) {
    const el=safeText('article','college-leader','');
    el.appendChild(safeText('span','college-leader-kicker',title));
    el.appendChild(safeText('strong','college-leader-name',school?.name||'—'));
    el.appendChild(safeText('span','college-leader-value',school?value:'—'));
    el.appendChild(safeText('span','college-leader-desc',desc));
    if (school) {el.tabIndex=0;el.setAttribute('role','button');el.addEventListener('click',()=>selectCollege(school.name));
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCollege(school.name);}});}
    return el;
  }
  function collegeBest(rows,metric) {return [...rows].sort((a,b)=>b[metric]-a[metric]||b.n-a.n)[0];}
  function renderCollege() {
    if (!$('college-view')) return;
    $('draft-view').hidden=collegeView!=='draft';
    $('college-view').hidden=collegeView!=='college';
    $('hall-view').hidden=collegeView!=='hall';
    $('comparison-view').hidden=collegeView!=='comparison';
    $('view-comparison').classList.toggle('is-active',collegeView==='comparison');
    $('view-comparison').setAttribute('aria-pressed',String(collegeView==='comparison'));
    $('view-hall').classList.toggle('is-active',collegeView==='hall');
    $('view-hall').setAttribute('aria-pressed',String(collegeView==='hall'));
    $('view-draft').classList.toggle('is-active',collegeView==='draft');
    $('view-college').classList.toggle('is-active',collegeView==='college');
    $('view-draft').setAttribute('aria-pressed',String(collegeView==='draft'));
    $('view-college').setAttribute('aria-pressed',String(collegeView==='college'));
    if(collegeView==='hall'){renderHall();return;}
    if(collegeView==='comparison'){DraftCompare.render(state.league);return;}
    if(collegeView!=='college')return;
    if (!collegeCatalog?.leagues?.[state.league]) {
      $('college-status').textContent='College rankings are loading or unavailable. The draft board remains accessible.';
      $('college-leaders').replaceChildren();
      $('college-rows').replaceChildren();
      $('college-count').textContent='—';
      $('college-detail').hidden=true;
      return;
    }
    const all=collegeCatalog.leagues[state.league].map(collegeStats).filter(Boolean);
    // Ranking rates and averages require a meaningful sample; smaller programs remain
    // visible but cannot top a rate-only leaderboard on a one-player denominator.
    const eligible=all.filter(x=>x.n>=5);
    let rows=all.filter(s=>s.name.toLowerCase().includes(collegeSearch.trim().toLowerCase()));
    const sampleSort=['rate','quality','depth'].includes(collegeSort);
    rows.sort((a,b)=>(sampleSort&&a.n>=5!== (b.n>=5) ? (a.n>=5?-1:1) : 0)
      ||collegeSortValue(b)-collegeSortValue(a)||b.n-a.n||a.name.localeCompare(b.name));
    collegeRows=rows;
    $('college-status').textContent=state.league+' · '+collegeCatalog.years+' · '+
      (collegePosition==='all'?'All positions':collegePosition)+' · '+ all.reduce((s,x)=>s+x.n,0).toLocaleString()+
      ' drafted players · '+all.length+' colleges in this selection';
    const leaders=$('college-leaders');
    leaders.replaceChildren();
    if (all.length) {
      const most=collegeBest(all,'n'), first=collegeBest(all,'first'),
        stars=collegeBest(all,'stars'),depth=collegeBest(eligible,'depth');
      leaders.append(
        collegeMetricCard('MOST DRAFTED',most,collegeNum(most.n)+' picks','2000–2026 selected cohorts'),
        collegeMetricCard('MOST FIRST ROUNDERS',first,collegeNum(first.first)+' picks','First-round selections'),
        collegeMetricCard('MOST ELITE PLAYERS',stars,collegeNum(stars.stars)+' stars','Career quality of 75+'),
        collegeMetricCard('BEST DEPTH RATE · 5+ PICKS',depth,depth?depth.depth.toFixed(1)+'/100':'—','Contributors, starters and longevity')
      );
    }
    $('college-count').textContent=rows.length+' schools';
    const tbody=$('college-rows');tbody.replaceChildren();
    const yardLabel=state.league==='NBA'?'points':
      collegePosition==='WR'||collegePosition==='TE'?'rec yds':
      collegePosition==='RB'?'rush yds':collegePosition==='QB'?'pass yds':'—';
    for (let i=0;i<Math.min(rows.length,350);i++){
      const s=rows[i],tr=document.createElement('tr');tr.tabIndex=0;
      tr.setAttribute('aria-label','View '+s.name+' drafted players');
      if(selectedCollege===s.name)tr.classList.add('college-selected');
      const vals=[String(i+1),s.name,collegeNum(s.n),collegeNum(s.first),
        collegeNum(s.quality),collegeNum(s.stars),s.depth.toFixed(1),s.greatness.toFixed(1),
        collegeNum(s.allstars),collegeNum(s.honors),yardLabel==='—'?'—':collegeNum(s.yards)+' '+yardLabel];
      vals.forEach((v,j)=>cell(tr,safeText('span',j===1?'college-school':j===0?'pick-number':'college-num',v)));
      tr.addEventListener('click',()=>selectCollege(s.name));
      tr.addEventListener('keydown',e=>{if(e.target===tr&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectCollege(s.name);}});
      tbody.appendChild(tr);
    }
    if(selectedCollege && all.some(s=>s.name===selectedCollege))renderCollegeDetail(all.find(s=>s.name===selectedCollege));
    else $('college-detail').hidden=true;
  }
  function selectCollege(name){
    selectedCollege=selectedCollege===name?null:name;
    renderCollege();
    if(selectedCollege)$('college-detail').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function showCollegePlayer(p){
    try{
      const response=await fetch('./data/'+state.league.toLowerCase()+'/'+p.y+'.json',{cache:'force-cache'});
      if(!response.ok)throw Error('Player record unavailable');
      const data=await response.json();
      const full=data.picks?.find(x=>x.overall===p.o && x.name===p.n);
      if(!full)throw Error('Matching draft pick unavailable');
      selectedRow=null;showProfile(full);
    }catch(e){console.error('Could not open college player dossier',e);$('college-status').textContent='Player dossier unavailable; try again.';}
  }
  function renderCollegeDetail(s) {
    const panel=$('college-detail');panel.hidden=false;panel.replaceChildren();
    const head=safeText('div','college-detail-head','');
    const title=safeText('div','','');title.appendChild(safeText('span','small-kicker','SCHOOL ROSTER / '+state.league));
    title.appendChild(safeText('h4','',s.name));
    title.appendChild(safeText('p','',s.n+' drafted players · '+s.first+' first round · '+s.quality+
      ' quality players · '+s.stars+' elite stars · '+s.allstars+
      (state.league==='NFL'?' Pro Bowl selections':' All-Star selections')));
    const close=safeText('button','college-close','Close ×');close.type='button';close.addEventListener('click',()=>{
      selectedCollege=null;panel.hidden=true;document.querySelectorAll('.college-selected').forEach(e=>e.classList.remove('college-selected'));});
    head.append(title,close);panel.appendChild(head);
    const roster=safeText('div','college-roster','');
    for(const p of [...s.players].sort((a,b)=>(b.q??-1)-(a.q??-1)||a.y-b.y)){
      const b=safeText('button','college-person','');b.type='button';
      b.appendChild(safeText('strong','',p.n));
      b.appendChild(safeText('span','',p.y+' · '+(p.p||state.league)+' · Round '+p.r+' / Pick '+p.o));
      b.appendChild(safeText('span','', 'Quality '+(typeof p.q==='number'?p.q.toFixed(1):'not rated')+
        ' · '+(p.aw?.[0]||0)+(state.league==='NFL'?' Pro Bowls':' All-Stars')+' ↗'));
      b.addEventListener('click',()=>showCollegePlayer(p));roster.appendChild(b);
    }
    panel.appendChild(roster);
  }
  async function loadCollegeCatalog(){
    try{
      const response=await fetch('./data/college_summaries.json',{cache:'no-cache'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(data.schema_version!==1||data.method!=='college-talent-v1'||
        !Array.isArray(data.leagues?.NFL)||!Array.isArray(data.leagues?.NBA)||
        data.leagues.NFL.length<100||data.leagues.NBA.length<50)throw Error('Invalid college summary');
      collegeCatalog=data;
    }catch(e){console.warn('College summary unavailable',e);collegeCatalog=null;}
    renderCollege();
  }
  function wireCollege(){
    updateCollegePosition();
    $('view-draft').addEventListener('click',()=>{collegeView='draft';renderCollege();syncCollegeUrl();});
    $('view-college').addEventListener('click',()=>{collegeView='college';renderCollege();syncCollegeUrl();});
    $('view-hall').addEventListener('click',()=>{collegeView='hall';renderCollege();syncCollegeUrl();});
    $('view-comparison').addEventListener('click',()=>{collegeView='comparison';renderCollege();syncCollegeUrl();});
    for(const id of ['hall-tier','hall-era','hall-position','hall-sort','hall-search'])$(id).addEventListener(id==='hall-search'?'input':'change',renderHall);
    for(let y=2026;y>=2000;y--){const opt=safeText('option','',String(y));opt.value=String(y);$('hall-era').appendChild(opt);}
    $('college-era').addEventListener('change',e=>{collegeEra=e.target.value;selectedCollege=null;renderCollege();});
    $('college-position').addEventListener('change',e=>{collegePosition=e.target.value;selectedCollege=null;renderCollege();});
    $('college-search').addEventListener('input',e=>{collegeSearch=e.target.value;selectedCollege=null;renderCollege();});
    $('college-sort').addEventListener('change',e=>{collegeSort=e.target.value;renderCollege();});
  }
  function syncCollegeUrl(){
    const url=new URL(window.location.href);
    if(['college','hall','comparison'].includes(collegeView))url.searchParams.set('view',collegeView);
    else url.searchParams.delete('view');
    window.history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  const hallCache=new Map();
  const hallLoading=new Map();
  const hallErrors=new Map();
  function loadHall(league){
    if(hallLoading.has(league)||hallCache.has(league))return;
    hallErrors.delete(league);
    const job=(async()=>{
      const docs=[];
      for(let y=2000;y<=2026;y+=5){
        const batch=await Promise.all(Array.from({length:Math.min(5,2027-y)},(_,i)=>y+i).map(async year=>{
          const response=await fetch('./data/'+league.toLowerCase()+'/'+year+'.json',{cache:'no-cache'});
          if(!response.ok)throw Error('Missing '+year);
          const d=await response.json();
          if(d.league!==league||d.year!==year||d.schema_version!==2||d.model_version!==DraftHall.models[league]||!Array.isArray(d.picks)||d.picks.length<(league==='NFL'?200:56)||d.picks.some((p,i)=>p.year!==year||p.league!==league||p.overall!==i+1))throw Error('Invalid or mixed-version draft '+year);
          return d;
        }));
        docs.push(...batch);
      }
      const picks=docs.flatMap(d=>d.picks);
      const rows=docs.flatMap(d=>d.picks.map(p=>({p,h:DraftHall.classify(p,d.model_version)}))).filter(x=>x.h);
      if(rows.filter(x=>x.h.tier==='inducted').length!==Object.keys(DraftHall.ledger[league]).length)throw Error('Hall of Fame identity reconciliation failed');
      const response=await fetch('./data/hall-history.json',{cache:'no-cache'});
      if(!response.ok)throw Error('Historical directory unavailable');
      const historical=await response.json();
      if(historical.schema_version!==2||!Array.isArray(historical.players))throw Error('Invalid historical directory');
      const byId=new Map(picks.map(p=>[p.id,p]));
      const indexed=new Map(rows.map(x=>[x.p.id,x]));
      const seen=new Set();
      for(const entry of historical.players.filter(x=>x.league===league)){
        if(seen.has(entry.id))throw Error('Duplicate historical identity');
        seen.add(entry.id);
        const matched=entry.draft_id?byId.get(entry.draft_id):null;
        if(matched){
          const row=indexed.get(matched.id);
          if(row){
            row.history=entry;
            if(entry.induction_year&&row.h.tier!=='inducted')throw Error('Unverified modern inductee match');
          }else{
            const h=entry.induction_year?{tier:'inducted',year:entry.induction_year}:{tier:'ballot'};
            if(entry.induction_year)throw Error('Unverified modern inductee match');
            const added={p:matched,h,history:entry};rows.push(added);indexed.set(matched.id,added);
          }
        }else{
          rows.push({p:{id:entry.id,league,name:entry.name,position:entry.position||'',team:'',college:'',year:null,overall:null,quality_score:null,pace:null},h:{tier:entry.induction_year?'inducted':'ballot',year:entry.induction_year},history:entry,historicalOnly:true});
        }
      }
      const upcoming=historical.upcoming.filter(x=>x.draft_id.startsWith(league.toLowerCase()+'-'));
      for(const e of upcoming){
        const p=byId.get(e.draft_id);
        if(!p||p.name!==e.name)throw Error('Eligibility identity mismatch '+e.draft_id);
        let row=indexed.get(p.id);
        if(!row){row={p,h:{tier:'upcoming'}};rows.push(row);indexed.set(p.id,row);}
        if(row.h.tier!=='inducted')row.eligibility=e;
      }
      DraftHall.attachHistoricalEstimates(rows,picks);
      hallCache.set(league,rows);
    })();
    hallLoading.set(league,job);
    job.catch(e=>{console.warn('Hall leaderboard unavailable',e);hallErrors.set(league,e.message);})
      .finally(()=>{hallLoading.delete(league);if(state.league===league&&collegeView==='hall')renderHall();});
  }
  function renderHall(){
    if(collegeView!=='hall')return;
    const league=state.league, data=hallCache.get(league);
    if(!data){
      $('hall-kpis').replaceChildren();$('hall-rows').replaceChildren();$('hall-count').textContent='—';
      const status=$('hall-status');status.replaceChildren();
      if(hallErrors.has(league)){
        status.appendChild(document.createTextNode('Complete leaderboard unavailable: '+hallErrors.get(league)+' '));
        const retry=safeText('button','view-toggle','Retry');retry.type='button';
        retry.addEventListener('click',()=>{hallErrors.delete(league);renderHall();});status.appendChild(retry);
      }else{
        status.textContent='Loading '+league+' draft scores and historical directory…';loadHall(league);
      }
      return;
    }
    const positionSelect=$('hall-position');
    if(positionSelect.dataset.league!==league){
      positionSelect.replaceChildren();
      for(const [value,label] of [['all','All positions'],...DraftHall.positionOptions[league]]){
        const option=safeText('option','',label);option.value=value;positionSelect.appendChild(option);
      }
      positionSelect.dataset.league=league;
      positionSelect.value='all';
    }
    const eraSelect=$('hall-era');
    if(eraSelect.dataset.league!==league){
      eraSelect.replaceChildren();
      for(const [value,label] of [['all','All years'],['undrafted','Undrafted'],...Array.from({length:107},(_,i)=>[String(2026-i),String(2026-i)])]){
        const o=safeText('option','',label);o.value=value;eraSelect.appendChild(o);
      }
      eraSelect.dataset.league=league;
    }
    const year=eraSelect.value, tier=$('hall-tier').value, position=positionSelect.value, q=$('hall-search').value.trim().toLowerCase(), sort=$('hall-sort').value;
    const population=data.filter(DraftHall.hallScope);
    const scoped=population.filter(({p,history})=>(year==='all'||(year==='undrafted'?history?.historical_draft?.status==='undrafted':String(p.year||history?.historical_draft?.year)===year))&&DraftHall.matchesPosition(p,history,position));
    const kpis=$('hall-kpis');kpis.replaceChildren();
    for(const t of [...DraftHall.order,'ballot','upcoming']){
      const count=scoped.filter(x=>t==='upcoming'?x.eligibility:x.h.tier===t).length;
      const b=safeText('button','honor-metric','');b.type='button';b.setAttribute('aria-pressed',String(tier===t));
      b.appendChild(safeText('span','honor-metric-count',String(count)));
      b.appendChild(safeText('span','honor-metric-label',(DraftHall.labels[t]||(t==='upcoming'?'Estimated eligibility':'Ballot history'))));
      b.appendChild(safeText('span','honor-metric-extra',t==='inducted'?'Directory records':t==='early'?'Strong start':t==='ballot'?'Not model-ranked':t==='upcoming'?'2027–2031 · estimated':'Model tier'));
      b.addEventListener('click',()=>{$('hall-tier').value=tier===t?'all':t;renderHall();});kpis.appendChild(b);
    }
    const rows=scoped.filter(({p,h,eligibility,history})=>(tier==='all'||(tier==='upcoming'?!!eligibility:h.tier===tier))&&(!q||[p.name,p.team||'',DraftHall.positionLabel(p,history),p.college||''].some(x=>x.toLowerCase().includes(q))));
    const qv=p=>DraftHall.quality(p)??-1, pv=p=>p.pace?.score??-1;
    const ev=row=>{const s=DraftHall.hallScore(row.p,row.history);return ['partial','observed'].includes(s.kind)?s.value:-1;};
    const evidence=row=>{const s=DraftHall.hallScore(row.p,row.history);return s.kind==='evidence'?s.value:-1;};
    rows.sort((a,b)=>{
      const x=a.p,y=b.p;
      if(sort==='name')return x.name.localeCompare(y.name);
      if(sort==='year')return (y.year||b.history?.historical_draft?.year||0)-(x.year||a.history?.historical_draft?.year||0)||(x.overall||a.history?.historical_draft?.overall||0)-(y.overall||b.history?.historical_draft?.overall||0);
      if(sort==='quality')return qv(y)-qv(x)||ev(b)-ev(a)||evidence(b)-evidence(a)||pv(y)-pv(x)||x.name.localeCompare(y.name);
      if(sort==='partial')return ev(b)-ev(a)||evidence(b)-evidence(a)||x.name.localeCompare(y.name);
      if(sort==='eligibility')return (a.eligibility?.estimated_first_eligible_class??9999)-(b.eligibility?.estimated_first_eligible_class??9999)||x.name.localeCompare(y.name);
      if(sort==='pace')return pv(y)-pv(x)||qv(y)-qv(x)||x.name.localeCompare(y.name);
      return [...DraftHall.order,'ballot','upcoming'].indexOf(a.h.tier)-[...DraftHall.order,'ballot','upcoming'].indexOf(b.h.tier)||(a.h.tier==='early'?pv(y)-pv(x):qv(y)-qv(x))||ev(b)-ev(a)||evidence(b)-evidence(a)||x.name.localeCompare(y.name);
    });
    $('hall-status').textContent=league+' · '+population.length+' player entries · '+population.filter(x=>DraftHall.hallScore(x.p,x.history).kind==='full').length+' full scores · '+population.filter(x=>['partial','observed'].includes(DraftHall.hallScore(x.p,x.history).kind)).length+' historical model estimates · '+population.filter(x=>DraftHall.hallScore(x.p,x.history).kind==='evidence').length+' evidence indices · '+population.filter(x=>DraftHall.hallScore(x.p,x.history).kind==='missing').length+' not yet scored';
    $('hall-count').textContent=rows.length+' players';
    const target=$('hall-rows');target.replaceChildren();
    for(const {p,h,history,historicalOnly,eligibility} of rows){
      const tr=document.createElement('tr');
      const first=document.createElement('td');
      const b=safeText('button','hall-player',p.name+' ›');b.type='button';
      b.setAttribute('aria-label','Open '+p.name+' career profile');
      b.addEventListener('click',()=>historicalOnly?showHistoricalProfile(p,history):showProfile(p));first.appendChild(b);
      const ballotYears=[...new Set([...(history?.ballots||[]).map(x=>x.year),...(history?.finalist_years||[])])].sort((a,b)=>b-a);
      if(ballotYears.length)first.appendChild(safeText('div','player-detail','Ballot / finalist: '+ballotYears.join(', ')));
      if(history?.induction_verification==='review')first.appendChild(safeText('div','player-detail','Induction identity under review'));
      if(eligibility)first.appendChild(safeText('div','player-detail','Estimated eligibility: '+eligibility.estimated_first_eligible_class+' · last observed '+eligibility.last_observed_season));
      if(history?.pro_career_scope==='other_basketball')first.appendChild(safeText('div','player-detail','Other basketball category · no NBA model rating'));
      if(history?.pro_career_scope==='unreviewed')first.appendChild(safeText('div','player-detail','NBA career not verified in current data'));
      if(historicalOnly&&history?.career_summary)first.appendChild(safeText('div','player-detail','Career statistics & awards · open profile'));
      tr.appendChild(first);
      const score=DraftHall.hallScore(p,history);
      for(const v of [DraftHall.historicalDraftLabel(p,history),DraftHall.positionLabel(p,history)||'Unknown',score.label,score.kind==='observed'?history.observed_estimate.coverage+'% · career only':score.kind==='evidence'?history.evidence_estimate.coverage+'% · evidence index':score.kind==='partial'?history.coverage+'% components':score.kind==='full'?'Full model':'—',pv(p)<0?'—':pv(p).toFixed(1)])tr.appendChild(safeText('td','',v));
      const status=document.createElement('td');status.appendChild(safeText('span','hall-tier hall-'+h.tier,DraftHall.labels[h.tier]||(h.tier==='upcoming'?'Estimated eligibility':'Ballot history')));tr.appendChild(status);
      tr.appendChild(safeText('td','',h.year?String(h.year):'—'));target.appendChild(tr);
    }
    if(!rows.length){const tr=document.createElement('tr'),td=safeText('td','','No matching players. Change the filters.');td.colSpan=8;tr.appendChild(td);target.appendChild(tr);}
  }
  async function main() {
    $('copyright-year').textContent = String(new Date().getFullYear());
    restoreState();
    populateYears();
    $('year-filter').value = String(state.year);
    populateRounds();
    wireEvents();
    wireCollege();
    await Promise.all([loadDraft(), loadCohortCatalog(), loadCollegeCatalog()]);
  }
  main();
})();
