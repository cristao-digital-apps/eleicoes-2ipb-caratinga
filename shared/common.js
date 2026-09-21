export const PROTOCOL_VERSION = 1;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const FP_RE = /^[A-Za-z0-9_-]{43}$/;
export const te = new TextEncoder();
export const td = new TextDecoder();
export const REQUEST_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(resource, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('A requisição demorou demais. Verifique sua conexão e tente novamente.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function sessionFromLocation({ fingerprint = false, sheet = false } = {}) {
  const params = new URLSearchParams(location.search);
  const values = params.getAll('uuid');
  if (values.length !== 1) return null;
  const uuid = values[0].toLowerCase();
  if (!UUID_RE.test(uuid)) return null;
  let sheetId;
  if (sheet) {
    const sheets=params.getAll('sheet-id');
    if(sheets.length!==1||!SHEET_ID_RE.test(sheets[0]))return null;
    sheetId=sheets[0];
  }
  if (!fingerprint) return sheet ? {uuid,sheetId} : { uuid };
  const hash = new URLSearchParams(location.hash.slice(1));
  const keys = hash.getAll('k');
  if (keys.length !== 1 || !FP_RE.test(keys[0])) return null;
  return sheet ? {uuid,sheetId,trust:keys[0]} : { uuid, trust: keys[0] };
}

export const SHEET_ID_RE=/^[A-Za-z0-9_-]{20,}$/;
export function validateEndpoints(values){
  if(!Array.isArray(values))throw new Error('Lista de endpoints inválida.');
  const endpoints=[],seen=new Set();
  for(const raw of values){if(!String(raw??'').trim())continue;let url;try{url=new URL(String(raw).trim());}catch{throw new Error('Endpoint inválido.');}if(url.protocol!=='https:'||url.hostname.toLowerCase()!=='script.google.com'||url.username||url.password||url.search||url.hash||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(url.pathname))throw new Error(`Endpoint inválido: ${raw}`);url.hostname='script.google.com';url.port='';url.pathname=url.pathname.replace(/\/$/,'');const normalized=url.href;if(seen.has(normalized))throw new Error(`Endpoint repetido: ${normalized}`);seen.add(normalized);endpoints.push(normalized);}
  if(!endpoints.length)throw new Error('A coluna H não contém endpoints.');if(endpoints.length>20)throw new Error('A coluna H excede o limite de 20 endpoints.');return endpoints;
}
export async function endpointFingerprint(endpoints){return sha(validateEndpoints(endpoints).join('\n'));}
export async function assignedEndpoint(uuid,deviceId,endpoints){const list=validateEndpoints(endpoints),fingerprint=await endpointFingerprint(list),digest=unb64(await sha(`${uuid}:${deviceId}:${fingerprint}`));let value=0n;for(const byte of digest.slice(0,8))value=(value<<8n)|BigInt(byte);const index=Number(value%BigInt(list.length));return {endpoint:list[index],index,fingerprint};}

export const storage = uuid => ({
  get(name) { try { return localStorage.getItem(`eleicoes:v1:${uuid}:${name}`); } catch { return null; } },
  set(name, value) { localStorage.setItem(`eleicoes:v1:${uuid}:${name}`, value); },
  json(name) { try { return JSON.parse(this.get(name)); } catch { return null; } },
  put(name, value) { this.set(name, JSON.stringify(value)); }
});

export async function saveEndpointsCache(cache,sheetId,endpoints){
  const normalized=validateEndpoints(endpoints),fingerprint=await endpointFingerprint(normalized);
  const value={sheetId,endpoints:normalized,fingerprint};cache.put('endpointsCache',value);return value;
}
export async function loadEndpointsCache(cache,sheetId){
  const value=cache.json('endpointsCache');
  if(!value||value.sheetId!==sheetId||!Array.isArray(value.endpoints)||typeof value.fingerprint!=='string')return null;
  try{const endpoints=validateEndpoints(value.endpoints),fingerprint=await endpointFingerprint(endpoints);return fingerprint===value.fingerprint?{sheetId,endpoints,fingerprint}:null;}catch{return null;}
}

export const SHEET_CACHE_MAX_AGE_MS=15000;
export async function saveSheetCache(cache,sheetId,ballot,now=Date.now()){
  const payload=JSON.stringify(ballot),value={sheetId,fetchedAt:now,hash:await sha(payload),ballot};cache.put('sheetCache',value);return ballot;
}
export async function loadSheetCache(cache,sheetId,{maxAgeMs=SHEET_CACHE_MAX_AGE_MS,now=Date.now()}={}){
  const value=cache.json('sheetCache');
  if(!value||value.sheetId!==sheetId||!Number.isFinite(value.fetchedAt)||now-value.fetchedAt<0||now-value.fetchedAt>maxAgeMs||!value.ballot||typeof value.hash!=='string')return null;
  try{return await sha(JSON.stringify(value.ballot))===value.hash?value.ballot:null;}catch{return null;}
}
export async function fetchSheetCached(sheetId,cache,{force=false,maxAgeMs=SHEET_CACHE_MAX_AGE_MS}={}){
  if(!force){const cached=await loadSheetCache(cache,sheetId,{maxAgeMs});if(cached)return cached;}
  return saveSheetCache(cache,sheetId,await fetchSheet(sheetId));
}

export function b64(bytes, url = false) {
  let s = ''; const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  const out = btoa(s); return url ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : out;
}
export function unb64(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4);
  const raw = atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export async function sha(value) { return b64(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? te.encode(value) : value), true); }
export function pem(bytes, label) { const body = b64(bytes).match(/.{1,64}/g).join('\n'); return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`; }
export function depem(value, label) {
  const re = new RegExp(`^-----BEGIN ${label}-----\\s+([A-Za-z0-9+/=\\s]+)-----END ${label}-----$`);
  const m = String(value).trim().match(re); if (!m) throw new Error(`Chave ${label} inválida.`);
  return unb64(m[1].replace(/\s/g, ''));
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function signedPayload(message) { const copy = { ...message }; delete copy.signature; return te.encode(canonical(copy)); }
export async function keyFingerprint(jwk) { return sha(canonical(jwk)); }
export async function generateKeys() {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) throw new Error('Criptografia indisponível. Abra a aplicação por HTTPS ou em http://localhost (não use 0.0.0.0).');
  const rsa = await webCrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['encrypt','decrypt']);
  const sign = await webCrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
  return {
    publicKey: pem(await webCrypto.subtle.exportKey('spki', rsa.publicKey), 'PUBLIC KEY'),
    privateKey: pem(await webCrypto.subtle.exportKey('pkcs8', rsa.privateKey), 'PRIVATE KEY'),
    adminSigningPublicKey: await webCrypto.subtle.exportKey('jwk', sign.publicKey),
    adminSigningPrivateKey: await webCrypto.subtle.exportKey('jwk', sign.privateKey)
  };
}
export async function importRsaPublic(p) { return crypto.subtle.importKey('spki', depem(p, 'PUBLIC KEY'), { name:'RSA-OAEP', hash:'SHA-256' }, true, ['encrypt']); }
export async function importRsaPrivate(p) { return crypto.subtle.importKey('pkcs8', depem(p, 'PRIVATE KEY'), { name:'RSA-OAEP', hash:'SHA-256' }, true, ['decrypt']); }
export async function importSigning(jwk, use) { return crypto.subtle.importKey('jwk', jwk, { name:'ECDSA', namedCurve:'P-256' }, true, [use]); }
export async function assertRsaPair(pubPem, privPem) {
  const pub = await importRsaPublic(pubPem), priv = await importRsaPrivate(privPem), marker = crypto.getRandomValues(new Uint8Array(24));
  const enc = await crypto.subtle.encrypt({name:'RSA-OAEP'}, pub, marker);
  const dec = new Uint8Array(await crypto.subtle.decrypt({name:'RSA-OAEP'}, priv, enc));
  if (!dec.every((v,i) => v === marker[i])) throw new Error('As chaves não formam um par.');
}
export async function sign(message, privateJwk) {
  const key = await importSigning(privateJwk, 'sign');
  message.signature = b64(await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, key, signedPayload(message)), true);
  return message;
}
export async function verify(message, publicJwk) {
  try { const key = await importSigning(publicJwk, 'verify'); return crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, key, unb64(message.signature), signedPayload(message)); } catch { return false; }
}

export async function deviceKeys(cache) {
  let pub = cache.json('deviceSigningPublicKey'), priv = cache.json('deviceSigningPrivateKey');
  try { if (pub && priv) { await importSigning(pub,'verify'); await importSigning(priv,'sign'); } else throw 0; }
  catch { const pair = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']); pub = await crypto.subtle.exportKey('jwk',pair.publicKey); priv = await crypto.subtle.exportKey('jwk',pair.privateKey); cache.put('deviceSigningPublicKey',pub); cache.put('deviceSigningPrivateKey',priv); }
  const deviceId = await keyFingerprint(pub); cache.set('deviceId', deviceId); return {pub,priv,deviceId};
}

export function messageBase(type, uuid, fingerprint) { return { type, protocolVersion:1, sessionId:uuid, publishedAt:new Date().toISOString(), signingKeyFingerprint:fingerprint }; }
export async function publish(uuid,message,endpoint){
  const url=validateEndpoints([endpoint])[0],res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'append',sessionId:uuid,message})});
  let receipt;try{receipt=await res.json();}catch{throw new Error('Resposta não JSON do endpoint.');}
  if(!res.ok||!receipt?.ok)throw new Error(receipt?.error||`Endpoint respondeu ${res.status}.`);
  if(receipt.sessionId!==uuid||!Number.isSafeInteger(receipt.cursor)||receipt.cursor<1||typeof receipt.hash!=='string')throw new Error('Recibo inválido do endpoint.');
  return receipt;
}
export async function publishAll(uuid,message,endpoints){
  const selected=validateEndpoints(endpoints),settled=await Promise.allSettled(selected.map(endpoint=>publish(uuid,message,endpoint)));
  const failures=settled.flatMap((r,i)=>r.status==='rejected'?[{endpoint:selected[i],error:r.reason.message}]:[]);
  if(failures.length){const e=new Error(`Publicação incompleta em ${failures.length} endpoint(s).`);e.failures=failures;e.successes=settled.flatMap((r,i)=>r.status==='fulfilled'?[selected[i]]:[]);throw e;}
  return settled.map(r=>r.value);
}
export async function history(uuid,endpoint,{after=0,limit=500}={}){
  endpoint=validateEndpoints([endpoint])[0];
  const messages=[],hashes=new Map();let cursor=after,more=true;
  while(more){const u=new URL(endpoint);u.searchParams.set('action','messages');u.searchParams.set('sessionId',uuid);u.searchParams.set('after',cursor);u.searchParams.set('limit',limit);const res=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});let page;try{page=await res.json();}catch{throw new Error('Resposta não JSON do endpoint.');}if(!res.ok||!page?.ok)throw new Error(page?.error||`Não foi possível consultar o endpoint (${res.status}).`);if(page.sessionId!==uuid||!Array.isArray(page.records)||typeof page.hasMore!=='boolean'||!Number.isSafeInteger(page.nextAfter))throw new Error('Página inválida no endpoint.');
    for(const record of page.records){if(record.cursor!==cursor+1||typeof record.json!=='string'||await sha(record.json)!==record.hash||hashes.has(record.cursor))throw new Error('Falha de integridade no endpoint.');let msg;try{msg=JSON.parse(record.json);}catch{throw new Error('JSON inválido no endpoint.');}if(msg.sessionId!==uuid||record.type!==msg.type)throw new Error('Sessão ou tipo divergente no endpoint.');hashes.set(record.cursor,record.hash);cursor=record.cursor;Object.defineProperties(msg,{_endpoint:{value:endpoint},_cursor:{value:cursor},_receivedAt:{value:record.receivedAt},_transportHash:{value:record.hash}});messages.push(msg);}
    if(page.nextAfter!==cursor||(page.hasMore&&page.records.length===0))throw new Error('Paginação incoerente no endpoint.');more=page.hasMore;
  }
  return messages;
}
export async function histories(uuid,endpoints){const list=validateEndpoints(endpoints),settled=await Promise.allSettled(list.map(e=>history(uuid,e)));return {channels:settled.map((r,i)=>({number:i+1,endpoint:list[i],status:r.status==='fulfilled'?'updated':'failed',messages:r.status==='fulfilled'?r.value:[],error:r.status==='rejected'?r.reason.message:null,lastCursor:r.status==='fulfilled'?(r.value.at(-1)?._cursor||0):0})),messages:settled.flatMap(r=>r.status==='fulfilled'?r.value:[]),complete:settled.every(r=>r.status==='fulfilled')};}
export function saneMessage(m, uuid, type) { return m && m.type===type && m.protocolVersion===1 && m.sessionId===uuid && typeof m.signature==='string' && typeof m.publishedAt==='string'; }
export async function trustedConfigs(messages, uuid, trust) {
  const valid=[];
  for (const m of messages) {
    if (!saneMessage(m,uuid,m.type) || m.type!=='PUBLIC_KEY' || !m.adminSigningPublicKeyJwk) continue;
    if (await keyFingerprint(m.adminSigningPublicKeyJwk)!==trust || m.signingKeyFingerprint!==trust || !(await verify(m,m.adminSigningPublicKeyJwk))) continue;
    valid.push(m);
  }
  const latest = type => valid.filter(x=>x.type===type).sort((a,b)=>Date.parse(a.publishedAt)-Date.parse(b.publishedAt)).at(-1);
  return { publicKey:latest('PUBLIC_KEY') };
}

export function parseSheetUrl(raw) {
  const url = new URL(raw); if (url.protocol!=='https:' || url.hostname!=='docs.google.com') throw new Error('Use uma URL HTTPS do Google Planilhas.');
  const m=url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/); if(!m) throw new Error('URL da planilha inválida.');
  const gid=url.searchParams.get('gid') || new URLSearchParams(url.hash.slice(1)).get('gid') || '0'; if(!/^\d+$/.test(gid)) throw new Error('gid inválido.');
  return {sheetId:m[1],sheetGid:gid,sheetUrl:`https://docs.google.com/spreadsheets/d/${m[1]}/edit?gid=${gid}#gid=${gid}`};
}
function csvRows(text) {
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i]; if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}
  row.push(field.replace(/\r$/,'')); if(row.some(Boolean)||rows.length===0)rows.push(row); return rows;
}
const norm=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export async function parseBallot(csv) {
  const rows=csvRows(csv); if(norm(rows[2]?.[2])!=='0'&&norm(rows[2]?.[2])!=='1') throw new Error('C3 deve conter 0 ou 1.');
  const questions=[]; let i=5;
  while(i<rows.length){ while(i<rows.length && !rows[i].slice(0,5).some(x=>norm(x))) i++; if(i>=rows.length)break;
    const title=String(rows[i][1]??'').trim(); if(!title)throw new Error(`Pergunta inválida na linha ${i+1}.`); i++;
    if(i>=rows.length||!norm(rows[i][1]))throw new Error(`Pergunta "${title}" sem opções.`);
    const first=i,count=Number(rows[first][2]),shuffle=String(rows[first][3]??'').trim(),opts=[];let showImages=String(rows[first][4]??'').trim(),imageMarker=-1;
    while(i<rows.length&&rows[i].slice(0,5).some(x=>norm(x))){const columnC=norm(rows[i][2]);if(!norm(rows[i][1])){if(imageMarker>=0&&i===imageMarker+1&&['0','1'].includes(columnC)){showImages=String(rows[i][2]).trim();i++;continue;}throw new Error(`Opção vazia em "${title}".`);}if(columnC.includes('mostrar imagens')){if(imageMarker!==-1)throw new Error(`Configuração de imagens repetida em "${title}".`);imageMarker=i;}const image=String(rows[i][0]??'').trim();if(image){let u;try{u=new URL(image);}catch{throw new Error(`Imagem inválida em "${title}".`);}if(u.protocol!=='https:')throw new Error(`Imagem inválida em "${title}".`);}opts.push({text:String(rows[i][1]).trim(),image});i++;}
    if(!showImages&&imageMarker>=0)showImages=String(rows[imageMarker+1]?.[2]??'').trim();
    for(let row=first;row<i;row++){const allowedC=row===first||row===imageMarker||row===imageMarker+1,allowedD=row===first,allowedE=row===first;if((!allowedC&&norm(rows[row][2]))||(!allowedD&&norm(rows[row][3]))||(!allowedE&&norm(rows[row][4])))throw new Error(`Configuração inesperada em "${title}".`);}
    if(opts.length<2||!Number.isInteger(count)||count<1||count>opts.length||!['0','1'].includes(shuffle)||!['0','1'].includes(showImages)||new Set(opts.map(o=>norm(o.text))).size!==opts.length)throw new Error(`Bloco inválido: ${title}.`);
    const questionId=await sha(`${questions.length}\n${norm(title)}`),options=[];for(let x=0;x<opts.length;x++)options.push({id:await sha(`${questionId}\n${x}\n${norm(opts[x].text)}\n${opts[x].image}`),...opts[x]});
    questions.push({id:questionId,text:title,count,shuffle:shuffle==='1',showImages:showImages==='1',options});
  }
  if(!questions.length)throw new Error('Nenhuma pergunta encontrada.');
  const canonicalBallot=questions.map(q=>({id:q.id,text:norm(q.text),count:q.count,shuffle:q.shuffle,showImages:q.showImages,options:q.options.map(o=>({id:o.id,text:norm(o.text),image:o.image}))}));
  const validated=[];for(let r=1;r<rows.length;r++){const value=String(rows[r]?.[5]??'').trim(),m=value.match(/^(.*)-([A-Za-z0-9_-]{43})$/);if(m&&m[1].trim())validated.push({name:m[1].trim(),deviceId:m[2]});}
  const columnH=rows.map((r,index)=>index?r[7]:'').filter(v=>norm(v)),columnF=rows.map((r,index)=>index?r[5]:'').filter(v=>/^https:\/\/script\.google\.com\/macros\/s\//i.test(String(v).trim()));
  const endpoints=validateEndpoints(columnH.length?columnH:columnF);
  return {state:String(rows[2][2]).trim(),questions,ballotFingerprint:await sha(canonical(canonicalBallot)),validated,endpoints,rows};
}
export async function fetchSheet(sheetId,gid='0') {
  let r;
  try { r=await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`,{cache:'no-store'}); }
  catch (error) {
    if (error?.message?.startsWith('A requisição demorou demais.')) throw error;
    throw new Error('Não foi possível acessar a planilha. Confira o link e libere a leitura para qualquer pessoa com o link.');
  }
  if(!r.ok)throw new Error(`Planilha indisponível (${r.status}). Confira o link e o compartilhamento público.`);
  return parseBallot(await r.text());
}
export function validName(value) { const s=String(value).normalize('NFC').trim().replace(/\s+/g,' '); if(s.length<2||s.length>120||s.split(' ').length<2||!/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)+$/u.test(s))throw new Error('Informe nome e sobrenome usando apenas letras.'); return s; }
export function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const max=0x100000000-(0x100000000%(i+1));let n;do n=crypto.getRandomValues(new Uint32Array(1))[0];while(n>=max);const j=n%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export async function encryptVote(payload,pubPem){const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,te.encode(JSON.stringify(payload)));const raw=await crypto.subtle.exportKey('raw',aes);const encryptedKey=await crypto.subtle.encrypt({name:'RSA-OAEP'},await importRsaPublic(pubPem),raw);return {encryptedKey:b64(encryptedKey),iv:b64(iv),ciphertext:b64(ciphertext)};}
export async function decryptVote(message,privPem){const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},await importRsaPrivate(privPem),unb64(message.encryptedKey));const aes=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);return JSON.parse(td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(message.iv)},aes,unb64(message.ciphertext))));}

export function el(tag,attrs={},...children){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),v);else if(v!==false)n.setAttribute(k,v===true?'':v);}for(const c of children.flat())n.append(c?.nodeType?c:document.createTextNode(String(c??'')));return n;}
export function modal(title,content,opener){const shade=el('div',{class:'modal-shade'}),box=el('section',{class:'modal',role:'dialog','aria-modal':'true','aria-labelledby':'modal-title'}),h=el('h2',{id:'modal-title',text:title}),close=el('button',{class:'secondary',type:'button',text:'Fechar'});box.append(h,content,close);shade.append(box);document.body.append(shade);const focusables=()=>[...box.querySelectorAll('button,input,textarea,a[href]')].filter(x=>!x.disabled);function done(){shade.remove();opener?.focus();}close.onclick=done;shade.onclick=e=>{if(e.target===shade)done();};shade.onkeydown=e=>{if(e.key==='Escape')done();if(e.key==='Tab'){const f=focusables(),a=f[0],z=f.at(-1);if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}};queueMicrotask(()=>close.focus());return {close:done,box};}
