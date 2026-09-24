import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const client=await readFile(new URL('../cliente/app.js',import.meta.url),'utf8');

test('esperas do cliente têm atualização automática com temporizador visível',()=>{
  assert.match(client,/Próxima atualização automática em/);
  assert.match(client,/countdown\(5\)/);
  assert.match(client,/countdown\(20\)/);
  assert.doesNotMatch(client,/const update=el\('button'/);
  assert.doesNotMatch(client,/setTimeout\(waiting/);
});
