(() => {
  'use strict';
  const projects = Array.isArray(window.RQ_PROJECTS) ? window.RQ_PROJECTS : [];
  const grid = document.getElementById('project-grid');
  const search = document.getElementById('project-search');
  const filters = document.getElementById('category-filters');
  const count = document.getElementById('results-count');
  const empty = document.getElementById('empty-state');
  const reset = document.getElementById('reset-filters');
  const categoryNames = [...new Set(projects.flatMap(project => project.categories || []))];

  let activeCategory = 'All projects';
  let query = '';

  document.getElementById('current-year').textContent = new Date().getFullYear();
  document.getElementById('project-total').textContent = String(projects.length).padStart(2, '0');

  function text(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = content;
    return element;
  }

  function makeCard(project, index) {
    const card = document.createElement('a');
    card.className = `project-card project-card--${project.theme || 'default'}`;
    card.href = project.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.setAttribute('aria-label', `Open ${project.title} in a new tab`);

    const top = text('div', 'card-top', '');
    top.appendChild(text('span', 'card-number', String(index + 1).padStart(2, '0') + ' / PROJECT'));
    top.appendChild(text('span', 'card-open', '↗'));
    top.lastChild.setAttribute('aria-hidden', 'true');

    const artwork = text('div', 'card-art', '');
    artwork.setAttribute('aria-hidden', 'true');
    const emblem = text('span', 'card-emblem', project.shortName || 'RQ');
    artwork.appendChild(emblem);
    artwork.appendChild(text('span', 'art-caption', project.domain));

    const body = text('div', 'card-body', '');
    body.appendChild(text('span', 'card-domain', project.domain));
    body.appendChild(text('h3', 'card-title', project.title));
    body.appendChild(text('p', 'card-description', project.description));

    const bottom = text('div', 'card-bottom', '');
    const tags = text('div', 'card-tags', '');
    (project.categories || []).forEach(category => tags.appendChild(text('span', 'card-tag', category)));
    bottom.appendChild(tags);
    bottom.appendChild(text('span', 'card-visit', 'View project ↗'));

    card.append(top, artwork, body, bottom);
    return card;
  }

  function renderFilters() {
    filters.replaceChildren();
    for (const category of ['All projects', ...categoryNames]) {
      const button = text('button', 'filter-button', category);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(activeCategory === category));
      if (activeCategory === category) button.classList.add('is-active');
      button.addEventListener('click', () => {
        activeCategory = category;
        render();
      });
      filters.appendChild(button);
    }
  }

  function render() {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const shown = projects.filter(project => {
      const inCategory = activeCategory === 'All projects' || (project.categories || []).includes(activeCategory);
      const haystack = [project.title, project.description, project.domain, ...(project.categories || []), ...(project.searchKeywords || [])].join(' ').toLocaleLowerCase();
      return inCategory && (!normalizedQuery || haystack.includes(normalizedQuery));
    });

    grid.replaceChildren(...shown.map(project => makeCard(project, projects.indexOf(project))));
    count.textContent = `${shown.length} ${shown.length === 1 ? 'project' : 'projects'}`;
    empty.hidden = shown.length !== 0;
    grid.hidden = shown.length === 0;
    renderFilters();
  }

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  reset.addEventListener('click', () => {
    activeCategory = 'All projects';
    query = '';
    search.value = '';
    render();
    search.focus();
  });

  // Search shortcut: press / from anywhere except a text input.
  document.addEventListener('keydown', event => {
    const focusedTag = document.activeElement?.tagName;
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA'].includes(focusedTag)) {
      event.preventDefault();
      search.focus();
    }
    if (event.key === 'Escape' && document.activeElement === search) {
      search.blur();
    }
  });
  render();
})();
