# Eleições — aplicação estática

Aplicação de votação criptografada para GitHub Pages, implementada conforme as
[Specs 001, 002 e 003](specs/README.md). Os endpoints são descobertos na coluna
H da planilha mestre e cada um mantém uma guia append-only por UUID.

## Executar localmente

```bash
npm test
npm run serve
```

Abra `http://localhost:8087/servidor/` e siga os três passos. Antes da votação,
implante uma ou mais cópias de [Code.gs](google-apps-script/Code.gs), execute
`configurar()` em cada planilha de canal e coloque as URLs `/exec` na coluna H
da planilha mestre.

O Apps Script cria uma guia com o UUID para cada sessão. Publique o Web App para
execução pela conta proprietária e acesso público; nenhuma credencial é colocada no site.
Faça um teste de carga com a capacidade planejada antes do uso em produção.

Em desenvolvimento, use exatamente `localhost` (não `0.0.0.0`), que o navegador
trata como origem segura. Fora da máquina local, o site precisa ser servido por
HTTPS para o Web Crypto e a área de transferência. Não abra os HTMLs diretamente
pelo sistema de arquivos.
