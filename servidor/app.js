import {UUID_RE,sessionFromLocation,storage,saveEndpointsCache,fetchSheetCached,generateKeys,keyFingerprint,sha,depem,assertRsaPair,importRsaPublic,messageBase,sign,publish,publishAll,histories,nameDecisions,votingStart,votingStarted,trustedConfigs,saneMessage,verify,parseSheetUrl,fetchSheet,fetchWithTimeout,decryptVote,el,modal} from '../shared/common.js';
import {showQrLink,votingUrl} from '../shared/qr-link.js';

const app=document.querySelector('#app'),params=new URLSearchParams(location.search),uuidValues=params.getAll('uuid'),sheetValues=params.getAll('sheet-id');
if(!uuidValues.length&&!sheetValues.length)stepOne();else{const session=sessionFromLocation({sheet:sheetValues.length>0});if(session&&(sheetValues.length===0||session.sheetId))sheetValues.length?boot(session):stepTwo(session.uuid);}
function frame(step,...nodes){app.replaceChildren(el('main',{},el('div',{class:'eyebrow',text:'Iniciar nova votação'}),el('h1',{text:`${step}º Passo`}),...nodes));}
function stepOne(){const button=el('button',{type:'button',text:'Gerar chave de sessão'});button.onclick=()=>{const id=crypto.randomUUID().toLowerCase();if(!UUID_RE.test(id))return;const url=new URL(location.href);url.search=`?uuid=${encodeURIComponent(id)}`;url.hash='';location.replace(url.href);};frame(1,el('section',{class:'card'},button));}
function stepTwo(uuid){const input=el('input',{type:'url',placeholder:'https://docs.google.com/spreadsheets/d/...'}),button=el('button',{type:'button',text:'Verificar e usar essa Planilha Google'}),out=el('p',{class:'status','aria-live':'polite'});button.onclick=async()=>{button.disabled=true;input.disabled=true;out.className='status';out.textContent='Verificando planilha e endpoints…';try{const {sheetId}=parseSheetUrl(input.value),ballot=await fetchSheet(sheetId);await health(ballot.endpoints);await saveEndpointsCache(storage(uuid),sheetId,ballot.endpoints);const url=new URL(location.href);url.search='';url.searchParams.set('uuid',uuid);url.searchParams.set('sheet-id',sheetId);location.replace(url.href);}catch(e){out.className='status error';out.textContent=e?.message||'Não foi possível verificar a planilha.';}finally{button.disabled=false;input.disabled=false;}};frame(2,el('section',{class:'card'},el('label',{text:'URL da planilha'}),input,button,out));}
async function health(endpoints){
 const results=await Promise.allSettled(endpoints.map(async endpoint=>{
  const u=new URL(endpoint);u.searchParams.set('action','health');
  let r;try{r=await fetchWithTimeout(u,{cache:'no-store'});}catch(e){throw Error(e?.message||'Falha de rede ou acesso bloqueado pelo navegador.');}
  let body;try{body=await r.json();}catch{throw Error(`Resposta não JSON (HTTP ${r.status}). Confira a URL e o acesso público da implantação.`);}
  if(!r.ok||body?.ok!==true||body.service!=='election-channel')throw Error(body?.error||`Resposta inválida (HTTP ${r.status}). Confira a implantação do Apps Script.`);
 }));
 const failed=results.flatMap((r,i)=>r.status==='rejected'?[`${i+1}: ${r.reason.message} — ${endpoints[i]}`]:[]);
 if(failed.length)throw Error(`Endpoint(s) indisponível(is): ${failed.join(' | ')}`);
}

async function boot({uuid,sheetId}){
 const cache=storage(uuid);let ballot;try{ballot=await fetchSheetCached(sheetId,cache);await health(ballot.endpoints);await saveEndpointsCache(cache,sheetId,ballot.endpoints);}catch(e){const retry=el('button',{type:'button',text:'Tentar novamente',onClick:()=>boot({uuid,sheetId})});frame(3,el('p',{class:'error',text:e.message}),retry);return;}
 const status=el('p',{class:'status','aria-live':'polite'}),keysArea=el('div'),operations=el('div');frame(3,el('section',{class:'card'},el('p',{text:`Sessão ${uuid}`}),el('p',{text:`Planilha ${sheetId}`}),keysArea,status),operations);
 const load=()=>['publicKey','privateKey','adminSigningPublicKey','adminSigningPrivateKey'].reduce((o,k)=>(o[k]=k.includes('Signing')?cache.json(k):cache.get(k),o),{});
 const save=k=>Object.entries(k).forEach(([n,v])=>typeof v==='string'?cache.set(n,v):cache.put(n,v));
 async function admin(){const k=load();if(!Object.values(k).every(Boolean))throw Error('Gere ou importe as chaves primeiro.');await assertRsaPair(k.publicKey,k.privateKey);return {...k,fp:await keyFingerprint(k.adminSigningPublicKey)};}
 async function renderKeys(){keysArea.replaceChildren();const k=load(),ready=Object.values(k).every(Boolean),gen=el('button',{type:'button',text:'Gerar chaves para Criptografia Assimétrica'}),imp=el('button',{type:'button',class:'secondary',text:'Inserir chaves existentes'});gen.onclick=async()=>{if(k.privateKey&&!confirm('Trocar as chaves pode impedir a leitura de votos existentes. Continuar?'))return;gen.disabled=true;try{save(await generateKeys());status.className='status ok';status.textContent='Chaves geradas neste navegador.';await renderKeys();}catch(e){status.className='status error';status.textContent=e.message;}finally{gen.disabled=false;}};imp.onclick=()=>importKeys(imp);keysArea.append(el('div',{class:'actions'},gen,imp));if(!ready)return;
   const publish=el('button',{type:'button',text:'Publicar e confirmar chave pública'});publish.onclick=async()=>{publish.disabled=true;try{const a=await admin();await importRsaPublic(a.publicKey);let msg=cache.json('pendingPublicKey');if(!msg||msg.signingKeyFingerprint!==a.fp){msg={...messageBase('PUBLIC_KEY',uuid,a.fp),publicKeyPem:a.publicKey,fingerprint:await sha(depem(a.publicKey,'PUBLIC KEY')),adminSigningPublicKeyJwk:a.adminSigningPublicKey};await sign(msg,a.adminSigningPrivateKey);cache.put('pendingPublicKey',msg);}await publishAll(uuid,msg,ballot.endpoints);const aggregate=await histories(uuid,ballot.endpoints);if(!aggregate.complete)throw Error('Não foi possível reler todos os endpoints.');for(const channel of aggregate.channels){const cfg=await trustedConfigs(channel.messages,uuid,a.fp);if(!cfg.publicKey||cfg.publicKey.signature!==msg.signature)throw Error('Configuração divergente entre endpoints.');}cache.put('endpoints',ballot.endpoints);cache.set('endpointFingerprint',await sha(ballot.endpoints.join('\n')));status.className='status ok';status.textContent='Chave confirmada em todos os endpoints.';await renderOperations();}catch(e){status.className='status error';status.textContent=e.message;}finally{publish.disabled=false;}};
   keysArea.append(el('label',{text:'Chave Pública'}),Object.assign(el('textarea',{readonly:true}),{value:k.publicKey}),publish);
 }
 function importKeys(opener){const pub=el('textarea',{placeholder:'Chave pública RSA PEM'}),priv=el('textarea',{placeholder:'Chave privada RSA PEM'}),go=el('button',{type:'button',text:'Importar par RSA'}),out=el('p',{class:'status'});modal('Inserir chaves existentes',el('div',{},el('label',{text:'Chave pública'}),pub,el('label',{text:'Chave privada'}),priv,go,out),opener);go.onclick=async()=>{try{await assertRsaPair(pub.value,priv.value);const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);save({publicKey:pub.value.trim(),privateKey:priv.value.trim(),adminSigningPublicKey:await crypto.subtle.exportKey('jwk',pair.publicKey),adminSigningPrivateKey:await crypto.subtle.exportKey('jwk',pair.privateKey)});await renderKeys();out.className='status ok';out.textContent='Chaves importadas.';}catch(e){out.className='status error';out.textContent=e.message;}};}
 async function validDevice(m,type){return saneMessage(m,uuid,type)&&m.deviceSigningPublicKeyJwk&&m.deviceId===await keyFingerprint(m.deviceSigningPublicKeyJwk)&&m.signingKeyFingerprint===m.deviceId&&await verify(m,m.deviceSigningPublicKeyJwk);}
 async function remote(){const a=await admin(),aggregate=await histories(uuid,ballot.endpoints);if(!aggregate.complete)throw Error('Um ou mais endpoints estão indisponíveis.');for(const c of aggregate.channels){const cfg=await trustedConfigs(c.messages,uuid,a.fp);if(!cfg.publicKey)throw Error('A chave ainda não converge em todos os endpoints.');}return {a,msgs:aggregate.messages,channels:aggregate.channels};}
 async function renderOperations(){operations.replaceChildren();let snapshot;try{snapshot=await remote();}catch{return;}const validate=el('button',{type:'button',text:'Validar Pessoas'}),vote=el('button',{type:'button',text:'Página de Votação'}),panel=el('button',{type:'button',text:'Painel de Acompanhamento'}),results=el('button',{type:'button',text:'Resultados da Votação'}),occupancy=ballot.endpoints.map(endpoint=>new Set(snapshot.msgs.filter(m=>m.type==='NAME_REQUEST'&&m._endpoint===endpoint).map(m=>m.deviceId)).size);const started=await Promise.all(snapshot.channels.map(channel=>votingStarted(channel.messages,uuid,snapshot.a.fp,ballot.ballotFingerprint))),startButton=el('button',{type:'button',class:'start-voting',text:started.every(Boolean)?'Votação iniciada':'Iniciar Votação'});
   startButton.disabled=started.every(Boolean);
   operations.append(el('section',{class:'start-section'},startButton),el('section',{class:'card'},el('h2',{text:'Operação'}),el('p',{text:`Aparelhos observados por endpoint: ${occupancy.join(' / ') || '0'}.`}),el('div',{class:'actions'},validate,vote,panel,results)));
   startButton.onclick=async()=>{
    const content=el('div',{},el('p',{text:'Verificando solicitações…'})),dialog=modal('Iniciar Votação',content,startButton);
    try{
      ballot=await fetchSheet(sheetId);
      const {a,msgs,channels}=await remote(),decisions=await nameDecisions(msgs,uuid,a.fp),requests=new Map();
      for(const request of msgs)if(request.type==='NAME_REQUEST'&&await validDevice(request,'NAME_REQUEST'))requests.set(request.deviceId,request);
      const pending=[...requests.values()].filter(request=>!decisions.has(request.requestId));
      const message=el('p',{text:pending.length?'Existem pessoas aguardando a validação do nome, deseja iniciar a votação mesmo assim?':'Tudo pronto para iniciar, não há nenhuma pessoa aguardando validação do nome.'}),go=el('button',{type:'button',class:'success',text:'Iniciar'}),feedback=el('p',{class:'status','aria-live':'polite'});
      content.replaceChildren(message,go,feedback);
      go.onclick=async()=>{go.disabled=true;feedback.textContent='Registrando início em todos os endpoints…';try{
        let start=cache.json('pendingVotingStart');
        if(!start||start.ballotFingerprint!==ballot.ballotFingerprint||start.signingKeyFingerprint!==a.fp){start={...messageBase('VOTING_START',uuid,a.fp),startId:crypto.randomUUID(),ballotFingerprint:ballot.ballotFingerprint,adminSigningPublicKeyJwk:a.adminSigningPublicKey};await sign(start,a.adminSigningPrivateKey);cache.put('pendingVotingStart',start);}
        await publishAll(uuid,start,ballot.endpoints);
        const refreshed=await histories(uuid,ballot.endpoints);
        if(!refreshed.complete||!(await Promise.all(refreshed.channels.map(channel=>votingStarted(channel.messages,uuid,a.fp,ballot.ballotFingerprint)))).every(Boolean))throw Error('O início não foi confirmado em todos os endpoints. Tente novamente.');
        cache.put('pendingVotingStart',null);dialog.close();await renderOperations();
      }catch(e){feedback.className='status error';feedback.textContent=e.message;go.disabled=false;}};
    }catch(e){content.replaceChildren(el('p',{class:'error',text:e.message}));}
   };
   validate.onclick=async()=>{
    const content=el('div',{},el('p',{text:'Carregando…'}));modal('Validar Pessoas',content,validate);
    let filter='pending';
    async function show(){try{
      const {a,msgs}=await remote(),requests=new Map();
      for(const m of msgs)if(m.type==='NAME_REQUEST'&&await validDevice(m,'NAME_REQUEST'))requests.set(m.deviceId,m);
      const decisions=await nameDecisions(msgs,uuid,a.fp);
      const people=[...requests.values()].map(request=>({request,decision:decisions.get(request.requestId)}));
      const tabs=el('div',{class:'actions'}),list=el('div');
      for(const [key,label] of [['pending','Não validados'],['approved','Validados']]){
        const button=el('button',{type:'button',class:key===filter?'':'secondary',text:label});
        button.onclick=()=>{filter=key;show();};tabs.append(button);
      }
      content.replaceChildren(tabs,list);
      const visible=people.filter(({decision})=>filter==='approved'?decision?.decision==='approved':!decision||decision.decision==='typo');
      for(const {request,decision} of visible){
        const row=el('div',{class:'request person-row'}),label=el('span',{text:request.name}),button=el('button',{type:'button',class:'secondary icon-button','aria-label':filter==='approved'?`Excluir ${request.name}`:`Incluir ${request.name}`,title:filter==='approved'?'Excluir':'Incluir',text:filter==='approved'?'−':'+'});
        row.append(label,button);list.append(row);
        const decide=async kind=>{button.disabled=true;try{const message={...messageBase('NAME_DECISION',uuid,a.fp),decisionId:crypto.randomUUID(),requestId:request.requestId,deviceId:request.deviceId,name:request.name,decision:kind,adminSigningPublicKeyJwk:a.adminSigningPublicKey};await sign(message,a.adminSigningPrivateKey);await publish(uuid,message,request._endpoint);await show();}catch(e){button.disabled=false;content.append(el('p',{class:'error',text:e.message}));}};
        button.onclick=()=>{
          if(filter==='pending'){decide('approved');return;}
          const box=el('div',{},el('p',{text:`Excluir ${request.name} da votação?`})),reject=el('button',{type:'button',text:'Excluir'}),typo=el('button',{type:'button',class:'secondary',text:'Erro de digitação'});
          box.append(el('div',{class:'actions'},reject,typo));
          const dialog=modal('Confirmar exclusão',box,button);
          const finish=async kind=>{reject.disabled=typo.disabled=true;await decide(kind);dialog?.close?.();};
          reject.onclick=()=>finish('rejected');typo.onclick=()=>finish('typo');
        };
      }
      if(!visible.length)list.append(el('p',{class:'ok',text:filter==='pending'?'Não há solicitações pendentes.':'Não há pessoas validadas.'}));
    }catch(e){content.replaceChildren(el('p',{class:'error',text:e.message}));}}
    await show();
   };
   vote.onclick=async()=>{const a=await admin();showQrLink('Página de Votação',votingUrl({uuid,sheetId,trust:a.fp}),vote);};panel.onclick=async()=>{const a=await admin(),url=new URL('../painel/',location.href);url.search='';url.searchParams.set('uuid',uuid);url.searchParams.set('sheet-id',sheetId);url.hash=`k=${a.fp}`;window.open(url.href,'_blank','noopener');};
   results.onclick=async()=>{const c=el('div',{},el('p',{text:'Decifrando localmente…'}));modal('Resultados',c,results);try{ballot=await fetchSheet(sheetId);const {a,msgs}=await remote(),decisions=await nameDecisions(msgs,uuid,a.fp),latestRequests=new Map();for(const request of msgs)if(request.type==='NAME_REQUEST'&&await validDevice(request,'NAME_REQUEST'))latestRequests.set(request.deviceId,request);const authorized=new Set([...latestRequests.values()].filter(request=>decisions.get(request.requestId)?.decision==='approved').map(request=>request.deviceId)),starts=new Map();for(const endpoint of ballot.endpoints)starts.set(endpoint,await votingStart(msgs.filter(m=>m._endpoint===endpoint),uuid,a.fp,ballot.ballotFingerprint));const seen=new Set(),counts=new Map(ballot.questions.map(q=>[q.id,new Map(q.options.map(o=>[o.id,0]))]));let accepted=0;for(const m of msgs){if(m.type!=='VOTE'||seen.has(m.deviceId)||!authorized.has(m.deviceId)||!starts.get(m._endpoint)||m._cursor<=starts.get(m._endpoint)._cursor||!await validDevice(m,'VOTE'))continue;try{const p=await decryptVote(m,a.privateKey);if(p.sheetId!==sheetId||p.ballotFingerprint!==ballot.ballotFingerprint)continue;for(const q of ballot.questions){const answer=p.answers.find(x=>x.questionId===q.id);if(!answer||answer.optionIds.length!==q.count)throw 0;for(const id of answer.optionIds)counts.get(q.id).set(id,counts.get(q.id).get(id)+1);}seen.add(m.deviceId);accepted++;}catch{}}c.replaceChildren(el('p',{class:'ok',text:`${accepted} votos válidos.`}));for(const q of ballot.questions){const box=el('section',{},el('h3',{text:q.text}));for(const o of q.options)box.append(el('p',{text:`${o.text}: ${counts.get(q.id).get(o.id)}`}));c.append(box);}}catch(e){c.replaceChildren(el('p',{class:'error',text:e.message}));}};
 }
 await renderKeys();await renderOperations();
}
