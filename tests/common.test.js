import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';globalThis.crypto??=webcrypto;
import {PROTOCOL_VERSION,parseBallot,generateKeys,assertRsaPair,encryptVote,decryptVote,validName,publish,messageBase,keyFingerprint,sign,verify,validateEndpoints,assignedEndpoint,fetchWithTimeout,randomCapability,adminRequest} from '../shared/common.js';
const uuid='12345678-1234-4123-8123-123456789abc',endpoint='https://script.google.com/macros/s/deployment_identifier_123/exec';
const csv=[
 ',chave pública,,,,,,' ,
 ',x,,,,Maria Silva-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,,',
 ',"1 = servidor rodando, e 0 = parado/pausado",1,,,,,',
 '', '',
 ',DIACONOS SEDE,quantidade de respostas aceitas,embaralhar,exibir imagens,,,',
 'https://img.test/joao.jpg,João,2,1,,,,',
 'https://img.test/jose.jpg,José,mostrar imagens,,,,,',
 'https://img.test/lucas.jpg,Lucas,1,,,,,',
 'https://img.test/marcos.jpg,Marcos,,,,,,',
 '',
 ',DIÁCONOS LAGE,quantidade de respostas aceitas,embaralhar,exibir imagens,,,',
 ',Ana,1,0,0,,,',',Bia,,,,,,',
 ',,,,,,,https://script.google.com/macros/s/deployment_identifier_123/exec'
].join('\n');
test('parser não transforma coluna pública em autorização',async()=>{const b=await parseBallot(csv);assert.equal(b.state,'1');assert.deepEqual(b.questions.map(q=>[q.count,q.shuffle,q.showImages,q.options.length]),[[2,true,true,4],[1,false,false,2]]);assert.equal(b.questions[0].options[0].image,'https://img.test/joao.jpg');assert.equal('validated' in b,false);assert.deepEqual(b.endpoints,[endpoint]);});
test('parser aceita a estrutura compacta atual sem linhas de controle',async()=>{const compact=[
 ',DIACONOS SEDE,quantidade de respostas aceitas,embaralhar respostas,,,,endpoints google app script',
 ',Daniel,2,1,,,,https://script.google.com/macros/s/deployment_identifier_123/exec',
 ',Douglas,mostrar imagens,,,,,',
 ',Sérgio,1,,,,,',
 ',Willian,,,,,,',
 '',
 ',DIACONOS LAGE,quantidade de respostas aceitas,embaralhar respostas,,,,',
 ',Anderson,1,0,,,,',
 ',Erivelton,mostrar imagens,,,,,',
 ',Nilton,0,,,,,'
].join('\n');const b=await parseBallot(compact);assert.equal(b.state,null);assert.deepEqual(b.questions.map(q=>[q.count,q.shuffle,q.showImages,q.options.length]),[[2,true,true,4],[1,false,false,3]]);assert.deepEqual(b.endpoints,[endpoint]);});
test('fingerprint da cédula é determinística',async()=>assert.equal((await parseBallot(csv)).ballotFingerprint,(await parseBallot(csv)).ballotFingerprint));
test('imagem em célula pode estar ausente no CSV do Google',async()=>assert.equal((await parseBallot(csv.replace('https://img.test/jose.jpg',''))).questions[0].showImages,true));
test('nome exige duas palavras e aceita diacríticos',()=>{assert.equal(validName(' João D’Ávila-Silva '),'João D’Ávila-Silva');assert.throws(()=>validName('João1 Silva'));});
test('voto híbrido cifra e decifra',async()=>{const k=await generateKeys();await assertRsaPair(k.publicKey,k.privateKey);const plain={secret:'não aparece'},env=await encryptVote(plain,k.publicKey);assert.equal(JSON.stringify(env).includes('secret'),false);assert.deepEqual(await decryptVote(env,k.privateKey),plain);});
test('endpoints exigem Web App normalizado, sem duplicatas',()=>{assert.deepEqual(validateEndpoints([endpoint+'/']),[endpoint]);assert.throws(()=>validateEndpoints([endpoint,endpoint+'/']));assert.throws(()=>validateEndpoints(['https://example.com/x']));});
test('atribuição de endpoint é determinística',async()=>assert.deepEqual(await assignedEndpoint(uuid,'device', [endpoint]),await assignedEndpoint(uuid,'device',[endpoint])));
test('requisição pendurada é cancelada com mensagem clara',async()=>{const original=globalThis.fetch;globalThis.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))));try{await assert.rejects(fetchWithTimeout('https://example.test',{},5),/demorou demais/);}finally{globalThis.fetch=original;}});
test('publicação usa operação mínima e recibo específico',async()=>{const original=globalThis.fetch;let request;globalThis.fetch=async(url,options)=>(request={url,options},{ok:true,json:async()=>({ok:true,sessionId:uuid,id:'vote-1'})});try{await publish(uuid,{type:'VOTE',ballotId:'vote-1'},endpoint);}finally{globalThis.fetch=original;}assert.equal(request.url,endpoint);assert.equal(request.options.headers['Content-Type'],'text/plain;charset=UTF-8');const body=JSON.parse(request.options.body);assert.equal(body.action,'appendVote');assert.equal(body.protocolVersion,2);});
test('capacidade administrativa tem 256 bits em base64url',()=>{const c=randomCapability();assert.match(c,/^[A-Za-z0-9_-]{43}$/);assert.equal(Buffer.from(c,'base64url').length,32);});
test('operação administrativa assina capacidade no corpo, não na URL',async()=>{const original=globalThis.fetch,keys=await generateKeys(),cap=randomCapability();let request;globalThis.fetch=async(url,options)=>(request={url,options},{ok:true,json:async()=>({ok:true})});try{await adminRequest(endpoint,'sessionStatus',uuid,cap,keys.adminSigningPrivateKey);}finally{globalThis.fetch=original;}assert.equal(request.url.includes(cap),false);const body=JSON.parse(request.options.body);assert.equal(body.adminCapability,cap);assert.equal(body.protocolVersion,PROTOCOL_VERSION);assert.equal(await verify(body,keys.adminSigningPublicKey),true);});
