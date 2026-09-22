import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_PEOPLE, clampCount, makePreviewPeople} from '../painel/preview-data.js';

test('prévia gera a quantidade escolhida com nomes e identificadores únicos', () => {
  for (const count of [1, 10, 20, 200, MAX_PEOPLE]) {
    const people = makePreviewPeople(count);
    assert.equal(people.length, count);
    assert.equal(new Set(people.map(person => person.name)).size, count);
    assert.equal(new Set(people.map(person => person.deviceId)).size, count);
    assert.deepEqual(people, makePreviewPeople(count));
  }
});

test('votos simulados ficam entre zero e o total de eleitores', () => {
  assert.equal(clampCount(-5, 10), 0);
  assert.equal(clampCount(8, 10), 8);
  assert.equal(clampCount(20, 10), 10);
  assert.equal(clampCount(2001), MAX_PEOPLE);
});
