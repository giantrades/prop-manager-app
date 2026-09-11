# Shell UX Foundation (P0+P1+P2) — executado

> Escopo transversal (não é módulo de produto): velocidade, palette, toast, onboarding,
> atalhos, tokens, Home personalizável, PWA flow, impressão, push. Dono: `module-shells`.

## P0 — uso diário
- [x] **Code-split**: `App.jsx` com `React.lazy` por rota + `Suspense`; `vite.config.js` com
  `manualChunks` (vendor/charts/icons). Inicial ~367 kB (vendor 161 kB paralelo; gzip ~100 kB);
  charts (421 kB) sob demanda; **blocknote (1,3 MB) só ao abrir o editor de notas** (dynamic import).
  Antes: 1.159 kB em 1 chunk.
- [x] **Command palette** (`packages/ui/CommandPalette.tsx`, Ctrl+K, `/`): 22 rotas +
  3 ações (novo trade, atualizar preços, gerar recorrentes) + busca de contas/estratégias
  (carrega ao abrir). Setas/Enter/Esc, mobile bottom-sheet.
- [x] **Busca global**: dentro da palette (páginas + contas + estratégias).
- [x] **Toast unificado** (`packages/ui/Toast.tsx` + provider no `main.jsx`): `toast(msg,
  {type, action})` com undo, aria-live. Migrados: Navbar (backup), JournalPage,
  WealthEditors (import), SettingsPage (7 chamadas).
- [x] **Onboarding** (`main-app/src/Onboarding.jsx`): aparece com app vazio (0 contas +
  0 trades), 3 passos, dispensa persistente.
- [x] **Atalhos**: Ctrl/Cmd+K palette, `/` palette, `N` novo trade (`/journal?new=1`,
  `JournalPage` lê o param), nunca em campo de texto.

## P1 — polish
- [x] **Tokens**: `:focus-visible` global, `prefers-reduced-motion`, `--sb-muted-txt`
  `#4a5568`→`#8b94a5` (contraste).
- [x] **Home personalizável**: `hidden` em `HomeCommandCenter` + toggle "Personalizar"
  com persistência (`homeWidgetsHidden`).
- [x] **PWA flow** (`main-app/src/usePwa.js`): botão Instalar (prompt nativo + instrução
  iOS), banner offline, toast "Nova versão" com Atualizar.
- [x] **Impressão**: `@media print` (esconde shell/nav/ações) + botões Imprimir
  (FirmPnl, Journal).

## P2 — push (infra pronta, deploy manual)
- [x] Migration `supabase/migrations/20260201000000_push_subscriptions.sql` (RLS por dono).
- [x] `sw.js`: handlers `push` (payload {title,body,url}) + `notificationclick`.
- [x] `main-app/src/usePush.js` + toggle em Settings (com estados sem-chave/negado).
- [x] Edge Function `supabase/functions/push-sender/index.ts` (envia + limpa 410).
- [x] `VITE_VAPID_PUBLIC_KEY` no `.env.example` + runbook `supabase/README-push.md`
  (VAPID, deploy, cron, checklist).
- [ ] **Manual (dono)**: gerar VAPID, `supabase db push`, deploy da function, curl de teste.

## Gate
- [x] `tsc` 0 erros (corrigidos: JSX condicional no Insights, tipo do toast)
- [x] 168 testes verdes · build verde
- [ ] **Manual (dono)**: Lighthouse PWA 100 + Performance ≥90 (roteiro: `pnpm dev:main`,
  Chrome DevTools → Lighthouse → Mobile; ou `npx -y lighthouse http://localhost:4173
  --view` após `pnpm preview`)

## Batch V — consolidação visual + IA (audit UX externo, executado)
- **V1 glass restoration**: `.ws-tabs` + upgrades glass (gradiente+tinta+sombra do CSS antigo)
  em `packages/ui/styles.css`; `jd-card` com tinta por posição, `pf-total-card` roxo, `hc-quad` glass.
- **V2 journal em 3 abas**: Dashboard (métricas+calendário+day drill) | Trades | Review
  (heatmap/breakdown/R/duração/weekly) em `JournalPage.jsx`.
- **V3 workspaces por rota** (sem duplicação, chunks preservados): Portfolio Overview|Holdings,
  Accounts Contas|Firms, Payouts Payouts|Alocar (`ws-tabs` com NavLink nas 6 páginas).
- **V4 nav enxuta**: Trading sem payout-center/positions/quantower/import; Quantower+Importar
  no Sistema; rotas e palette intactas.
- **V5 accounts master-detail**: lista + detalhe lado a lado no desktop (`.ac2-master-detail`).
- **V6 home attention-first**: Action Center logo após Trading Today (`HomeCommandCenter.tsx`).
- Fora de escopo (churn alto, valor baixo): Goals+Forecast virarem "Planning", fundir os dois
  calendários, status unificado texto+ícone+cor em tudo, IA ler+agir (contratos Fase 5 proíbem).
- Gate: `vite build` verde + 220 testes verdes.

## Batch H — transição suave entre abas (executado)
Problema: trocar de aba dentro de um módulo dava "flash" (chunk lazy + Suspense) e
recarregava tudo (skeleton) porque cada página remontava e refazia o fetch.
- **H1 prefetch de chunks**: `main-app/src/routeLoaders.js` é a fonte única dos chunks
  (usada pelo `lazy()` do App); `ModuleTabs` e os botões de módulo da sidebar chamam
  `prefetchPage` ao montar/hover/focus. Trocar de aba não baixa chunk na hora.
- **H2 cache SWR por rota**: `main-app/src/usePageData.js` (cache em memória + revalidação
  no `datastore:change`). `useEngineData` agora cacheia por pathname. Voltar a uma aba
  mostra o último dado na hora e revalida em background (sem skeleton).
- **H3 containers migrados**: JournalPage, PlaybookPage, AccountsPage, PayoutsPage,
  PayoutCenterPage, GoalsManagePage, PositionsManagePage e todos os dashboards passam a
  usar o cache. `MoneyDashboardPage` migrado p/ `useEngineData`.
- Pendente: SettingsPage/QuantowerPage/DataPage (Sistema) ainda com load próprio.
- Gate: `tsc` 0 + build verde + 228 testes verdes.

## Batch G — dashboards de módulo (EXECUTADO — G1..G4)
Cada âncora agora tem uma **dashboard como porta de entrada**; a primeira página do
módulo virou aba ("Resumo" aponta de volta p/ a dashboard). Clique no módulo → dashboard.
- **G1** rota de dashboard por módulo: `/dinheiro` (D6), `/contas`, `/trading`,
  `/investimentos`, `/planejamento`. Home já era dashboard (`/`).
- **G2** Dinheiro `/dinheiro` (D6): free cash, a pagar, carteiras, payouts, próximas
  contas, top categorias. Abas Resumo|Wallets|Gastos|Tax.
- **G3** Contas `/contas` (`AccountsDashboardPage`): contas prop ativas, equity total,
  risco (STOP/WARN/SAFE), payouts pendentes, lista de contas com pill de risco e P&L por
  firm. Abas Resumo|Accounts|Firm P&L|Payouts|Alocar.
- **G4** Trading `/trading` (`TradingDashboardPage`): PnL hoje, contas em risco, checklist
  do dia, estratégias + `JournalDashboard`. Investimentos `/investimentos`
  (`InvestmentsDashboardPage`): patrimônio, investido, PnL, maiores posições + série.
  Planejamento `/planejamento` (`PlanningDashboardPage`): metas, safe available, fluxo
  mensal, projeção 90d + Forecast/Goals.
- **Infra**: `useEngineData` extraído p/ `main-app/src/useEngineData.js` (reuso nos
  dashboards). `.cmd-page*` movido p/ `main-app/src/styles.css` (era injetado só pelo
  HomePage lazy — abrir rota direto perdia o estilo). `.dash-*` globais.
- Gate: `tsc` 0 + `vite build` verde + 228 testes verdes.

## Batch F — sidebar por dashboard + abas de módulo + mapa (executado)
- **F1 sidebar sem acordeão**: clique no módulo vai **direto à dashboard** do módulo
  (`Navbar.jsx` → `goToModule`). Removidos `openModules`/`toggleModule`/chevron/children.
  A lista principal agora tem só as 8 âncoras visíveis.
- **F2 abas de módulo**: novo `main-app/src/ModuleTabs.jsx` (`<ModuleTabs module="..." />`)
  derivado de `navConfig.js`; todas as páginas usam esse componente (nada de `ws-tabs` à mão).
  Workspaces: Home, Contas (Accounts|Firm P&L|Payouts|Alocar), Trading, Dinheiro
  (Wallets|Gastos|Tax), Investimentos (Portfolio|Net Worth|Holdings), Planejamento,
  Relatórios, Sistema.
- **F3 mapa de código**: `DOCS/11_PAGE_MAP.md` (rota → módulo → container → UI → motor →
  testes + peças transversais + convenções). É o ponto de entrada p/ qualquer melhoria.
- **F4 agente de página**: `.opencode/agent/module-page-improvements.md` (uma rota por vez).
  Agentes `phase0..phase5` **arquivados** em `DOCS/_ARCHIVE/agents/` (reconstrução concluída).
- Gate: `vite build` verde + 220 testes verdes.

## Batch E — migração 7 âncoras (executado)
- `navConfig.js`: HOME / CONTAS / TRADING / DINHEIRO / INVESTIMENTOS / PLANEJAMENTO /
  RELATÓRIOS + Sistema. Labels e keywords preservados; palette deriva sozinha.
- `Navbar.jsx`: defaults de módulos abertos com merge (quem já usava não perde estado).
  Restore de rota/última-página/scroll continua funcionando (chaves por id; ids antigos
  viram fallback p/ dashboard e são regravados).
- `.opencode/agent/module-shells.md`: missão atualizada p/ 7 âncoras.
- Gate: `vite build` verde + 220 testes verdes.

## Batch D — auditoria UX externa (executado P0/P1 + housekeeping; P2 parcial)
Achado central confirmado: o padrão `ws-tabs` (Payouts|Alocar) já é o drill-down do
`visao-produto.md` — o ganho está em replicá-lo, não em redesenhar telas.
- **D1 workspace Patrimônio**: NetWorth|Wallets|Portfolio compartilham `ws-tabs`
  (Visão Geral|Carteiras|Investimentos); Portfolio mantém 2ª linha (Resumo|Holdings|Configurar).
- **D2 workspace Trading**: Journal|Playbook|Risk com `ws-tabs` nas 3 páginas.
- **D2b workspace Planejamento**: Goals|Forecast|Marcos com `ws-tabs` nas 3 páginas.
- **D3 rename Diário→Marcos**: `/journal-events` (nav + título + palette); keywords do
  Trading Journal sem "diário". Glossário: Conta Prop (Trading) vs Carteira (Money) vs
  posição de investimento (Portfolio) — nunca "conta" solto.
- **D4 charts nas 3 telas com 0 recharts**: Wallets (barras saldo/carteira), Forecast
  (área hoje→90d), Tax (barras day vs swing, líquido × IR). Só display de props.
- **D5 Relatórios v1** (`/reports`, nav Wealth): cards patrimônio/firm-6m/IR-6m + barras
  firm×mês + tabela fechamento 6m (freeCash+taxCockpit por mês) + CSV + Imprimir.
- **D6 Payout Center sem select**: pendentes como cards clicáveis (alocado = tem tx com
  `ref.type==='payoutId'`); form embaixo como antes.
- **D7 Personalizar da Home**: painel próprio (`.hm-custom`) em vez de caixa `cmd-msg`.
- **D8 housekeeping**: `GoalsPage` morto removido; `main-app/src/navConfig.js` fonte única
  (MODULES + keywords + EXTRA_ROUTES p/ payout-center/positions) — Navbar e App importam.
- **Diferido (decisão do dono)**: ~~migração p/ 7 âncoras~~ EXECUTADA (Batch E):
  HOME/Home+Calendar+Actions; CONTAS/Accounts+Firms+Payouts; TRADING/Journal+Playbook+Risk;
  DINHEIRO/Wallets+Gastos+Tax; INVESTIMENTOS/Portfolio+NetWorth+Holdings;
  PLANEJAMENTO/Goals+Forecast+Marcos; RELATÓRIOS; + grupo Sistema (Settings/Quantower/
  Importar, desvio intencional). `/positions` virou item sidebar (Holdings).
  Seguem em aberto: exposição cambial dedicada e evolução ano a ano + DARF no Relatórios.
- Gate: `vite build` verde + 220 testes verdes. Push c/ a próxima leva.

## Batch C — settings em 2 níveis + Money na Home (executado)
- **C2-global**: taxa USD→BRL de exibição editável no card Moeda (`SettingsPage.jsx`,
  usa o `setRate` do `CurrencyProvider`; persistida em `usdBrlRate`). Global = só moeda,
  dados, push, conta, sync.
- **C2-módulo**: aba **Configurar** no workspace Portfolio (`PortfolioPage`): taxa FX do
  motor + série CDI mensal saíram do topo da página p/ a aba. Padrão: config do módulo
  vive no módulo (Gastos já tem categorias/orçamento/recorrentes inline; Trading tem
  Playbook + sessões no heatmap).
- **C1 (parcial)**: quadrante **Money** na Home (`HomeCommandCenter.tsx` + widget `money`
  em `HomePage.jsx`): carteiras, free cash do mês, payouts pendentes — tudo do snapshot
  (composição, zero lógica nova). Resto do C1 (profundidade app-inteiro por módulo) vira
  batch nos `melhorias.md` de cada módulo, conforme você for anotando.
- Gate: `vite build` verde + 220 testes verdes. Push c/ a próxima leva.

## Batch B — ideias UI/UX futuras (não executar agora)
- **B1 — Modo claro**: EXCLUÍDO por decisão do dono (dark-only). Registrado para não reabrir.
- **B2 — Densidade de tela (compacto/confortável)**: toggle que reduz paddings/fontes via classe no root. Afeta todas as telas de uma vez; bom para celular pequeno vs desktop.
- **B3 — Atalhos customizáveis**: remapear Ctrl+K/N// em Settings (persistido em `localStorage`). Hoje são fixos no `App.jsx`.
