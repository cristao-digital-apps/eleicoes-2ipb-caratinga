# Spec 003 — Inicialização por sessão e descoberta de canais pela planilha

- **Estado:** implementada
- **Revisão:** 2
- **Depende de:** Specs 001 e 002
- **Tipo:** alteração do fluxo de inicialização e da descoberta dos canais
- **Implementação nesta etapa:** aplicação, transporte e contrato da planilha atualizados

## 1. Objetivo

Fazer a página estática descobrir os canais da votação a partir da planilha
Google escolhida pelo administrador. A URL deixa de transportar o manifesto ou
o endereço de cada endpoint e passa a transportar somente:

- o UUID da sessão, em `uuid`;
- o ID da planilha mestre, em `sheet-id`;
- a âncora pública de confiança `#k=`, quando as chaves já existirem.

A coluna H da planilha mestre contém URLs de Web Apps do Google Apps Script.
Esses endpoints recebem e fornecem as mensagens da votação. O JavaScript da
página completa a URL de cada endpoint com ação, sessão, cursor e demais
parâmetros necessários para cada consulta.

O fluxo da página servidor passa a ser um assistente sequencial de três passos:
criar a sessão, validar a planilha e configurar as chaves. A ação **Publicar
Planilha** deixa de existir. A chave pública continua sendo publicada, agora em
todos os endpoints descobertos na coluna H.

Cada endpoint usa uma planilha de mensagens e cria nela uma guia exclusiva para
cada UUID. A mesma planilha de canal pode, assim, atender várias votações sem
misturar seus registros.

## 2. Relação com as especificações anteriores

Esta spec prevalece sobre as Specs 001 e 002 nos seguintes pontos:

- parâmetros de URL;
- abertura inicial da página servidor;
- cadastramento e publicação da planilha;
- manifesto manual de canais;
- quantidade fixa de três canais;
- descoberta e escolha do endpoint pelo cliente;
- isolamento das sessões em guias distintas.

Continuam válidos os formatos assinados, criptografia híbrida, validação do
aparelho, idempotência, histórico incremental, confirmação do voto, apuração,
falha fechada e demais regras não substituídas expressamente aqui.

Nesta spec, **planilha mestre** é a planilha informada no 2º passo, que contém a
cédula, pessoas, estado e coluna H de endpoints. **Planilha de canal** é a
planilha ligada a uma implantação do Apps Script e usada como log de mensagens.
Elas podem ser arquivos diferentes. Cada endpoint da coluna H deve corresponder
a uma planilha de canal.

## 3. URLs canônicas

### 3.1 Página servidor

Estado inicial, sem sessão:

```text
/servidor/
```

Sessão criada, aguardando planilha:

```text
/servidor/?uuid=550e8400-e29b-41d4-a716-446655440000
```

Sessão e planilha registradas:

```text
/servidor/?uuid=550e8400-e29b-41d4-a716-446655440000&sheet-id=1RkwZlbuAWYpLurF9VAggu1VGl_q55eIl3v0fwt8q9qQ
```

### 3.2 Cliente e painel

```text
/cliente/?uuid=<uuid>&sheet-id=<id>#k=<fingerprint-administrativa>
/painel/?uuid=<uuid>&sheet-id=<id>#k=<fingerprint-administrativa>
```

Não são colocados na URL: URL completa da planilha, `gid`, endpoint escolhido,
chave privada, conteúdo de voto ou credencial Google.

### 3.3 Validação dos parâmetros

- `uuid` ocorre exatamente uma vez e segue o formato UUID aceito pelo protocolo;
- `sheet-id` ocorre exatamente uma vez e contém somente `[A-Za-z0-9_-]`, com
  comprimento compatível com um ID do Google Sheets;
- parâmetros repetidos ou malformados provocam falha fechada;
- o nome do parâmetro é literalmente `sheet-id`, em minúsculas;
- a ordem dos parâmetros não é relevante;
- depois do 3º passo, cliente e painel também exigem uma única âncora `#k=` válida.

O JavaScript usa `URL` e `URLSearchParams` para completar URLs. Não concatena
valores sem codificação.

## 4. Assistente da página servidor

Em cada estado aparece somente o conteúdo do passo atual. Se um parâmetro de um
passo anterior for válido, ele não é pedido novamente. Atualizar ou reabrir a
página conserva o passo por meio da URL; dados secretos continuam somente no
armazenamento local da sessão.

### 4.1 1º Passo — gerar sessão

Quando a página servidor abre sem `uuid`, mostra somente:

```text
Iniciar nova votação
1º Passo
[ Gerar chave de sessão ]
```

Ao clicar, a página:

1. gera um UUID com `crypto.randomUUID()`;
2. valida localmente o UUID gerado;
3. recarrega `/servidor/?uuid=<uuid>` usando `location.replace` ou navegação
   equivalente que não preserve um formulário intermediário.

Esse passo não acessa planilhas, endpoints ou cache de outra sessão.

### 4.2 2º Passo — verificar a planilha Google

Quando existe `uuid` válido e não existe `sheet-id`, mostra somente:

```text
Iniciar nova votação
2º Passo
[ URL da planilha                                      ]
[ Verificar e usar essa Planilha Google ]
```

Ao clicar, a página:

1. aceita apenas URL HTTPS no formato
   `docs.google.com/spreadsheets/d/<ID>/...`;
2. extrai o ID sem confiar em outros parâmetros da URL colada;
3. consulta a planilha sem usar credenciais embutidas no navegador;
4. valida o contrato mínimo da cédula já definido na Spec 001;
5. lê toda a coluna H usada, normaliza e remove linhas vazias;
6. exige ao menos um endpoint válido;
7. faz uma consulta de saúde a cada endpoint;
8. exige resposta válida de todos os endpoints antes de aceitar a planilha;
9. recarrega a página acrescentando somente
   `sheet-id=<ID extraído>` à query string.

Uma falha mantém o usuário no 2º passo, informa o motivo sem expor conteúdo
sensível e não altera a URL. Entre os motivos distinguíveis estão: URL inválida,
planilha inacessível, contrato inválido, coluna H vazia, endpoint inválido,
endpoint repetido e endpoint indisponível.

### 4.3 3º Passo — chaves criptográficas

Quando `uuid` e `sheet-id` são válidos, a página torna a consultar a planilha e
os endpoints antes de mostrar o passo:

```text
Iniciar nova votação
3º Passo
[ campos para inserir chaves existentes ]
[ Gerar chaves para Criptografia Assimétrica ]
```

O texto do botão foi corrigido para descrever o par assimétrico administrativo.
A operação mantém o modelo híbrido das
Specs 001 e 002: gera o par assimétrico administrativo/RSA necessário para
proteger as chaves AES de cada voto; a chave AES simétrica de cada voto continua
sendo gerada no cliente. Alterar o algoritmo ou gerar uma única chave simétrica
compartilhada está fora do escopo.

Os campos de importação, backup cifrado e validação de par continuam seguindo a
Spec 001. Depois de gerar ou importar chaves válidas, o servidor:

1. cria a mensagem administrativa assinada `PUBLIC_KEY`;
2. publica exatamente a mesma mensagem em todos os endpoints da coluna H;
3. cada endpoint cria, se necessário, a guia da sessão;
4. cada endpoint grava `PUBLIC_KEY` de forma idempotente;
5. o servidor relê todos os endpoints e confirma conteúdo e hash;
6. somente depois da convergência libera links e QR Codes.

Sucesso parcial deixa a sessão em **configuração divergente**. A repetição usa o
mesmo identificador e conteúdo nos endpoints faltantes. Nenhum link é liberado
enquanto um endpoint não confirmar a chave pública.

### 4.4 Remoções

- não existe mais botão ou funcionalidade **Publicar Planilha**;
- não existe formulário manual para IDs, `gid`, implantação, URL de leitura ou
  URL de escrita de cada canal;
- não existe mensagem administrativa `SPREADSHEET` para descoberta da planilha;
- a planilha é identificada pelo `sheet-id` da URL e validada diretamente.

## 5. Contrato transposto e descoberta dos endpoints na coluna H

A coluna inserida à esquerda da antiga A desloca o contrato físico da planilha:

| Coluna | Conteúdo |
|---|---|
| A | URL HTTPS da imagem da opção |
| B | pergunta ou texto da opção |
| C | metadados verticais do bloco; em C3, estado da votação |
| D | embaralhar respostas (`1` ou `0`) na primeira opção |
| E | reservada |
| F | pessoas validadas (`Nome-deviceId`) |
| H | URLs base dos endpoints |

Na primeira opção, C contém a quantidade de respostas. Em outra linha de opção,
C contém `mostrar imagens (booleano 1 ou 0)` e, na linha seguinte, C contém o
valor `1` ou `0`; essa linha de valor também pode não ter texto de opção. O novo
booleano integra a impressão digital da cédula. Imagens inseridas diretamente
como objeto dentro da célula não são fornecidas pela exportação CSV do Google.
Para renderizá-las no cliente, A deve conter a URL HTTPS da imagem. Uma imagem
ausente não invalida o bloco, permitindo o uso da planilha atual, e o texto da
opção continua sendo seu nome acessível.

Como compatibilidade com a planilha existente, se H estiver vazia o parser
também reconhece URLs válidas de Web App na coluna F; novos endpoints devem ser
mantidos na coluna H para não compartilhar a coluna de pessoas validadas.

Cada célula não vazia da coluna H deve conter uma única URL base de Web App:

```text
https://script.google.com/macros/s/<deployment-id>/exec
```

Cabeçalho textual conhecido, se adotado pela planilha, é ignorado somente na
linha definida pelo contrato. Qualquer outro valor não vazio e inválido reprova
a configuração inteira; não há aceitação silenciosa de um subconjunto.

Regras de normalização e validação:

- protocolo obrigatório `https:`;
- host permitido `script.google.com`;
- caminho no formato `/macros/s/<deployment-id>/exec`;
- sem usuário, senha, fragmento ou parâmetros previamente definidos;
- comparação de duplicidade após normalização de host, porta e barra final;
- quantidade máxima inicial: 20 endpoints, para limitar abuso e rajadas;
- ordem canônica: ordem de aparição na coluna H.

O cliente lê a coluna H novamente ao iniciar, mas fixa no cache da sessão a lista
normalizada, sua impressão SHA-256 e o endpoint atribuído. Se a lista mudar após
o primeiro `NAME_REQUEST` ou `VOTE`, ele bloqueia nova publicação e pede
intervenção administrativa; não migra silenciosamente.

## 6. Construção das consultas

A URL da coluna H é uma URL base. Exemplos conceituais:

```text
GET <endpoint>?action=health
GET <endpoint>?action=messages&sessionId=<uuid>&after=0&limit=500
POST <endpoint>  corpo: {"action":"append","sessionId":"<uuid>","message":{...}}
```

Para evitar preflight incompatível com Web Apps simples, o `POST` pode enviar
JSON como `text/plain;charset=UTF-8`; o endpoint sempre interpreta e valida o
corpo como JSON. Tipo de conteúdo não é mecanismo de autenticação.

Respostas têm MIME `application/json`, `ok: true|false` e nunca indicam sucesso
apenas porque o HTTP terminou. O chamador valida esquema, sessão, endpoint,
cursores, hashes e conteúdo assinado.

## 7. Divisão dos aparelhos entre endpoints

Se houver `M` endpoints, cada aparelho usa exatamente um deles para
`NAME_REQUEST`, leitura de autorização e `VOTE`. Mensagens administrativas são
replicadas nos `M` endpoints; servidor e painel leem e agregam todos.

A atribuição é determinística:

```text
digest = SHA-256(uuid + ":" + deviceId + ":" + fingerprintDaListaDeEndpoints)
indice = inteiroSemSinalDosPrimeiros8Bytes(digest) mod M
endpoint = endpoints[indice]
```

Assim, o mesmo aparelho permanece no mesmo endpoint em recargas e a divisão é
aproximadamente uniforme sem revelar o endpoint na URL. Para 100 aparelhos e
três endpoints, a expectativa é aproximadamente 33 por endpoint, mas o hash não
garante exatamente 34/33/33. A interface do servidor mostra a ocupação observada
de cada endpoint.

Se for exigida diferença máxima exata de uma pessoa, será necessário um alocador
central atômico ou links previamente divididos; isso não faz parte desta revisão,
pois introduziria um novo ponto único de contenção.

Um endpoint indisponível não causa realocação automática. Trocar o índice depois
de uma publicação poderia duplicar identidade e voto.

## 8. Guia por sessão na planilha de canal

Cada endpoint mantém uma guia cujo nome é exatamente o UUID canônico da sessão.
Antes de criar:

1. valida o UUID;
2. adquire `LockService.getScriptLock()`;
3. procura novamente uma guia com esse nome dentro do bloqueio;
4. cria somente se ainda não existir;
5. escreve e valida o cabeçalho;
6. congela a primeira linha.

Duas requisições simultâneas nunca podem criar duas guias para a mesma sessão.
Se a guia existir com cabeçalho incompatível, o endpoint falha fechado e não a
sobrescreve. Guias nunca são apagadas ou reutilizadas automaticamente.

Contrato da guia:

| Coluna | Conteúdo |
|---|---|
| A | cursor inteiro crescente da sessão |
| B | tipo da mensagem |
| C | identificador idempotente |
| D | instante de recebimento do endpoint |
| E | JSON integral recebido como texto |
| F | SHA-256 base64url do JSON |

O UUID não precisa ser repetido em cada linha porque identifica a própria guia.
Mensagens são append-only. Cursor e identificador idempotente são locais à guia.

## 9. Publicação e consulta

### 9.1 Publicação

O endpoint aceita somente os tipos `PUBLIC_KEY`, `NAME_REQUEST` e `VOTE`.
`SPREADSHEET` não é mais aceito. Ele valida ao menos:

- tamanho do corpo;
- JSON e ação;
- UUID externo e `message.sessionId` idênticos;
- versão e tipo do protocolo;
- identificador idempotente obrigatório;
- ausência de valores inesperados usados como cursor ou nome de guia.

Sob bloqueio exclusivo, procura o identificador na guia. Repetição com JSON e
hash idênticos devolve o recibo original; conteúdo diferente com o mesmo ID
retorna conflito; conteúdo novo recebe o próximo cursor e uma única linha.

### 9.2 Consulta

`action=messages` recebe `sessionId`, `after` e `limit`. A resposta contém os
registros em ordem crescente, `hasMore` e `nextAfter`. Guia inexistente retorna
histórico vazio e não precisa ser criada por uma leitura.

Buraco de cursor, hash alterado, identificador conflitante, sessão divergente ou
paginação incoerente é falha de integridade. O servidor e o painel mantêm cursores
independentes por endpoint.

### 9.3 Saúde

`action=health` prova apenas que a implantação responde e consegue abrir sua
planilha. Não cria guia e não substitui a verificação de publicação/leitura da
chave pública no 3º passo.

## 10. Código de referência para cada Apps Script

O código abaixo deve ser colocado no projeto Apps Script vinculado a cada
planilha de canal. Depois de colar, execute `configurar()` uma vez como
proprietário e publique como Web App executado pelo proprietário, acessível aos
usuários previstos pela implantação. Cada URL `/exec` publicada é então colocada
em uma célula da coluna H da planilha mestre.

Este trecho corresponde ao contrato implementado em `google-apps-script/Code.gs`.

```javascript
const MAX_BODY_BYTES = 100000;
const MAX_PAGE_SIZE = 500;
const TYPES = new Set(['PUBLIC_KEY', 'NAME_REQUEST', 'VOTE']);
const HEADER = ['cursor', 'type', 'id', 'receivedAt', 'json', 'sha256'];

function configurar() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Vincule este script a uma planilha.');
  PropertiesService.getScriptProperties()
    .setProperty('SPREADSHEET_ID', spreadsheet.getId());
}

function doGet(e) {
  return responder_(function () {
    const params = (e && e.parameter) || {};
    if (params.action === 'health') {
      const spreadsheet = planilha_();
      return { ok: true, service: 'election-channel', spreadsheetId: spreadsheet.getId() };
    }
    if (params.action !== 'messages') throw erro_(400, 'Ação inválida.');
    const sessionId = uuid_(params.sessionId);
    const after = inteiro_(params.after || '0', 0, Number.MAX_SAFE_INTEGER, 'after');
    const limit = inteiro_(params.limit || String(MAX_PAGE_SIZE), 1, MAX_PAGE_SIZE, 'limit');
    const sheet = planilha_().getSheetByName(sessionId);
    if (!sheet) return { ok: true, sessionId, records: [], hasMore: false, nextAfter: after };
    validarCabecalho_(sheet);
    const lastRow = sheet.getLastRow();
    const records = [];
    if (lastRow > 1) {
      const rows = sheet.getRange(2, 1, lastRow - 1, HEADER.length).getDisplayValues();
      for (const row of rows) {
        const cursor = Number(row[0]);
        if (cursor <= after) continue;
        records.push({
          cursor: cursor,
          type: row[1],
          id: row[2],
          receivedAt: row[3],
          json: row[4],
          hash: row[5]
        });
        if (records.length === limit + 1) break;
      }
    }
    const hasMore = records.length > limit;
    if (hasMore) records.pop();
    const nextAfter = records.length ? records[records.length - 1].cursor : after;
    return { ok: true, sessionId, records, hasMore, nextAfter };
  });
}

function doPost(e) {
  return responder_(function () {
    const raw = String(e && e.postData && e.postData.contents || '');
    if (!raw) throw erro_(400, 'Corpo ausente.');
    if (Utilities.newBlob(raw).getBytes().length > MAX_BODY_BYTES) {
      throw erro_(413, 'Corpo excessivo.');
    }
    let input;
    try { input = JSON.parse(raw); } catch (_) { throw erro_(400, 'JSON inválido.'); }
    if (input.action !== 'append' || !input.message || typeof input.message !== 'object') {
      throw erro_(400, 'Publicação inválida.');
    }
    const sessionId = uuid_(input.sessionId);
    const message = input.message;
    if (message.sessionId !== sessionId || message.protocolVersion !== 1 || !TYPES.has(message.type)) {
      throw erro_(400, 'Sessão, versão ou tipo inválido.');
    }
    const id = idempotencia_(message);
    const json = JSON.stringify(message);
    const hash = sha256_(json);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) throw erro_(503, 'Canal ocupado.');
    try {
      const sheet = guiaDaSessao_(sessionId);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const rows = sheet.getRange(2, 1, lastRow - 1, HEADER.length).getDisplayValues();
        for (const row of rows) {
          if (row[2] !== id) continue;
          if (row[4] !== json || row[5] !== hash) {
            throw erro_(409, 'Identificador idempotente conflitante.');
          }
          return {
            ok: true,
            duplicate: true,
            sessionId,
            cursor: Number(row[0]),
            id,
            hash,
            receivedAt: row[3]
          };
        }
      }
      const cursor = lastRow === 1 ? 1 : Number(sheet.getRange(lastRow, 1).getValue()) + 1;
      if (!Number.isSafeInteger(cursor) || cursor < 1) throw erro_(500, 'Cursor inválido.');
      const receivedAt = new Date().toISOString();
      const range = sheet.getRange(lastRow + 1, 1, 1, HEADER.length);
      range.setNumberFormat('@');
      range.setValues([[String(cursor), message.type, id, receivedAt, json, hash]]);
      SpreadsheetApp.flush();
      return { ok: true, duplicate: false, sessionId, cursor, id, hash, receivedAt };
    } finally {
      lock.releaseLock();
    }
  });
}

function guiaDaSessao_(sessionId) {
  const spreadsheet = planilha_();
  let sheet = spreadsheet.getSheetByName(sessionId);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sessionId);
    sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
    sheet.setFrozenRows(1);
  }
  validarCabecalho_(sheet);
  return sheet;
}

function validarCabecalho_(sheet) {
  const actual = sheet.getRange(1, 1, 1, HEADER.length).getDisplayValues()[0];
  if (!HEADER.every(function (value, index) { return actual[index] === value; })) {
    throw erro_(409, 'Guia da sessão possui cabeçalho incompatível.');
  }
}

function planilha_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw erro_(500, 'Execute configurar() antes de publicar.');
  return SpreadsheetApp.openById(id);
}

function idempotencia_(message) {
  let id = '';
  if (message.type === 'PUBLIC_KEY') {
    id = String(message.signingKeyFingerprint || '') + ':PUBLIC_KEY';
  } else if (message.type === 'NAME_REQUEST') {
    id = String(message.requestId || '');
  } else if (message.type === 'VOTE') {
    id = String(message.ballotId || '');
  }
  if (!id || id.length > 300) throw erro_(400, 'Identificador idempotente ausente.');
  return id;
}

function uuid_(value) {
  const text = String(value || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw erro_(400, 'UUID inválido.');
  }
  return text;
}

function inteiro_(value, min, max, name) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value))) throw erro_(400, name + ' inválido.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw erro_(400, name + ' inválido.');
  }
  return number;
}

function sha256_(text) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
  ).replace(/=+$/, '');
}

function erro_(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function responder_(operation) {
  let result;
  try {
    result = operation();
  } catch (error) {
    result = { ok: false, status: error.status || 500, error: error.message || 'Erro interno.' };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Limitação relevante do Web App: o corpo JSON informa um campo lógico `status`,
pois `ContentService` não oferece controle completo de status HTTP e cabeçalhos
CORS. Portanto, o navegador deve validar `ok` e `status` no JSON, sem considerar
HTTP 200 isoladamente como sucesso.

## 11. Segurança e integridade

- A coluna H é configuração pública e não pode conter segredo, token ou chave.
- Qualquer pessoa que conheça um endpoint público pode tentar enviar dados; a
  aplicação só confia em mensagens com assinatura eleitoral válida.
- O Apps Script faz validação estrutural e idempotência, mas a validação
  criptográfica completa continua obrigatória no servidor, cliente e painel.
- A impressão da lista de endpoints integra o vínculo local para detectar troca.
- A raiz de confiança continua sendo `#k=`, não a planilha ou o endpoint.
- Nenhuma chave privada é publicada ou enviada ao Apps Script.
- JSON é gravado como texto; nenhuma parte dele é executada como fórmula.
- Logs de produção não devem registrar votos completos, chaves ou corpos brutos.
- Acesso de edição às planilhas de canal fica restrito aos administradores.
- Alteração manual de linha, cursor, JSON ou hash bloqueia confirmação/apuração.

## 12. Estados de interface

### Servidor

```text
sem uuid -> 1º Passo
uuid válido, sem sheet-id -> 2º Passo
uuid e sheet-id válidos, planilha/endpoints válidos -> 3º Passo
planilha ou endpoints inválidos -> permanece no passo atual, falha fechada
chave publicada em parte dos endpoints -> configuração divergente
chave confirmada em todos -> links, QRs e administração liberados
```

### Cliente

```text
uuid/sheet-id/#k ausente ou inválido -> página vazia ou erro fechado conforme Spec 001
planilha válida -> descobre endpoints
deviceId disponível -> calcula e fixa endpoint
lista alterada após publicação -> bloqueado, sem migração
endpoint indisponível -> mantém vínculo e permite tentar novamente
```

### Painel

```text
planilha válida -> descobre todos os endpoints
rodada -> consulta todos em paralelo com cursores independentes
um endpoint falhou -> preserva último estado e marca total provisório
todos íntegros -> mostra total consolidado
```

## 13. Critérios de aceite

- [ ] Abrir `/servidor/` sem parâmetros mostra somente o 1º passo solicitado.
- [ ] **Gerar chave de sessão** cria UUID e recarrega com `?uuid=`.
- [ ] Com UUID e sem `sheet-id`, aparece somente o 2º passo solicitado.
- [x] A planilha só é aceita quando seu contrato e todos os endpoints da coluna H respondem.
- [ ] O sucesso do 2º passo recarrega com `uuid` e `sheet-id`, sem URL completa.
- [ ] Com os dois parâmetros válidos, aparece o 3º passo solicitado.
- [ ] Não existe botão nem mensagem `SPREADSHEET` para publicar a planilha.
- [ ] Cliente e painel obtêm a planilha pelo `sheet-id` da própria URL.
- [ ] O JavaScript completa as URLs base dos endpoints para leitura e escrita.
- [x] URLs inválidas ou duplicadas na coluna H fazem a configuração falhar inteira.
- [ ] Cada aparelho fica vinculado deterministicamente a um único endpoint.
- [ ] A distribuição por hash é aproximadamente uniforme e a ocupação é visível.
- [ ] A chave pública assinada é registrada e confirmada em todos os endpoints.
- [ ] Sucesso parcial da chave bloqueia a liberação dos links e QRs.
- [ ] Cada planilha de canal cria no máximo uma guia para cada UUID.
- [ ] Sessões diferentes usam guias diferentes na mesma planilha de canal.
- [ ] Requisições concorrentes não criam guia duplicada nem cursor duplicado.
- [ ] `PUBLIC_KEY`, `NAME_REQUEST` e `VOTE` são append-only e idempotentes.
- [ ] Leitura é paginada, ordenada e verificável por cursor e hash.
- [ ] A mesma planilha e endpoint podem ser reutilizados em nova sessão sem misturar dados.
- [ ] Nenhuma chave privada ou credencial aparece em URL, planilha ou mensagem.
- [x] Imagens na coluna A e o booleano de exibição por bloco integram a cédula.
- [x] A ação de geração descreve corretamente a criptografia assimétrica.

## 14. Testes mínimos futuros

- URL: ausência, repetição, caixa, caracteres inválidos e combinação de parâmetros;
- assistente: entrada direta em cada passo, recarga, voltar/avançar e falhas;
- planilha mestre: inacessível, contrato inválido, H vazia, duplicada e malformada;
- endpoint: saúde, timeout, resposta não JSON, `ok:false` e implantação removida;
- atribuição: estabilidade por aparelho/sessão/lista e distribuição estatística;
- guia: criação concorrente, reuso, cabeçalho incompatível e sessões distintas;
- publicação: duplicata idêntica, conflito, corpo excessivo e tipo inválido;
- leitura: vazio, paginação, `hasMore`, buraco, hash alterado e retomada;
- configuração: chave pública em todos, sucesso parcial e reconciliação;
- integração: nome, autorização, voto, confirmação, painel e apuração em vários endpoints;
- carga: quantidade-alvo real de aparelhos e quantidade máxima configurada de endpoints;
- segurança: fórmula, adulteração de mensagem, troca de coluna H e ausência de segredos.

## 15. Decisões e ponto pendente

Decisões desta revisão:

- a URL transporta somente UUID, `sheet-id` e, quando aplicável, `#k=`;
- a planilha mestre contém os endpoints na coluna H;
- endpoints são descobertos dinamicamente, não limitados a exatamente três;
- aparelhos são distribuídos por hash determinístico, com equilíbrio aproximado;
- a planilha deixa de ser publicada como mensagem administrativa;
- a chave pública é replicada em todos os endpoints;
- cada sessão possui sua própria guia em cada planilha de canal;
- o código Apps Script desta spec está implementado em `google-apps-script/Code.gs`.

O rótulo foi corrigido para **“Gerar chaves para Criptografia Assimétrica”**,
pois a ação gera/importa os pares RSA/ECDSA; cada voto continua usando uma chave
AES-GCM própria no modelo híbrido.
