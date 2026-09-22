import QRCode from './vendor/qrcode/index.js';
import QRErrorCorrectLevel from './vendor/qrcode/QRErrorCorrectLevel.js';
import {el,modal} from './common.js';

export function votingUrl({uuid,sheetId,trust}){
  const url=new URL('../cliente/',location.href);
  url.search='';
  url.searchParams.set('uuid',uuid);
  url.searchParams.set('sheet-id',sheetId);
  url.hash=`k=${trust}`;
  return url;
}

export function renderQr(target,url,size){
  try{
    const qr=new QRCode(-1,QRErrorCorrectLevel.M);
    qr.addData(Array.from(new TextEncoder().encode(url),byte=>String.fromCharCode(byte)).join(''));
    qr.make();
    const count=qr.getModuleCount(),quiet=4,canvas=el('canvas',{'aria-label':'QR code para abrir a página de votação',role:'img'});
    canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas indisponível.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
    ctx.fillStyle='#000';
    const step=size/(count+quiet*2);
    for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col)){
      const x=Math.round((col+quiet)*step),y=Math.round((row+quiet)*step);
      ctx.fillRect(x,y,Math.round((col+quiet+1)*step)-x,Math.round((row+quiet+1)*step)-y);
    }
    target.replaceChildren(canvas);
  }catch{
    target.replaceChildren(el('p',{class:'error',text:'Não foi possível gerar o QR code. Use o botão Link ou copie o endereço ao abrir a página.'}));
  }
}

export function showQrLink(title,url,opener,{large=false}={}){
  const href=String(url),qr=el('div',{class:`qr-display${large?' qr-display-large':''}`}),link=el('a',{class:'button',href,target:'_blank',rel:'noopener',text:'Link'});
  const svgNs='http://www.w3.org/2000/svg',icon=document.createElementNS(svgNs,'svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20','aria-hidden':'true',focusable:'false'}))icon.setAttribute(key,value);
  const rect=document.createElementNS(svgNs,'rect'),path=document.createElementNS(svgNs,'path');
  for(const [key,value] of Object.entries({x:'8',y:'8',width:'12',height:'12',rx:'2',fill:'none',stroke:'currentColor','stroke-width':'2'}))rect.setAttribute(key,value);
  for(const [key,value] of Object.entries({d:'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',fill:'none',stroke:'currentColor','stroke-width':'2'}))path.setAttribute(key,value);
  icon.append(rect,path);
  const copy=el('button',{type:'button',class:'copy-link','aria-label':'Copiar link',title:'Copiar link'},icon),status=el('p',{class:'status','aria-live':'polite'});
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(href);status.className='status ok';status.textContent='Link copiado.';}catch{status.className='status error';status.textContent='Não foi possível copiar o link. Abra o Link e copie o endereço do navegador.';}};
  const content=el('div',{},qr,el('div',{class:'share-actions'},link,copy),status);
  modal(title,content,opener);
  renderQr(qr,href,large?500:300);
}
