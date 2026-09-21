# Spec 002 — Três canais de mensagens em Google Sheets

- **Estado:** proposta para revisão
- **Revisão:** 2
- **Depende de:** Spec 001
- **Tipo:** alteração de transporte, sem alteração das regras eleitorais
- **Implementação nesta etapa:** nenhuma

## 1. Objetivo

Substituir o ntfy por três canais independentes baseados em Google Sheets, cada
um pertencente a uma conta Google diferente. A quantidade planejada de eleitores
será dividida da forma mais equilibrada possível entre os três canais.

Esta especificação altera somente o transporte e a agregação das mensagens. São
preservados, salvo incompatibilidade expressamente indicada aqui:

- páginas servidor, cliente e painel;
- UUID da sessão e âncora de confiança `#k=`;
- formatos, assinaturas e validações das mensagens da Spec 001;
- criptografia híbrida e sigilo das escolhas;
- identificação por chave do aparelho;
- cédula, validação nominal, voto único, apuração e relatório;
- consulta do cliente em espera a cada 20 segundos;
- primeira verificação automática 5 segundos após pedir validação;
- atualização do painel a cada 5 segundos;
- até seis verificações do voto, separadas por 1,5 segundo;
- comportamento de falha fechada.

Não existe limite funcional fixo de 35 eleitores por canal. Para `N` eleitores, a
distribuição planejada deve manter diferença máxima de uma pessoa entre o maior e
o menor grupo. Por exemplo, 105 resulta em 35/35/35 e 200 resulta em 67/67/66. A
capacidade de cada implantação deve ser validada em teste de carga para o maior
`N` pretendido; ela não é uma garantia oferecida pelo Google.

## 2. Relação com a Spec 001

Esta spec substitui as referências ao ntfy nas seções 1, 3, 4, 9, 11, 12, 15,
16 e 17 da Spec 001. As demais disposições continuam válidas.

Onde a Spec 001 disser:

- “tópico ntfy”, entende-se o conjunto dos três canais da sessão;
- “ID ntfy”, entende-se o cursor imutável da linha do canal;
- “histórico ntfy”, entende-se o histórico ordenado e completo do canal;
- “publicar no ntfy”, entende-se anexar atomicamente uma mensagem ao canal;
- “varrer o tópico”, entende-se ler incrementalmente um ou os três canais,
  conforme o papel da página.

Nenhuma mudança de transporte pode alterar o conteúdo assinado de uma mensagem
existente. Metadados criados pelo canal não participam da assinatura.

## 3. Topologia e isolamento

Cada sessão possui exatamente três canais:

| Canal | Conta proprietária | Parcela planejada | Leitores clientes |
|---|---|---:|---|
| `1` | conta Google A | aproximadamente `N/3` | somente grupo 1 |
| `2` | conta Google B | aproximadamente `N/3` | somente grupo 2 |
| `3` | conta Google C | aproximadamente `N/3` | somente grupo 3 |

Cada canal deve estar em conta Google diferente e usar implantação, credenciais e
projeto Google independentes sempre que a plataforma permitir. Compartilhar uma
service account, implantação ou identidade de execução entre os três canais não
é considerado isolamento válido.

Os canais são partições, não réplicas:

- uma `NAME_REQUEST` ou `VOTE` pertence a exatamente um canal;
- mensagens administrativas são publicadas nos três canais;
- servidor e painel leem os três canais e produzem uma visão agregada;
- cliente lê e escreve somente em seu canal atribuído;
- indisponibilidade de um canal não autoriza redirecionar silenciosamente um
  cliente a outro canal.

## 4. Manifesto dos canais

O servidor mantém um manifesto da sessão com, para cada canal:

- número `1`, `2` ou `3`;
- identificador da planilha;
- identificador da aba de mensagens;
- URL HTTPS de leitura;
- URL HTTPS de publicação;
- identificador da implantação;
- chave pública ou impressão digital usada para autenticar a resposta do canal,
  caso exista uma camada de publicação;
- estado operacional, última leitura bem-sucedida e último cursor persistido.

O manifesto não contém segredo de escrita utilizável pelo navegador. Chaves de
API, tokens OAuth e credenciais de conta Google nunca aparecem no repositório,
HTML, JavaScript entregue ao cliente, URL, QR Code, planilha pública ou cache do
cliente.

O manifesto é validado integralmente antes de qualquer publicação. Devem ser
rejeitados canais repetidos, URLs fora de HTTPS, identificadores malformados e
configuração com menos ou mais de três canais.

## 5. Atribuição dos eleitores

### 5.1 Links e QR Codes

O servidor oferece três links e três QR Codes distintos. O link do cliente inclui
um parâmetro explícito `channel=1`, `channel=2` ou `channel=3`, além do UUID e da
âncora `#k=` já exigidos.

Exemplo:

```text
/cliente/?uuid=550e8400-e29b-41d4-a716-446655440000&channel=2#k=<fingerprint>
```

O parâmetro é validado antes de ler cache ou rede. Ausência, repetição, valor fora
de `1..3` ou sintaxe inválida causa a mesma falha fechada aplicável ao UUID.

### 5.2 Permanência no canal

Na primeira inicialização válida, o cliente grava o canal no namespace local da
sessão. Depois de publicar `NAME_REQUEST`, o canal fica preso ao `deviceId`:

- recarregar a página não altera o canal;
- abrir link de outro canal com o mesmo estado local apresenta erro e não publica;
- editar o nome não altera o canal;
- repetir um voto mantém o mesmo canal e `ballotId`;
- servidor rejeita o mesmo `deviceId`, `requestId` ou `ballotId` observado em mais
  de um canal.

A distribuição é calculada a partir do total planejado `N`. Antes de entregar os
QRs/links, o servidor informa as metas de cada grupo, usando quociente e resto:

```text
base = floor(N / 3)
resto = N mod 3
```

Os primeiros `resto` canais recebem `base + 1` pessoas e os demais recebem
`base`. Assim, 200 pessoas são distribuídas como 67/67/66. O administrador
entrega os três links respeitando essas metas, e o servidor mostra quantidade
planejada e quantidade observada por canal.

A meta serve para balanceamento, não como limite rígido do protocolo. Ultrapassá-
la gera alerta operacional e orienta o administrador a usar o canal menos ocupado
para os próximos participantes, mas não invalida automaticamente um aparelho já
vinculado nem rejeita seu voto. Depois da publicação de `NAME_REQUEST`, não há
migração automática entre canais.

## 6. Contrato físico de cada canal

Cada planilha possui uma aba exclusiva de mensagens, separada da cédula e das
pessoas validadas. A aba é um log append-only com uma linha de cabeçalho e uma
linha por mensagem aceita.

Colunas mínimas:

| Coluna | Conteúdo |
|---|---|
| A | cursor inteiro crescente e imutável |
| B | UUID da sessão |
| C | número do canal |
| D | tipo da mensagem |
| E | identificador idempotente |
| F | instante de recebimento atribuído pelo canal |
| G | JSON integral recebido, como texto |
| H | hash SHA-256 do JSON recebido |

O identificador idempotente é:

- impressão digital administrativa mais tipo, para `PUBLIC_KEY` e `SPREADSHEET`;
- `requestId`, para `NAME_REQUEST`;
- `ballotId`, para `VOTE`.

Fórmulas, gatilhos, ordenação manual e edição humana não podem atuar sobre a aba
de mensagens durante uma sessão. Células recebidas são gravadas como texto e
nunca interpretadas como fórmula. O canal rejeita conteúdo iniciado por `=`, `+`,
`-` ou `@` quando ele não estiver encapsulado exclusivamente dentro do JSON
validado.

Uma mensagem aceita nunca é atualizada nem removida. Correções são novas
mensagens assinadas. Cursor, JSON e hash tornam alterações posteriores
detectáveis; divergência bloqueia confirmação e apuração.

## 7. Publicação

Planilhas não recebem escrita anônima diretamente. Cada conta oferece um endpoint
HTTPS mínimo, por exemplo um Web App do Apps Script, que executa como a conta
proprietária e possui permissão somente sobre seu canal.

O endpoint:

1. aceita somente `POST` e corpo JSON com limite documentado;
2. valida tamanho, esquema básico, `sessionId`, tipo e canal;
3. calcula o identificador idempotente e o hash;
4. obtém bloqueio exclusivo da planilha;
5. procura uma publicação anterior com o mesmo identificador;
6. se idêntica, devolve o mesmo recibo sem criar outra linha;
7. se conflitante, rejeita;
8. reserva o próximo cursor e anexa uma única linha atomicamente;
9. força persistência antes de responder;
10. devolve recibo contendo canal, cursor, identificador, hash e instante.

O recibo de transporte não substitui a regra existente de o cliente localizar o
próprio `VOTE` no histórico. Permanecem as seis verificações com intervalo de 1,5
segundo. O recibo pode orientar a leitura a partir do cursor correspondente, sem
alterar número ou intervalo das tentativas.

Publicações concorrentes são serializadas por canal. Respostas de limite,
contenção ou indisponibilidade não podem produzir sucesso falso. Retentativas
reutilizam o mesmo identificador e conteúdo assinado.

## 8. Leitura e histórico incremental

O endpoint de leitura devolve registros depois de um cursor informado, em ordem
crescente, com paginação e indicação inequívoca de continuação. A primeira carga
usa cursor zero e reconstrói todo o histórico da sessão daquele canal.

Cada página guarda por canal:

- último cursor persistido;
- registros validados necessários;
- hash conhecido de cada cursor;
- instante da última sincronização completa.

O cursor só avança depois de o lote ser validado e persistido. Linhas repetidas
são deduplicadas por canal e cursor. Buraco na sequência, cursor reutilizado,
mudança de hash, página truncada ou mensagem alegadamente pertencente a outro
canal é falha de integridade.

O servidor e o painel consultam os três canais em paralelo, mantendo cursores
independentes. Falha em um canal não apaga o estado dos outros, mas a visão passa
a indicar explicitamente qual canal está desatualizado. Apuração e resultado
final exigem sincronização íntegra dos três.

O cliente consulta somente seu canal. São mantidos sem alteração:

- primeira consulta automática 5 segundos depois de `NAME_REQUEST`;
- espera posterior com consultas a cada 20 segundos;
- consulta anterior ao envio do voto;
- até seis consultas após o envio, separadas por 1,5 segundo.

O painel inicia uma rodada a cada 5 segundos e, em cada rodada, consulta os três
canais. Uma rodada anterior ainda em andamento não é sobreposta por outra.

## 9. Mensagens administrativas e consistência

`PUBLIC_KEY` e `SPREADSHEET` são publicadas nos três canais com conteúdo assinado
idêntico. Metadados de transporte podem diferir.

Servidor, cliente e painel só aceitam configuração quando:

- a assinatura administrativa é válida e ancorada por `#k=`;
- o `sessionId` coincide;
- a configuração mais recente do canal é internamente válida;
- as configurações válidas mais recentes dos três canais têm a mesma impressão
  digital, quando a página possui acesso aos três.

O cliente pode operar vendo apenas seu canal, mas o servidor não libera os links
como prontos enquanto a configuração não tiver sido confirmada nos três.

Uma publicação administrativa que obtenha sucesso parcial deixa a sessão em
estado **configuração divergente**. O servidor tenta novamente apenas nos canais
faltantes usando a mesma mensagem assinada e o mesmo identificador idempotente.
Enquanto houver divergência, novos votos são bloqueados e as telas informam os
canais afetados.

## 10. Validação de pessoas

O servidor agrega `NAME_REQUEST` dos três canais em uma lista única, mantendo o
número do canal visível em cada registro administrativo.

Uma pessoa validada fica vinculada a `deviceId` e canal. A autorização usada para
aceitar o voto deve preservar esse vínculo. Se as três planilhas mantiverem listas
separadas, cada pessoa aparece somente na planilha correspondente. Se existir uma
cédula mestra replicada, as réplicas devem produzir o mesmo
`ballotFingerprint`.

Mesmo nome pode existir em canais diferentes somente quando representar pessoas
distintas deliberadamente validadas. O servidor destaca nomes duplicados para
decisão humana, como já ocorre com pedidos suspeitos.

## 11. Votos, painel e apuração

Cada `VOTE` é aceito somente no canal atribuído ao `deviceId`. Todas as verificações
da Spec 001 continuam obrigatórias: assinatura do aparelho, autorização nominal,
impressão da chave RSA, impressão da cédula, esquema criptográfico e unicidade.

A unicidade é global, não apenas por planilha:

- apenas o primeiro voto válido por `deviceId` conta;
- apenas um envelope por `ballotId` conta;
- duplicata idêntica em outro canal não aumenta o total;
- conflito entre canais é destacado e bloqueia a apuração daquele aparelho.

O painel agrega os três conjuntos de pessoas e votos e mostra:

```text
X votos de Y registrados
```

Também mostra discretamente o estado de cada canal: atualizado, sincronizando ou
falha operacional. Um canal falho não faz cartões desaparecerem nem transforma
votos em não recebidos; os totais ficam marcados como provisórios até a
reconciliação.

O servidor só inicia a apuração depois de obter históricos completos e íntegros
dos três canais. Os votos válidos são unidos e deduplicados antes da decifragem.
O relatório registra, sem revelar escolhas individuais, a quantidade de pessoas,
mensagens aceitas, votos válidos, rejeições e último cursor de cada canal.

## 12. Limites e disponibilidade

O desenho assume três grupos equilibrados, uma tela servidor e uma tela painel.
Os tempos atuais geram rajadas superiores à média, especialmente após liberação
simultânea e confirmação de votos. Separar contas reduz o domínio de falha, mas
não elimina limites do Google, cache, contenção ou indisponibilidade.

Antes de produção é obrigatório definir a capacidade-alvo `N` e executar teste
com `N` clientes distribuídos pelos três canais segundo a seção 5.2, além das duas
telas agregadoras. O teste preserva exatamente os relógios de 5 segundos, 20
segundos e 1,5 segundo. A implantação só é aprovada se, em três execuções
consecutivas:

- nenhum voto aceito for perdido ou duplicado;
- todos os `N` clientes puderem concluir;
- não houver sucesso falso;
- toda resposta 429/5xx ou timeout for recuperada sem trocar de canal;
- servidor e painel convergirem para o mesmo total;
- a apuração reconstruir integralmente os três históricos;
- limites e duração observados forem registrados no relatório do teste.

Se o teste falhar, a capacidade-alvo `N` não é considerada atendida. Esta spec
proíbe corrigir a falha alterando silenciosamente os intervalos; será necessária
redução formal da capacidade declarada ou revisão explícita da arquitetura ou
desta especificação.

## 13. Segurança e privacidade

- A planilha de mensagens contém dados públicos auxiliares equivalentes aos antes
  expostos no ntfy; nome e identificadores podem ficar visíveis.
- Nome e respostas dentro do voto continuam cifrados conforme a Spec 001.
- As três contas devem usar autenticação multifator e recuperação documentada.
- Cada endpoint tem privilégio somente sobre sua planilha.
- O endpoint não confia no cliente para informar cursor, horário ou canal.
- CORS permite somente as origens de produção e desenvolvimento autorizadas.
- Entrada é tratada como dado, com limites de tamanho e sem avaliação de fórmulas.
- Logs não registram corpo completo de voto, chaves, tokens ou credenciais.
- O administrador não edita a aba append-only durante a votação.
- Backups das três planilhas cobrem toda a duração da sessão e são testados.
- A integridade continua baseada em assinaturas; possuir a conta Google não
  permite fabricar mensagem eleitoral válida sem as chaves correspondentes.

## 14. Estados adicionais

### Servidor

```text
canais incompletos -> configuração bloqueada
publicação parcial -> configuração divergente
ocupação equilibrada -> operação normal
meta do canal ultrapassada -> alerta e distribuição dos próximos no menos ocupado
um canal indisponível -> operação degradada, apuração bloqueada
três históricos íntegros -> apuração permitida
```

### Cliente

```text
canal inválido ou ausente -> página vazia
canal diferente do cache -> erro, sem publicação
meta do canal ultrapassada -> vínculo existente preservado, sem migração automática
histórico incompleto -> voto não confirmado
voto localizado no canal atribuído -> confirmado
```

### Painel

```text
três canais atuais -> total consolidado
rodada em andamento -> não inicia rodada sobreposta
um canal falhou -> último estado preservado e total provisório
reconciliação concluída -> total definitivo atualizado
```

## 15. Critérios de aceite

- [ ] Existem exatamente três canais, pertencentes a contas Google distintas.
- [ ] Cada cliente recebe e persiste um canal entre `1` e `3`.
- [ ] Cliente nunca lê ou publica em canal diferente do atribuído.
- [ ] O total planejado é dividido com diferença máxima de uma pessoa entre canais.
- [ ] A interface mostra meta e ocupação observada de cada canal.
- [ ] Ultrapassar a meta gera alerta, mas não invalida vínculo ou voto existente.
- [ ] Servidor e painel leem e agregam os três canais.
- [ ] Painel inicia atualização dos três canais a cada 5 segundos.
- [ ] Cliente mantém espera de 20 segundos e primeira repetição de 5 segundos.
- [ ] Confirmação mantém até seis leituras separadas por 1,5 segundo.
- [ ] Publicação é append-only, atômica, serializada e idempotente.
- [ ] Credenciais Google não são entregues ao navegador.
- [ ] Mensagens da Spec 001 conservam formato e conteúdo assinado.
- [ ] Configuração administrativa converge identicamente nos três canais.
- [ ] Voto e aparelho são deduplicados globalmente.
- [ ] Falha de um canal fica visível e bloqueia resultado definitivo.
- [ ] Apuração exige os três históricos completos e íntegros.
- [ ] Teste de carga com a capacidade-alvo `N` atende à seção 12 sem mudar os tempos.
- [ ] Nenhuma mudança de código é feita como parte da aprovação desta spec.

## 16. Testes mínimos futuros

- unitários: manifesto, parâmetro `channel`, vínculo de aparelho, divisão por
  quociente e resto, cursor, hash, idempotência e deduplicação global;
- contrato: append atômico, duplicata idêntica, conflito de identificador,
  conteúdo excessivo, fórmula e sessão/canal incorretos;
- histórico: paginação, buraco, linha alterada, cursor repetido, retomada e carga
  inicial integral;
- integração: publicação administrativa tripla, sucesso parcial e reconciliação;
- concorrência: a parcela da capacidade-alvo em pedidos de nome e votos
  simultâneos por canal;
- agregação: servidor e painel com três canais em ordens e latências diferentes;
- falhas: 429, 5xx, timeout, bloqueio ocupado e indisponibilidade de uma conta;
- segurança: CORS, ausência de credenciais no cliente, injeção de fórmula,
  mensagem adulterada e escrita no canal errado;
- carga: `N` navegadores, servidor e painel nos tempos atuais;
- ponta a ponta: validação, votação, confirmação, painel, apuração e relatório com
  participantes distribuídos de forma equilibrada entre os canais.

## 17. Decisões consolidadas

- ntfy será substituído por três canais Google Sheets.
- Os canais pertencem a três contas distintas e recebem parcelas equilibradas da
  quantidade planejada de participantes.
- Servidor e painel leem todos os canais; cliente acessa somente um.
- Os canais são partições, não cópias do mesmo fluxo de votos.
- Mensagens administrativas são replicadas nos três canais.
- Não há migração automática entre canais.
- Não existe teto funcional de 35; a capacidade declarada depende de teste com o
  total planejado `N`.
- Os tempos atuais de 5 segundos, 20 segundos e 1,5 segundo permanecem.
- A confirmação ainda exige localizar o voto no histórico.
- A capacidade-alvo `N` depende de teste de carga aprovado.
- Esta etapa documenta a mudança e não altera código de produção.

## 18. Referências técnicas

- [Google Sheets API — limites de uso](https://developers.google.com/workspace/sheets/api/limits)
- [Google Sheets API — erros e concorrência](https://developers.google.com/workspace/sheets/api/troubleshoot-api-errors)
- [Google Apps Script — cotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Google Apps Script — LockService](https://developers.google.com/apps-script/reference/lock/lock-service)
- [RFC 8785 — JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
