# Spec 004 — Autorização administrativa e privacidade da sessão

- **Estado:** implementada
- **Revisão:** 1
- **Depende de:** Specs 001, 002 e 003
- **Tipo:** correção de segurança, autorização e minimização de dados
- **Implementação:** protocolo 2 em `shared/`, `servidor/`, `cliente/`, `painel/`
  e `google-apps-script/`.

## 1. Motivação

A página `/servidor/` é uma aplicação estática, não um servidor protegido. Uma URL
de cliente contém `uuid` e `sheet-id`; trocar o caminho de `/cliente/` para
`/servidor/` permite abrir a interface administrativa em outro navegador. Na
implementação atual, esse navegador pode gerar um novo par administrativo,
publicar outra `PUBLIC_KEY`, ler solicitações `NAME_REQUEST`, criar links e painéis
paralelos e consultar todo o histórico público dos canais.

A âncora `#k=` continua protegendo clientes que receberam o QR legítimo: eles
ignoram chaves com outra impressão digital. Ela, porém, autentica a configuração
para o eleitor e não autoriza o operador da página servidor. Uma chave
autoassinada comprova posse daquela chave, mas não comprova que ela pertence ao
administrador legítimo da sessão.

Esta spec introduz autorização efetiva nos endpoints. Ocultar, renomear ou
desabilitar visualmente `/servidor/` não é controle de acesso e não satisfaz esta
spec.

## 2. Objetivos

- permitir apenas ao aparelho administrativo que criou ou restaurou a sessão
  executar operações privilegiadas;
- fixar uma única autoridade administrativa por sessão em cada endpoint;
- impedir publicação de uma segunda `PUBLIC_KEY` por outra autoridade;
- não entregar nomes, solicitações ou votos pelo histórico público;
- mover a validação de pessoas para armazenamento privado;
- impedir criação ilimitada de guias para UUIDs arbitrários;
- preservar a confirmação de envio e a operação do cliente sem credenciais;
- manter a chave privada de decifragem somente no navegador administrativo;
- oferecer recuperação por backup cifrado, sem colocar segredo administrativo no
  QR do eleitor.

## 3. Fora de escopo

- esconder a existência das rotas estáticas;
- identificar pessoas pelo endereço MAC;
- autenticar a identidade civil do eleitor automaticamente;
- tornar anônimos IP, horário e tamanho das requisições perante Google/rede;
- substituir auditoria organizacional por criptografia;
- aceitar silenciosamente sessões antigas inseguras.

## 4. Modelo de ameaça

Considera-se atacante qualquer pessoa que tenha recebido ou fotografado o QR de
votação e, portanto, conheça `uuid`, `sheet-id`, `#k=` e os endpoints publicados
na planilha mestre. O atacante pode:

- alterar livremente caminhos, query string e fragmentos no navegador;
- executar o JavaScript do projeto e construir requisições próprias;
- gerar pares RSA, ECDSA e chaves de aparelho válidas;
- ler toda informação oferecida por uma API pública;
- enviar requisições concorrentes, repetidas ou malformadas;
- distribuir um QR falso para outros participantes.

Pressupostos mantidos:

- HTTPS, navegador e Web Crypto do aparelho administrativo não estão
  comprometidos;
- o atacante não possui o segredo administrativo nem o backup cifrado;
- somente responsáveis autorizados editam ou implantam o Apps Script e suas
  planilhas privadas;
- a origem estática pode ser lida por qualquer pessoa e não contém segredos.

## 5. Papéis e dados

### 5.1 Público/eleitor

Pode obter apenas:

- configuração pública e chave administrativa fixada;
- estado público da cédula;
- confirmação de uma mensagem específica mediante identificadores suficientes;
- situação de autorização do próprio `deviceId`, sem nome e sem lista global.

Pode publicar apenas `NAME_REQUEST` e `VOTE`, sujeitos a esquema, assinatura,
limites e sessão previamente registrada.

### 5.2 Administrador

Pode, depois de autenticado:

- registrar e publicar a chave pública da eleição;
- consultar solicitações de identificação;
- aprovar, rejeitar ou revogar um `deviceId`;
- consultar os envelopes de votos e realizar apuração local;
- emitir acesso ao painel;
- encerrar administrativamente a sessão.

### 5.3 Painel

O painel deixa de ser implicitamente público. Usa uma capacidade somente de
leitura, diferente da capacidade administrativa, e pode consultar apenas nomes
validados e estado de recebimento. Não pode publicar chaves, validar pessoas,
obter envelopes cifrados nem alterar a sessão.

## 6. Capacidade administrativa

### 6.1 Geração

No 1º passo, junto com o UUID, o navegador gera `adminCapability`, com 32 bytes
aleatórios de `crypto.getRandomValues`, codificados em base64url sem padding. O
valor possui 43 caracteres e pelo menos 256 bits de entropia.

O segredo é armazenado sob o namespace da sessão no navegador administrativo e
nunca aparece:

- no QR ou link do eleitor;
- em `uuid`, `sheet-id` ou `#k=`;
- na planilha mestre pública;
- em mensagens ou respostas públicas;
- em logs e mensagens de erro;
- no DOM depois que a ação que precisa dele termina.

Não se usa senha humana como capacidade. O backup cifrado definido na Spec 001
passa a incluir `adminCapability` e os dados de registro da sessão.

### 6.2 Armazenamento no endpoint

O endpoint armazena somente:

- `sessionId`;
- `adminCapabilityHash = SHA-256(adminCapability)`;
- impressão e chave pública administrativa fixadas;
- estado e datas da sessão;
- hash da lista canônica de endpoints;
- versão do protocolo.

O segredo em claro não é persistido. Comparações de hashes devem evitar retorno
antecipado dependente do primeiro byte divergente.

### 6.3 Transporte

Operações privilegiadas usam `POST` HTTPS com corpo `text/plain;charset=UTF-8`.
A capacidade vai no corpo, nunca na query string. Ela não pode ser reenviada em
respostas. Requisições privilegiadas também incluem `requestId`, `issuedAt` e
`nonce`; o endpoint rejeita horário fora da janela configurada e repetição do
mesmo nonce para reduzir replay.

Como reforço de integridade, o corpo administrativo é assinado pela chave ECDSA
administrativa. São obrigatórios os dois fatores criptográficos da sessão:

1. hash correto da capacidade;
2. assinatura válida pela chave administrativa fixada.

Conhecer somente a capacidade ou somente a chave privada de assinatura não basta
para alterar a sessão.

## 7. Registro atômico da sessão

### 7.1 Momento do registro

Depois que o 2º passo validar a planilha e seus endpoints, mas antes de publicar
chaves ou exibir links, o servidor registra a sessão em todos os endpoints. Até a
confirmação completa, a interface permanece em **registro pendente** e não libera
QR, painel, validação nem apuração.

O UUID não deve ser compartilhado antes desse registro. A segurança do primeiro
registro combina UUID imprevisível, capacidade aleatória e ausência de divulgação
prévia. Para cenários que não aceitem confiança no primeiro uso, a implantação
deve exigir provisionamento autenticado pelo proprietário do Apps Script.

### 7.2 Contrato de registro

Conceitualmente:

```json
{
  "action": "registerSession",
  "sessionId": "<uuid>",
  "adminCapability": "<segredo>",
  "adminSigningPublicKeyJwk": {},
  "adminSigningKeyFingerprint": "<sha256-base64url>",
  "encryptionPublicKeyPem": "<RSA-SPKI>",
  "encryptionKeyFingerprint": "<sha256-base64url>",
  "endpointListFingerprint": "<sha256-base64url>",
  "requestId": "<uuid>",
  "issuedAt": "<ISO-8601>",
  "nonce": "<base64url>",
  "signature": "<base64url>"
}
```

O endpoint, sob lock:

1. valida limites, algoritmos, impressões e assinatura;
2. se a sessão não existe, grava o registro e cria sua estrutura privada;
3. se existe com exatamente a mesma autoridade e conteúdo, responde duplicata
   idempotente;
4. se existe com outra capacidade, chave ou lista de endpoints, rejeita com
   conflito sem revelar qual campo divergiu;
5. nunca cria guia apenas porque recebeu `NAME_REQUEST` ou `VOTE`.

### 7.3 Vários endpoints e sucesso parcial

O mesmo registro é enviado a todos os endpoints. Sucesso parcial não libera a
sessão. A repetição usa o mesmo conteúdo e `requestId`. Se algum endpoint já
estiver registrado por outra autoridade, a sessão é marcada como comprometida e
um novo UUID deve ser criado; não há tomada automática de posse.

## 8. Fixação da autoridade e publicação de chave

Depois do registro:

- somente a chave ECDSA fixada pode assinar operações administrativas;
- somente a capacidade cujo hash foi registrado pode autorizá-las;
- existe exatamente uma chave pública RSA ativa por sessão;
- `PUBLIC_KEY` com outra autoridade ou impressão é rejeitada no endpoint;
- rotação de chave exige operação administrativa específica, confirmação forte,
  ausência de votos ou procedimento de migração auditável;
- uma mensagem autoassinada por chave não fixada nunca cria uma autoridade
  paralela.

O `#k=` do QR continua sendo a impressão pública da chave ECDSA fixada. Cliente e
painel rejeitam qualquer configuração que não corresponda a ela.

## 9. APIs públicas e privadas

### 9.1 Remoção do histórico público integral

`GET action=messages` não pode continuar devolvendo todos os registros. Ele é
removido ou passa a responder somente dados explicitamente públicos. Não pode
retornar:

- nomes ou conteúdo de `NAME_REQUEST`;
- lista de aparelhos;
- envelopes completos de `VOTE`;
- capacidades, hashes de capacidade ou nonces administrativos;
- dados suficientes para reproduzir operações privilegiadas.

### 9.2 Operações públicas mínimas

O contrato deve oferecer operações específicas, em vez de uma varredura geral:

- `publicConfig(sessionId)`: chave pública e metadados públicos fixados;
- `authorizationStatus(sessionId, deviceId)`: booleano/estado do aparelho, sem
  nome e sem lista de terceiros;
- `messageReceipt(sessionId, type, id, deviceId)`: confirmação mínima de uma
  publicação específica;
- `appendNameRequest`: publicação autoassinada de pedido de identificação;
- `appendVote`: publicação autoassinada do envelope cifrado.

As respostas não informam se outros nomes ou identificadores existem.

### 9.3 Operações administrativas

Todas usam capacidade e assinatura administrativas:

- `listNameRequests`;
- `approveDevice`, `rejectDevice` e `revokeDevice`;
- `listEncryptedVotes`;
- `sessionStatus` completo;
- `issuePanelCapability` e `revokePanelCapability`;
- eventual rotação ou encerramento da sessão.

Paginação, cursores, hashes e idempotência continuam obrigatórios. Falha de
autorização retorna erro genérico e não distingue sessão, capacidade ou assinatura.

## 10. Validação e planilha mestre

A coluna F da planilha mestre pública deixa de ser fonte de autorização. Nomes e
`deviceId` validados são armazenados exclusivamente na área privada dos endpoints.
A planilha mestre contém apenas cédula, estado público e endpoints.

Fluxo novo:

1. cliente publica `NAME_REQUEST` autoassinada;
2. administrador autenticado consulta solicitações privadas;
3. administrador aprova ou rejeita na própria interface;
4. a decisão é replicada de forma idempotente em todos os endpoints;
5. cliente consulta somente o estado do próprio `deviceId`;
6. voto somente é aceito/contado se o `deviceId` estiver aprovado e a assinatura
   corresponder à chave registrada no pedido.

Não haverá mais instrução para copiar `Nome-deviceId` para uma planilha pública.
Conflitos de mesmo nome em aparelhos diferentes continuam destacados apenas ao
administrador.

## 11. Confirmação e apuração

- o cliente confirma seu envio por consulta específica de recibo, sem ler votos
  de terceiros;
- o endpoint valida autorização antes de aceitar `VOTE`, além de a apuração
  revalidar tudo;
- um voto deve indicar a impressão da chave RSA ativa e o endpoint rejeita chave
  diferente;
- o administrador baixa envelopes somente mediante autorização;
- a decifragem continua local no navegador administrativo;
- nenhuma resposta individual em claro é enviada de volta ao endpoint;
- relatório e totais não associam nome a escolhas.

Uma votação recebida por QR produzido por autoridade não fixada deve falhar antes
do envio ou ser rejeitada pelo endpoint, nunca aparecer como voto confirmado.

## 12. Painel com privilégio mínimo

O administrador emite uma capacidade aleatória de painel com escopo somente de
leitura e prazo de validade. Ela pode ser transportada no fragmento do link do
painel, pois o fragmento não é enviado na navegação, mas o painel a utiliza apenas
em requisições HTTPS privadas e deve removê-la da barra/endereço visível após
guardá-la em memória de sessão.

O painel recebe somente:

- nome ou rótulo autorizado para exibição;
- estado `aguardando`/`recebido`;
- totais agregados e saúde operacional estritamente necessária.

A capacidade do painel não permite obter conteúdo cifrado dos votos nem executar
qualquer escrita. Deve ser revogável sem trocar a autoridade administrativa.

## 13. Interface da página servidor

Ao abrir `/servidor/?uuid=...&sheet-id=...` sem capacidade local válida:

- não mostra geração/publicação de chaves, pessoas, painel ou resultados;
- não consulta dados privados;
- informa apenas que o aparelho não está autorizado;
- oferece importar um backup cifrado válido;
- não oferece “assumir” ou recriar a administração da sessão.

A mera troca de `/cliente/` para `/servidor/` deve, portanto, produzir uma página
sem privilégios. Após restaurar backup, o navegador prova capacidade e assinatura
antes de carregar controles administrativos.

Estados adicionais:

```text
capacidade ausente -> aparelho não autorizado
capacidade/chave inválida -> acesso negado, sem dados privados
registro ainda não iniciado -> assistente local, sem QR liberado
registro parcial -> bloqueado para reconciliação
registro conflitante -> sessão comprometida; criar novo UUID
registro convergente -> administração habilitada
```

## 14. Limites e resistência a abuso

Cada endpoint aplica, no mínimo:

- rejeição de UUID não registrado;
- limite de tamanho por tipo de mensagem;
- limite total e por janela para sessão, IP quando disponível e `deviceId`;
- uma solicitação ativa por `deviceId`, com atualização idempotente controlada;
- no máximo um voto aceito por `deviceId` e `ballotId` conforme regra eleitoral;
- quantidade máxima de registros e retenção definida;
- validação criptográfica antes de gravar mensagens custosas;
- nenhuma criação automática ilimitada de guias;
- contadores e alerta de rejeições/quota sem expor dados pessoais em logs.

Limites não substituem autenticação. Erros de cota devem falhar fechados e nunca
autorizar troca silenciosa de endpoint ou chave.

## 15. Migração e compatibilidade

Sessões criadas pelo protocolo anterior não possuem capacidade nem autoridade
fixada no endpoint. Elas são classificadas como **legadas e inseguras**.

- não há migração automática por “primeiro que reivindicar”, pois isso permitiria
  sequestro de sessão conhecida;
- para produção, cria-se novo UUID sob o protocolo desta spec;
- dados legados podem ser consultados apenas por procedimento administrativo fora
  do fluxo público e, se necessário, exportados para auditoria;
- a versão do protocolo diferencia mensagens e contratos antigos dos novos;
- depois da implantação, endpoints não aceitam novas sessões do protocolo antigo.

Se uma chave não autorizada já tiver sido publicada durante teste, a sessão não
deve ser promovida a eleição real. Deve-se registrar nova sessão após a correção.

## 16. Auditoria e operação

Eventos administrativos mantêm trilha append-only contendo ação, instante,
`requestId`, impressão da chave autora e resultado, mas nunca a capacidade ou
chaves privadas. Aprovação, rejeição, revogação, emissão de painel, rotação e
encerramento são auditáveis.

Antes da eleição, o responsável deve:

1. registrar a sessão e verificar convergência de todos os endpoints;
2. baixar e testar restauração do backup cifrado;
3. conferir a impressão `#k=` em canal independente;
4. restringir edição das planilhas e implantação do Apps Script;
5. realizar ensaio de acesso por segundo aparelho, spam e QR adulterado;
6. iniciar a votação somente depois de todos os controles passarem.

## 17. Critérios de aceite

- [ ] Trocar `/cliente/` por `/servidor/` em outro aparelho não libera controles nem dados.
- [ ] UUID e `sheet-id` válidos não são suficientes para autorização administrativa.
- [ ] A capacidade administrativa possui 256 bits, não aparece no QR e não é persistida no endpoint em claro.
- [ ] A sessão é registrada atomicamente e converge em todos os endpoints antes de liberar QR.
- [ ] Endpoint rejeita UUID não registrado sem criar guia ou outro armazenamento.
- [ ] Uma segunda capacidade ou chave administrativa não publica `PUBLIC_KEY` na sessão.
- [ ] Repetição idempotente pelo administrador original é aceita.
- [ ] Operações administrativas exigem capacidade válida e assinatura da chave fixada.
- [ ] Replays com nonce usado ou horário fora da janela são rejeitados.
- [ ] API pública não lista `NAME_REQUEST`, nomes, aparelhos ou envelopes de votos.
- [ ] Cliente consulta apenas autorização e recibo referentes ao próprio aparelho/mensagem.
- [ ] Coluna F pública deixa de conceder autorização.
- [ ] Aprovação e revogação ocorrem por API administrativa e convergem nos endpoints.
- [ ] Voto para chave RSA diferente da chave ativa é rejeitado.
- [ ] QR falso de autoridade não fixada não consegue confirmar voto.
- [ ] Apuração continua local e não publica respostas em claro.
- [ ] Painel usa credencial própria, somente leitura, com expiração e revogação.
- [ ] Backup cifrado restaura chaves, capacidade e acesso administrativo.
- [ ] Sessão legada não pode ser reivindicada automaticamente.
- [ ] Limites impedem criação irrestrita de guias e crescimento ilimitado por aparelho.
- [ ] Logs e erros não revelam capacidade, chave privada, nomes desnecessários ou conteúdo de voto.

## 18. Testes mínimos futuros

### Autorização

- acesso ao servidor com URL do cliente, com e sem `#k=`;
- capacidade ausente, alterada, truncada, repetida e pertencente a outra sessão;
- assinatura por chave não fixada e capacidade correta isoladamente;
- capacidade correta e assinatura correta em conjunto;
- nonce repetido, relógio adiantado/atrasado e `requestId` duplicado;
- registro concorrente por duas autoridades e registro parcial em vários endpoints;
- restauração por backup correto, senha errada e backup de outro UUID.

### Privacidade

- varredura de todas as operações públicas sem retorno de nomes ou envelopes;
- consulta de autorização de outro aparelho sem enumeração;
- painel sem permissão administrativa e painel revogado/expirado;
- ausência de segredo em URL, DOM persistente, planilha, resposta, erro e log.

### Integridade eleitoral

- segunda `PUBLIC_KEY`, rotação não autorizada e QR falso;
- voto cifrado para chave errada;
- voto de aparelho não aprovado, revogado ou com chave divergente;
- duplicidade por `deviceId`/`ballotId` e conflitos entre endpoints;
- alteração da lista de endpoints após registro;
- apuração com histórico completo, incompleto e adulterado.

### Abuso e disponibilidade

- UUID inexistente não cria guia;
- rajadas de `NAME_REQUEST`, `VOTE` e corpos no limite;
- excesso por aparelho, sessão e origem disponível;
- esgotamento de quota, lock concorrente e recuperação idempotente;
- retenção e limite máximo sem remoção silenciosa de votos válidos.

## 19. Decisões desta revisão

- segurança administrativa será aplicada no endpoint, não pela ocultação da rota;
- a sessão usará capacidade aleatória mais assinatura administrativa;
- a autoridade será fixada antes da divulgação de qualquer QR;
- o histórico integral deixará de ser público;
- validações sairão da planilha mestre pública;
- o painel terá capacidade distinta e somente de leitura;
- sessões antigas não serão reivindicadas automaticamente;
- nenhum código de produção é alterado por esta especificação.

## 20. Questões para revisão antes da implementação

- definir janela exata de `issuedAt` e retenção de nonces;
- definir limites por minuto/dia compatíveis com a quantidade real de eleitores;
- decidir se o estado público da votação permanece na planilha mestre ou migra
  para operação administrativa assinada;
- decidir o prazo padrão e o conteúdo nominal exibido pelo painel;
- avaliar se eleições de maior risco exigem provisionamento autenticado do UUID
  pelo proprietário do Apps Script, eliminando a confiança no primeiro uso;
- definir procedimento organizacional de guarda separada do backup e sua senha.
