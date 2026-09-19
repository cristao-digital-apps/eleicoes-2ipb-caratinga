import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;
import {parseBallot,generateKeys,assertRsaPair,encryptVote,decryptVote,validName,publish,history,messageBase,keyFingerprint,sign,verify} from '../shared/common.js';

const csv=[
 'chave pública,,,,Nomes validados para a votação abaixo (adm deve colar aqui)',
 'x,,,,Maria Silva-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
 '"1 = servidor rodando, e 0 = parado/pausado",1',
 '',
 '',
 'DIACONOS SEDE,quantidade de respostas aceitas (inteiro),embaralhar respostas (booleano 1 ou 0)',
 'João,2,1',
 'José,,',
 'Lucas,,',
 'Marcos,,',
 '',
 'DIÁCONOS LAGE,quantidade de respostas aceitas (inteiro),embaralhar respostas (booleano 1 ou 0)',
 'Ana,1,1',
 'Bia,,',
 'Cris,,',
 'Dora,,',
 '',
 'DIÁCONO BANANAL,quantidade de respostas aceitas (inteiro),embaralhar respostas (booleano 1 ou 0)',
 'Um,1,0',
 'Dois,,'
].join('\n');

test('parser conserva os três blocos e suas regras',async()=>{const b=await parseBallot(csv);assert.equal(b.state,'1');assert.deepEqual(b.questions.map(q=>[q.count,q.shuffle,q.options.length]),[[2,true,4],[1,true,4],[1,false,2]]);assert.equal(b.ballotFingerprint.length,43);assert.equal(b.validated.length,1);});
test('fingerprint da cédula é determinística',async()=>assert.equal((await parseBallot(csv)).ballotFingerprint,(await parseBallot(csv)).ballotFingerprint));
test('nome exige ao menos duas palavras e aceita diacríticos/hífen',()=>{assert.equal(validName('  João   D’Ávila-Silva '),'João D’Ávila-Silva');assert.throws(()=>validName('João1 Silva'));assert.throws(()=>validName('João'));});
test('voto híbrido cifra e decifra de forma independente',async()=>{const k=await generateKeys();await assertRsaPair(k.publicKey,k.privateKey);const plain={answers:[{questionId:'q',optionIds:['a']}],secret:'não aparece no envelope'},env=await encryptVote(plain,k.publicKey);assert.equal(JSON.stringify(env).includes('secret'),false);assert.deepEqual(await decryptVote(env,k.privateKey),plain);});
test('publicação no tópico ntfy envia o protocolo como mensagem de texto',async()=>{
 const originalFetch=globalThis.fetch,message={type:'SPREADSHEET',protocolVersion:1};let request;
 globalThis.fetch=async(url,options)=>{request={url,options};return {ok:true};};
 try{await publish('12345678-1234-4123-8123-123456789abc',message);}
 finally{globalThis.fetch=originalFetch;}
 assert.equal(request.url,'https://ntfy.sh/12345678-1234-4123-8123-123456789abc');
 assert.equal(request.options.headers['Content-Type'],'text/plain; charset=utf-8');
 assert.deepEqual(JSON.parse(request.options.body),message);
});
test('metadados do histórico ntfy não invalidam a assinatura',async()=>{
 const originalFetch=globalThis.fetch,keys=await generateKeys(),uuid='12345678-1234-4123-8123-123456789abc';
 const fingerprint=await keyFingerprint(keys.adminSigningPublicKey),message={...messageBase('SPREADSHEET',uuid,fingerprint),sheetId:'planilha',adminSigningPublicKeyJwk:keys.adminSigningPublicKey};
 await sign(message,keys.adminSigningPrivateKey);
 const line=JSON.stringify({id:'ntfy-id',time:123,event:'message',message:JSON.stringify(message)});
 globalThis.fetch=async()=>({ok:true,headers:{get:()=>null},text:async()=>line});
 let restored;
 try{[restored]=await history(uuid);}
 finally{globalThis.fetch=originalFetch;}
 assert.equal(restored._ntfyId,'ntfy-id');
 assert.equal(Object.keys(restored).includes('_ntfyId'),false);
 assert.equal(await verify(restored,keys.adminSigningPublicKey),true);
});
