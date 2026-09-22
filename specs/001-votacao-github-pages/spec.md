# Spec 001 — Votação criptografada em GitHub Pages

- **Estado:** proposta para revisão
- **Revisão:** 2
- **Tipo:** aplicação web estática, sem backend próprio
- **Hospedagem:** GitHub Pages, obrigatoriamente via HTTPS
- **Idioma:** português do Brasil
- **Implementação nesta etapa:** nenhuma

## 1. Objetivo e páginas

Construir uma votação estática com três páginas:

- **servidor:** configuração, geração/publicação das chaves, publicação da
  planilha, validação de pessoas e acesso à votação;
- **cliente:** identificação, carregamento da cédula e envio do voto criptografado;
- **painel:** acompanhamento em telão das pessoas validadas e dos votos recebidos.

Google Sheets será a origem pública da configuração, perguntas e pessoas
validadas. O ntfy transportará mensagens entre navegadores.

> “Servidor” é somente o nome da página administrativa. Ela não é um servidor HTTP
> e seu cache não é compartilhado com outros dispositivos.

## 2. Estrutura futura

```text
/
├── servidor/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── cliente/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── painel/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── specs/
    └── 001-votacao-github-pages/spec.md
```

Cada página terá um HTML, um JavaScript e um CSS como entradas. Dependências
externas deverão ter versão fixada e ser compatíveis com GitHub Pages.

## 3. UUID da sessão

As três páginas recebem `?uuid=<uuid>`:

```text
/servidor/?uuid=550e8400-e29b-41d4-a716-446655440000
/cliente/?uuid=550e8400-e29b-41d4-a716-446655440000#k=<admin-key-fingerprint>
/painel/?uuid=550e8400-e29b-41d4-a716-446655440000#k=<admin-key-fingerprint>
```

Antes de renderizar, validar e normalizar para minúsculas:

```regex
^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

O UUID normalizado será o nome exato do tópico ntfy e o namespace do cache.

Cliente e painel também recebem no fragmento `#k=` a impressão digital SHA-256 da
chave pública de assinatura administrativa. O fragmento não é enviado ao GitHub
Pages nem ao ntfy e funciona como âncora de confiança. Nessas páginas, UUID válido
sem impressão digital válida não autoriza carregar configuração ou votação.

### 3.1 Falha fechada

Os HTMLs conterão somente a raiz vazia e referências a CSS/JavaScript. Tudo que é
visível será criado por JavaScript após validar o UUID. Se ele estiver ausente,
repetido, vazio ou inválido:

- a página permanece visualmente vazia, sem mensagem de erro;
- não consulta planilha ou ntfy;
- não lê nem grava cache da sessão.

## 4. Cache local

“Cache” significa `localStorage`, isolado por UUID e versionado:

```text
eleicoes:v1:<uuid>:sheetUrl
eleicoes:v1:<uuid>:sheetId
eleicoes:v1:<uuid>:sheetGid
eleicoes:v1:<uuid>:publicKey
eleicoes:v1:<uuid>:privateKey
eleicoes:v1:<uuid>:adminSigningPublicKey
eleicoes:v1:<uuid>:adminSigningPrivateKey
eleicoes:v1:<uuid>:deviceSigningPublicKey
eleicoes:v1:<uuid>:deviceSigningPrivateKey
eleicoes:v1:<uuid>:deviceId
eleicoes:v1:<uuid>:voterName
eleicoes:v1:<uuid>:ballotState
```

- dados malformados são ignorados, nunca executados;
- no cliente, o par de assinatura do dispositivo é criado uma vez por sessão no
  navegador; `deviceId` é a impressão digital SHA-256 dessa chave pública;
- dados vindos do ntfy são revalidados antes de serem guardados;
- as chaves privadas administrativas existem apenas no cache da página servidor,
  na mesma origem, ou no arquivo de backup cifrado;
- nenhuma chave privada vai para URL, log, planilha ou ntfy;
- apagar o cache apaga a chave privada e pode tornar votos indecifráveis se não
  houver uma cópia externa.

`localStorage` não atravessa dispositivos. O cliente descobre chave pública e
planilha varrendo o histórico do tópico.

## 5. Página servidor

Depois do UUID válido, a ordem lógica da página será:

1. **Gerar Criptografia Assimétrica**;
2. bloco da chave privada, após gerar;
3. bloco da chave pública e **Publicar Chave**;
4. campo da planilha e **Publicar Planilha**;
5. **Validar Pessoas**, com indicador de pendências;
6. **Página de Votação**;
7. **Painel de Acompanhamento**;
8. **Resultados da Votação**.

### 5.1 Gerar criptografia

**Gerar Criptografia Assimétrica** cria com Web Crypto dois pares conforme a seção
10: RSA-OAEP para cifrar votos e ECDSA P-256 para assinar configurações. Todos são
guardados no cache da sessão. Se já existirem chaves, exige confirmação: a troca
pode impossibilitar decifragem e invalidar assinaturas. Durante a geração,
desabilita a ação e mostra carregamento. Falha não apaga chaves válidas existentes.

Depois de gerar, aparece centralizado o bloco privado:

- ícone de envelope com cadeado trancado à frente;
- abaixo, **Chave Privada**;
- ícone e texto formam um único botão acessível.

Ao acioná-lo, abre um modal pequeno com:

1. **“Não compartilhe essa chave, ela garante uma votação secreta e segura”**;
2. campo multilinha não editável com a chave privada PEM/PKCS#8;
3. botão para copiar;
4. botão para fechar.

A chave só é copiada após gesto explícito. Fechar remove seu valor visível do DOM.

### 5.2 Backup e importação de chaves

Ao lado do bloco criptográfico haverá:

- **Baixar arquivo de chaves**;
- **Inserir chaves existentes**.

O download exige uma senha de backup digitada e confirmada no momento da ação. O
arquivo `.json` conterá as chaves privadas/públicas de cifragem e assinatura,
metadados de algoritmo, versão, UUID e impressões digitais. O material privado será
cifrado com AES-GCM; a chave do arquivo será derivada da senha com PBKDF2-HMAC-
SHA-256, salt aleatório, pelo menos 600.000 iterações e parâmetros gravados no
próprio arquivo. Salt e IV serão novos em cada exportação. A senha nunca será
persistida. Não haverá opção de baixar chave privada sem proteção.

**Inserir chaves existentes** abre modal com dois modos:

1. importar o arquivo de backup e informar sua senha;
2. colar manualmente chave pública RSA PEM/SPKI e chave privada RSA PEM/PKCS#8.

No modo manual, se não houver par administrativo de assinatura, a página gera um
novo ECDSA antes de qualquer publicação. Depois que configuração ou voto tiver
sido publicado, a importação manual só é aceita se todas as impressões digitais
coincidirem com as chaves fixadas; não se gera assinatura nova nessa fase.

Antes de alterar o cache, a página deve decifrar/importar em memória e validar
esquema, limites, algoritmos, pares público-privado, UUID e impressões digitais.
Importar backup de outro UUID exige confirmação explícita. Falha deixa o cache
anterior intacto e apresenta erro sem revelar material privado.

Depois de importar com sucesso, a interface passa a tratar as chaves exatamente
como chaves geradas localmente. O usuário deve ser incentivado a guardar o arquivo
e a senha em locais separados.

### 5.3 Chave pública

Abaixo do bloco privado aparece:

- campo multilinha não editável com chave pública PEM/SPKI;
- à frente, **Publicar Chave**;
- abaixo, **Chave Pública**.

Ao publicar, a página importa e valida novamente a chave e envia `PUBLIC_KEY` ao
tópico. Sucesso/erro aparece junto ao botão. A mensagem válida mais recente vigora.

### 5.4 Planilha

O campo aceita URL HTTPS `docs.google.com/spreadsheets/d/<ID>/...`; à frente fica
**Publicar Planilha**. O ID deve corresponder a:

```regex
^[A-Za-z0-9_-]{20,}$
```

Ao publicar, o servidor:

1. extrai, normaliza e guarda URL, ID e `gid`;
2. verifica leitura anônima e conteúdo mínimo da seção 8;
3. publica `SPREADSHEET` no tópico;
4. não substitui configuração válida por entrada inválida.

Planilha de referência:

```text
URL: https://docs.google.com/spreadsheets/d/1RkwZlbuAWYpLurF9VAggu1VGl_q55eIl3v0fwt8q9qQ/edit?gid=0#gid=0
ID:  1RkwZlbuAWYpLurF9VAggu1VGl_q55eIl3v0fwt8q9qQ
gid: 0
```

A planilha precisa estar publicada ou compartilhada para leitura anônima.

### 5.5 Modal “Validar Pessoas”

O botão abre um modal com mensagens `NAME_REQUEST` que ainda não constem da
coluna E. Cada solicitação é copiável como:

```text
Nome Completo-<deviceId>
Marcelo Luis Pereira-K7tYg6I4hP9Qj2Nv8Ws0Xe3Ba5Dc1Rf7Um4Lo9Zi2Ak
```

O administrador copia as linhas e cola, uma por linha, na coluna E. Ao consultar
novamente a planilha, o servidor:

- remove os itens encontrados na coluna E;
- mantém indicador vermelho enquanto existir pendência;
- remove o indicador quando não houver pendência;
- atualiza modal/indicador sem recarregar a página inteira.

O indicador terá equivalente textual para leitores de tela. Se o mesmo nome
normalizado aparecer em aparelhos diferentes, as solicitações ficam agrupadas,
destacadas e acompanhadas de texto explicando a inconsistência. Não são mescladas
nem aprovadas automaticamente. Nome e `deviceId` são campos distintos; o hífen é
somente a serialização para copiar.

### 5.6 Modal “Página de Votação”

Ao clicar, o servidor varre o tópico e procura separadamente a `PUBLIC_KEY` válida
mais recente e a `SPREADSHEET` válida mais recente.

Se faltar qualquer uma, o modal abre sem QR/link e mostra:

> É obrigatório publicar a **Planilha** e a **Chave Pública**

Se a planilha foi publicada, mas ID, acesso ou conteúdo mínimo não for válido,
também mostra **“planilha inválida”** abaixo do item. Não basta existir no cache: a
configuração válida precisa existir no tópico.

Com ambas válidas, mostra:

1. QR Code com a URL absoluta
   `/cliente/?uuid=<uuid>#k=<admin-key-fingerprint>`;
2. abaixo, link clicável para essa URL, abrindo em nova aba com `noopener`;
3. à frente, botão apenas com ícone e nome acessível **Copiar link**.

O QR contém a URL da página cliente e a impressão digital administrativa, não o ID
da planilha nem uma chave privada.

### 5.7 Abrir painel

**Painel de Acompanhamento** abre em nova aba, com `noopener`, a URL
`/painel/?uuid=<uuid>#k=<admin-key-fingerprint>`. O botão só fica disponível com
chaves administrativas válidas. A impressão digital é a mesma usada no link e QR
do cliente.

### 5.8 Resultados e relatório

O servidor terá o botão **Resultados da Votação**. Os votos só serão decifrados
quando esse botão for acionado; não haverá apuração antecipada em segundo plano.

Ao clicar, a página varre `VOTE`, mantém apenas o primeiro voto de cada `deviceId`
validado na coluna E, usa a chave privada correspondente e valida o conteúdo
decifrado. O resultado mostra, em cada pergunta, a quantidade de votos e a
porcentagem de cada opção, além dos votos rejeitados e seus motivos. O denominador
da porcentagem é o total de votos válidos naquela pergunta, com abstenções
indicadas separadamente. Chave privada e votos em claro nunca saem do navegador.

O modal terá **Baixar relatório**, que gera um `.html` autônomo, com apresentação
adequada para leitura, impressão e arquivo. Ele conterá sessão, data/hora,
impressão digital da cédula, totais, quantidades, porcentagens, abstenções,
rejeições por motivo e impressão digital da chave. Não conterá chave privada,
respostas individuais, nomes ou `deviceId`.

Depois que o primeiro `VOTE` aparecer no tópico, fica proibido gerar outro par ou
publicar chave pública diferente, mesmo se esse voto posteriormente for rejeitado.

## 6. Página cliente

### 6.1 Início e sincronização

Após validar o UUID, aparece **Iniciar votação**. Ao clicar, o cliente varre o
histórico e captura as mensagens válidas mais recentes `PUBLIC_KEY` e
`SPREADSHEET`, guardando-as no cache. Uma ação de atualização executará a mesma
varredura. Mensagem inválida nunca substitui valor válido em cache.

Valores válidos em cache permitem continuidade se o histórico não trouxer versão
nova. Em seguida, o cliente lê o estado na planilha. Se faltar chave/planilha ou
se a votação estiver pausada, mostra com cor e destaque:

> A votação está pausada ou o administrador ainda não iniciou a votação.

A mensagem é intencionalmente genérica. Diagnóstico técnico pode aparecer em área
secundária sem expor chaves ou votos.

### 6.2 Nome e validação

Com configuração válida e sessão aceitando identificação, pede o nome completo.
Ele deve:

- ter 2 a 120 caracteres após normalizar espaços e pelo menos duas palavras;
- permitir letras Unicode, diacríticos, apóstrofo, hífen e espaços;
- rejeitar dígitos, controle, HTML e pontuação não prevista;
- ser normalizado apenas para detectar duplicidade, preservando a grafia exibida.

Ao confirmar, publica `NAME_REQUEST` com nome, `deviceId` e UUID. Depois mostra
carregamento, o texto:

> Aguarde o administrador validar seu nome para a votação

e **Editar nome**. Editar e confirmar publica nova solicitação com o mesmo
`deviceId`; apenas a mais recente daquele aparelho é exibida como vigente.

### 6.3 Espera e início da cédula

O cliente consulta a coluna E até encontrar exatamente
`Nome Completo-<deviceId>`. Isso valida apenas aquele aparelho. Depois mostra:

> Aguardando o administrador iniciar a votação

A tela terá contagem regressiva visível de 20 a 0 segundos. Ao chegar a zero, lê a
planilha novamente e reinicia a contagem. Abaixo há **Atualizar** com ícone de
recarregar; ele verifica imediatamente sem criar requisições concorrentes.

O estado canônico vem da célula B3 da planilha:

- `1`: votação em andamento; renderizar perguntas;
- `0`: votação pausada; continuar aguardando.

Qualquer outro valor é inválido e produz comportamento fechado. O cache não
transforma `1` antigo em autorização permanente. O estado é lido
antes da cédula e imediatamente antes do envio. Falha de leitura bloqueia início e
envio.

### 6.4 Questões, verificação e envio

Com estado `1`, o cliente valida todos os blocos. As questões aparecem **uma por
vez**, respeitando ordem, opções, obrigatoriedade e configurações de exibição.
Cada questão, exceto a última, tem **Próxima** e não permite avançar se a resposta
obrigatória atual estiver incompleta.

Na última questão aparece o botão azul **Verificar**. Ele abre uma tela com todas
as perguntas e somente a opção selecionada em cada uma. Cada resposta tem
**Editar**. Ao editar, reaparece aquela questão; o botão **Verificar** retorna à
revisão sem perder as demais respostas.

Na revisão aparece o botão verde **Confirmar Votação**. Ao clicar:

1. relê o estado e a impressão digital da cédula;
2. bloqueia edição e cliques repetidos;
3. mostra loading e **“Confirmando que seu voto foi computado”**;
4. cifra e publica `VOTE`;
5. varre o tópico até encontrar o mesmo `ballotId` e `deviceId`;
6. após encontrá-lo, mostra confirmação inequívoca e impede novo voto.

Uma resposta HTTP bem-sucedida sem localizar a mensagem no tópico não é sucesso
final. O cliente preserva o mesmo `ballotId` e permite verificar ou tentar de novo
sem criar outro voto lógico.

- planilha inválida não gera cédula parcial;
- texto de célula usa `textContent`, nunca HTML;
- perguntas obrigatórias bloqueiam envio incompleto;
- uma cédula já iniciada não muda silenciosamente;
- impressão digital e estado são conferidos novamente antes do envio.

O primeiro `VOTE` válido de cada `deviceId` é considerado pelo painel e apuração.

## 7. Página painel

Pensada para telão, obtém a planilha pelo tópico, carrega as pessoas validadas da
coluna E e varre o tópico a cada 5 segundos.

### 7.1 Layout e votos recebidos

- a área central mostra, em texto muito grande e destacado, a contagem geral no
  formato **“20 votos de 30 registrados.”**;
- ao redor ficam os cards das pessoas validadas;
- nomes são agrupados pela inicial, em blocos A, B, C etc.;
- blocos e nomes internos ficam em ordem alfabética pt-BR;
- ordenação ignora caixa/acentos, mas preserva a grafia exibida;
- cada `Nome-<deviceId>` é distinto, mesmo com nome repetido.
- cabeçalho e contagem geral permanecem visíveis no topo;
- os nomes são distribuídos em páginas conforme o espaço disponível, sem cortar
  cartões, e avançam automaticamente a cada 8 segundos; após a última página,
  a primeira reaparece;
- a página visível é preservada quando chegam novos votos e recalculada quando
  mudam os nomes ou o tamanho da tela.
- controles no topo aumentam ou diminuem a fonte dos nomes e recalculam as
  páginas; todos os nomes continuam no ciclo.

O card começa neutro. Ao encontrar o primeiro `VOTE` estruturalmente válido daquele
`deviceId`, fica verde; os demais são ignorados. Verde significa somente **voto
recebido**, não decifrado ou aceito na apuração.

O primeiro número é a quantidade de `deviceId` validados que já possuem ao menos
um `VOTE`; o segundo é a quantidade total de pessoas/aparelhos validados na coluna
E. Uma cédula conta como **um voto**, independentemente da quantidade de questões.
O painel não mostra contagem por opção, como “Opção 1 — 2 votos”. Para essa
contagem geral não é necessário decifrar escolhas, preservando o voto secreto.

A cada ciclo, o painel busca novas mensagens sem reprocessar indefinidamente o
histórico, atualiza a planilha, preserva cards verdes em falha transitória e nunca
fica verde por causa de `NAME_REQUEST`.

### 7.2 Modal de QR Code

No topo há botão para abrir modal. Ele:

- ocupa grande parte da tela e deixa parte do painel visível ao fundo;
- tem fundo opaco suficiente para o QR ser legível;
- mostra QR grande para leitura à distância;
- aponta à URL absoluta
  `/cliente/?uuid=<uuid>#k=<admin-key-fingerprint>`;
- fecha por botão, Escape e clique controlado fora;
- prende o foco e o devolve ao botão ao fechar.

## 8. Contrato da planilha

A inspeção da planilha pública de referência confirmou o contrato abaixo. A fonte
de leitura será o endpoint de exportação CSV, pois ele preserva as linhas vazias
que delimitam os blocos; a saída CSV do Google Visualization não as preservou de
forma adequada para este formato.

### 8.1 Linhas de controle

| Célula | Conteúdo esperado | Uso |
|---|---|---|
| A1 | `chave pública` | rótulo legado/informativo |
| B1 | valor atualmente preenchido | não autoritativo; chave vem do ntfy |
| A2 | `chave uuid` | rótulo legado/informativo |
| B2 | valor atualmente preenchido | não autoritativo; UUID vem da URL |
| A3 | `1 = servidor rodando, e 0 = parado/pausado` | rótulo do estado |
| B3 | `1` ou `0` | estado canônico da votação |
| E1 | `Nomes validados para a votação abaixo (adm deve colar aqui)` | cabeçalho |
| E2:E | `Nome Completo-<deviceId>` | pessoas/aparelhos validados |

Os valores B1 e B2 existentes não substituem os contratos definidos nesta spec:
chave pública e planilha são descobertas pelo tópico, e o UUID da sessão vem da
URL. Eles podem permanecer na planilha por compatibilidade, mas o cliente não deve
confiar neles para segurança ou roteamento.

Para separar nome e aparelho na coluna E, o parser lê os 43 caracteres Base64url
da impressão digital SHA-256 no fim da célula, precedidos por hífen, em vez de
dividir no primeiro hífen, pois nomes podem conter hífen. Linhas inválidas são
sinalizadas no servidor e ignoradas para autorização.

### 8.2 Blocos de perguntas

As perguntas ocupam as colunas A:C a partir da linha 6. Um ou mais registros com
A:C vazias separam os blocos. A coluna E é independente e pode conter nomes nas
mesmas linhas.

Cada bloco tem este formato:

1. **Cabeçalho:** coluna A contém o texto da pergunta; coluna B contém o rótulo
   `quantidade de respostas aceitas (inteiro)`; coluna C pode conter o rótulo
   `embaralhar respostas (booleano 1 ou 0)`.
2. **Primeira opção/configuração:** na próxima linha não vazia, A contém a primeira
   opção, B contém a quantidade de respostas aceitas e C contém `1` para embaralhar
   ou `0` para preservar a ordem.
3. **Demais opções:** as linhas seguintes usam A para o texto da opção e deixam B
   e C vazias, até o separador do próximo bloco.

Regras de validação:

- pergunta e opções são textos não vazios e exibidos com `textContent`;
- cada bloco possui pelo menos duas opções;
- quantidade aceita é inteiro entre 1 e o total de opções;
- `1` em embaralhamento aplica Fisher–Yates com aleatoriedade segura; `0` mantém a
  ordem original; qualquer outro valor invalida o bloco;
- opção duplicada dentro da mesma pergunta, após normalização, invalida o bloco;
- se a quantidade aceita for 1, usar seleção única; se for maior, usar seleção
  múltipla e impedir escolhas acima do limite;
- todas as perguntas são obrigatórias e exigem exatamente a quantidade configurada
  de opções, salvo futura extensão explícita do contrato;
- conteúdo inesperado em B/C nas linhas de opções invalida o bloco;
- nenhum bloco é renderizado se qualquer bloco estiver inválido.

Na planilha inspecionada foram encontrados três blocos:

| Pergunta | Respostas aceitas | Embaralhar | Opções |
|---|---:|---:|---:|
| `DIACONOS SEDE` | 2 | 1 | 4 |
| `DIÁCONOS LAGE` | 1 | 1 | 4 |
| `DIÁCONO BANANAL` | 1 | 0 | 2 |

### 8.3 Identificadores e impressão digital

Como a planilha não possui IDs explícitos nem uma célula de versão, a aplicação
deve derivá-los de forma determinística:

- `questionId`: SHA-256 do índice do bloco e texto normalizado da pergunta;
- `optionId`: SHA-256 do `questionId`, índice e texto normalizado da opção;
- `ballotFingerprint`: SHA-256 da representação canônica de todas as perguntas,
  opções, quantidades e regras de embaralhamento, antes de embaralhar na tela.

A representação canônica e a codificação dos hashes devem ser únicas e testadas
entre navegadores. Mudança em qualquer pergunta, opção ou configuração altera a
impressão digital. O estado B3 e a coluna E não fazem parte dela.

ID e `gid` da planilha são validados. Todo conteúdo é processado como dados, nunca
executado como código.

## 9. Protocolo ntfy

### 9.1 Instância e retenção

Produção usará uma instância ntfy dedicada, servida por HTTPS. `ntfy.sh` poderá ser
usado apenas em desenvolvimento. A instância terá:

- cache persistente em SQLite ou PostgreSQL, sobrevivendo a reinicializações;
- `cache-duration` mínimo de 30 dias, e duração da sessão inferior à retenção;
- CORS testado para a origem exata do GitHub Pages;
- limite de mensagem preservado em 4.096 bytes; anexos não serão usados;
- monitoramento de disponibilidade, espaço e respostas HTTP 429/5xx;
- relógio sincronizado, backup do cache e procedimento de restauração testado.

O tópico é o UUID normalizado. A URL base será uma constante configurável. O
conteúdo auxiliar pode ser público; autenticidade e sigilo das escolhas são
fornecidos pelo protocolo criptográfico, não pelo nome secreto do tópico.

### 9.2 Histórico incremental

Na primeira execução, cada página faz `poll=1&since=all`, valida e arquiva as
mensagens relevantes em IndexedDB. Guarda também o último ID ntfy processado. Nas
consultas seguintes usa `poll=1&since=<ultimo-id>`, deduplica pelo ID ntfy e só
avança o cursor depois de persistir o lote com sucesso.

Se a resposta trouxer `X-Messages-Truncated: 1`, a página considera o histórico
incompleto: servidor bloqueia apuração, cliente não confirma voto e painel mostra
erro operacional. Respostas 429/5xx usam retentativa com atraso exponencial e
aleatoriedade, respeitando `Retry-After` quando presente. O histórico local é
reconciliado com o remoto depois de recarga; limpar dados do navegador exige
reconstrução dentro da janela de retenção.

### 9.3 Tipos e assinaturas

Toda mensagem JSON contém `type`, `protocolVersion`, `sessionId`, `publishedAt`,
`signingKeyFingerprint` e `signature`.

- `PUBLIC_KEY`: chave PEM/SPKI e impressão digital SHA-256;
- `SPREADSHEET`: ID, `gid`, URL normalizada e impressão digital conhecida;
- `NAME_REQUEST`: nome, `deviceId`, chave pública do aparelho e `requestId`;
- `VOTE`: `deviceId`, `ballotId`, metadados criptográficos e conteúdo cifrado.

`PUBLIC_KEY` e `SPREADSHEET` são assinadas pela chave administrativa ECDSA. A
primeira mensagem também transporta essa chave pública; sua impressão digital deve
coincidir com `#k=` no link/QR antes de a assinatura ser aceita. Isso impede que
uma chave falsa publicada no tópico se torne a raiz de confiança.

Cada cliente gera seu par ECDSA. `deviceId` é a impressão digital da chave pública.
`NAME_REQUEST` é autoassinada; o servidor verifica assinatura e correspondência
entre chave e `deviceId` antes de mostrar o nome. Quando o administrador copia
`Nome-<deviceId>` para a coluna E, ele autoriza aquela chave. Todo `VOTE` é assinado
pela mesma chave do dispositivo; servidor e painel rejeitam voto cuja assinatura,
`deviceId` ou autorização não corresponda.

A assinatura cobre a serialização canônica de todos os campos da mensagem, exceto
`signature`, usando JSON Canonicalization Scheme (RFC 8785), ECDSA P-256/SHA-256 e
assinatura de 64 bytes (`r || s`) em Base64url sem padding. Alterar qualquer campo
invalida a assinatura. IDs ntfy, cabeçalhos de transporte e ordem de chegada não
fazem parte do conteúdo assinado.

Chave e planilha são mensagens separadas; a varredura seleciona a mensagem válida,
assinada e mais recente de cada tipo. Nenhuma mensagem é confiável apenas por
existir: esquema, UUID, tamanho, datas, assinatura e conteúdo são validados.

Exemplos resumidos:

```json
{
  "type": "PUBLIC_KEY",
  "protocolVersion": 1,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "fingerprint": "sha256-base64url",
  "adminSigningPublicKeyJwk": {},
  "publishedAt": "2026-09-19T12:00:00.000Z",
  "signingKeyFingerprint": "sha256-base64url",
  "signature": "base64url"
}
```

```json
{
  "type": "SPREADSHEET",
  "protocolVersion": 1,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sheetId": "1RkwZlbuAWYpLurF9VAggu1VGl_q55eIl3v0fwt8q9qQ",
  "sheetGid": "0",
  "ballotFingerprint": "sha256-base64url",
  "publishedAt": "2026-09-19T12:00:00.000Z",
  "signingKeyFingerprint": "sha256-base64url",
  "signature": "base64url"
}
```

```json
{
  "type": "NAME_REQUEST",
  "protocolVersion": 1,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "requestId": "uuid-da-solicitacao",
  "deviceId": "fingerprint-base64url-do-aparelho",
  "deviceSigningPublicKeyJwk": {},
  "name": "Marcelo Luis Pereira",
  "publishedAt": "2026-09-19T12:02:00.000Z",
  "signingKeyFingerprint": "fingerprint-base64url-do-aparelho",
  "signature": "base64url"
}
```

## 10. Criptografia e voto

### 10.1 Algoritmos

- RSA-OAEP, SHA-256 e módulo mínimo de 2048 bits;
- chave pública PEM/SPKI e privada PEM/PKCS#8;
- assinaturas administrativas e de aparelhos com ECDSA P-256/SHA-256;
- chaves de assinatura exportadas/importadas em JWK;
- conteúdo com AES-GCM de 256 bits;
- IV aleatório de 96 bits, nunca reutilizado com a mesma chave;
- aleatoriedade apenas com `crypto.getRandomValues()`;
- binários em Base64 padronizado e documentado.

Cada voto usa nova chave AES; o cliente cifra o voto com AES-GCM e essa chave com
RSA-OAEP. O voto em claro não é publicado nem persistido após sucesso.

### 10.2 Conteúdo cifrado

```json
{
  "protocolVersion": 1,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "ballotId": "uuid-do-voto",
  "deviceId": "fingerprint-base64url-do-aparelho",
  "voterName": "Marcelo Luis Pereira",
  "sheetId": "1RkwZlbuAWYpLurF9VAggu1VGl_q55eIl3v0fwt8q9qQ",
  "ballotFingerprint": "sha256-base64url",
  "submittedAt": "2026-09-19T12:05:00.000Z",
  "answers": [{ "questionId": "presidente", "optionId": "p1" }]
}
```

### 10.3 Envelope publicado

```json
{
  "type": "VOTE",
  "protocolVersion": 1,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "ballotId": "uuid-do-voto",
  "deviceId": "fingerprint-base64url-do-aparelho",
  "keyFingerprint": "sha256-base64url",
  "keyAlgorithm": "RSA-OAEP-256",
  "contentAlgorithm": "A256GCM",
  "encryptedKey": "base64",
  "iv": "base64",
  "ciphertext": "base64",
  "publishedAt": "2026-09-19T12:05:00.000Z",
  "signingKeyFingerprint": "fingerprint-base64url-do-aparelho",
  "signature": "base64url"
}
```

`deviceId` e `ballotId` ficam visíveis para confirmação/deduplicação. Nome e
respostas ficam cifrados. O painel só torna verde o card se o `deviceId` estiver em
uma linha validada da coluna E.

## 11. Segurança, privacidade e identificação do aparelho

- UUID separa sessões, mas não autentica administrador ou eleitor.
- A privacidade das escolhas vem da criptografia assimétrica/híbrida, não do ntfy.
  O ntfy é somente o canal e pode expor deliberadamente nomes, identificadores,
  chave pública e referência da planilha.
- O histórico ntfy precisa durar todo o período da votação.
- Quem conhecer o tópico público pode ler os dados não cifrados e enviar spam,
  mas mensagens sem assinatura autorizada são rejeitadas.
- RSA-OAEP garante sigilo, mas não identidade do remetente.
- `deviceId` e cache evitam duplicação acidental; limpar cache os contorna.
- Nome/`deviceId` aparecem no pedido e na planilha: participação não é anônima,
  embora as escolhas fiquem cifradas.
- ntfy/rede observam horário, IP e tamanho das mensagens.
- card verde comprova recebimento técnico, não validade ou apuração.
- copiar chave privada a expõe à área de transferência.
- usar CSP restritiva, sem scripts inline, e dependências fixadas.
- a apuração ocorre somente no navegador do servidor, por ação explícita; a guarda
  externa da chave privada continua sendo responsabilidade do administrador.

Uma página web comum não consegue obter o endereço MAC do aparelho. Chrome,
Safari, Firefox e as APIs do navegador não expõem MAC ao JavaScript; o endereço
também não atravessa roteadores até GitHub Pages ou ntfy e celulares modernos
podem randomizá-lo por rede. Portanto, usar MAC exigiria abandonar a arquitetura
puramente web e instalar um aplicativo/agente nativo com permissões específicas.
Nesta arquitetura, `deviceId` será a impressão SHA-256 da chave pública de
assinatura persistida no navegador. Ele identifica aquela instalação/chave, não o
hardware, e muda se o usuário limpar os dados e gerar outro par.

Para eleição real, ainda é recomendável avaliar credenciais pessoais de voto
único, tópico protegido e processo de apuração auditável. As assinaturas aqui
autenticam chaves/aparelhos aprovados, não a identidade civil de uma pessoa.

## 12. Estados mínimos

### Servidor

```text
UUID inválido -> vazio
sem chaves -> gerar criptografia
gerando -> carregamento
chaves geradas -> blocos privado/público
nomes pendentes -> indicador em Validar Pessoas
configuração remota incompleta -> aviso no modal
configuração remota válida -> QR e link
primeiro voto encontrado -> rotação de chave bloqueada
resultados -> decifragem local, totais e relatório HTML
```

### Cliente

```text
UUID inválido -> vazio
entrada -> Iniciar votação
indisponível/pausada -> aviso
identificação -> nome
nome enviado -> aguardando validação e Editar nome
validado + 0 -> contagem de 20 segundos
1 -> questões, uma por vez
última questão -> Verificar
revisão -> Editar ou Confirmar Votação
confirmando -> procura o próprio voto no tópico
confirmado -> mensagem de sucesso e novo voto bloqueado
```

### Painel

```text
UUID inválido -> vazio
carregando -> planilha e histórico
acompanhamento -> grupos, total geral e ciclo de 5 segundos
QR aberto -> modal grande sobre fundo parcialmente visível
```

## 13. Acessibilidade e compatibilidade

- cliente responsivo para celular; painel para telão;
- campos com `label`; ícones com nome acessível; foco visível;
- modais titulados, foco preso, Escape e retorno do foco;
- estados/erros com `aria-live`;
- WCAG 2.2 AA e alvos de toque mínimos de 44 × 44 CSS pixels;
- cor nunca é o único indicador;
- navegadores atuais com os recursos Web Crypto usados.

## 14. Critérios de aceite

### Geral e servidor

- [ ] As três páginas ficam vazias e sem requisições com UUID inválido.
- [ ] Sessões UUID diferentes mantêm cache independente.
- [ ] Geração cria/persiste pares RSA-OAEP e ECDSA e regeneração exige confirmação.
- [ ] Chave privada só aparece no modal não editável e pode ser copiada.
- [ ] Backup baixa arquivo cifrado por senha, sem material privado em claro.
- [ ] Importação valida senha, esquema, pares, UUID e impressões digitais antes de
  substituir o cache.
- [ ] **Publicar Chave** nunca envia chave privada.
- [ ] Chave e planilha são publicadas/validadas separadamente.
- [ ] Configurações sem assinatura administrativa válida são ignoradas.
- [ ] A impressão `#k=` do link/QR ancora a chave administrativa.
- [ ] Modal de votação verifica o tópico, não apenas cache.
- [ ] Configuração incompleta mostra a frase exigida sem QR/link.
- [ ] Configuração válida mostra QR, link e botão de copiar.
- [ ] Depois do primeiro `VOTE`, geração/publicação de nova chave fica bloqueada.
- [ ] Resultados decifram localmente e mostram quantidade/porcentagem por opção.
- [ ] Relatório HTML é apresentável e não expõe votos individuais ou chave privada.

### Pessoas e cliente

- [ ] Nome válido publica `NAME_REQUEST` com `deviceId`.
- [ ] `deviceId` corresponde à impressão da chave pública do aparelho.
- [ ] Pedido de nome e voto possuem assinaturas verificáveis dessa chave.
- [ ] Editar nome mantém aparelho e substitui pedido vigente na interface.
- [ ] Servidor remove pendentes encontrados na coluna E.
- [ ] Nomes iguais/aparelhos diferentes são agrupados e destacados.
- [ ] Indicador de pendência possui alternativa textual.
- [ ] Cliente só avança com correspondência exata de nome/aparelho.
- [ ] **Iniciar votação** varre e guarda chave/planilha válidas.
- [ ] Ausência de configuração ou pausa mostra a mensagem definida.
- [ ] A planilha de referência produz exatamente três perguntas, com limites
  `2`, `1`, `1` e embaralhamento `1`, `1`, `0`, respectivamente.
- [ ] Linhas vazias delimitam blocos sem interferir nos nomes da coluna E.
- [ ] Espera consulta em 20 segundos e permite atualização manual.
- [ ] Somente B3=`1` renderiza questões; B3=`0` mantém a espera.
- [ ] Valores diferentes de `0` e `1` em B3 bloqueiam a votação.
- [ ] Questões aparecem uma por vez, com **Próxima** e **Verificar** na última.
- [ ] Revisão mostra apenas opções escolhidas e permite editar cada resposta.
- [ ] **Confirmar Votação** procura o próprio voto antes de declarar sucesso.
- [ ] `VOTE` não expõe nome ou respostas em claro.
- [ ] Falha preserva `ballotId`; sucesso bloqueia reenvio acidental.
- [ ] Teste decifra o voto com a chave privada correspondente.

### Painel

- [ ] Blocos e nomes ficam ordenados alfabeticamente em pt-BR.
- [ ] Atualização acontece a cada 5 segundos.
- [ ] Apenas o primeiro `VOTE` válido por aparelho deixa card verde.
- [ ] `VOTE` com assinatura inválida nunca altera card ou apuração.
- [ ] Aparelho não validado não cria nem altera card.
- [ ] Modal tem QR grande para o cliente da mesma sessão.
- [ ] Centro mostra “X votos de Y registrados” em destaque.
- [ ] Uma cédula conta uma vez, independentemente do número de questões.
- [ ] Painel não mostra totais por opção e não precisa decifrar as escolhas.

## 15. Testes mínimos

- unitários: UUID, parser CSV com linhas vazias, blocos A:C, nomes da coluna E,
  estado B3, IDs derivados, `ballotFingerprint`, PEM, Base64, ordem pt-BR e
  mensagens;
- criptográficos: cifrar no navegador e decifrar independentemente;
- integração: `fetch`, relógios, cache, clipboard e ntfy simulados;
- histórico: inválidas, repetidas, fora de ordem e de outra sessão;
- autenticação: alteração de cada campo assinado, troca de chave, replay e âncora
  `#k=` incorreta;
- histórico incremental: primeira carga, retomada por ID, deduplicação, 429/5xx e
  `X-Messages-Truncated: 1`;
- backup: senha errada, arquivo adulterado, par incompatível e importação atômica;
- ponta a ponta das três páginas em HTTPS, celular e telão;
- relógio controlado para ciclos de 5/20 segundos;
- perda de cache e rotação acidental de chave.

## 16. Decisões consolidadas

- planilha inspecionada e contrato das células A1:B3, coluna E e blocos A:C
  documentado na seção 8;
- estado em B3 usa `1` (andamento) e `0` (pausa); não há `encerrada`;
- a versão inexistente foi substituída por `ballotFingerprint` derivada da cédula;
- dados auxiliares podem ficar expostos no ntfy; escolhas permanecem cifradas;
- resultados são decifrados sob demanda no servidor, com totais, porcentagens e
  relatório HTML;
- rotação de chave é proibida depois do primeiro voto encontrado;
- o centro do painel mostra **“X votos de Y registrados”**, sem opções;
- o painel conta envelopes únicos e não precisa decifrar escolhas;
- MAC não é acessível no GitHub Pages; `deviceId` é a impressão da chave pública
  persistida do aparelho;
- produção usa ntfy dedicado com cache persistente de pelo menos 30 dias; ntfy.sh
  fica restrito ao desenvolvimento;
- histórico usa carga inicial completa, IndexedDB e retomada incremental pelo ID
  ntfy; replay truncado bloqueia confirmação/apuração;
- configuração usa assinatura administrativa ECDSA ancorada pela impressão `#k=`
  do QR/link; nomes e votos usam assinatura ECDSA do aparelho aprovado;
- o servidor permite baixar backup cifrado por senha e inserir chaves existentes;
- arquivo de backup usa AES-GCM e PBKDF2-HMAC-SHA-256; chaves importadas são
  validadas integralmente antes de substituir o cache.

## 17. Referências técnicas

- [ntfy — API de assinatura, polling e `since`](https://docs.ntfy.sh/subscribe/api/)
- [ntfy — publicação, cache e limites](https://docs.ntfy.sh/publish/)
- [ntfy — cache persistente e controle de acesso](https://docs.ntfy.sh/config/)
- [RFC 8785 — JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
