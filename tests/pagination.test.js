import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readPages,sha} from '../shared/common.js';

globalThis.crypto=webcrypto;

const pageRecord=async(cursor,data)=>({cursor,hash:await sha(JSON.stringify(data)),receivedAt:'2026-09-24T00:00:00.000Z',data});
test('leitura paginada valida e reúne páginas sequenciais',async()=>{const pages={0:{records:[await pageRecord(1,{id:'a'})],nextAfter:1,hasMore:true},1:{records:[await pageRecord(2,{id:'b'})],nextAfter:2,hasMore:false}},result=await readPages(after=>pages[after]);assert.deepEqual(result.records.map(x=>x.id),['a','b']);assert.equal(result.lastCursor,2);});
test('leitura paginada rejeita hash alterado e buraco de cursor',async()=>{await assert.rejects(()=>readPages(async()=>({records:[{cursor:1,hash:'inválido',data:{id:'a'}}],nextAfter:1,hasMore:false})),/integridade/);await assert.rejects(()=>readPages(async()=>({records:[await pageRecord(2,{id:'a'})],nextAfter:2,hasMore:false})),/integridade/);});
