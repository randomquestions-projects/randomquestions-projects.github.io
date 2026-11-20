(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sourceLinks = {
    NFL: 'https://www.profootballhof.com/football-history/nfl-draft-history/1960/2020',
    NBA: 'https://www.nba.com/news/2020-nba-draft-results-picks-1-60'
  };
  const state = { league: 'NFL', year: 2020, round: 1, query: '', sort: 'pick' };
  let picks = [];
  let selectedRow = null;
  let latestLoad = 0;
  let dataUnavailable = false;

  const safeText = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  };
  const fullName = (s) => s || '—';

  function populateYears() {
    $('year-filter').replaceChildren();
    const availableYears = state.league === 'NFL'
      ? Array.from({length:27},(_,i)=>2026-i)
      : [2020];
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
      if (state.sort === 'quality' || state.sort === 'value') {
        const key = state.sort;
        const x = a.rating && Number.isFinite(a.rating[key]) ? a.rating[key] : -1;
        const y = b.rating && Number.isFinite(b.rating[key]) ? b.rating[key] : -1;
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
    player.appendChild(safeText('div', 'player-detail', p.position ? p.position + (p.college ? ' · ' + p.college : '') : '2020 draft selection'));
    tr.appendChild(player);
    cell(tr, safeText('span', 'team-name', p.team));
    const quality = p.rating && typeof p.rating.quality === 'number' ? p.rating.quality.toFixed(1) : null;
    const grade = p.rating && p.rating.grade ? p.rating.grade : null;
    cell(tr, safeText('span', 'score-pending', quality === null ? (p.career_status === 'too_early' ? 'Too early' : 'Not rated') : quality));
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
  function showProfile(p) {
    selectedRow = document.activeElement;
    $('profile-monogram').textContent = p.name.split(/[\s.-]+/).slice(0,2).map((s) => s[0] || '').join('').toUpperCase();
    $('profile-name').textContent = p.name;
    $('profile-subtitle').textContent = p.league + ' / ' + p.year + ' DRAFT CLASS';
    $('profile-meta').textContent = 'Round ' + p.round + ' · Pick #' + p.overall + ' · ' + p.team + (p.position ? ' · ' + p.position : '');
    $('profile-quality').textContent = p.rating && typeof p.rating.quality === 'number' ? p.rating.quality.toFixed(1) : '—';
    $('profile-grade').textContent = p.rating && p.rating.grade ? p.rating.grade : '—';
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
      if(awards.first_team_all_pro !== null && awards.first_team_all_pro !== undefined)
        detailLine(second,'First-team All-Pro',String(awards.first_team_all_pro));
      if(awards.pro_bowls !== null && awards.pro_bowls !== undefined)
        detailLine(second,'Pro Bowl selections',String(awards.pro_bowls));
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
    } else {
      first.appendChild(safeText('p','detail-empty','NBA career data will follow the NFL research release.'));
      second.appendChild(safeText('p','detail-empty','Verified honors not yet imported.'));
      const seasonContainer=document.getElementById('season-summary');
      if(seasonContainer)seasonContainer.replaceChildren();
    }
    const sourceNote=document.querySelector('.profile-source > span:nth-child(2)');
    if(sourceNote)sourceNote.textContent = career ?
      ('Career scoring ' + (p.rating ? (p.rating.maturity === 'final' ? 'established-career snapshot' : 'provisional') : 'pending')+
       ' · Source: nflverse · Model '+(p.rating ? p.rating.model_version : 'not assigned')) :
      'Draft selection verified · career measurements pending';

    if (!$('player-dialog').open) $('player-dialog').showModal();
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
        'Original NBA draft selections verified · career scores not yet available.') :
      (dataUnavailable ? 'Unable to load this draft class.' : 'Draft selections not yet available for this year and round.');
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
        'Historical draft selections for this league, year or round have not been imported. NFL 2000–2026 and NBA 2020 Round 1 are available.');
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
    $('data-state').textContent = 'Loading verified draft records…';
    render();
    try {
      const url = league === 'NFL' && year >= 2000 && year <= 2026 ?
        './data/nfl/' + year + '.json' : './data/draft-board.json';
      const response = await fetch(url,{cache:'no-cache'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data = await response.json();
      if(token !== latestLoad)return;
      if(league === 'NFL' && year >= 2000 && year <= 2026) {
        if(data.schema_version !== 2 || data.league !== 'NFL' || data.year !== year ||
            !Array.isArray(data.picks) || data.picks.length < 200)
          throw new Error('Invalid NFL export');
        picks = data.picks;
        $('data-state').textContent = 'NFL 2000–2026 · career data & grades';
      } else {
        if(data.schema_version !== 1 || !Array.isArray(data.picks))throw new Error('Invalid starter board');
        picks = data.picks.filter(p => p.league === league && p.year === year);
        $('data-state').textContent = league === 'NBA' ? 'NBA career model coming next' : 'NFL 2000–2026 supported';
      }
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
    await loadDraft();
  }
  main();
})();
