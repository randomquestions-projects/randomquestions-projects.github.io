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
  let honorScope = 'round';
  let honorMetric = null;
  const honorDefinitions = {
    NFL: [
      ['pro_bowls', 'Pro Bowls'],
      ['total_all_pro', 'All-Pro seasons'],
      ['first_team_all_pro', 'First-team All-Pro'],
      ['mvp', 'MVP'],
      ['opoy', 'Offensive POY'],
      ['dpoy', 'Defensive POY'],
      ['super_bowl_titles', 'Champion-team rosters']
    ],
    NBA: [
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
        const get = p => key === 'pace' ? p.pace?.score : p.rating?.[key];
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
    const quality = p.rating && typeof p.rating.quality === 'number' ? p.rating.quality.toFixed(1) : null;
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
  function showProfile(p) {
    selectedRow = document.activeElement;
    $('profile-monogram').textContent = p.name.split(/[\s.-]+/).slice(0,2).map((s) => s[0] || '').join('').toUpperCase();
    $('profile-name').textContent = p.name;
    $('profile-subtitle').textContent = p.league + ' / ' + p.year + ' DRAFT CLASS';
    $('profile-meta').textContent = 'Round ' + p.round + ' · Pick #' + p.overall + ' · ' + p.team + (p.position ? ' · ' + p.position : '');
    $('profile-quality').textContent = p.rating && typeof p.rating.quality === 'number' ? p.rating.quality.toFixed(1) : '—';
    $('profile-grade').textContent = p.rating && p.rating.grade ? p.rating.grade : '—';
    $('profile-pace').textContent = p.pace && Number.isFinite(p.pace.score) ? p.pace.score.toFixed(1) : '—';
    $('profile-pace-note').textContent = p.pace ? p.pace.band + ' · ' + p.pace.seasons + ' completed seasons · ' + p.pace.peer_count + ' peers' : 'Insufficient completed-season data';
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
      ('Career scoring ' + (p.rating ? (p.rating.maturity === 'final' ? 'established-career snapshot' : 'provisional') : 'too early to grade')+
       ' · Grade basis: '+(p.rating?.grade_basis === 'career_pace' ? 'tenure-adjusted pace' : 'career quality') + ' · Source: '+(p.league==='NBA'?'NBA Stats / Basketball-Reference':'nflverse')+' · Model '+(p.rating ? p.rating.model_version : 'not assigned')) :
      'Draft selection verified · career measurements pending';

    if (!$('player-dialog').open) $('player-dialog').showModal();
  }

  function awardCount(p, key) {
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
      honorMetric = state.league === 'NFL' ? 'pro_bowls' : 'all_star';
    }
    const metrics = $('honors-metrics');
    metrics.replaceChildren();
    for (const [key, label] of categories) {
      const selections = scopedPicks.reduce((s, p) => s + awardCount(p, key), 0);
      const players = scopedPicks.filter(p => awardCount(p, key) > 0).length;
      const btn = safeText('button', 'honor-metric', '');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(honorMetric === key));
      btn.setAttribute('aria-label', label + ': ' + selections + ' selections, ' +
        players + ' players. Show the recipients.');
      btn.appendChild(safeText('span', 'honor-metric-count', String(selections)));
      btn.appendChild(safeText('span', 'honor-metric-label', label));
      btn.appendChild(safeText('span', 'honor-metric-extra',
        players + (players === 1 ? ' player' : ' players')));
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
        (b.rating?.quality || 0) - (a.rating?.quality || 0) ||
        a.overall - b.overall);
    roster.appendChild(safeText('h5', 'honors-roster-title', selectedLabel +
      ' · ' + (honorScope === 'class' ? 'entire class' : 'Round ' + state.round) +
      ' · ' + people.length + (people.length === 1 ? ' player' : ' players')));
    if (!people.length) {
      roster.appendChild(safeText('p', 'honors-roster-empty', !scopedPicks.length ?
        'Draft players are loading or unavailable.' :
        'No verified recipients from this selection yet. Choose another honor or the entire class.'));
    } else {
      const grid = safeText('div', 'honors-roster-grid', '');
      for (const p of people) {
        const btn = safeText('button', 'honors-person', '');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Open player profile for ' + p.name);
        btn.appendChild(safeText('span', 'honors-person-name', p.name + ' · #' + p.overall));
        const n = awardCount(p, honorMetric);
        btn.appendChild(safeText('span', 'honors-person-detail',
          String(n) + (n === 1 ? ' selection' : ' selections') + ' ↗'));
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
    honorScope = 'round';
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
  async function main() {
    $('copyright-year').textContent = String(new Date().getFullYear());
    restoreState();
    populateYears();
    $('year-filter').value = String(state.year);
    populateRounds();
    wireEvents();
    await Promise.all([loadDraft(), loadCohortCatalog()]);
  }
  main();
})();
