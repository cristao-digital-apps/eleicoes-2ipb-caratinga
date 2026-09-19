export const PROTOCOL_VERSION = 1;
export const NTFY_BASE = 'https://ntfy.sh'; // Troque pela instância dedicada em produção.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const FP_RE = /^[A-Za-z0-9_-]{43}$/;
export const te = new TextEncoder();
export const td = new TextDecoder();

export function sessionFromLocation({ fingerprint = false } = {}) {
  const params = new URLSearchParams(location.search);
  const values = params.getAll('uuid');
  if (values.length !== 1) return null;
  const uuid = values[0].toLowerCase();
  if (!UUID_RE.test(uuid)) return null;
  if (!fingerprint) return { uuid };
  const hash = new URLSearchParams(location.hash.slice(1));
  const keys = hash.getAll('k');
  if (keys.length !== 1 || !FP_RE.test(keys[0])) return null;
  return { uuid, trust: keys[0] };
}

export const storage = uuid => ({
  get(name) { try { return localStorage.getItem(`eleicoes:v1:${uuid}:${name}`); } catch { return null; } },
  set(name, value) { localStorage.setItem(`eleicoes:v1:${uuid}:${name}`, value); },
  json(name) { try { return JSON.parse(this.get(name)); } catch { return null; } },
  put(name, value) { this.set(name, JSON.stringify(value)); }
});

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
export async function publish(uuid, message) {
  // Na URL do tópico, o ntfy trata o corpo como a mensagem somente no formato
  // texto. O formato application/json é reservado à API da URL raiz do ntfy.
  const res = await fetch(`${NTFY_BASE}/${uuid}`, { method:'POST', headers:{'Content-Type':'text/plain; charset=utf-8'}, body:JSON.stringify(message) });
  if (!res.ok) throw new Error(`ntfy respondeu ${res.status}.`); return res;
}
export async function history(uuid, since='all') {
  const res = await fetch(`${NTFY_BASE}/${uuid}/json?poll=1&since=${encodeURIComponent(since)}`, {headers:{Accept:'application/x-ndjson'}});
  if (!res.ok) throw new Error(`Não foi possível consultar o tópico (${res.status}).`);
  if (res.headers.get('X-Messages-Truncated') === '1') throw new Error('Histórico remoto incompleto.');
  const text = await res.text(); return text.split(/\r?\n/).filter(Boolean).flatMap(line => { try {
    const n=JSON.parse(line), m=JSON.parse(n.message);
    // Metadados de transporte não pertencem à mensagem assinada e, portanto,
    // não podem participar da enumeração usada por signedPayload().
    Object.defineProperties(m,{_ntfyId:{value:n.id,enumerable:false},_ntfyTime:{value:n.time,enumerable:false}});
    return [m];
  } catch { return []; } });
}
export function saneMessage(m, uuid, type) { return m && m.type===type && m.protocolVersion===1 && m.sessionId===uuid && typeof m.signature==='string' && typeof m.publishedAt==='string'; }
export async function trustedConfigs(messages, uuid, trust) {
  const valid=[];
  for (const m of messages) {
    if (!saneMessage(m,uuid,m.type) || !['PUBLIC_KEY','SPREADSHEET'].includes(m.type) || !m.adminSigningPublicKeyJwk) continue;
    if (await keyFingerprint(m.adminSigningPublicKeyJwk)!==trust || m.signingKeyFingerprint!==trust || !(await verify(m,m.adminSigningPublicKeyJwk))) continue;
    valid.push(m);
  }
  const latest = type => valid.filter(x=>x.type===type).sort((a,b)=>Date.parse(a.publishedAt)-Date.parse(b.publishedAt)).at(-1);
  return { publicKey:latest('PUBLIC_KEY'), spreadsheet:latest('SPREADSHEET') };
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
  const rows=csvRows(csv); if(norm(rows[2]?.[1])!=='0'&&norm(rows[2]?.[1])!=='1') throw new Error('B3 deve conter 0 ou 1.');
  const questions=[]; let i=5;
  while(i<rows.length){ while(i<rows.length && !rows[i].slice(0,3).some(x=>norm(x))) i++; if(i>=rows.length)break;
    const title=String(rows[i][0]??'').trim(); if(!title)throw new Error(`Pergunta inválida na linha ${i+1}.`); i++;
    if(i>=rows.length||!norm(rows[i][0]))throw new Error(`Pergunta "${title}" sem opções.`);
    const count=Number(rows[i][1]), shuffle=String(rows[i][2]??'').trim(); const opts=[];
    while(i<rows.length&&rows[i].slice(0,3).some(x=>norm(x))){ if(!norm(rows[i][0]))throw new Error(`Opção vazia em "${title}".`); if(opts.length&& (norm(rows[i][1])||norm(rows[i][2])))throw new Error(`Configuração inesperada em "${title}".`); opts.push(String(rows[i][0]).trim()); i++; }
    if(opts.length<2||!Number.isInteger(count)||count<1||count>opts.length||!['0','1'].includes(shuffle)||new Set(opts.map(norm)).size!==opts.length)throw new Error(`Bloco inválido: ${title}.`);
    const questionId=await sha(`${questions.length}\n${norm(title)}`); const options=[]; for(let x=0;x<opts.length;x++)options.push({id:await sha(`${questionId}\n${x}\n${norm(opts[x])}`),text:opts[x]});
    questions.push({id:questionId,text:title,count,shuffle:shuffle==='1',options});
  }
  if(!questions.length)throw new Error('Nenhuma pergunta encontrada.');
  const canonicalBallot=questions.map(q=>({id:q.id,text:norm(q.text),count:q.count,shuffle:q.shuffle,options:q.options.map(o=>({id:o.id,text:norm(o.text)}))}));
  const validated=[]; for(let r=1;r<rows.length;r++){const value=String(rows[r]?.[4]??'').trim(),m=value.match(/^(.*)-([A-Za-z0-9_-]{43})$/);if(m&&m[1].trim())validated.push({name:m[1].trim(),deviceId:m[2]});}
  return {state:String(rows[2][1]).trim(),questions,ballotFingerprint:await sha(canonical(canonicalBallot)),validated,rows};
}
export async function fetchSheet(sheetId,gid) {
  let r;
  try { r=await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`,{cache:'no-store'}); }
  catch { throw new Error('Não foi possível acessar a planilha. Confira o link e libere a leitura para qualquer pessoa com o link.'); }
  if(!r.ok)throw new Error(`Planilha indisponível (${r.status}). Confira o link e o compartilhamento público.`);
  return parseBallot(await r.text());
}
export function validName(value) { const s=String(value).normalize('NFC').trim().replace(/\s+/g,' '); if(s.length<2||s.length>120||s.split(' ').length<2||!/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)+$/u.test(s))throw new Error('Informe nome e sobrenome usando apenas letras.'); return s; }
export function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const max=0x100000000-(0x100000000%(i+1));let n;do n=crypto.getRandomValues(new Uint32Array(1))[0];while(n>=max);const j=n%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export async function encryptVote(payload,pubPem){const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,te.encode(JSON.stringify(payload)));const raw=await crypto.subtle.exportKey('raw',aes);const encryptedKey=await crypto.subtle.encrypt({name:'RSA-OAEP'},await importRsaPublic(pubPem),raw);return {encryptedKey:b64(encryptedKey),iv:b64(iv),ciphertext:b64(ciphertext)};}
export async function decryptVote(message,privPem){const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},await importRsaPrivate(privPem),unb64(message.encryptedKey));const aes=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);return JSON.parse(td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(message.iv)},aes,unb64(message.ciphertext))));}

export function el(tag,attrs={},...children){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),v);else if(v!==false)n.setAttribute(k,v===true?'':v);}for(const c of children.flat())n.append(c?.nodeType?c:document.createTextNode(String(c??'')));return n;}
export function modal(title,content,opener){const shade=el('div',{class:'modal-shade'}),box=el('section',{class:'modal',role:'dialog','aria-modal':'true','aria-labelledby':'modal-title'}),h=el('h2',{id:'modal-title',text:title}),close=el('button',{class:'secondary',type:'button',text:'Fechar'});box.append(h,content,close);shade.append(box);document.body.append(shade);const focusables=()=>[...box.querySelectorAll('button,input,textarea,a[href]')].filter(x=>!x.disabled);function done(){shade.remove();opener?.focus();}close.onclick=done;shade.onclick=e=>{if(e.target===shade)done();};shade.onkeydown=e=>{if(e.key==='Escape')done();if(e.key==='Tab'){const f=focusables(),a=f[0],z=f.at(-1);if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}};queueMicrotask(()=>close.focus());return {close:done,box};}
