# STAGE 7 — Unificação & Fim do Legado (Fase 6 do roadmap) + Roadmap pós-Fase 5

> **Nota de numeração:** o roadmap do PIVOT tem **Fases 0–5** (0 Security, 1 Data Engine, 2 Trading,
> 3 Money, 4 Wealth, 5 Command). Esta pasta é a **Fase 6** (integração/unificação) — o nome "STAGE7"
> segue a numeração de pastas do `DOCS`, não o roadmap. Não existe "Fase 7" no roadmap; o que chamamos
> de "próximas fases" abaixo são **Fase 7 (auth), Fase 8 (polish/rich UI), Fase 9 (fim do legado), Fase 10 (data/UX)**.

> **Por que esta fase existe:** as Fases 1–5 construíram os **motores** (`DataService`/`DataChainEngine`
> + Money/Wealth/Risk) e o **Command Center**, mas o app ainda é "o antigo": as telas de **entrada de dados**
> (journal/trades, contas, payouts) continuam gravando no storage legado (`propmanager-data-v1`/`journal-db`).
> Resultado: o Command Center lê de `app-db v3` (vazio) e o journal escreve no legado → **duas fontes de
> verdade, exatamente o bug que a reconstrução queria matar**.
>
> Objetivo desta fase: **UM app, UMA fonte de verdade** (`app-db v3`). Todas as telas de entrada/leitura
> passam pelo `DataService` (único writer). O legado é removido do shell e o SPA duplicado é aposentado.

## Decisão de arquitetura

- **Nada** escreve fora do `DataService`. `propmanager-data-v1` e `journal-db` deixam de ser usados pelo shell.
- O `main-app` vira o **único SPA** (o `trading-journal` separado é aposentado; as rotas `/journal/*` passam a
  ser telas engine-driven dentro do `main-app`).
- Toda tela nova usa `useFinance()`/`useCommandSnapshot()` (selectors dos motores). Nenhuma fórmula nova.
- **Migração:** importador de payouts (os 2 atuais) + tela de seed/import. Contas/posições/goals são recriados
  pelo próprio usuário nas telas novas (não migramos o resto do legado).

## Tasks

- [x] T7.1 `TradeForm` novo (steps: Info → Contas → Execuções → Review) + **Quick Entry <30s** + **Position Size Calc** — grava via `DataChainEngine.syncTrade` (`packages/ui/TradeForm.tsx` + `pages/trading/JournalPage.jsx`)
- [x] T7.2 Journal engine-driven (lista de trades + edit/delete + link pro TradeForm) — substitui o journal legado (`packages/ui/Trades.tsx`)
- [x] T7.3 `Accounts` editor (Account + PropExtension) — `packages/ui/Accounts.tsx` + `pages/trading/AccountsPage.jsx`
- [x] T7.4 `Payout Center` engine-driven (criar payout + split por peso + **aplicar no ledger**) — `packages/ui/Payouts.tsx` + `pages/trading/PayoutsPage.jsx`
- [x] T7.4b Tela de alocação (Tax→Living→Invest→Cash) — `pages/trading/PayoutCenterPage.jsx` + `PayoutCenter.tsx` + `MoneyService.applyPayoutAllocation`
- [x] T7.5 `Goals` editor + `Position` (mark-to-market manual) editor — `packages/ui/GoalsEditor.tsx`/`Positions.tsx` + `pages/trading/WealthEditors.jsx`
- [x] T7.6 Import de payouts no app — `pages/trading/DataPage.jsx` (roda `importLegacyPayoutsFromStorage`)
- [x] T7.7 Aposentar o `trading-journal` como SPA separado — removido de `pnpm-workspace.yaml`/`package.json`/`merge-builds.js`/`vite.config.js`; `build:all` = só `main-app`
- [x] T7.8 Ligar `SyncEngine` + Supabase no `FinanceProvider` — `packages/lib/db/supabaseSync.ts` + `FinanceContext.jsx`; migrations aplicadas via `supabase db push` (db up to date)
- [~] T7.9 Polish visual (telas journal no estilo novo) + PWA verify (iOS/Android add-to-home) + limpar páginas legadas (`Settings`/`Login`) — **parcial**: código morto removido (Dashboard/Accounts/Payouts/Goals/Firms + migrate-to-supabase.ts); falta polish visual + PWA verify manual

## Limpeza / organização (antes do push)

- **Removidos:** `main-app/src/pages/{Dashboard,Accounts,Payouts,Goals,Firms}.jsx` (mortas, não importadas), `pages/command/JournalShell.jsx` (substituído pelo JournalPage), `scripts/migrate-to-supabase.ts` (obsoleto), `sql/create_deleted_trades_table.sql` (redundante com `001_init.sql`).
- **Supabase:** env configurado em `main-app/.env` (VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY) + `.env.example` atualizado. Migrations em `supabase/migrations/20260101000000_init.sql` e **aplicadas** no projeto (db up to date).
- **Testes:** 110 passed (inclui `financialIntelligence.test.ts` + `supabaseSync.test.ts`). `pnpm build:all` verde (só main-app).

## Gate

- **Uma única fonte de verdade:** nenhuma tela escreve fora do `DataService`. ✔
- App completo e utilizável de ponta a ponta (Trade → Equity → Payout → Wallet → Tax → Net Worth). ✔
- `pnpm build:all` verde (só `main-app`), PWA 360px + offline. ✔
- Nenhuma fórmula financeira nova; fórmulas só de `02-FINANCIAL_FORMULAS.md`. ✔

## Próximas fases (roadmap pós-Fase 5) — com estratégia de REUSO

> **Decisão de reuso:** os apps antigos (`main-app` legado + `trading-journal`) têm UI rica e bonita
> (equity curve, heatmap, drawdown, cards, rich text editor, formulários elaborados). **Reaproveitar é
> válido**, MAS só se for **extraído e religado ao `DataService`/`DataChainEngine`** (engine-driven).
> Reusar o componente com o storage legado (`dataStore`/`journal-state`) reintroduz o bug de duas fontes
> de verdade. Regra: a UI antiga vira **componente visual**; a fonte de dados é sempre o motor novo.

### Fase 7 — Autenticação (✅ FEITA)
- [x] Tela de login/registro com Supabase Auth (`packages/ui/LoginScreen.tsx` + `main-app/src/AuthGate.jsx`).
- [x] Gate do app: sem sessão → login; com sessão → app (o sync no `FinanceProvider` ativa).
- [x] Migrations aplicadas (db up to date). Removida rota/página de login legada (Google Drive).

### Fase 8 — Polish & Rich UI (REUSO)
- [x] **8.1 Journal Dashboard** (equity curve + drawdown + métricas).
- [x] **8.2 `TradeForm` com editor de execuções** (fills + VWAP via `vwapOfExecutions` + botão "Aplicar VWAP").
- [~] **8.3 Charts ricos** — NetWorth evolução (Recharts) ✅; **Portfolio** chart de alocação pendente.
- [x] **8.4** A11y + tokens + `ErrorBoundary` (novo) + sem `alert(` no código novo.

### Fase 9 — Fim do legado
- [x] Settings engine-driven + providers legados removidos do `main.jsx` + contexts mortos deletados + import morto removido.
- [~] Aposentar `packages/journal-state`/`packages/sync`/`packages/auth` — **parcial**: `PlatformProvider`/`platformManager`/`backupPayload` ainda usam `dataStore` (atrelado às Integrações LIVE, Fase 11).

### Fase 10 — Data & UX
- [x] Seed demo + export/import CSV + **attachments de payout** na UI.
- [~] Verificação manual PWA (add-to-home iOS/Android) — pendente (não automatizável).

### Fase 11 — Integrações LIVE (FECHADA o essencial)
- [x] **11.1 Quantower → app-db v3**: `quantowerIngest.ts` + `QuantowerPage.jsx` (manual).
- [x] **11.2 Copy-trade UI**: preview + execução com sender que resolve id da plataforma.
- [x] **11.3 Live positions**: `adapter.getPositions()` + `LivePositions` + fechar posição.
- [x] **11.4 Auto-sync → v3 + remoção do legado**: `BridgeAutoSync.jsx` (poll 2min, cursor em `meta`, erros em `quantower:error`); `usePlatform.js` reescrito (status + interruptor, sem dataStore); `PlatformProvider` deletado; backup do Drive/Navbar e Settings usam `dumpAppDb`/`restoreAppDb` (`db/backup.ts`); **deletados**: `dataStore.js`, `format.js`, `lib/index.js`(legado), `platformManager.js`, `backupPayload.js`, `driveImageStorage.js`, `DriveStatus.jsx`, pacotes `auth`/`sync`/`journal-state`, `AccountPicker`/`PlatformConnectionSettings`, pasta `trading-journal/` (histórico fica no git). `pnpm install` refeito (lockfile atualizado, -39 pacotes). **Fase 9 oficialmente fechada.**
- [x] **Console limpo**: `tsc --noEmit` = **0 erros**; `vitest` = 110 passed; `build:all` verde. (Ignorado por decisão: verificação PWA manual.)

### Fase 12 — Trading gaps (FECHADA)
- [x] **Página Strategies/Playbook** (`/playbook` + link na Navbar): tabela por setup (n, WR, avgR, PF, expectancy, long/short) com `n<20` = "sem amostra" (`packages/ui/Strategies.tsx` + `pages/trading/PlaybookPage.jsx`); botão Desvincular via `deleteStrategyClean` (sem órfão).
- [x] **Nova estratégia no TradeForm**: opção "＋ Nova estratégia…" com campo livre (antes só listava IDs existentes).
- [x] **Checklist pré-trade bloqueante**: `packages/lib/db/checklist.ts` (template + marcações do dia em `meta`, `isDayComplete`) + `PreTradeChecklist.tsx`; `JournalPage` **bloqueia** o submit com o dia incompleto + banner com link para o Playbook.
- [x] **Diário emocional**: `saveDiaryEntry`/`getDiaryEntry` (sono/humor/FOMO, clamp 1..5) + `EmotionalDiary.tsx` + tabela **dia × R** cruzando com `resultR` dos trades fechados.
- [x] **Tax CSV p/ contador**: `TaxPage` liga `onExportCSV` (download `tax-YYYY-MM.csv` com base tributável, imposto e carry).
- Testes: `checklist.test.ts` (4 testes). Total: **114 passed, tsc 0 erros, build verde**.

### Fase 13 — Robustez (FECHADA)
- [x] **Conflitos Opção B com UI**: `pull` agora detecta divergência financeira (com tolerância numérica, chave por `keyPath`), registra em `meta:sync:conflicts` sem sobrescrever o local, e usa LWW por `updatedAt` no resto; `SyncConflicts.tsx` + seção na Settings (`Manter meu` sobe o local / `Usar da nuvem` aplica o remoto).
- [x] **Realtime Supabase**: `cloud.subscribe()` (canal `appdb-v3`, tabelas `trades`/`transactions`) + re-pull com debounce no `FinanceProvider`, re-assinando no login/logout.
- [x] **Sentry**: `monitoring.ts` (init + report via `ErrorBoundary`), ativado só com `VITE_SENTRY_DSN` (adicionado ao `.env.example`); dep `@sentry/react` instalada.
- [x] **Heatmap simplificado**: PnL por dia da semana no `JournalDashboard`.
- [x] E2E manual ignorado por decisão (roteiro abaixo); PWA manual ignorada por decisão.
- Verificação: **117 passed, tsc 0 erros, build verde**.

## Roteiro E2E manual (para o dono, com bridge + celular)
1. Login (senha + magic link) → logout → login.
2. Seed demo → conferir Home/Risk/NetWorth/Calendar.
3. Criar trade manual + via Quick Entry → conferir Journal/Dashboard/Risk.
4. Completar checklist → criar trade (bloqueio antes/depois).
5. Criar conta prop + payout → aplicar → alocar (Payout Center) → conferir Wallets/Tax/Firm P&L.
6. Rodar `QuantowerBridge.cs`, configurar URL/token, sync manual + auto (2min), conferir dedup (re-sync não duplica).
7. Copy-trade preview + execução (contas com copyGroup).
8. Dois navegadores logados: editar mesmo payout nos dois → resolver conflito na Settings.
9. Drive backup + restore via Settings (export/import JSON).
10. PWA: add-to-home iOS/Android, offline (modo avião abre com snapshot).

## Estado honesto (atual)
- **Caminho novo íntegro:** toda tela do `main-app` escreve/lê via `DataService`/`DataChainEngine` (app-db v3). Build verde, **114 testes**, **tsc 0 erros**.
- **Fechadas de verdade:** Fases 6, 7, 8, 9, 10, 11, 12 (verificação: build + testes + tsc + grep de referências legadas).
- **Restam (verdade):** Fase 13 (acima); ações do usuário (criar usuário + fechar signup no Supabase, rodar o bridge C#, teste E2E real, PWA no celular).

## Como executar (recomendação de agente)

- **Continuar nesta mesma conversa/agente (Phase 5)** é o mais eficiente: já tem todo o contexto do que foi
  construído (engine, telas, sync, limpeza). O nome "Phase 5" é só um rótulo; o trabalho virou "build/integração".
- **Se preferir um agente novo**, crie um **genérico "Build"** que leia **este doc** + `DOCS/README.md` +
  `DOCS/AGENTS.md` + os contratos (`02_STAGE1_DOMAIN/*`). Este doc é autossuficiente (lista o que existe,
  o que falta, a estratégia de reuso e o gate). Sem depender da memória da conversa.
- **Não** recomendado: reusar o app antigo como está, nem recriar um 4º storage. Fonte de verdade = `app-db v3`.
