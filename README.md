# Eleições — aplicação estática

Aplicação de votação criptografada para GitHub Pages, implementada conforme a
[Spec 001](specs/001-votacao-github-pages/spec.md).

## Executar localmente

```bash
npm test
npm run serve
```

Abra `http://localhost:8080/servidor/?uuid=<uuid-válido>`. Para produção, altere
`NTFY_BASE` em `shared/common.js` para a instância ntfy dedicada e ajuste os
domínios `connect-src` da CSP nos três HTMLs.

Em desenvolvimento, use exatamente `localhost` (não `0.0.0.0`), que o navegador
trata como origem segura. Fora da máquina local, o site precisa ser servido por
HTTPS para o Web Crypto e a área de transferência. Não abra os HTMLs diretamente
pelo sistema de arquivos.
