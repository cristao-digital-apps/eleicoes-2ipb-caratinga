# Eleições — aplicação estática

Aplicação de votação criptografada para GitHub Pages, implementada conforme as
[Specs 001 a 004](specs/README.md). Os endpoints são descobertos na coluna H e
mantêm configuração, autorizações e votos em tabelas privadas do protocolo 2.

## Executar localmente

```bash
npm test
npm run serve
```

Abra `http://localhost:8087/servidor/` e siga os três passos. Antes da votação,
implante uma ou mais cópias de [Code.gs](google-apps-script/Code.gs), execute
`configurar()` em cada planilha de canal e coloque as URLs `/exec` na coluna H
da planilha mestre.

O Apps Script só cria armazenamento após o registro administrativo assinado.
Execute `configurar()` novamente após implantar esta versão. Sessões antigas são
incompatíveis e devem receber um UUID novo. Publique o Web App para execução pela
conta proprietária e acesso público; nenhuma credencial administrativa vai no QR.
Faça um teste de carga com a capacidade planejada antes do uso em produção.

Em desenvolvimento, use exatamente `localhost` (não `0.0.0.0`), que o navegador
trata como origem segura. Fora da máquina local, o site precisa ser servido por
HTTPS para o Web Crypto e a área de transferência. Não abra os HTMLs diretamente
pelo sistema de arquivos.
