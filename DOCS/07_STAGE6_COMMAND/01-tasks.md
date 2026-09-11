# STAGE 6 — Tasks

- [x] T6.1 Home composição (sem nova lógica financeira)
- [x] T6.2 Financial Calendar (interno + overlay econômico via API free)
- [x] T6.3 Action Center + `risk:warning`/`goal:completed` + badges
- [x] T6.4 `financialIntelligence.ts` leitura + 4 insights base (origem crescimento, caixa parado, setup edge, projeção)
- [x] T6.5 Só aqui: fusão SPA definitiva + `tokens.css` único + polish visual profundo

Gate: Home sem query financeira própria (só selectors dos motores).

## Notas de implementação (Fase 5)

- **Home** = `packages/ui/HomeCommandCenter.tsx` (composição pura) + `main-app/src/pages/command/HomePage.jsx`
  (container que só chama `useCommandSnapshot()` → selectors dos motores). Nenhuma fórmula nova.
- **Fio de ligação** dos motores → React: `packages/state/FinanceContext.jsx` (`FinanceProvider`/`useFinance`)
  + `packages/state/CommandContext.jsx` (`CommandProvider`/`useCommandSnapshot`). A UI nunca constrói `DataService`.
- **Financial Calendar** = `packages/ui/FinancialCalendar.tsx` (mês único + camadas toggle) + overlay econômico
  via API free (`packages/lib/db/economicCalendar.ts` — xoomar, sem key; cache offline).
- **Action Center + Alerts** = `packages/ui/ActionCenter.tsx` + `packages/ui/AlertsBadge.tsx`; ações derivadas
  de flags dos motores (`risk:warning`/`goal:completed`/payout `Pending`/`prepareDarf`).
- **AI leitura-only** = `packages/lib/db/financialIntelligence.ts` (`buildCommandSnapshot` + `generateInsights` +
  `buildActions`). Todo insight cita a query/fonte exata; nenhum número inventado (testado).
- **Fusão SPA** = `main-app` agora é o router único: `/` (Command Center) + `/journal/*` (Trading Journal fundido)
  num só `BrowserRouter`; Navbar usa `<Link to="/journal">` (client-side, sem reload). `netlify.toml` não redireciona
  mais `/journal/*` pra um index.html separado. Tokens de design centralizados em `@apps/ui/styles.css`.
- **Arquivados**: `agent.md` (raiz) e `DOCS/PLANO_V1_REMAKE_OVERHAUL.md` → `DOCS/_ARCHIVE/` com cabeçalho SUPERSEDED.

## Verificação

- `pnpm build:all` verde (main-app + trading-journal).
- Testes: `npx vitest run` → 105 passed (inclui `financialIntelligence.test.ts`).
