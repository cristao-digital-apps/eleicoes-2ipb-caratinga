import {el} from '../shared/common.js';

const collator = new Intl.Collator('pt-BR', {sensitivity: 'base'});
const PAGE_DURATION = 8000;

export function createPanelView(app, {action, eyebrow = 'Acompanhamento', title = 'Votação', initialTotal = 'Carregando…'} = {}) {
  const main = el('main');
  const heading = el('div', {}, el('div', {class: 'eyebrow', text: eyebrow}), el('h1', {text: title}));
  const top = el('div', {class: 'top'}, heading);
  if (action) top.append(action);
  const smaller = el('button', {type: 'button', class: 'secondary', 'aria-label': 'Diminuir fonte dos nomes', title: 'Diminuir fonte dos nomes', text: 'A−'});
  const larger = el('button', {type: 'button', class: 'secondary', 'aria-label': 'Aumentar fonte dos nomes', title: 'Aumentar fonte dos nomes', text: 'A+'});
  top.append(el('div', {class: 'font-controls', role: 'group', 'aria-label': 'Tamanho da fonte dos nomes'}, smaller, larger));
  const total = el('div', {class: 'total', 'aria-live': 'polite', text: initialTotal});
  const filterControls = el('div', {class: 'filter-controls', role: 'group', 'aria-label': 'Mostrar eleitores'});
  filterControls.append(el('span', {class: 'filter-label', text: 'Mostrar'}));
  const filterRow = el('div', {class: 'filter-row'});
  const filterButtons = new Map([
    ['all', 'Todos'],
    ['voted', 'Votaram'],
    ['pending', 'Ainda não votaram']
  ].map(([key, label]) => {
    const button = el('button', {type: 'button', class: 'secondary filter-button', text: label});
    filterRow.append(button);
    return [key, button];
  }));
  filterControls.append(filterRow);
  const states = el('div', {class: 'channel-states'});
  const status = el('p', {class: 'status', 'aria-live': 'polite'});
  const countdown = el('p', {class: 'status', 'aria-live': 'off'});
  const pageIndicator = el('div', {class: 'page-indicator', 'aria-live': 'off'});
  const groups = el('div', {class: 'groups'});
  main.append(top, total, filterControls, states, status, countdown, pageIndicator, groups);
  app.append(main);

  let fontSize = Number.parseInt(getComputedStyle(main).getPropertyValue('--name-font-size'), 10) || 18;
  function changeFont(delta) {
    fontSize = Math.max(12, Math.min(30, fontSize + delta));
    main.style.setProperty('--name-font-size', `${fontSize}px`);
    smaller.disabled = fontSize === 12;
    larger.disabled = fontSize === 30;
    paginate();
  }
  smaller.onclick = () => changeFont(-2);
  larger.onclick = () => changeFont(2);

  let sortedPeople = [];
  let voted = new Set();
  let filter = 'all';
  let signature = '';
  let pages = [];
  let pageIndex = 0;
  let layoutWidth = 0;
  let layoutHeight = 0;

  function filteredPeople() {
    return sortedPeople.filter(person => filter === 'all' || voted.has(person.deviceId) === (filter === 'voted'));
  }

  function updateFilterButtons() {
    for (const [key, button] of filterButtons) {
      const active = key === filter;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
  for (const [key, button] of filterButtons) button.onclick = () => {
    if (filter === key) return;
    filter = key;
    pageIndex = 0;
    updateFilterButtons();
    paginate();
  };
  updateFilterButtons();

  function showPage() {
    const current = pages[pageIndex] || [];
    if (!current.length && sortedPeople.length) {
      groups.replaceChildren(el('p', {class: 'filter-empty', text: 'Nenhum eleitor neste filtro.'}));
      pageIndicator.textContent = '';
      return;
    }
    groups.replaceChildren(...current.map(column =>
      el('div', {class: 'page-column'}, ...column.map(({letter, people}) =>
        el('section', {class: 'card group'},
          el('h2', {text: letter}),
          el('div', {class: 'people'}, ...people.map(person => el('div', {
            class: `person ${voted.has(person.deviceId) ? 'voted' : ''}`,
            text: person.name
          }))))))));
    pageIndicator.textContent = pages.length > 1 ? `Página ${pageIndex + 1} de ${pages.length}` : '';
  }

  function paginate() {
    const width = groups.clientWidth;
    const height = groups.clientHeight;
    if (!width || !height) return;
    const availableHeight = height - 8;
    layoutWidth = width;
    layoutHeight = height;
    const gap = 12;
    const columns = Math.max(1, Math.floor((width + gap) / (260 + gap)));
    const columnWidth = (width - gap * (columns - 1)) / columns;
    groups.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;

    // Measure with the voted marker, which needs at least as much room as a neutral name.
    const probe = el('section', {class: 'card group measure-group'},
      el('h2', {text: 'A'}), el('div', {class: 'people'}));
    probe.style.width = `${columnWidth}px`;
    groups.append(probe);
    const list = probe.querySelector('.people');
    const sample = el('div', {class: 'person voted', text: 'A'});
    list.append(sample);
    const baseHeight = probe.offsetHeight - sample.offsetHeight;
    sample.remove();
    const peopleToShow = filteredPeople();
    const measured = peopleToShow.map(person => el('div', {class: 'person voted', text: person.name}));
    list.append(...measured);
    const heights = measured.map(node => node.offsetHeight);
    probe.remove();

    pages = [[]];
    let column = [];
    let used = 0;
    let segment = null;
    function nextColumn() {
      if (pages[pages.length - 1].length >= columns) pages.push([]);
      column = [];
      pages[pages.length - 1].push(column);
      used = 0;
      segment = null;
    }
    nextColumn();
    for (let i = 0; i < peopleToShow.length; i++) {
      const person = peopleToShow[i];
      const letter = person.name.normalize('NFD').replace(/\p{M}/gu, '').charAt(0).toUpperCase();
      const sameGroup = segment && segment.letter === letter;
      const needed = heights[i] + (sameGroup ? 8 : baseHeight + (column.length ? gap : 0));
      if (column.length && used + needed > availableHeight) nextColumn();
      if (!segment || segment.letter !== letter) {
        segment = {letter, people: []};
        if (column.length) used += gap;
        column.push(segment);
        used += baseHeight;
      } else used += 8;
      segment.people.push(person);
      used += heights[i];
    }
    if (!peopleToShow.length) pages = [];
    pageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
    showPage();
  }

  function render(people, votedIds) {
    const allowed = new Set(people.map(person => person.deviceId));
    total.textContent = `${[...votedIds].filter(id => allowed.has(id)).length} votos de ${allowed.size} registrados.`;
    const previousVoted = voted;
    voted = votedIds;
    const nextSignature = people.map(person => `${person.deviceId}\u0000${person.name}`).join('\u0001');
    const filteredMembershipChanged = filter !== 'all' && (voted.size !== previousVoted.size || [...voted].some(id => !previousVoted.has(id)));
    if (nextSignature !== signature || filteredMembershipChanged) {
      signature = nextSignature;
      sortedPeople = [...people].sort((a, b) => collator.compare(a.name, b.name));
      paginate();
    } else {
      const visiblePeople = (pages[pageIndex] || []).flatMap(column => column.flatMap(segment => segment.people));
      groups.querySelectorAll('.person').forEach((node, index) => {
        node.classList.toggle('voted', voted.has(visiblePeople[index].deviceId));
      });
    }
  }

  new ResizeObserver(() => {
    if (groups.clientWidth !== layoutWidth || groups.clientHeight !== layoutHeight) paginate();
  }).observe(groups);
  setInterval(() => {
    if (pages.length > 1) {
      pageIndex = (pageIndex + 1) % pages.length;
      showPage();
    }
  }, PAGE_DURATION);

  return {main, states, status, countdown, render};
}
