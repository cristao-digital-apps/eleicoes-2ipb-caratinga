# Especificações do projeto

Este diretório reúne as especificações usadas no desenvolvimento orientado por
especificações (Spec-Driven Development). Nenhum arquivo desta pasta é código de
produção.

## Especificações

- [`001-votacao-github-pages/spec.md`](001-votacao-github-pages/spec.md) — aplicação
  estática de votação, com páginas de servidor, cliente e painel, Google Sheets,
  ntfy e criptografia assimétrica.
- [`002-canais-google-sheets/spec.md`](002-canais-google-sheets/spec.md) — substituição
  do ntfy por três canais Google Sheets independentes, com divisão equilibrada
  dos eleitores e agregação no servidor e no painel.
- [`003-sessao-planilha-endpoints/spec.md`](003-sessao-planilha-endpoints/spec.md) —
  assistente de início da sessão, `sheet-id` na URL, descoberta dos endpoints na
  coluna G e uma guia por sessão em cada planilha de canal.

## Fluxo de trabalho sugerido

1. revisar e aprovar a especificação;
2. transformar os pontos marcados como decisão pendente em decisões explícitas;
3. criar tarefas de implementação a partir dos critérios de aceite;
4. implementar uma tarefa por vez, sem alterar silenciosamente a especificação;
5. manter nesta pasta o histórico das decisões relevantes.
