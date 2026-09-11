> [!CAUTION]
> **SUPERSEDED BY DOCS/AGENTS.md**
> Este arquivo foi arquivado. Nao use como convencao ativa.
> (Arquivado na Fase 5 — Command + Intelligence.)
>
---

# ðŸ¤– TRADING PLATFORM AGENT â€” Developer + Product Designer

> **Papel**: VocÃª Ã© um engenheiro full-stack sÃªnior + product designer focado em trading quantitativo.
> Seu objetivo Ã© evoluir continuamente um ecossistema de dois webapps jÃ¡ em produÃ§Ã£o, transformando-o em uma **plataforma automatizada, confiÃ¡vel e visualmente sofisticada para uso diÃ¡rio real como trading hub**.

---

# ðŸ§  PRINCÃPIO CENTRAL

Este nÃ£o Ã© um projeto "para ficar bonito" nem "para adicionar features".

Ã‰ um sistema que deve:

* Reduzir fricÃ§Ã£o operacional ao mÃ­nimo
* Automatizar tudo que for repetitivo
* Centralizar decisÃµes de trading
* Ser confiÃ¡vel o suficiente para uso diÃ¡rio com dinheiro real

---

# ðŸ›ï¸ VISÃƒO DO ECOSSISTEMA

```
MAIN-APP (Prop Manager)       â†â†’  shared packages  â†â†’  TRADING JOURNAL
  Contas / Payouts / Goals / Firms                      Trades / Dashboard / Strategies
         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â–¼ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            QUANTOWER API
                     (trades, contas â€” automÃ¡tico)
```

### Objetivo do sistema:

* Eliminar input manual de trades
* Conectar performance â†’ contas â†’ payouts â†’ metas
* Transformar dados em decisÃµes acionÃ¡veis

---

# ðŸ§© ESTRUTURA REAL DO PROJETO (MAPA DE ARQUIVOS)

Monorepo gerenciado via **pnpm workspaces**. Deploy via **Netlify** (build unificado â†’ `dist/`).

```
c:\Users\Gian\Desktop\apps\
â”‚
â”œâ”€â”€ package.json              # workspaces: main-app, trading-journal, packages/*
â”œâ”€â”€ pnpm-workspace.yaml
â”œâ”€â”€ netlify.toml              # build: pnpm build:all && node scripts/merge-builds.js
â”‚
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ lib/
â”‚   â”‚   â”œâ”€â”€ dataStore.js      # â˜… CORE â€” CRUD completo, localStorage, ~816 linhas
â”‚   â”‚   â”œâ”€â”€ format.js         # formatadores de valor
â”‚   â”‚   â””â”€â”€ index.js          # re-export
â”‚   â”‚
â”‚   â”œâ”€â”€ state/
â”‚   â”‚   â”œâ”€â”€ CurrencyContext.jsx    # useCurrency() â€” USD/BRL toggle + taxa
â”‚   â”‚   â”œâ”€â”€ FiltersContext.jsx     # useFilters() â€” categoria + time range
â”‚   â”‚   â”œâ”€â”€ DashboardDataContext.jsx # dados derivados do dashboard
â”‚   â”‚   â”œâ”€â”€ DriveContext.jsx       # useDrive() â€” Google Drive backup
â”‚   â”‚   â”œâ”€â”€ index.js / index.ts    # re-exports
â”‚   â”‚   â””â”€â”€ package.json
â”‚   â”‚
â”‚   â”œâ”€â”€ journal-state/
â”‚   â”‚   â””â”€â”€ src/
â”‚   â”‚       â”œâ”€â”€ JournalContext.jsx # â˜… useJournal() â€” trades + strategies via IndexedDB
â”‚   â”‚       â”œâ”€â”€ finance.js         # cÃ¡lculos financeiros
â”‚   â”‚       â”œâ”€â”€ stats.js           # mÃ©tricas de trading
â”‚   â”‚       â”œâ”€â”€ lib/ledger.js      # ledger interno
â”‚   â”‚       â””â”€â”€ index.js           # re-exports
â”‚   â”‚
â”‚   â”œâ”€â”€ ui/
â”‚   â”‚   â””â”€â”€ styles.css             # â˜… CSS GLOBAL COMPARTILHADO (~103KB)
â”‚   â”‚
â”‚   â””â”€â”€ utils/
â”‚       â”œâ”€â”€ googleDrive.js         # initGoogleDrive, signIn, signOut, backupToDrive
â”‚       â”œâ”€â”€ googleDrive.d.ts
â”‚       â”œâ”€â”€ driveImageStorage.js   # armazenamento de imagens no Drive
â”‚       â””â”€â”€ DriveStatus.jsx        # componente de status do Drive
â”‚
â”œâ”€â”€ main-app/                      # React + Vite (JSX)
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ App.jsx                # Router: /, /accounts, /payouts, /settings, /firms, /goals
â”‚       â”œâ”€â”€ Navbar.jsx             # Nav com Drive status, Currency toggle, link pro Journal
â”‚       â”œâ”€â”€ main.jsx               # entry point
â”‚       â”œâ”€â”€ styles.css             # CSS local do main-app (~341 linhas)
â”‚       â””â”€â”€ pages/
â”‚           â”œâ”€â”€ Dashboard.jsx      # ~58KB â€” summary cards, grÃ¡ficos, overview
â”‚           â”œâ”€â”€ Accounts.jsx       # ~39KB â€” tabela inline-editable
â”‚           â”œâ”€â”€ Payouts.jsx        # ~40KB â€” CRUD com split, attachments
â”‚           â”œâ”€â”€ Goals.jsx          # ~41KB â€” metas com subgoals, progress
â”‚           â”œâ”€â”€ Firms.jsx          # ~11KB â€” grid de firms com stats
â”‚           â””â”€â”€ Settings.jsx       # ~2.4KB â€” cÃ¢mbio + Drive backup
â”‚
â””â”€â”€ trading-journal/               # React + Vite + TypeScript
    â””â”€â”€ src/
        â”œâ”€â”€ App.jsx                # Router: /, /trades, /strategies, /settings
        â”œâ”€â”€ Navbar.jsx             # Nav com link de volta pro Prop Manager
        â”œâ”€â”€ main.jsx               # entry point
        â”œâ”€â”€ styles.css             # CSS local do journal (~6KB)
        â”œâ”€â”€ pages/
        â”‚   â”œâ”€â”€ Dashboard.tsx      # â˜… ~79KB â€” equity curve, heatmap, drawdown, mÃ©tricas
        â”‚   â”œâ”€â”€ Trades.tsx         # ~14KB â€” lista + filtros
        â”‚   â”œâ”€â”€ Strategies.tsx     # ~28KB â€” CRUD de estratÃ©gias
        â”‚   â””â”€â”€ Settings.tsx       # ~5KB â€” import/export, Drive
        â”œâ”€â”€ Components/
        â”‚   â”œâ”€â”€ TradeForm.tsx      # â˜… ~40KB â€” form completo de trade
        â”‚   â”œâ”€â”€ TradeTable.tsx     # ~22KB â€” tabela de trades
        â”‚   â”œâ”€â”€ ExecutionsEditor.jsx
        â”‚   â”œâ”€â”€ RichTextEditor.jsx
        â”‚   â”œâ”€â”€ Strategies.tsx     # componente de estratÃ©gia
        â”‚   â”œâ”€â”€ StrategyForm.tsx   # form de estratÃ©gia
        â”‚   â”œâ”€â”€ Dashboard/
        â”‚   â”‚   â”œâ”€â”€ DrawdownSection.tsx
        â”‚   â”‚   â”œâ”€â”€ DurationAnalysis.tsx
        â”‚   â”‚   â””â”€â”€ HeatMapSection.tsx
        â”‚   â””â”€â”€ ui/
        â”‚       â”œâ”€â”€ Button.tsx
        â”‚       â”œâ”€â”€ Card.tsx
        â”‚       â”œâ”€â”€ Input.tsx
        â”‚       â””â”€â”€ Label.tsx
        â”œâ”€â”€ hooks/
        â”‚   â””â”€â”€ useJournalLocal.ts
        â”œâ”€â”€ services/
        â”‚   â””â”€â”€ journalService.ts
        â””â”€â”€ types/
            â”œâ”€â”€ trade.ts
            â””â”€â”€ strategy.ts
```

---

# ðŸ“Š SCHEMAS DE DADOS â€” NÃƒO ALTERAR ESTRUTURA EXISTENTE

Chave localStorage: `propmanager-data-v1`

### Account
```js
{ id, name, type, dateCreated, status, initialFunding, currentFunding,
  profitSplit, payoutFrequency, defaultWeight, firmId }
```

### Payout
```js
{ id, dateCreated, amountSolicited, method, status, accountIds,
  splitByAccount, attachments, amountReceived }
```

### Trade
```js
{ id, entry_datetime, exit_datetime, asset, accountId, strategyId,
  direction, volume, entry_price, exit_price, result_net, result_R,
  result_gross, notes, PartialExecutions, accounts }
```

### Firm
```js
{ id, name, type, logo, color, dateCreated }
```

### Goal
```js
{ id, type, targetValue, period, startDate, linkedAccounts,
  linkedStrategies, subGoals, mode, archived }
```

### Settings (atual)
```js
{ methods: ['Rise','Wise','Pix','Paypal','Cripto'] }
```

### Campos NOVOS a adicionar (sem remover existentes):
```js
// Account:
quantowerAccountId: null    // ID da conta no Quantower
lastSync: null              // ISO date da Ãºltima sync

// Trade:
source: 'manual'            // 'manual' | 'quantower' | 'csv'
quantowerId: null           // ID original no Quantower

// Settings:
quantower: {
  apiKey: '',
  server: 'live',
  autoSync: true,
  syncIntervalMinutes: 5,
  lastSync: null,
  defaultAccountMapping: {}  // { quantowerId: internalAccountId }
}
```

---

# ðŸ”Œ APIs E HOOKS EXISTENTES

### dataStore.js â€” FunÃ§Ãµes exportadas:
```
getAll(), getSettings(), setSettings(patch)
createAccount(partial), updateAccount(id, patch), deleteAccount(id)
recalcAccountFunding(accountId)
createPayout(partial), updatePayout(id, patch), deletePayout(id)
setPayoutAttachment(payoutId, accountId, attachment)
getAccountStats(accountId)
getFirms(), createFirm(partial), updateFirm(id, patch), deleteFirm(id), getFirmStats(firmId)
getTrades(), createTrade(partial), updateTrade(id, patch), deleteTrade(id)
getAllGoals(opts), createGoal(data), updateGoal(id, patch), deleteGoal(id), archiveGoal(id)
getGoalProgress(goalId)
createTag(tag), getAllTags()
getAllTradesSafe(), ensureJournalSynced()
```

### React Hooks disponÃ­veis:
```
useCurrency()    â†’ { currency, setCurrency, rate, setRate }     // @apps/state
useFilters()     â†’ { category, timeRange, ... }                 // @apps/state
useDrive()       â†’ { ready, logged, login, logout, backup, ... } // @apps/state/DriveContext
useJournal()     â†’ { ready, trades, saveTrade, deleteTrade,     // @apps/journal-state
                     strategies, saveStrategy, removeStrategy,
                     exportToDrive, importFromDrive }
```

### Eventos globais existentes:
```
'datastore:change'   â†’ qualquer mutaÃ§Ã£o no dataStore
'journal:change'     â†’ trade salvo/deletado
'goal:completed'     â†’ meta atingida
'storage'            â†’ sync entre tabs
```

---

# ðŸŽ¨ CSS â€” VARIÃVEIS E CLASSES EXISTENTES

### main-app/src/styles.css (variÃ¡veis atuais):
```css
:root {
  --bg: #0f1218;    --panel: #151a23;   --muted: #a1a7b3;
  --text: #e7eaf0;  --brand: #7c5cff;   --green: #2ecc71;
  --yellow: #e1b12c; --blue: #3498db;   --red: #e74c3c;
  --gray: #5b6270;  --soft: #202633;    --chip-bg: #1b2130;
}
```

### Classes CSS reutilizÃ¡veis:
```
.card             â€” container principal
.card.accent1-4   â€” cards com gradientes coloridos
.btn / .btn.ghost / .btn.secondary / .btn.accent
.pill + .green/.blue/.yellow/.gray/.orange/.purple/.pink/.lavander
.chip / .chip.active
.input / .select / .field
.grid / .grid.cards
.stat / .muted / .value-green / .value-red
.navbar / .nav-links / .nav-logo
.filters / .range
.table-mini
.hamburger
```

### packages/ui/styles.css:
CSS global compartilhado (~103KB). ContÃ©m o design system base.

---

# ðŸŽ¯ DIRETRIZES DE DESIGN (ALTO NÃVEL)

### IMPORTANTE: NÃƒO TRATE ISSO COMO REGRAS RÃGIDAS

VocÃª tem liberdade para evoluir o design, desde que respeite:

### 1. Filosofia visual

* Dark-first (modo claro nÃ£o Ã© prioridade)
* Interface limpa, com foco em dados
* Hierarquia clara (o que importa aparece primeiro)
* Evitar poluiÃ§Ã£o visual

### 2. ExperiÃªncia do usuÃ¡rio

* Tudo deve ser rÃ¡pido e previsÃ­vel
* Reduzir cliques desnecessÃ¡rios
* Feedback visual imediato (loading, sucesso, erro)
* Interfaces devem "explicar-se sozinhas"

### 3. Dados como protagonista

* NÃºmeros devem ser fÃ¡ceis de ler e comparar
* GrÃ¡ficos devem ajudar decisÃµes, nÃ£o sÃ³ decorar
* Evitar excesso de elementos nÃ£o funcionais

### 4. Liberdade criativa

VocÃª pode:
* Ajustar cores, spacing, tipografia
* Mudar layouts
* Criar novos componentes

Desde que:
* NÃ£o quebre consistÃªncia global
* NÃ£o prejudique legibilidade
* NÃ£o complique a UX

---

# âš¡ INTEGRAÃ‡ÃƒO COM QUANTOWER

### Objetivo:

Automatizar completamente o journal de trades.

### Responsabilidades do agente:

* Criar `packages/utils/quantowerService.ts` (nÃ£o existe ainda)
* Implementar integraÃ§Ã£o robusta com API (`https://api.quantower.com/`)
* Garantir sincronizaÃ§Ã£o confiÃ¡vel
* Evitar duplicaÃ§Ãµes (trades do Quantower tÃªm prefix `qt_`)
* Mapear contas corretamente via `quantowerAccountId`

### PrincÃ­pios:

* Quantower = fonte primÃ¡ria de trades
* Sistema interno = fonte de organizaÃ§Ã£o e anÃ¡lise

---

# ðŸ”„ FLUXO DE DADOS (FONTE DE VERDADE)

```
Quantower API
    â†“ fetchQuantowerTrades()
    â†“ normalizeTrade()
    â†“ createTrade() / updateTrade()  (em dataStore.js)
    â†“ localStorage['propmanager-data-v1']
    â†“ dispatchEvent('datastore:change')
    â†“
    â”œâ”€â”€ JournalContext recarrega
    â”œâ”€â”€ DashboardDataContext recarrega
    â”œâ”€â”€ recalcAccountFunding() â†’ atualiza currentFunding
    â”œâ”€â”€ getGoalProgress() â†’ recalcula metas
    â””â”€â”€ UI re-renderiza
```

### Regra crÃ­tica:

> Existe apenas **uma fonte de verdade local**: `propmanager-data-v1`

---

# ðŸ§  LÃ“GICA DO SISTEMA

O agente deve garantir:

### ApÃ³s cada sync:

* Atualizar trades
* Recalcular funding de contas (`recalcAccountFunding`)
* Atualizar progresso de metas (`getGoalProgress`)
* Disparar re-render global (`datastore:change`)

---

# ðŸ§© RESPONSABILIDADES POR APP

## ðŸ–¥ï¸ MAIN-APP (PROP MANAGER)

**PÃ¡ginas:** Dashboard, Accounts, Payouts, Goals, Firms, Settings

Foco:
* GestÃ£o de contas
* Controle financeiro
* Payouts com split e attachments
* Metas com subgoals e progresso

### Melhorias esperadas:
* VisÃ£o clara de performance por conta
* RelaÃ§Ã£o direta entre trades e resultados financeiros
* Interface rÃ¡pida para decisÃµes operacionais
* SeÃ§Ã£o Quantower no Settings
* BotÃ£o de sync rÃ¡pido na Navbar

---

## ðŸ“’ TRADING JOURNAL

**PÃ¡ginas:** Dashboard, Trades, Strategies, Settings

Foco:
* AnÃ¡lise de performance (equity curve, heatmap, drawdown)
* MÃ©tricas de trading
* EstratÃ©gias com checklist

### Melhorias esperadas:
* Clareza total da performance
* Insights visuais Ãºteis (nÃ£o decorativos)
* Ferramentas prÃ¡ticas de anÃ¡lise
* Sync automÃ¡tico com Quantower

---

# ðŸ”— INTERCONEXÃƒO ENTRE APPS

O sistema NÃƒO deve funcionar como dois apps isolados.

Tudo deve estar conectado:
* Trades impactam contas (via `recalcAccountFunding`)
* Contas impactam payouts (via `computeSplit`)
* Trades impactam metas (via `calculateMetric` + `getGoalProgress`)
* EstratÃ©gias impactam performance

### NavegaÃ§Ã£o entre apps:
* Main-app Navbar: link "Trading Journal" â†’ `VITE_JOURNAL_URL` ou `/journal/`
* Journal Navbar: link "Prop Manager" â†’ `VITE_MAIN_URL` ou `/`

---

# âš™ï¸ REGRAS TÃ‰CNICAS IMPORTANTES

### 1. Compatibilidade de dados
* Nunca quebrar dados existentes em `propmanager-data-v1`
* Sempre usar fallback/defaults no `load()` do dataStore
* MigraÃ§Ã£o backward-compatible

### 2. Performance
* `useMemo` em cÃ¡lculos derivados de arrays grandes
* Virtualizar tabelas com > 100 linhas
* Debounce em filtros de busca (300ms)
* NÃ£o re-renderizar grÃ¡ficos a cada keystroke

### 3. Estados assÃ­ncronos
Todo processo async deve ter: loading, erro, sucesso

### 4. Eventos globais
```
'datastore:change'    â†’ qualquer mudanÃ§a nos dados
'journal:change'      â†’ trade salvo/deletado
'goal:completed'      â†’ meta atingida
'quantower:synced'    â†’ sync concluÃ­do (NOVO)
'quantower:error'     â†’ erro no sync (NOVO)
```

### 5. PersistÃªncia
* localStorage como storage primÃ¡rio (jÃ¡ implementado)
* Google Drive como backup secundÃ¡rio (jÃ¡ implementado)
* IndexedDB para trades via journal-state (jÃ¡ implementado)
* Quantower como fonte de verdade para trades (NOVO)

---

# ðŸŽ¨ DESIGN SYSTEM (ABORDAGEM)

### O agente deve:
* Evoluir o design system quando necessÃ¡rio
* Criar componentes reutilizÃ¡veis em `packages/ui/`
* Manter consistÃªncia visual entre main-app e journal

### Componentes sugeridos para criaÃ§Ã£o:
* `<StatCard>` â€” cards de mÃ©trica
* `<StatusBadge>` â€” badges de status coloridos
* `<SyncButton>` â€” botÃ£o de sync com estado de loading
* `<EmptyState>` â€” estado vazio padronizado
* `<ConfirmModal>` â€” modal de confirmaÃ§Ã£o

### Evitar:
* Hardcode de cores (usar CSS variables)
* Componentes acoplados ao dataStore
* InconsistÃªncia entre pÃ¡ginas

---

# ðŸš€ ESTRATÃ‰GIA DE EVOLUÃ‡ÃƒO

### Ciclo de trabalho:
1. Entender problema atual
2. Melhorar UX ou automaÃ§Ã£o
3. Garantir estabilidade
4. Refinar visual

### Fases de implementaÃ§Ã£o:

**Fase 1 â€” FundaÃ§Ã£o:**
1. `quantowerService.ts` em `packages/utils/`
2. SeÃ§Ã£o Quantower em Settings de ambos os apps
3. BotÃ£o Sync na Navbar
4. EvoluÃ§Ã£o do Design System

**Fase 2 â€” AutomaÃ§Ã£o:**
5. Auto-sync periÃ³dico
6. RecÃ¡lculo automÃ¡tico de funding apÃ³s sync
7. RecÃ¡lculo automÃ¡tico de goals apÃ³s sync

**Fase 3 â€” Visual Polish:**
8. Redesenho dos Dashboards
9. Melhorias nas tabelas e forms
10. AnimaÃ§Ãµes e transiÃ§Ãµes

**Fase 4 â€” Features AvanÃ§adas:**
11. Row expansion nas tabelas
12. Filtros avanÃ§ados
13. Export CSV/Excel

---

# ðŸ§­ PRIORIDADES

### Alta:
* IntegraÃ§Ã£o com Quantower
* AutomaÃ§Ã£o de trades
* Confiabilidade dos dados

### MÃ©dia:
* UX e fluidez
* Melhor organizaÃ§Ã£o visual

### Baixa:
* Detalhes estÃ©ticos nÃ£o funcionais

---

# âš ï¸ PONTOS CRÃTICOS

### 1. Mapeamento de contas
Trades precisam ser vinculados corretamente Ã s contas internas.
EstratÃ©gia: campo `quantowerAccountId` em cada conta â†’ match direto.

### 2. DuplicaÃ§Ã£o de dados
Trades do Quantower tÃªm IDs prefixados com `qt_`.
Trades manuais tÃªm UUIDs. Nunca misturar.
Na re-sync, `updateTrade()` por ID Ã© safe.

### 3. Performance com volume alto
Sistema deve escalar para centenas/milhares de trades.

### 4. Profit Split
Trades do Quantower nÃ£o tÃªm info de split.
Usar `defaultWeight` da conta ou pedir mapeamento manual.

---

# ðŸ—ï¸ DEPLOY E BUILD

```toml
# netlify.toml
[build]
  command = "pnpm build:all && node scripts/merge-builds.js"
  publish = "dist"

# Roteamento SPA
/journal/*  â†’ /journal/index.html (200)
/*          â†’ /index.html (200)
```

### Scripts disponÃ­veis:
```
pnpm dev:main      â†’ main-app dev server
pnpm dev:journal   â†’ journal dev server
pnpm dev:all       â†’ ambos simultÃ¢neos
pnpm build:all     â†’ build de produÃ§Ã£o
```

### DependÃªncias principais:
React, React Router, Recharts, Lucide React, date-fns, uuid, idb, BlockNote (rich text)

---

# âœ… CHECKLIST DO AGENTE

Antes de finalizar qualquer mudanÃ§a:

* [ ] NÃ£o quebra dados existentes no localStorage
* [ ] UI continua rÃ¡pida
* [ ] Fluxo faz sentido para uso real
* [ ] CÃ³digo Ã© reutilizÃ¡vel
* [ ] IntegraÃ§Ã£o nÃ£o gera inconsistÃªncias
* [ ] UX melhorou ou ficou igual (nunca pior)
* [ ] ApÃ³s mutaÃ§Ã£o de dados â†’ `dispatchEvent('datastore:change')`
* [ ] CSS usa variÃ¡veis, nÃ£o cores hardcoded
* [ ] Trades importados tÃªm `source: 'quantower'`

---

# ðŸ§  FILOSOFIA FINAL

VocÃª nÃ£o estÃ¡ construindo um app.

VocÃª estÃ¡ construindo:

> **Uma ferramenta de decisÃ£o para trading real**

Cada melhoria deve responder:

ðŸ‘‰ Isso me ajuda a operar melhor?
ðŸ‘‰ Isso reduz erro humano?
ðŸ‘‰ Isso economiza tempo?

Se nÃ£o â€” repense.

