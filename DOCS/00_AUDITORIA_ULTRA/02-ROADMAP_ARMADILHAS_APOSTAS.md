# ULTRA AUDITORIA — Parte 1 (cont.): Roadmap Final + Armadilhas + Apostas

> **SUPERSEDED PELO PIVOT (ver `00-PIVOT_RECONSTRUCAO.md`).** O dono decidiu reconstruir o
> app em vez de consertar o antigo. Este roadmap fix-first permanece como **referência de
> esforço e de especificação de requisitos** (fórmulas, armadilhas, apostas valem), mas as
> tasks T0.x de "corrigir o app antigo" **não são executadas**. Use a ordem de fases do
> `00-PIVOT_RECONSTRUCAO.md` (Security+Scaffold → Data Engine novo → Trading → Money →
> Wealth → Command). As armadilhas (§ SEÇÃO E) e as 3 apostas ousadas continuam válidas.

## SEÇÃO D — Roadmap final 0→6 (referência)

Convenção: **Proibido** é por stage (o que travar em code review). **Dependências**
listam só o que bloqueia de verdade. Estimativas são dias de esforço com agente(s) +
sua revisão, não dias corridos — rodar em paralelo reduz o calendário, não o esforço.

---

### Stage 0 — Stabilize (+ 2 quick-wins adiantados)

**Objetivo:** zerar os 15 P0 confirmados + tirar a chave do Google do ar + adiantar 2
itens de baixo risco que não dependem de nenhum contrato do Stage 1.

**Arquivos envolvidos:** `packages/sync/SyncProvider.tsx`, `packages/lib/dataStore.js`,
`packages/utils/googleDrive.js`, `packages/utils/backupPayload.js`,
`packages/sync/pull.ts`, `sql/create_deleted_trades_table.sql`,
`main-app/src/pages/{Payouts,Goals,Accounts}.jsx`, `QuantowerBridge.cs`,
`packages/utils/adapters/quantowerAdapter.js`, `trading-journal/src/Components/TradeTable.tsx`,
`trading-journal/src/pages/Dashboard.tsx`.

**Tasks (ordem de execução — respeita dependência de arquivo compartilhado):**

- [ ] T0.0a **[NOVO, fazer primeiro]** Revogar/rotacionar a Google API key
      (`googleDrive.js:6-7`), restringir por HTTP referrer, mover para env Netlify.
- [ ] T0.0b **[NOVO, quick-win PWA]** `manifest.json` + ícones 192/512 + service worker
      shell (cache do app shell só, zero cache de dado) — não depende de nenhum
      contrato de dados, pode entrar já. Critério: "Add to Home Screen" funciona.
- [ ] T0.0c **[NOVO, quick-win Firm P&L]** Adicionar `challengeCost`, `resetFee` como
      campos soltos em `Account` (schema atual, não o ledger ainda) só para não perder
      dado retroativo enquanto Stage 1/4 não chegam. Migra pro `Transaction` real no
      Stage 4 (T4.1) sem perda.
- [ ] T0.1 Fix `isPushing`/`isPulling` — `SyncProvider.tsx:192` deve setar
      `isPushing.current = false`, não `isPulling`. Teste: chamar `push()` duas vezes
      seguidas e confirmar que a segunda não retorna cedo demais; confirmar que o
      realtime (`SyncProvider.tsx:272`) volta a puxar depois de um push.
- [ ] T0.1b Debounce 3s no handler `datastore:change` (`SyncProvider.tsx:357`, hoje
      dispara push a cada mutação sem debounce nenhum) + guarda `visibilityState`.
- [ ] T0.2 Quarentena de `load()` corrupto — `dataStore.js:113-115`: em vez de
      `catch{ setItem(seed) }`, salvar em `propmanager-data-v1.corrupt-<ts>` e só
      então decidir (nunca sobrescrever o que existia). Teste: corromper o JSON manual
      e confirmar que o dado antigo sobrevive em quarentena.
- [ ] T0.3 Unificar restore: hoje `restoreFromDrive` (`googleDrive.js:449-480`) ignora
      `journal-db` e usa `alert()`; `applyFullBackupPayload` (`backupPayload.js:37-86`)
      já faz `tx.done` certo mas não faz backup prévio. Fix: todo restore passa por
      `applyFullBackupPayload`, que ganha um passo 0 de snapshot (`backup-<ts>`) antes
      de qualquer `clear()`. Deletar o caminho duplicado em `googleDrive.js`.
- [ ] T0.4 Fix `forceResync` snake_case — `SyncProvider.tsx:227-242`: remover
      `_toSnakeCase(item)` antes do `tx.store.put()`. Teste: reload do trading-journal
      depois de um forceResync, campos continuam camelCase.
- [ ] T0.5 Paginar `pull.ts` (`.range()` em todas as 10 queries, hoje só `.select('*')`)
      + migration `UNIQUE(user_id, platform_trade_id)` substituindo o
      `UNIQUE(platform_trade_id)` global (`sql/create_deleted_trades_table.sql:10`).
- [ ] T0.6 Fix `recalcAccountFunding` (`dataStore.js:295-312`) para ratear por
      `t.accounts[]` (campo **que já existe**, só não é lido) em vez de só `t.accountId`
      (linha 301).
- [ ] T0.7 Fix `computeSplit` (`dataStore.js:318-330`) para ponderar por
      `defaultWeight` (fallback 1) em vez de `amount / accounts.length` puro.
- [ ] T0.8 Fix reversão de payout: `Payouts.jsx:727` e `:742-750` devem usar
      `splitByAccount[accId].net`, nunca `amountSolicited / accountIds.length`. E
      `deletePayout` (`dataStore.js:393-400`) precisa **de fato reverter**
      `currentFunding` — hoje não reverte nada.
- [ ] T0.9 Remover as **10 escritas diretas de `currentFunding`** encontradas em
      `JournalContext.jsx:292,370`, `dataStore.js:307,1319`, `Accounts.jsx:889,1020`
      (este último é um `<input>` editável — saldo digitado à mão; linha 889 é outro
      `<input>` que também sobrescreve `currentFunding` ao editar `initialFunding`),
      `Payouts.jsx:341,663,732,747`. Substituir por leitura derivada (mesmo antes do
      ledger completo, já pode virar um `getDerivedFunding(accountId)` calculado,
      nunca gravado).
- [ ] T0.10 Fix ROI de Goals (`Goals.jsx:87-89` e duplicado em `:135-138`) — parar de
      dividir por `Σ t.volume` (lotes); usar `initialFunding` ou renomear a métrica pra
      o que ela realmente é.
- [ ] T0.11 Marcar Sharpe/RoR como `UNRELIABLE` na UI (`Dashboard.tsx:226-260`) até o
      Stage 1 formalizar a fórmula — não apagar, só desabilitar visualmente com tooltip.
- [ ] T0.12 Remover `genMockTrades` do caminho de produção (`Dashboard.tsx:135,
      1582-1585) ou transformar em modo Demo opt-in com banner permanente — nunca
      fallback silencioso.
- [ ] T0.13 Fix `TradeTable.tsx`: eliminar o segundo sistema de paginação — manter só
      um par `page/pageSize` (hoje há `currentPage/rowsPerPage=10` na linha 62-63 E
      `page/pageSize=25` na linha 128-134, dois estados brigando).
- [ ] T0.14 Bridge: adicionar `X-Bridge-Token` obrigatório em **todas** as rotas
      (inclusive `/positions/close`, que hoje não pede nada), remover o header
      `Access-Control-Allow-Private-Network: true` (`QuantowerBridge.cs:370`) enquanto
      não houver token, manter `AllowExternal=false` como default (já está certo).
- [ ] T0.15 `quantowerAdapter.js:23`: `this.bridgeUrl` não pode default pra
      `http://127.0.0.1:8787` quando a página é servida em HTTPS — hoje isso deixa
      `FILTERED_FALLBACKS` vazio em produção e o adapter nunca conecta. Aplicar o
      mesmo filtro `isPageSecure` também ao valor default do `bridgeUrl`.
- [ ] T0.16 Consolidar `isEntryFill` (hoje em `push.ts:165`, `pull.ts:55`,
      `usePlatform.js:174`, `platformManager.js:245,486`) numa função única exportada.
- [ ] T0.17 Consolidar parsing de data (`split('T')` em 10+ pontos) num
      `packages/lib/dateUtils.ts` único.
- [ ] T0.18 Consertar `BroadcastChannel("drive-sync")` (`DriveContext.jsx:19`, criado a
      cada render) — mover pra fora do corpo do componente (module scope, como já é
      feito corretamente em `dataStore.js:122`) e considerar unificar os dois canais
      num só.
- [ ] T0.19 Mover `drive-token` de `localStorage` (`DriveContext.jsx:48,157,183`) pra
      memória (variável de módulo) ou `sessionStorage` no mínimo.
- [ ] T0.20 `.gitignore`: `.env` → `**/.env*`. Remover `dist/` do índice do git
      (`git rm -r --cached dist`) já que está ignorado mas commitado (6 arquivos).
- [ ] T0.21 Arquivar `agent.md` (raiz) e `PLANO_V1_REMAKE_OVERHAUL.md` — mover para
      `DOCS/_ARCHIVE/` com um cabeçalho "SUPERSEDED BY DOCS/AGENTS.md" e
      "SUPERSEDED BY README.md", pra nenhum agente futuro os carregar por engano.
- [ ] T0.22 `main-app/package.json`: remover `jest` (sem script `test` associado, usa
      `vitest` no root) ou criar o script `test`; decidir entre `gapi-script` e a
      implementação própria em `googleDrive.js` (hoje os dois convivem); alinhar
      `react@18.2.0` com `@types/react` (root pede `^19.2.2`, incompatível).

**DoD / Gate (mensurável, não "parece bom"):**
- `pnpm build:all` verde.
- Os 15 bugs originais + os 22 itens acima com teste caracterizando antes/depois.
- `grep -rn "currentFunding\s*:" --include=*.jsx --include=*.js` fora de
  `packages/lib/dataStore.js` retorna **zero** resultados de escrita direta.
- Bridge recusa (401) qualquer request sem `X-Bridge-Token`.
- Nenhuma chave/segredo no `git log --all -p | grep -i "AIza\|apps.googleusercontent"`.

**Proibido:** mudar schema definitivo (isso é Stage 1), criar `app-db v3`, fundir SPA,
criar telas novas fora do que já existe.

**Estimativa:** 7–10 dias. **Dependências:** nenhuma (é o ponto de partida).

---

### Stage 1 — Domain Foundation (contrato, não código)

**Objetivo:** aprovar os 6 documentos de contrato antes de qualquer linha de feature
nova ser escrita.

**Arquivos envolvidos:** nenhum código ainda — só os `.md` em `02_STAGE1_DOMAIN/` +
`04_STAGE3_TRADING_OS/04-BRIDGE_V2_SPEC.md` + `05-PWA_MOBILE_SPEC.md`.

**Tasks:**
- [ ] T1.1 Ler e aprovar `00-DOMAIN_MODEL.md` (reescrito)
- [ ] T1.2 Ler e aprovar `01-DATA_CONTRACT.md` (reescrito)
- [ ] T1.3 Ler e aprovar `02-FINANCIAL_FORMULAS.md` (reescrito)
- [ ] T1.4 Ler e aprovar `03-SYNC_PROTOCOL.md` (reescrito)
- [ ] T1.5 Ler e aprovar `04-BRIDGE_V2_SPEC.md` (novo)
- [ ] T1.6 Ler e aprovar `05-PWA_MOBILE_SPEC.md` (novo)

**DoD/Gate:** você aprova os 6 documentos por escrito (um commit "docs: aprova stage 1
contracts" é suficiente). Nenhum agente escreve código de Stage 2+ antes disso.

**Proibido:** qualquer código de produção. Isso é revisão de contrato, não sprint.

**Estimativa:** 2–4 dias (seu tempo de revisão é o gargalo, não trabalho de agente).
**Dependências:** Stage 0 fechado (formulas/schema não fazem sentido sobre dado
corrompido).

---

### Stage 2 — Data Engine

**Objetivo:** unificar os **3 sistemas de persistência reais de hoje**
(`localStorage['propmanager-data-v1']`, `IndexedDB journal-db v2`,
`IndexedDB quantower-ledger v1`) num único `app-db v3`, com sync batelado e
multi-tab seguro.

**Arquivos envolvidos:** `packages/lib/dataStore.js` (1675 linhas, vira repositórios),
`packages/sync/*`, `packages/utils/backupPayload.js`, `packages/utils/platformManager.js`
— **confirmado, e são 3 locks distintos, não 1**: `platform:statusLock` (linhas
369-416), `platform:syncLock` (421-517) e `platform:positionLock` (576-640), todos via
`localStorage.getItem/setItem` com timeout de 3s. O `03-SYNC_PROTOCOL.md` original só
citava um; os 3 precisam virar `navigator.locks` juntos.

**Tasks:**
- [ ] T2.0 **[NOVO]** Escrever o inventário exato dos 3 storages (contagem de
      registros, tamanho em bytes, campos únicos de cada um) antes de migrar —
      é o "before" do teste de migração sem perda.
- [ ] T2.1 `DataService` único writer + repositórios por entidade + `events.js`
      central substituindo os `CustomEvent('datastore:change')` soltos hoje
      espalhados em pelo menos `dataStore.js`, `SyncProvider.tsx`, `backupPayload.js`.
- [ ] T2.2 `app-db v3` (IndexedDB) + migração dos 3 storages + rollback testado
      (restaurar o backup do T2.0 se contagem/soma não bater).
- [ ] T2.3 Sync batch (upsert 500/chunk) + `resolveConflict` real (ver
      `03-SYNC_PROTOCOL.md` reescrito para o algoritmo exato) + `.range()` já feito
      no Stage 0 (T0.5), aqui só formaliza no repositório novo.
- [ ] T2.4 `navigator.locks` multi-tab substituindo qualquer lock por localStorage +
      debounce central + teste com 2 abas reais.
- [ ] T2.5 `DataChainEngine` + testes unitários (`Trade -> Ledger -> Equity ->
      Eligibility -> Wallet`) + teste de DD trailing vs daily com dataset sintético.
- [ ] T2.6 Netlify: `pnpm --frozen-lockfile`, limpar `dist/` no
      `scripts/merge-builds.js` antes de copiar — **confirmado: o script (50 linhas)
      hoje só cria a pasta se não existir e copia por cima (`fs.cpSync`), nunca
      remove arquivo antigo antes; um asset removido de um build fica fantasma no
      `dist/` final**. Remover `package-lock.json` (o repo tem os dois lockfiles,
      `pnpm-lock.yaml` E `package-lock.json`, confirmados por `ls` na raiz — isso é
      fonte de drift de versão entre ambientes).

**DoD/Gate:** migração dos 3 storages sem perda (contagem+soma bate) + 2 abas sem
drift (editar em uma, ver refletido na outra em <3s) + `DataChainEngine` com teste
verde `Trade -> Wallet`.

**Proibido:** criar telas novas, mudar fórmula financeira (isso é Stage 1, já
congelado), adicionar 4º sistema de storage "temporário".

**Estimativa:** 10–14 dias (é o item de maior risco técnico do plano inteiro, por
causa dos 2 runtimes independentes descritos em B.0 da Parte 1). **Dependências:**
Stage 1 aprovado.

---

### Stage 3 — Trading OS (+ Bridge v2 + PWA completo)

**Objetivo:** Risk Center reativo + Quantower ou CSV eliminando input manual +
celular abre/edita/fecha posição com segurança.

**Arquivos envolvidos:** novo `accountModel.ts` (não existe ainda, confirmado),
`RiskCenter.tsx` (novo), `QuantowerBridge.cs`, `quantowerAdapter.js`,
`TradeForm.tsx`, `TradeTable.tsx`.

**Tasks:** mantém `04_STAGE3_TRADING_OS/01-tasks.md` (T3.1–T3.7) na íntegra, e some:
- [ ] T3.8 Implementar Bridge v2 completo por `04-BRIDGE_V2_SPEC.md` (novo).
- [ ] T3.9 Implementar PWA completo por `05-PWA_MOBILE_SPEC.md` (novo) — o shell já
      saiu no Stage 0 (T0.0b), aqui entra cache de dado (read) + fila offline.
- [ ] T3.10 Fórmula de `Consistency Rule %` definida e implementada (gap #11 da
      Parte 1) — sem isso `Payout Eligibility` não fecha.

**DoD/Gate:** 20 scalps/dia sem digitação massiva + Risk reativo em lote + abrir +
editar SL/TP + fechar pelo celular em conta demo + bridge off mostra cache + fila
(gate original do `03-mobile-trading-PWA.md`, mantido).

**Proibido:** lógica de Wallet/Payout/Tax aqui (isso é Stage 4, roda em paralelo mas
sem importar um do outro além do `DataChainEngine`).

**Estimativa:** 14–18 dias. **Dependências:** Stage 2 fechado. Pode rodar em
paralelo com Stage 4.

---

### Stage 4 — Money OS

**Objetivo:** `Payout -> Wallet -> Tax` fim-a-fim + Firm P&L de verdade (não mais o
stopgap do T0.0c).

**Arquivos envolvidos:** `main-app/src/pages/{Payouts,Accounts}.jsx` (reescrever a
parte de reversão/aplicação de funding que hoje vive solta na UI).

**Tasks:** mantém `05_STAGE4_MONEY_OS/01-tasks.md` (T4.1–T4.5) e some:
- [ ] T4.0 **[pré-requisito, antes de T4.1]** Confirmar que as 10 escritas diretas de
      `currentFunding` (T0.9) já saíram — se não saíram, o ledger nasce competindo
      com código legado gravando saldo por fora.
- [ ] T4.6 Migrar `challengeCost/resetFee` (campo solto do T0.0c) para `Transaction`
      real, sem perder o histórico já capturado.

**DoD/Gate:** fluxo `Payout Completed -> +Wallet -> Tax reserve -> Expense/Invest`
fim-a-fim testado (mantido do original) + Firm P&L bate com soma manual de 1 firm
de teste feita fora do app (Excel/calculadora) como sanity check.

**Proibido:** UI escrever em `Account.currentFunding` — se algum componente ainda
faz isso depois do Stage 0, é regressão, não feature.

**Estimativa:** 8–12 dias. **Dependências:** Stage 2 fechado. Paralelo ao Stage 3.

---

### Stage 5 — Wealth OS

**Objetivo:** Net Worth derivado + Portfolio cost-basis + Goals 2.0 com progresso
automático de verdade (sem o bug do volume-como-denominador).

**Tasks:** mantém `06_STAGE5_WEALTH_OS/01-tasks.md` (T5.1–T5.5) e some:
- [ ] T5.0 Confirmar fix do T0.10 (ROI de Goals) propagado pro novo Goals 2.0 —
      não reintroduzir `Σ volume` como denominador na reescrita.
- [ ] T5.6 Definir e documentar cadência de mark-to-market manual (diário? ao abrir
      o Portfolio?) — gap #20 da Parte 1.

**DoD/Gate:** Net Worth reconcilia com soma Accounts+Positions+Payouts pendentes
**como teste automatizado**, não conferência manual (endurece o gate original).

**Proibido:** Goals com fórmula nova fora de `02-FINANCIAL_FORMULAS.md`.

**Estimativa:** 6–10 dias. **Dependências:** Stage 4 fechado (Net Worth precisa do
Wallet/Payout do Money OS).

---

### Stage 6 — Command + Intelligence (+ fusão SPA)

**Objetivo:** Home só composição, Calendar, Alerts, camada de IA leitura-only, e só
aqui a fusão definitiva das 2 SPAs num router único.

**Tasks:** mantém `07_STAGE6_COMMAND/01-tasks.md` (T6.1–T6.5) e some:
- [ ] T6.6 Deletar de vez `agent.md` e `PLANO_V1_REMAKE_OVERHAUL.md` (arquivados no
      T0.21) — a fusão de SPA é o marco natural pra limpeza de documentação legada.
- [ ] T6.7 IA (`financialIntelligence.ts`): todo insight precisa citar a query/fonte
      exata usada (nunca "calcular" um número que os motores não expõem).

**DoD/Gate:** Home sem query financeira própria (mantido) + SPA fundida com
roteamento client-side real (não mais reload de página entre `/` e `/journal/`).

**Proibido:** qualquer lógica financeira nova nesta fase — é composição e migração
de shell, não feature.

**Estimativa:** 10–14 dias (a fusão de SPA é o item mais arriscado deste stage,
reserve 40% do tempo só pra ela). **Dependências:** Stages 3, 4 e 5 fechados.

---

**Calendário total (soma de esforço, execução paralela onde marcado):**
Stage 0 (7-10d) → Stage 1 (2-4d) → Stage 2 (10-14d) → Stage 3 ∥ Stage 4 (max 18d) →
Stage 5 (6-10d) → Stage 6 (10-14d) ≈ **47 a 70 dias de esforço**, comprimível pra
~35-50 dias de calendário corrido se Stage 3/4 realmente rodarem em paralelo com
2 agentes dedicados.

---

## SEÇÃO E — Top 10 armadilhas (onde os agentes vão errar)

| # | Armadilha | Como previne |
|---|---|---|
| 1 | **Escrever saldo direto** (`currentFunding`/`balance`) de dentro de um componente de UI — é o bug mais repetido do código atual (10 pontos). | Tipo `Account.currentFunding` vira `readonly` no tipo exposto à UI (TypeScript). Regra de lint customizada que reprova PR com `updateAccount(id, { currentFunding` ou `{ balance` fora de `packages/lib`. |
| 2 | **snake_case vazando pro IndexedDB/UI** — já aconteceu uma vez (`forceResync`) e o próprio objeto `Trade` hoje mistura `entry_datetime` (snake) com `accountId` (camel) no mesmo registro. | Teste unitário que roda `Object.keys()` recursivo sobre `getAll()`/repositórios e falha se achar `_[a-z]` fora de um bloco explicitamente marcado `// SUPABASE BOUNDARY`. |
| 3 | **LWW cego em campo financeiro** — o `SYNC_PROTOCOL.md` original pede "merge campo-a-campo" mas o schema só tem `updatedAt` por registro inteiro, não por campo. | Ver `03-SYNC_PROTOCOL.md` reescrito: define as 2 opções reais (granularidade por campo com custo de schema, ou "campo financeiro nunca merge automático, sempre pede confirmação"). Teste de conflito sintético (2 devices editando o mesmo `Transaction.amount` offline) tem que aparecer na UI como conflito, nunca sumir silenciosamente. |
| 4 | **`clear()`/`setItem(seed)` sem backup prévio** — aconteceu 2x no código atual (`load()` e `restoreFromDrive`), mesmo com `tx.done` correto num dos casos. | Wrapper único `runDestructiveWrite()` no `DataService`: sempre snapshot → try → só então clear+put. Lint/CI: grep bloqueando `.clear()` fora desse wrapper. |
| 5 | **Duplicar lógica em vez de importar util único** — `isEntryFill` em 5 arquivos, parse de data (`split('T')`) em 10+ pontos, cálculo de ROI em 2 blocos do mesmo arquivo (`Goals.jsx`). | Um util por conceito (`dateUtils.ts`, `dedup.ts`, `formulas.ts`), e um teste "grep de CI" que falha se `split('T')` ou uma segunda definição de `isEntryFill` aparecer fora do util. |
| 6 | **Mock data em produção sem flag visível** — 120 trades fake substituindo dado real silenciosamente hoje. | Build de produção falha se `genMockTrades`/similar for chamado sem `import.meta.env.VITE_DEMO_MODE === 'true'` explícito. Banner obrigatório e não removível em modo demo. |
| 7 | **CORS aberto / bridge sem token**, incluindo headers "extras" que ninguém lembra de remover (ex: `Access-Control-Allow-Private-Network`, já presente hoje). | Teste de integração: request ao bridge sem `X-Bridge-Token` tem que voltar 401 — se voltar 200, CI quebra. Checklist de headers CORS revisada a cada mudança no bridge. |
| 8 | **Estatística "decorativa"** sem validar unidade/granularidade — Sharpe anualizado com `sqrt(252)` sobre retorno por-trade (errado pra day trader), ROI dividindo por soma de lotes. | `02-FINANCIAL_FORMULAS.md` define edge case + unidade de cada fórmula explicitamente. Teste de regressão com dataset sintético calculado à mão (planilha) comparado byte-a-byte com o output do código. |
| 9 | **Clamp escondendo divergência** (`Math.max(x, 0)` sem log) — mascarou o bug de reversão de payout por quem sabe quanto tempo. | Todo clamp em valor financeiro loga quando de fato alterou o valor: `if (clamped !== raw) log.warn('funding clamp', {raw, clamped, accountId})`. Sentry/log agregando isso vira um alerta se disparar >0 vezes/semana. |
| 10 | **Documentação de agente divergente** — `agent.md` (raiz, 4 meses desatualizado) coexistindo com `DOCS/AGENTS.md`, e `PLANO_V1_REMAKE_OVERHAUL.md` coexistindo com o `README.md` novo. | Um único arquivo de convenção na raiz (`AGENTS.md` maiúsculo, o padrão que ferramentas de agente esperam), qualquer coisa histórica vai pra `DOCS/_ARCHIVE/` com cabeçalho "SUPERSEDED BY". Adicionar isso como regra #0 do `AGENTS.md`. |

---

## Fechamento

### 3 apostas ousadas que nenhum parecer anterior propôs

**1. Proveniência visível em todo número, não só "derivado".**
"Derivado, não editável" resolve mentira por edição manual. Não resolve mentira por
**staleness silenciosa** — um Net Worth "derivado" de um Portfolio com preço de 12
dias atrás ainda é apresentado com a mesma confiança visual de um Cash sincronizado há
2 minutos. Aposta: todo número na Home carrega um badge de proveniência (hover/tap
mostra "Cash R$84k — synced 2min | Invest R$261k — mark-to-market manual, há 12 dias").
Mais caro de construir que um dashboard comum, mas é a única forma de o sistema ser
honesto sobre o que ele realmente sabe vs. o que está assumindo. É o oposto do
"currentFunding mente" que motivou o projeto inteiro — só que aplicado a staleness,
não só a fórmula errada.

**2. Risk Gate por fricção, não só banner passivo.**
O plano atual trata Risk Center como sinalização (🟢🟡🔴). Dado que você **não** quer
esse app custodiando ordem (correto, mantém fora de regulação), a alternativa não é
bloquear execução (isso é papel do Quantower) — é **fricção deliberada**: quando
`dailyDD` está a <10% do limite, o fluxo mobile de abrir posição exige um passo extra
lendo em voz alta (texto grande, não checkbox discreto) o headroom exato em dólares
antes de liberar o botão de enviar ordem pro bridge. Não impede a decisão ruim, mas
tira ela do "reflexo" e coloca no "consciente" — que é exatamente o tipo de intervenção
que funciona contra tilt/revenge trading, o inimigo real de um day trader fundado.

**3. Challenge como decisão de EV, não só linha de custo.**
O Firm P&L (Seção B.1) trata challenge pago como despesa. Com histórico suficiente
(n≥5 tentativas), o sistema pode computar: custo afundado até agora + taxa de
aprovação histórica pessoal nesse tipo de challenge + payout esperado condicional a
passar → um sinal simples "continuar" vs "esse tipo de challenge historicamente não
compensa pra você". Isso é o tipo de insight que só faz sentido *depois* que o
Firm P&L existe — mas é a diferença entre "um app que soma gastos" e "um app que
ajuda a decidir se vale a pena pagar o próximo reset". Trava de segurança: nunca
mostrar esse sinal com n<5, sempre "amostra insuficiente" até lá — mesma disciplina
que `02-FINANCIAL_FORMULAS.md` já exige pra Strategies (`n<20`).

### O que eu cortaria do plano atual

- **Backup duplo Google Drive + Proton Drive com OAuth próprio.** É a maior
  concentração de bugs reais que achei fora do core financeiro (token em
  `localStorage`, `BroadcastChannel` vazando por render, `alert()` em vez de toast,
  API key hardcoded) — e é redundante com o Supabase, que já é sua fonte de verdade
  multi-device. Reduzir para: **1 botão "exportar JSON"** (download local, sem OAuth,
  sem API de terceiro) como backup manual de emergência, e deixar o Supabase carregar
  todo o resto. Menos superfície de ataque, menos código pra manter, sem perda real de
  funcionalidade (o valor do Drive hoje é "ter uma cópia fora do navegador" — um export
  manual entrega isso sem o custo de manutenção de uma integração OAuth inteira).
- **CSV universal (MT5/cTrader/Apex/Rithmic) como escopo do Stage 3.** Seu bridge real
  é o Quantower. Construir 4 mapeadores de coluna bespoke agora é trabalho de cauda
  longa com retorno baixo enquanto o Quantower já cobre o caso principal. Reduzir pra
  **Quantower + 1 CSV genérico** (mapeamento manual de coluna, sem preset por broker)
  no Stage 3; presets por broker específico viram backlog pós-Stage 6, só se você de
  fato trocar de mesa/corretora com frequência suficiente pra justificar.
