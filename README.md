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

As questões podem começar na primeira linha (título na coluna B), ou manter o
formato antigo a partir da linha 6. Endpoints podem estar na coluna H desde H1.
Depois de publicar a chave, use **Iniciar Votação** no administrador: o comando
é gravado em todos os endpoints, e C3 não abre mais a votação. Atualize e
reimplante cada Web App do Apps Script para aceitar o comando `VOTING_START`.

Para visualizar o painel com dados fictícios, abra
`http://localhost:8087/painel/preview.html`. A prévia permite escolher de 1 a
2.000 eleitores e quantos aparecem como votados, sem acessar a votação real.

O Apps Script cria uma guia com o UUID para cada sessão. Publique o Web App para
execução pela conta proprietária e acesso público; nenhuma credencial é colocada no site.
Faça um teste de carga com a capacidade planejada antes do uso em produção.

Em desenvolvimento, use exatamente `localhost` (não `0.0.0.0`), que o navegador
trata como origem segura. Fora da máquina local, o site precisa ser servido por
HTTPS para o Web Crypto e a área de transferência. Não abra os HTMLs diretamente
pelo sistema de arquivos.
