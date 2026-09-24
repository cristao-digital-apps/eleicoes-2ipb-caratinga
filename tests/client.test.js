import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWaitCycle} from '../cliente/wait-cycle.js';

const client=await readFile(new URL('../cliente/app.js',import.meta.url),'utf8');

test('esperas do cliente têm atualização automática com temporizador visível',()=>{
  assert.match(client,/Próxima atualização automática em/);
  assert.match(client,/countdown\(5\)/);
  assert.match(client,/countdown\(20\)/);
  assert.doesNotMatch(client,/const update=el\('button'/);
  assert.doesNotMatch(client,/setTimeout\(waiting/);
});

test('ciclo de espera começa somente quando solicitado e atualiza até concluir',()=>{
  let callback,cleared=0,elapsed=0;
  const ticks=[];
  const cycle=createWaitCycle({
    onElapsed:()=>elapsed++,
    setIntervalFn:fn=>{callback=fn;return 7;},
    clearIntervalFn:id=>{assert.equal(id,7);cleared++;}
  });
  const start=cycle.prepare(2,value=>ticks.push(value));
  assert.deepEqual(ticks,[2]);
  assert.equal(cycle.running,false);
  start();
  assert.equal(cycle.running,true);
  callback();
  callback();
  assert.deepEqual(ticks,[2,1,0]);
  assert.equal(elapsed,1);
  assert.equal(cleared,1);
  assert.equal(cycle.running,false);
});

test('preparar ou parar uma nova tela cancela somente o ciclo anterior',()=>{
  let nextId=0;
  const cleared=[];
  const cycle=createWaitCycle({
    onElapsed:()=>{},
    setIntervalFn:()=>++nextId,
    clearIntervalFn:id=>cleared.push(id)
  });
  const first=cycle.prepare(5,()=>{});
  first();
  const second=cycle.prepare(20,()=>{});
  assert.deepEqual(cleared,[1]);
  assert.equal(cycle.running,false);
  second();
  assert.equal(cycle.running,true);
  cycle.stop();
  assert.deepEqual(cleared,[1,2]);
});

test('retomada usa consulta interna sem ser bloqueada pelo busy externo',()=>{
  assert.match(client,/savedName\?await checkWaiting\(\):nameForm\(''\)/);
  assert.match(client,/async function checkWaiting\(\)/);
  assert.match(client,/async function waiting\(\)\{if\(busy\)return;busy=true;try\{await checkWaiting\(\);\}/);
});

test('telas pendente e pausada renderizam antes de iniciar seus ciclos',()=>{
  assert.match(client,/requested\(name\).*refresh=countdown\(5\);render\([\s\S]*?refresh\.start\(\);\}/);
  assert.match(client,/const refresh=countdown\(20\);render\([\s\S]*?refresh\.start\(\);\}/);
  assert.match(client,/cfg\.pub\.state==='active'\)\{renderQuestion\(0\);return;\}/);
});

test('cliente trata rejeição, correção e revogação sem reutilizar solicitação',()=>{
  assert.match(client,/\['rejected','typo','revoked'\]/);
  assert.match(client,/cache\.set\('requestId',''\)/);
  assert.match(client,/monitorDecision\(\)/);
});
