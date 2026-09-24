import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const server=await readFile(new URL('../servidor/app.js',import.meta.url),'utf8');
const panel=await readFile(new URL('../painel/app.js',import.meta.url),'utf8');
const sharing=await readFile(new URL('../shared/qr-link.js',import.meta.url),'utf8');

test('administração usa o modal compartilhado nos links emitidos',()=>{
  assert.match(server,/import \{showQrLink\} from '\.\.\/shared\/qr-link\.js'/);
  assert.match(server,/showQrLink\(title,u,opener\)/);
});

test('painel oferece QR da votação pelo modal compartilhado',()=>{
  assert.match(panel,/text:'QR code da votação'/);
  assert.match(panel,/showQrLink\('Página de votação'/);
  assert.match(panel,/adminSigningKeyFingerprint/);
});

test('modal compartilhado contém link, cópia e QR',()=>{
  assert.match(sharing,/text:'Link'/);
  assert.match(sharing,/'aria-label':'Copiar link'/);
  assert.match(sharing,/renderQr\(qr,href,/);
});
