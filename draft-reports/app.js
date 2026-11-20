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

  const safeText = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  };
  const fullName = (s) => s || '—';

  function populateYears() {
    for (let year = 2026; year >= 1960; year--) {
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
    cell(tr, safeText('span', 'score-pending', quality === null ? 'Not rated' : quality));
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
    $('profile-source-link').href = sourceLinks[p.league];
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
      'Original draft selections verified · career measurements and grades not yet available.' :
      'Draft selections for this year and round have not been imported yet.';
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
        'The historical pick list for this combination has not been imported. Choose 2020 / Round 1 to explore the verified starter board.';
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
    populateRounds();
    render();
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
    $('year-filter').addEventListener('change', (e) => { state.year = Number(e.target.value); render(); });
    $('round-filter').addEventListener('change', (e) => { state.round = Number(e.target.value); render(); });
    $('player-search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
    $('sort-filter').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
    $('empty-reset').addEventListener('click', () => {
      if (picks.some((p) => p.league === state.league && p.year === state.year && p.round === state.round)) {
        state.query = ''; $('player-search').value = '';
      } else { state.year = 2020; state.round = 1; $('year-filter').value = '2020'; $('round-filter').value = '1'; }
      render();
    });
    $('close-dialog').addEventListener('click', () => $('player-dialog').close());
    $('player-dialog').addEventListener('click', (e) => {
      const bounds = $('player-dialog').getBoundingClientRect();
      if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) $('player-dialog').close();
    });
    $('player-dialog').addEventListener('close', () => { if (selectedRow && selectedRow.isConnected) selectedRow.focus(); });
  }
  async function main() {
    $('copyright-year').textContent = String(new Date().getFullYear());
    restoreState();
    populateYears();
    $('year-filter').value = String(state.year);
    populateRounds();
    wireEvents();
    try {
      const response = await fetch('./data/draft-board.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Draft board HTTP ' + response.status);
      const payload = await response.json();
      if (!payload || payload.schema_version !== 1 || !Array.isArray(payload.picks)) throw new Error('Invalid draft board format');
      picks = payload.picks.filter((p) => p && ['NFL','NBA'].includes(p.league) &&
        Number.isInteger(p.year) && Number.isInteger(p.round) && Number.isInteger(p.overall) &&
        typeof p.name === 'string' && typeof p.team === 'string');
      render();
    } catch (error) {
      console.error('Draft board could not be loaded', error);
      $('data-state').textContent = 'Data temporarily unavailable';
      render();
      $('coverage-note').textContent = 'Unable to load the draft data. Refresh this page or check back later.';
      $('empty-title').textContent = 'Unable to load the draft board';
      $('empty-message').textContent = 'The site interface is available, but the starter data file could not be retrieved.';
      $('empty-reset').hidden = true;
    }
  }
  main();
})();