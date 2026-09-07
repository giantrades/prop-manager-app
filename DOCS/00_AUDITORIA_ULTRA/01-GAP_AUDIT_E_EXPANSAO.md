# ULTRA AUDITORIA — Parte 1: Gap Audit + Expansão "Mega-App Útil"

> **SUPERSEDED PELO PIVOT (ver `00-PIVOT_RECONSTRUCAO.md`).** O dono decidiu reconstruir o
> app em vez de consertar o antigo. Este gap audit permanece como **especificação de
> requisitos** — cada P0/bug citado com `arquivo:linha` vira um requisito que o app NOVO
> deve satisfazer por construção, não um bugfix no código antigo. A expansão "mega-app útil"
> (§ SEÇÃO B) e os 30 gaps continuam 100% válidos como escopo do produto.


> Metodologia: clonei `github.com/giantrades/prop-manager-app` (branch `main`, commit
> `f26cea5`, 2026-09-06) e verifiquei linha a linha os bugs P0 e as premissas dos 24 docs
> antes de escrever qualquer recomendação. Onde confirmei, cito `arquivo:linha` exato.
> Onde a citação original estava certa mas incompleta, marquei **[CONFIRMADO+]**. Onde a
> citação original estava tecnicamente errada num detalhe, marquei **[CORRIGIDO]**. Onde
> não consegui verificar, digo **NÃO VERIFICADO** — não existe no plano nenhuma afirmação
> minha sobre código que eu não tenha lido de fato.

---

## 🔴 AÇÃO IMEDIATA — não espera o Stage 0

**Sua Google API Key e Client ID estão hardcoded e VIVOS em `packages/utils/googleDrive.js:6-7`,
no HEAD atual, num repositório público no GitHub, agora.** Não é ".env que pode ter sido
commitado" — é uma string literal em `.js`, dentro do histórico de 306 commits, clonável
por qualquer pessoa sem autenticação (eu mesmo cliquei sem token). Isso é independente
de qualquer stage do roadmap:

1. **Revogar/rotacionar a API key no Google Cloud Console hoje.** Enquanto ela existir,
   qualquer um com o link do repo pode usá-la (rate-limit no seu projeto, ou pior, abusar
   de quota associada à sua conta Google).
2. Restringir a nova key por **HTTP referrer** (seu domínio Netlify) no console do Google,
   nunca deixar sem restrição de novo.
3. Mover para env var (Netlify Build Environment), nunca para `main-app/.env` sozinho —
   **hoje ele não está commitado** (`git ls-files` não lista `.env`, `git log --all` não
   mostra nenhum commit que o tenha adicionado) — isso corrige parcialmente a citação
   original do bug #11, que tratava ".env commitado" como parte do problema; o problema
   real e comprovado é só o hardcode em `googleDrive.js:6-7`. Ainda assim, corrija o
   `.gitignore` (ver gap #7 abaixo) como prevenção.
4. Uma key vazada não "some" só porque você troca a variável — se ela ficou em 306
   commits de histórico público, considere o histórico do arquivo como comprometido
   permanentemente; rotacionar é obrigatório, reescrever histórico (`git filter-repo`)
   é opcional/cosmético depois disso.

---

## SEÇÃO A — Gap Audit por arquivo

| # | Arquivo | Veredito | O que falta para um agente júnior executar sem perguntar |
|---|---|---|---|
| 1 | `README.md` | **PARCIAL** | Falta critério de rollback entre stages (se Stage 2 falha o gate, o que acontece com Stage 3 já em paralelo?). Falta apontar para os 2 arquivos novos (Bridge/PWA spec). Sem estimativa de dias — adicionado no roadmap (Parte 2). |
| 2 | `AGENTS.md` | **PARCIAL** | Não resolve o conflito com `agent.md` da raiz (ver gap #1). Falta DoD diferenciado por tipo de mudança (schema vs UI vs bugfix têm riscos diferentes). Sem política de commit/branch por stage. |
| 3 | `00_VISAO/visao-produto.md` | **APROVADO conceitualmente / PARCIAL em métrica** | "O que NÃO construir" está certo mas sem métrica de sucesso (o que "excepcional no celular" significa em número — ver B.3). |
| 4 | `01_STAGE0_STABILIZE/00-tasks.md` | **PARCIAL** | Sem ordem de dependência entre tasks que tocam o mesmo arquivo (T0.1 e T0.4 editam `SyncProvider.tsx` — se um agente pegar os dois em paralelo, conflito garantido). Sem critério de teste por task. |
| 5 | `01_STAGE0_STABILIZE/01-bugs-P0.md` | **APROVADO tecnicamente — verifiquei 15/15 no código real** | Ver tabela de verificação abaixo. Faltam os efeitos colaterais que só aparecem lendo o código (ex: bug #1 também mata o pull via realtime, não só o push). |
| 6 | `01_STAGE0_STABILIZE/02-monitoramento.md` | **PARCIAL** | "Sentry (ou no mínimo sync_logs)" é uma decisão não tomada — vira ambiguidade em produção. Sem ação definida quando o alerta de quota dispara (só "toast" — bloqueia escrita? força export?). |
| 7 | `02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md` | **PARCIAL/ERRADO por omissão** | Sem índices, sem versionamento de campo, e o mais importante: `Trade.accounts[]` **já existe no código atual** (`dataStore.js:502`) mas não é mencionado como "campo dormente a religar" — reescrito na Parte 2. |
| 8 | `02_STAGE1_DOMAIN/01-DATA_CONTRACT.md` | **PARCIAL** | Eventos sem payload completo. Sem contrato de erro (o que a UI faz se o push falhar 3x?). Reescrito. |
| 9 | `02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md` | **PARCIAL/ERRADO em edge case** | Sharpe "remover net/10000" não diz qual denominador correto nem resolve que a série é por-trade (incompatível com `sqrt(252)`, que assume 1 retorno/dia). PF "nunca Infinity" não define o que mostrar quando `grossL=0 e grossW>0`. Reescrito com edge cases explícitos. |
| 10 | `02_STAGE1_DOMAIN/03-SYNC_PROTOCOL.md` | **PARCIAL/inviável como escrito** | "Merge campo-a-campo" pressupõe timestamp por campo, mas o contrato define só `updatedAt` por registro inteiro. Como escrito hoje, é impossível de implementar sem redesenhar o schema. Reescrito com 2 opções reais. |
| 11 | `03_STAGE2_DATA_ENGINE/00-arquitetura.md` | **ERRADO por omissão relevante** | Fala como se hoje já fosse IndexedDB. **Não é.** `dataStore.js` usa `localStorage.getItem/setItem('propmanager-data-v1')` como fonte de verdade (blob único). IndexedDB (`journal-db v2`, `quantower-ledger v1`) hoje é só espelho/cache do trading-journal. Ver B.0 abaixo — isso muda o risco real do Stage 2. |
| 12 | `03_STAGE2_DATA_ENGINE/01-tasks.md` | **PARCIAL** | Falta a task nomeada "unificar localStorage blob + 2 IndexedDBs em `app-db v3`" — hoje está implícita, precisa ser explícita porque é o item de maior risco do stage. |
| 13 | `03_STAGE2_DATA_ENGINE/02-offline-resiliencia.md` | **BOM/PARCIAL** | Sobrepõe com o Bridge v2 spec (version handshake) — defini a fonte única de verdade no novo `BRIDGE_V2_SPEC.md`. Sem tratamento para `/health` responder 500 (diferente de timeout/offline). |
| 14 | `04_STAGE3_TRADING_OS/00-produto.md` | **PARCIAL** | `accountModel.ts` **não existe ainda** no repo (confirmado — é greenfield, o que é esperado). Contrato de campos exato agora vive no DOMAIN_MODEL reescrito. |
| 15 | `04_STAGE3_TRADING_OS/01-tasks.md` | **PARCIAL** | Sem breakdown de T3.5. Sem menção à duplicação real de `isEntryFill` (achei em **5 arquivos**, não 3) nem ao parse de data duplicado em pelo menos 2 arquivos de Dashboard. |
| 16 | `04_STAGE3_TRADING_OS/02-design.md` | **APROVADO / PARCIAL** | Falta regra explícita: nenhum componente novo pode ter fallback mock silencioso (ver `genMockTrades`, achado #27 abaixo). |
| 17 | `04_STAGE3_TRADING_OS/03-mobile-trading-PWA.md` | **BOM/PARCIAL** | Já é o doc mais maduro do pacote. Falta mencionar o header `Access-Control-Allow-Private-Network: true` já presente no bridge (achado #14) — isso piora o "CORS * sem auth" porque desativa uma proteção do próprio Chrome contra sites públicos acessando rede privada. |
| 18 | `05_STAGE4_MONEY_OS/00-produto.md` | **PARCIAL** | Não conecta o Firm P&L ao achado mais importante do código: `currentFunding` é escrito direto em **10 pontos, 4 arquivos** (lista completa no arquivo 2, task T0.9). O ledger não nasce "do zero", nasce consertando 10 pontos de escrita simultânea. |
| 19 | `05_STAGE4_MONEY_OS/01-tasks.md` | **PARCIAL** | Falta task explícita "remover as 10 escritas diretas de `currentFunding`" **antes** de T4.1, ou o ledger nasce competindo com código legado que ainda escreve saldo direto. |
| 20 | `06_STAGE5_WEALTH_OS/00-produto.md` | **APROVADO / FALTA** | Não define quem atualiza preço de mercado (mark-to-market manual) nem cadência. |
| 21 | `06_STAGE5_WEALTH_OS/01-tasks.md` | **PARCIAL** | "Gate: Net Worth reconcilia" precisa ser um teste automatizado, não uma verificação manual. |
| 22 | `07_STAGE6_COMMAND/00-produto.md` | **APROVADO / PARCIAL** | Camada de IA sem guardrail contra alucinar número — precisa sempre citar a query/fonte exata usada, nunca "calcular" um valor novo fora dos motores. |
| 23 | `07_STAGE6_COMMAND/01-tasks.md` | **PARCIAL** | Falta remover/arquivar `agent.md` (raiz) e `PLANO_V1_REMAKE_OVERHAUL.md` na fusão de SPA — ver gaps #1 e #2. |
| 24 | `PLANO_V1_REMAKE_OVERHAUL.md` | **HISTÓRICO — deprecar formalmente** | É o plano "Fase 0-4" antigo (pré-3º parecer). Hoje coexiste sem aviso com o README novo "Stage 0-6". Risco idêntico ao `agent.md`: um agente (ou você, 3 meses depois) pode ler o arquivo errado e agir sobre uma arquitetura já superada. |

### Verificação linha-a-linha dos 15 bugs P0 (contra commit `f26cea5`)

| Bug original | Status | Nota |
|---|---|---|
| #1 isPushing/isPulling | ✅ **CONFIRMADO+** | `SyncProvider.tsx:180-192` exato. **Efeito colateral não documentado**: como `isPushing` nunca volta a `false`, a linha 272 (`if (!isPushing.current) pull()`) também trava — o realtime para de puxar dados depois do primeiro push, não só o push trava. |
| #2 load() apaga tudo | ✅ **CONFIRMADO** | `dataStore.js:113-115` exato, `catch(e){ setItem(seed); return seed }`. |
| #3 Restore duplo destrutivo | ⚠️ **CORRIGIDO** | `googleDrive.js:449-480` confirmado: `localStorage.setItem` cru, ignora `journal-db`, usa `alert()` (viola a própria regra de UX do doc 02-design.md). Mas `backupPayload.js:37-86` **já dá `await tx.done`** (linhas 67 e 74) — a citação original "sem tx.done" está desatualizada/errada. O risco real que sobrevive: nenhum dos dois caminhos faz backup-antes-de-sobrescrever, e são dois caminhos *diferentes* coexistindo. |
| #4 forceResync snake_case | ✅ **CONFIRMADO** | `SyncProvider.tsx:227-242` exato, comentário no próprio código diz "convert to snake_case". |
| #5 pull sem paginação + UNIQUE global | ✅ **CONFIRMADO** | `pull.ts:16-27` só `.select('*')`, sem `.range()`. `sql/create_deleted_trades_table.sql:10` `UNIQUE (platform_trade_id)` sem `user_id`. |
| #6 recalc ignora multi-conta | ✅ **CONFIRMADO** | `dataStore.js:301` filtra só `t.accountId`. Bônus: `dataStore.js:307` escreve `account.currentFunding` direto — é o próprio anti-padrão que o `DOMAIN_MODEL.md` proíbe, ao vivo. |
| #7 computeSplit ignora peso | ✅ **CONFIRMADO** | `dataStore.js:318-330`, `share = amount / accounts.length`. |
| #8 ROI goals usa volume | ✅ **CONFIRMADO** | `main-app/src/pages/Goals.jsx:87-89` **e duplicado** em `:135-138` (subGoals): `invested = Σ t.volume` (soma de lotes), `roi = pnl / invested`. Divide dólares por lotes. |
| #9 Sharpe/RoR inválidos | ✅ **CONFIRMADO+** | `trading-journal/src/pages/Dashboard.tsx:226` `returns = result_net / 10000` (fixo). **Achado extra**: linha 230 anualiza com `sqrt(252)` assumindo 1 retorno/dia, mas a série é por-trade — para um day trader fazendo ~20 scalps/dia (meta do Stage 3), isso infla o Sharpe em ~√20× além do erro do denominador fixo. |
| #10 Payout delete valor errado | ✅ **CONFIRMADO+ (pior que descrito)** | Não achei isso em "delete" — achei em **`main-app/src/pages/Payouts.jsx:727`** (reversão ao editar) e **`:742-750`** (aplicação ao criar/editar): ambos usam `amountSolicited / accountIds.length`, nunca `splitByAccount[id].net`. Só que **`deletePayout` de fato (`dataStore.js:393-400`) não reverte `currentFunding` nenhuma vez** — deletar um payout deixa o saldo decrementado pra sempre, órfão. É mais grave que "valor errado": em delete puro, não há reversão alguma. |
| #11 API key hardcoded | ✅ **CONFIRMADO, ver alerta no topo** | `googleDrive.js:6-7`, live no HEAD público. |
| #12 Bridge CORS/auth | ✅ **CONFIRMADO+** | `QuantowerBridge.cs:366` `Access-Control-Allow-Origin: *`, zero token em qualquer endpoint. **Achado extra**: linha 370 também manda `Access-Control-Allow-Private-Network: true` — isso é o header que faz o Chrome permitir que uma página pública acesse um endereço de rede privada (seu bridge local). Combinado com CORS `*` e zero auth, qualquer aba aberta no seu navegador (mesmo um site qualquer) pode, em teoria, chamar `POST /positions/close` no seu bridge. `AllowExternal=false` por padrão (linha 50) é o único freio hoje. |
| #13 TradeTable paginação dupla | ✅ **CONFIRMADO+ (pior que descrito)** | Não são só constantes diferentes: são **dois sistemas de paginação paralelos** no mesmo arquivo — `currentPage`/`rowsPerPage=10` (linhas 62-63, controla o texto "Página X/Y") e `page`/`pageSize=25` (linhas 128-134, controla o `.slice()` real). |
| #14 genMockTrades em prod | ✅ **CONFIRMADO+** | `trading-journal/src/pages/Dashboard.tsx:135,1582-1585`. Comentário no código: "Se não tem dados reais, usar mock". **Sem nenhum indicador visual de "modo demo"** — 120 trades fake alimentam gráficos, stats e cards como se fossem reais. |
| #15 Timezone ingênuo | ✅ **CONFIRMADO+ (mais espalhado)** | `split('T')`/`split("T")` em **10+ pontos**: `dataStore.js` (3x), `Dashboard.jsx`, `Dashboard.tsx` (trading-journal, outro arquivo!), `Goals.jsx`, `TradeForm.tsx`, `TradeTable.tsx`, `ExecutionsEditor.jsx`. Não é uma função `calculateDuration` isolada — é um padrão copiado em pelo menos 2 Dashboards diferentes. |

---

## Gaps concretos adicionais (30, além dos 15 confirmados acima)

**Dados / Schema**
1. Nenhum índice definido nos stores v3 (`accounts.firmId`, `transactions.accountId+date`,
   `trades.accountId+entry_datetime`) — toda consulta hoje é `.filter()` sobre array em
   memória; em 5k+ trades isso já é perceptível no celular.
2. `Trade.accounts[]` **já existe no schema atual** (`dataStore.js:502`,
   `accounts: partial.accounts || []`) mas nenhuma lógica de cálculo o usa de fato — o
   gap real não é "criar o campo", é "consumir o campo que já existe" em `recalc` e
   `computeSplit`.
3. `deleted_trades` com `UNIQUE(platform_trade_id)` global quebra silenciosamente se você
   conectar duas plataformas que reusem IDs (ex: MT5 e cTrader ambos numerando do 1).
4. Storage hoje é **3 camadas paralelas, não 1**: `localStorage['propmanager-data-v1']`
   (fonte de verdade do main-app), `IndexedDB journal-db v2` (espelho lido pelo
   trading-journal), `IndexedDB quantower-ledger v1` (ledger de trade, que por sua vez
   **também** tem backup em localStorage — `dataStore.js:1365-1410`). O `00-arquitetura.md`
   fala como se já fosse IndexedDB único; a migração real é "unificar 3 sistemas de
   persistência", não "subir de v1 pra v3".
5. `BroadcastChannel` já existe em **2 instâncias com nomes diferentes** hoje:
   `propmanager-datastore` (`dataStore.js:122`, escopo de módulo, correto) e `drive-sync`
   (`DriveContext.jsx:19`, **dentro do corpo do componente — recriado a cada render**,
   nunca fechado). Unificar não é "criar 1", é "consolidar 2 que já existem e consertar 1
   que vaza".
6. `isEntryFill` duplicado em **5 arquivos**: `push.ts:165`, `pull.ts:55`,
   `usePlatform.js:174`, `platformManager.js:245` e `platformManager.js:486`.
7. `.gitignore` lista `.env` (sem `**/.env*`) — não pega `.env.local`/`.env.production`.
   Hoje não há `.env` versionado, mas o padrão está frágil para o próximo dev/agente.
8. `dist/` está **commitado no git** (6 arquivos, confirmado via `git ls-files`) apesar do
   próprio `.gitignore` listar `dist/` — foi adicionado antes do gitignore existir. Builds
   antigos ficam no histórico e podem confundir quem clona o repo.

**Fórmulas / Edge cases**
9. PF (`grossW/grossL`) não define o que mostrar quando `grossL=0 E grossW=0` (zero
   trades) vs `grossL=0 E grossW>0` (só ganhos) — "n/a" cobre só o primeiro caso; o
   segundo é literalmente infinito e precisa de um símbolo próprio (`∞` ou "sem perdas"),
   nunca o número `Infinity` cru.
10. Sharpe "só com equity base + risk-free" não diz qual **granularidade de retorno**
    usar — por trade só funciona com frequência ~diária; para 20 scalps/dia (meta do
    Stage 3) o Sharpe por trade precisa ser reamostrado por dia antes de anualizar, ou o
    `sqrt(N)` de anualização muda completamente.
11. "Consistency Rule %" é citado em Risk Center, Payout Eligibility e Prop Engine, mas a
    fórmula exata nunca é escrita — cada prop firm define diferente (ex: "maior dia
    lucrativo ÷ lucro total do período" é o mais comum, mas FTMO/E8/Apex têm variações
    de janela). Sem isso, `Payout Eligibility` não pode ser implementado.
12. `Challenge ROI` e `Cash-on-Cash` têm fórmulas parecidas — falta um exemplo numérico
    lado a lado mostrando por que são conceitos diferentes (ver reescrita).
13. Câmbio de payout internacional: nenhum doc define **qual cotação usar** para converter
    pra BRL na hora do imposto (dia do recebimento? PTAX de fechamento?) — isso muda o
    valor do DARF, não é detalhe cosmético.

**Segurança**
14. `Access-Control-Allow-Private-Network: true` já presente no bridge (achado do bug
    #12) precisa entrar explicitamente na lista de headers a remover/gatear por token —
    nenhum doc atual menciona esse header.
15. `X-Bridge-Token` (Bridge v2) não define rotação/expiração — um token estático para
    sempre é o mesmo tipo de risco que a API key do Google, só que exposto via Tailscale
    Funnel em vez de GitHub.
16. `drive-token` (token OAuth real, não só um booleano) fica em `localStorage` em texto
    plano (`DriveContext.jsx:48,157,183`) — acessível a qualquer script rodando na
    página (XSS teria acesso total ao Drive do usuário).
17. `restoreFromDrive` usa `alert()`/`confirm()` nativos (`googleDrive.js:456,473,477`) —
    viola a própria regra de UX do `02-design.md` ("toast+undo, nunca alert/confirm").

**Mobile / PWA**
18. Nenhuma estratégia de cache por rota definida (network-first vs cache-first vs
    stale-while-revalidate) — "nunca cachear POST" não é uma estratégia, é só uma
    restrição.
19. `POST /positions/open` (Bridge v2, ainda não implementado) não define contrato de
    erro para rejeição da corretora (margem insuficiente, símbolo fechado, mercado
    fechado) — sem isso o app mobile não sabe o que mostrar.
20. Copy-trade: `copyMultiplier` não define arredondamento de lote (0.33× de 1 lote =
    0.33, mas o mínimo negociável do símbolo pode ser 0.01 ou 1— precisa de
    `lotStep` por símbolo/conta).
21. Critério de aceite visual não tem número — "Lighthouse PWA verde" sem definir score
    mínimo de Performance/Accessibility (ex: ≥90).

**Processo / Agentes**
22. `agent.md` (raiz, 596 linhas, **último commit 2026-05-20**, quase 4 meses antes do
    `DOCS/AGENTS.md` de hoje) não menciona stages, não menciona `DOCS/`, e dá orientação
    genérica que conflita em rigor com o novo `AGENTS.md`. Ferramentas de agente
    (OpenCode, Claude Code, etc.) costumam procurar automaticamente um arquivo de
    convenção na raiz — risco real de um agente carregar o arquivo errado.
23. `PLANO_V1_REMAKE_OVERHAUL.md` tem o mesmo risco (visão "Fase 0-4" superada
    coexistindo sem aviso com o roadmap "Stage 0-6").
24. Nenhum critério de "tempo estimado" por task nas listas `01-tasks.md` de cada stage —
    corrigido no roadmap (arquivo 2).
25. Nenhuma tela em nenhum doc tem os 3 estados obrigatórios especificados
    (loading/empty/error) — "toast+undo" cobre erro de ação, não estado de tela vazia
    (ex: Risk Center no primeiro uso, zero contas).

**Produto / UX**
26. Nenhum doc define o que a Home mostra no primeiro uso (zero contas, zero trades,
    zero payouts) — todo mockup do Command Center assume dados já existentes.
27. `genMockTrades` não tem plano de virar um **modo Demo explícito e opt-in** — hoje é
    fallback silencioso (`hasRealData` binário). Trocar por: banner permanente
    "🧪 Modo demonstração — dados fictícios" enquanto não houver 1 trade real, nunca
    misturado com dado real.
28. `Financial Journal` (Stage 5) não tem schema de evento definido — é um novo store?
    Como se busca/edita um evento de vida?
29. Goal "Payout Anual" não define se "ano" é calendário ou 12 meses rolantes — muda a
    barra de progresso perto da virada do ano.
30. Nenhum doc define o que acontece quando duas abas abrem o Risk Center e uma fecha
    uma posição pelo Bridge enquanto a outra ainda mostra a posição aberta (reconciliação
    otimista vs. pessimista de UI).

---

## SEÇÃO B — Expansão "mega-app útil"

### B.0 — A correção estrutural que muda o resto do plano

Antes de qualquer feature nova: o Stage 2 não é "IndexedDB v1 → v3". É **3 sistemas de
persistência divergentes → 1**:

```
HOJE:
  localStorage['propmanager-data-v1']   <- fonte de verdade do main-app (accounts, payouts,
                                            firms, trades, goals, settings — um JSON só)
  IndexedDB('journal-db', v2)           <- espelho escrito pelo SyncProvider, lido pelo
                                            trading-journal (aqui mora o bug do snake_case)
  IndexedDB('quantower-ledger', v1)     <- ledger de dedup de trade, com backup PRÓPRIO
                                            em localStorage (outra chave)

+ main-app e trading-journal são 2 SPAs Vite INDEPENDENTES (base:'/' porta 5174 vs
  base:'/journal/' porta 5173), unidas só por cópia de arquivo (`merge-builds.js`) +
  redirect do Netlify. Navegar entre eles é reload completo de página — não é roteamento
  client-side. A ÚNICA comunicação entre os dois apps é storage + BroadcastChannel.
```

Isso explica por que tantos bugs P0 são de sincronização (não são falhas de lógica de
negócio, são sintomas de dois runtimes JS separados tentando concordar via disco).
Também explica por que "Fusão SPA" corretamente fica pro Stage 6: forçar isso cedo
destrava um problema (sync) só pra abrir outro maior (reescrever roteamento com 40+
páginas já construídas). **Mantenha a decisão de adiar, mas documente o motivo real.**

### B.1 — Firm P&L completo

Regra: **todo custo de firm vira `Transaction`, nunca campo solto.**

```
FIRM E8                                    Fonte
  Challenges pagos ..........  $499 (3x)   Transaction kind=challenge_cost, firmId=E8
  Resets ..................... $150 (1x)   Transaction kind=reset_fee, firmId=E8
  Mensalidades ...............   $0        Transaction kind=monthly_fee, firmId=E8
  Payouts recebidos .......... $2.560      Transaction kind=payout_in, ref=payoutId
  Fees da mesa ............... -$640       Transaction kind=fee, ref=payoutId
  Comissões/swap .............  -$87       Trade.commission + Trade.swap somados
  Rebates ....................  +$42       Transaction kind=rebate (nunca abate a fee
                                            direto — auditoria exige rebate visível)
  ────────────────────────────────────
  LUCRO LÍQUIDO NA FIRM ...... +$1.376     Σ payout_in − Σ(challenge+reset+monthly+fee)
                                              + Σ rebate − Σ(commission+swap)
```

Caso de borda que nenhum doc atual cobre: **conta que falhou o challenge.** O
`challenge_cost` pago continua contando no Firm P&L (você gastou de verdade), mas a
`Account.phase` vai para `failed` e ela some do Risk Center ativo. Regra: `Transaction`
nunca é deletada quando a conta falha/é arquivada — só a `Account` muda de fase. Isso é
o que permite responder "quanto já perdi tentando passar challenge da E8 no total" —
inclusive contando as que falharam.

### B.2 — Bridge v2

Ver `DOCS/04_STAGE3_TRADING_OS/04-BRIDGE_V2_SPEC.md` (novo). Resumo do que muda: token
obrigatório em toda rota (inclusive `/positions/close`, que hoje não tem nenhum),
`clientOrderId` idempotente em toda escrita, contrato de erro padronizado, handshake de
versão usando o campo `version` que **já existe** em `/status` (só falta o lado cliente
comparar), e remoção explícita do header `Access-Control-Allow-Private-Network`
enquanto não houver token.

### B.3 — PWA

Ver `DOCS/04_STAGE3_TRADING_OS/05-PWA_MOBILE_SPEC.md` (novo). Critério de sucesso em
número, não em adjetivo: Lighthouse PWA = 100, Performance ≥ 90 em rede 4G simulada,
Time-to-Interactive < 3s em Moto G4 simulado (perfil padrão do Lighthouse mobile),
"Add to Home Screen" funcional em iOS Safari e Android Chrome, Risk Center e Positions
legíveis e operáveis com uma mão em viewport 360×640.

### B.4 — Offline / degraded UX

Estados obrigatórios por conta (não por app inteiro — uma conta Prop pode estar STALE
enquanto Wallets/Portfolio continuam 100% operantes, porque não dependem do bridge):

```
🟢 LIVE       — último sync < 60s
🟡 STALE Xm   — último sync entre 60s e 15min, mostra cache + timestamp
🔴 OFFLINE    — > 15min ou 3 falhas de /health seguidas — mostra cache "congelado" +
                banner fixo + fila de ações pendentes visível (não escondida em log)
```

Fila (`sync_queue`) precisa de UI própria: lista do que está pendente, com botão
"tentar agora" e "descartar" — nunca só um contador escondido em canto de tela.

### B.5 — Financial Calendar + Forecast + Safe Available + Financial Journal

- **Calendar**: um mês, 5 camadas sobrepostas (Trading/Economic/Bills/Payouts/Tax),
  cada camada pode ser desligada individualmente (toggle), nunca forçada junto.
- **Forecast 30/60/90d**: `hoje + Σ payouts esperados (só os com Payout Eligibility=YES
  E minDays cumprido) + salário − Σ contas recorrentes − imposto estimado − aportes
  programados`. Payout "esperado mas não elegível ainda" entra só no forecast de 90d,
  nunca no de 30d — evita otimismo.
- **Safe Available**: `caixa líquido − 30d de contas fixas − reserva de imposto do mês
  corrente + payouts já aprovados (status=Approved, não Pending)`. É a resposta direta
  pra "posso comprar isso agora" — só conta o que já está garantido ou a 30 dias.
- **Financial Journal**: novo store `journal_events { id, date, kind: milestone|note,
  title, linkedEntityId?, amountSnapshot? }`. Evento se cria manual (usuário registra
  "primeiro payout de $10k") ou automático (sistema sugere quando `Payout` cruza um
  Goal) — mas o automático sempre pede confirmação, nunca cria sozinho.

### B.6 — Tax Cockpit BR

Regra de câmbio (gap #13 fechado aqui): **cotação PTAX de venda do dia do
recebimento em conta** (não do fechamento do trade) para converter payout
internacional a BRL — é o padrão que a Receita aceita e que qualquer contador vai
pedir. Guardar o `rate` usado junto da `Transaction` (nunca recalcular depois com
cotação atual, isso muda o imposto retroativamente).

```
Day Trade ...... 20% sobre lucro líquido mensal (compensa prejuízo do mesmo tipo)
Swing Trade .... 15% sobre lucro líquido mensal (compensa prejuízo do mesmo tipo,
                  isenção de R$20k/mês em vendas só pra ações, não day trade)
Payout intl. ... Carnê-Leão (pessoa física) ou PJ — cockpit estima, contador decide
                  qual regime; nunca declarar sozinho
```

### B.7 — Risk genérico (Account Risk framework)

```
kind=prop      -> daily DD, trailing DD, max DD, target, consistency%, minDays
kind=invest    -> concentração (% em 1 ativo), drawdown do portfólio, volatilidade 30d
kind=crypto    -> mesmo de invest + exposure a stablecoin vs. volátil
kind=bank/cash -> sem risco de mercado; risco = liquidez (dias de runway coberto)
```

Cada `kind` define sua própria função `getRiskStatus(account) -> SAFE|WARN|STOP`, mas
todas retornam a mesma forma `{ status, reason, headroom }` — é isso que deixa o Risk
Center genérico em vez de ter um `if (kind==='prop')` gigante espalhado pela UI.

### B.8 — O que NÃO construir (reforço + itens novos)

Mantém os 6 originais e adiciona, com base no que vi no código:

7. **Não** criar um 4º sistema de storage. A tentação em qualquer refactor é "criar mais
   um cache pra resolver". A resposta pra qualquer lentidão nova é otimizar o `app-db v3`
   único, nunca adicionar camada.
8. **Não** deixar a IA (Stage 6) "calcular" nada que os motores já calculam — ela só
   narra números que já existem, com a fonte citável. Se ela precisar inventar uma
   fórmula nova pra responder, a pergunta deve ser recusada, não respondida com um
   número novo sem dono.
9. **Não** perseguir 100% de paridade de features entre main-app e trading-journal antes
   da fusão de SPA — isso é trabalho jogado fora quando os dois virarem um só no Stage 6.
