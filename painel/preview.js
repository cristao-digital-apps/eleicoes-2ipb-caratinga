import {el} from '../shared/common.js';
import {createPanelView} from './view.js';
import {MAX_PEOPLE, clampCount, makePreviewPeople} from './preview-data.js';

const peopleInput = el('input', {id: 'preview-people', type: 'number', min: '1', max: String(MAX_PEOPLE), step: '1', value: '20'});
const votesInput = el('input', {id: 'preview-votes', type: 'number', min: '0', max: '20', step: '1', value: '5'});
const controls = el('section', {class: 'card preview-controls'},
  el('h2', {text: 'Simulação do painel'}),
  el('p', {text: 'Dados fictícios para visualizar o painel. Nenhum voto real é consultado.'}),
  el('div', {class: 'row'},
    el('div', {}, el('label', {for: 'preview-people', text: 'Quantidade de eleitores'}), peopleInput),
    el('div', {}, el('label', {for: 'preview-votes', text: 'Votos simulados'}), votesInput)));
const view = createPanelView(document.querySelector('#app'), {eyebrow: 'Visualização de teste', initialTotal: ''});
view.main.insertBefore(controls, view.main.querySelector('.total'));

function update() {
  const count = Math.max(1, clampCount(peopleInput.value));
  const votes = clampCount(votesInput.value, count);
  peopleInput.value = String(count);
  votesInput.max = String(count);
  votesInput.value = String(votes);
  const people = makePreviewPeople(count);
  view.render(people, new Set(people.slice(0, votes).map(person => person.deviceId)));
}

peopleInput.addEventListener('change', update);
votesInput.addEventListener('change', update);
update();
