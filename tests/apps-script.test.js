import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8');

test('helpers do Apps Script não possuem nomes duplicados',()=>{
  const names=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match=>match[1]);
  const duplicates=[...new Set(names.filter((name,index)=>names.indexOf(name)!==index))];
  assert.deepEqual(duplicates,[]);
});

test('gravações usam helper distinto da soma elíptica',()=>{
  assert.match(source,/function append_\(n,r\)/);
  assert.match(source,/function add_\(a,b\)/);
  assert.doesNotMatch(source,/add_\(['"](?:sessions|names|votes|audit|nonces|panels)['"]/);
});

test('estado da sessão é administrativo e também imposto ao receber votos',()=>{
  assert.match(source,/setSessionState:setState_/);
  assert.match(source,/function setState_\(x,s\)/);
  assert.match(source,/session_\(id\)\.state!=='active'/);
  assert.match(source,/endpointListFingerprint,'paused'/);
});
