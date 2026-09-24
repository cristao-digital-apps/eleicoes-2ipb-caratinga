import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregatePeople,selectVotes} from '../shared/aggregate.js';

test('painel mantém pessoas distintas com o mesmo nome',()=>{const result=aggregatePeople([{endpoint:'a',records:[{personId:'1',name:'João Silva',received:false},{personId:'2',name:'João Silva',received:true}]}]);assert.equal(result.people.length,2);assert.equal(result.people.filter(p=>p.received).length,1);});
test('painel marca voto do mesmo identificador em dois endpoints como conflito',()=>{const result=aggregatePeople([{endpoint:'a',records:[{personId:'1',name:'Ana Lima',received:true}]},{endpoint:'b',records:[{personId:'1',name:'Ana Lima',received:true}]}]);assert.equal(result.conflicts.size,1);assert.equal(result.people[0].received,false);});
test('apuração aceita duplicata idêntica uma vez e rejeita conflito por aparelho',()=>{const vote={deviceId:'d1',ballotId:'b1',ciphertext:'x'},duplicate={...vote,_cursor:2},conflict={deviceId:'d1',ballotId:'b2',ciphertext:'y'};let result=selectVotes([{endpoint:'a',records:[vote]},{endpoint:'b',records:[duplicate]}]);assert.equal(result.accepted.length,1);assert.equal(result.duplicateIds.size,1);result=selectVotes([{endpoint:'a',records:[vote]},{endpoint:'b',records:[conflict]}]);assert.equal(result.accepted.length,0);assert.equal(result.conflicts.has('d1'),true);});
