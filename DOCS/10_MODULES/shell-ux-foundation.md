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

## Batch W — conexões de plataforma em cards + associação de contas (executado)
- **Substituído o dropdown** (`PlatformStatusIndicator`) do Settings por **cards por conexão**
  (`main-app/src/pages/trading/ConnectionsManager.jsx`): nome, status (conectada/offline) e
  **X/Y contas associadas**, glass + **cor da firm** vinculada à conexão (firm mais comum
  entre as contas associadas).
- **Associar/criar contas da ponte**: lista as contas do bridge por conexão e permite
  **associar** a uma conta do app (`Account.platformAccountId`), **desassociar**, **criar
  conta** (com tipo: Prop/Banco/Cripto-Carteira/Investimento/Dinheiro), **auto-associar por
  nome** e **criar todas as faltantes**. Resolve o gap do app antigo (vínculo conexão↔conta)
  já adaptado aos vários tipos de conta novos.
- Gate: `tsc` 0 + build verde + 238 testes.

## Batch V — paridade do Resumo de Investimentos + Home reordenável (executado)
- **Resumo de Investimentos** ganhou **valor × custo × CDI** e **DCA** (reusa o `Portfolio`
  com `only={['history','dca']}`) — fecha a paridade com a antiga "Visão Geral".
- **Home reordenável/redimensionável**: os widgets agora usam `WidgetGrid` (arrastar + 1x/2x,
  persistido em `widgetLayout:home`), somando ao "Personalizar" (mostrar/ocultar).
- Gate: `tsc` 0 + build verde + 238 testes.

## Batch U — reordenar/redimensionar widgets (executado)
- **`WidgetGrid`** (`packages/ui`): grade de 2 colunas com **arrastar para reordenar** e
  **largura 1x/2x** por widget, persistido por página (`widgetLayout:<key>`). Aceita `items`
  ou `children` com `key` (+ `data-span={2}`).
- Aplicado nos resumos: **Trading** (calendário/histograma/drawdown), **Investimentos**
  (classe/ativo/posições/payouts/evolução), **Gastos** (donut/cashflow/contas/cartões/…),
  **Contas** (por tipo/P&L por firm), **Planejamento** (marcos/metas).
- Home mantém o "Personalizar" (mostrar/ocultar); reorder na Home fica como próximo passo.
- Gate: `tsc` 0 + build verde + 238 testes.

## Batch T — Investimentos unificado + pies (executado)
- **Resumo = visão geral do Portfolio**: `InvestimentosDashboardPage` agora traz KPIs +
  **pies por classe** (Renda variável, Renda fixa, Cripto, Imóveis/Outros) e **por ativo**,
  evolução do patrimônio e payouts por mês. Gerenciamento fica no Portfolio.
- **Portfolio** perdeu a aba **Visão Geral** (redundante) — ficou Posições | Proventos |
  Alertas | Configurar. A alocação do Portfolio agora usa dois pies (por ativo / por conta).
- **`AllocationPie`** (novo, `packages/ui`): donut + **legenda legível** (cor, label, %, valor)
  reusado em ambos; corrige legendas bugadas e padroniza a qualidade dos pies.
- **Home** (commit anterior): widgets com **altura igual** (`stretch` + min-height), pie por
  classe (net worth), Trading **sem “Risco”**, e **Ações manuais + config de regras**
  (`packages/lib/db/actions.ts`, gaveta cria/exclui, Settings alterna regras).
- Gate: `tsc` 0 + build verde + 238 testes.

## Batch S — Home refinada + visualizações (executado)
- **Home · Contas**: widget com **PnL por conta** (trading + investimentos), ordenado por
  tamanho — o valor "que vai crescendo". Snapshot ganhou `accountPnl`.
- **Home · Trading**: área de **PnL acumulado com marcadores de payout/withdrawal**
  (`payoutEvents` no snapshot).
- **Home · Investimentos**: **pie chart** de alocação (top símbolos). Snapshot ganhou
  `expensesByCategory` + `categories` (para pintar).
- **Home · Gastos**: **donut por categoria** (substitui as barras Entrou×Gastou).
- **Gastos (page)**: "6 meses" agora é **ComposedChart** (áreas de entradas/gastos + linha
  de saldo), diferente das barras.
- **Payouts**: gráfico virou **barras por mês** (page), não mais linha acumulada.
- **Investimentos Resumo**: novo widget **Alocação** (pie) além da composição por classe.
- **Actions (explicação)**: são **derivadas** dos flags dos motores — `ActionKind =
  risk | goal | payout | tax | price` (`buildActions` no `financialIntelligence.ts`). Não são
  criadas/editadas pelo usuário; hoje dá para **marcar como lida** (gaveta). Criar/editar/
  silenciar regras vira batch futuro (C-ish).
- Gate: `tsc` 0 + build verde + 238 testes.

## Batch R — Home como cockpit (executado)
- **Actions/Calendar deixam de ser abas**: nav do Home tem só Home; rotas `/actions` e
  `/calendar` removidas. Viram **widgets** na Home.
- **Home = cockpit com o gráfico principal de cada módulo** (`HomeCommandCenter`):
  - Trading: PnL acumulado (área) + PnL hoje/W-L/risco.
  - Gastos: Entrou × Gastou (barras 6m) + saldo do mês.
  - Investimentos: evolução valor × custo (área) + PnL%.
  - Contas & Payouts: payouts pendentes + P&L por firm.
  - Metas: barras de progresso.
  - Ações: lista de notificações (era a aba Actions).
  - Calendário: **eventos econômicos** (`fetchEconomicEvents`) + **feriados do mercado
    americano** (`usMarketHolidays` — cálculo local) dos próximos 45 dias.
  - Insights.
- **Snapshot estendido** (`buildCommandSnapshot`): `cashflowSeries`, `portfolioHistory`,
  `tradingSeries` (composição; sem número novo).
- Widgets configuráveis (Personalizar) continuam.
- Gate: `tsc` 0 + build verde + 238 testes.

## Batch Q — moeda única, ativos "outros", forms e Home (executado)
- **Q1 Moeda única**: "Saldo em contas" (Gastos) e "Líquido" (Contas) agora mostram **um
  valor convertido** para a moeda do app (`convertMoney` + `fmtDisplay`), em vez de quebrar
  por moeda — já que o seletor global converte tudo.
- **Q2 Ativos "outros"** no Portfolio: `assetKind: 'other'` (imóvel/bem/participação) com
  valor investido + valor atual → PnL de valorização/desvalorização. Engine preserva
  `assetKind` no `PortfolioRow` (+ teste). Resumo de Investimentos ganhou **Composição por
  classe** (Variável / Renda fixa / Outros) e a Home mostra "Outros ativos" no quadrante.
- **Q3 Forms mais agradáveis**: títulos com ícone; form de Posição com segmento de tipo
  (Variável/Renda fixa/Outro) e campos específicos; hints.
- **Q4 Home**: barra de **ações rápidas** (Novo trade, Novo lançamento, Payouts,
  Investimentos, Contas).
- Gate: `tsc` 0 + build verde + 238 testes.

## Batch P — Portfolio como workspace completo (executado)
- **Abas próprias** (estado, não toggle): **Visão Geral | Posições | Proventos | Alertas |
  Configurar**. Resolve o "clicar 2x no Configurar".
- **Posições (CRUD)**: aba dedicada reusando `Positions.tsx` — adicionar/editar/excluir
  posição com conta, símbolo, qty, preço médio, marca, moeda e renda fixa (taxa/indexação);
  lista mostra valor e **PnL** com moeda. Handlers no container (`ds.positions.put/remove`,
  `wealth.markPosition`). É aqui que se cadastra o que alimenta as % e o acompanhamento.
- **Proventos** e **Alertas**: abas focadas (o componente `Portfolio` ganhou `only` para
  renderizar seções específicas) + a tabela de posições p/ ações.
- **Configurar**: câmbio USD→BRL, CDI mensal e explicação de como a alocação/% é derivada
  do cadastro (cards próprios `.cfg-card`).
- Gate: `tsc` 0 + build verde + 237 testes verdes.

## Batch O — 4 pontos de acabamento (executado)
- **O1 Trades estilo app antigo** (`Trades.tsx`): tabela com colunas ordenáveis, paginação
  (15/página), busca, tags, badge de firm (ícone/cor) e lado; cards no mobile; replay
  expansível. Stats (Trades/Winrate/Avg R/PnL) no topo. `JournalPage` passa `firms`.
- **O2 Forecast útil** (`ForecastPage`): cards (caixa hoje, fluxo mensal, safe available,
  90d) + **parâmetros mensais editáveis** (renda, contas, imposto, aportes, contas 30d,
  reserve) salvos no motor (`setMonthlyInputs`) e recalculados; deltas 30/60/90 no gráfico.
- **O3 Widgets antigos** (`DrawdownSection.tsx`): métricas (Max/Avg/Recovery/Status), gráfico
  **underwater**, piores drawdowns com paginação e insights. Lógica no motor
  (`drawdownAnalysis` em `journalAnalytics.ts` + teste). Calendário de PnL ganhou **heat por
  intensidade**. Widgets no Resumo do Trading, lado a lado.
- **O4 Glass global**: bloco em `packages/ui/styles.css` (seletor `body ...`) padroniza os
  "surfaces" neutros (sections/cards de todos os módulos) com o mesmo glassmorphism
  (gradiente + borda + sombra + blur), sem tocar superfícies semânticas/acentos.
- Gate: `tsc` 0 + build verde + 237 testes verdes.

## Batch N — reestruturação de abas + widgets (executado)
- **Trading**: abas Resumo | Journal | Positions (Risk removido). Resumo enxuto: cards glass
  (PnL, winrate, PF, capital, payouts, ROI) + gráfico **PnL acumulado com marcadores de
  payout/withdrawal** + widgets (Calendário de PnL, **Drawdown** via `computeMaxDrawdown`,
  **Histograma de R**) lado a lado. Sem "contas em risco"/checklist redundantes.
- **Journal**: abas internas **Review | Trades | Playbook** (Playbook movido p/ dentro;
  `PlaybookPanel`). Dashboard antigo do journal saiu (infos no Resumo).
- **Investimentos**: Net Worth deixa de ser aba — vira widget do Resumo (junto de maiores
  posições e **payouts acumulados**).
- **Firms**: página só de cadastro (nome/tipo/cor/**ícone**/logo); gráficos de firm foram
  para o Resumo de **Contas** (lado a lado com contas por tipo).
- **Contas**: dashboard por tipo (Prop/Cripto-Carteira/Investimento/Banco/Dinheiro).
- **Forecast** → Gastos (aba). **Marcos**: criação manual funciona (`createJournalEvent`/
  `removeJournalEvent` no motor + form) e ganhou widget no Resumo de Planejamento.
- **Relatórios**: sai o gráfico de firm; entra resumo do mês + evolução (patrimônio, entradas
  × gastos, e tabela mês a mês de 12 meses).
- Gate: `tsc` 0 + build verde + 234 testes verdes.
- Pendente: Forecast mais útil/parametrizável; widgets antigos restantes.

## Batch M — Contas/Goals/Firms + limpeza de navbar (executado)
- **Contas por tipo simplificado**: só `Prop · Cripto/Carteira · Investimento · Banco ·
  Dinheiro` (contas `crypto` antigas exibem como Cripto/Carteira).
- **Dashboard de Contas** reescrita no estilo da dashboard antiga (cards com glow):
  Líquido **por moeda**, Capital gerido, Total payouts, ROI, Contas (total) e Firms —
  sem enquadrar tudo como prop. `AccountsDashboardPage.jsx`.
- **Firms com ícone**: `FirmDef.icon` (emoji) + seletor no cadastro; o ícone aparece nas
  contas e nos chips de payout (cor ainda propaga). `firms.ts` (+ teste).
- **Goals**: cards de resumo clicáveis (Total / Em andamento / Concluídas) com filtro,
  no estilo da Goals antiga (`WealthEditors.jsx`).
- **Limpeza na navbar**: removido o botão flutuante "Instalar app" (todas as páginas) e o
  bloco de login/logout de Google/Proton da sidebar (agora só em Settings → Backup).
- Gate: `tsc` 0 + build verde + 233 testes verdes.

## Batch L — reaproveitar widgets do app antigo (executado)
- **Trading dashboard**: cards com **glow** (PnL hoje, Capital nominal, Total payouts, ROI,
  Winrate, Profit factor) + **gráfico de área** com toggle PnL acumulado × Payouts acumulados
  (estilo da dashboard antiga) + JournalDashboard. `TradingDashboardPage.jsx`.
- **Settings**: nova seção **Conexões de plataforma** (reusa `PlatformStatusIndicator`) e
  **Backup na nuvem** (Google/Proton via `useDrive`), no layout de cards da Settings antiga.
- Base: `winrate`/`profitFactor` do motor; `fmtMoney` global (moeda).
- Gate: `tsc` 0 + build verde + 232 testes verdes.

## Batch K — notificações como gaveta (executado)
- A notificação da navbar **não navega mais** para `/actions`: abre uma **gaveta**
  (`packages/ui/NotificationsDrawer.tsx`) com a lista de ações em aberto.
- **Lida** = sai do sinal: `main-app/src/useReadNotifications.js` guarda os ids lidos em
  `localStorage` (`notifications:read`); a contagem do badge = não lidas. Clicar num item
  marca como lida (some da gaveta) e "Marcar todas" limpa o badge. Novo alerta (id novo)
  volta a aparecer. Rodapé da gaveta leva ao Action Center completo.
- Gate: `tsc` 0 + build verde + 232 testes verdes.

## Batch J — formatação de moeda global (USD/BRL) (executado)
- **Problema**: cada componente formatava por conta própria com `$`/`R$` fixo; trocar a
  moeda no Settings não mudava os valores.
- **Solução**: `packages/ui/currency.ts` — store reativo (`setDisplayCurrency`, `convertMoney`,
  `fmtMoney(value, fromCurrency)`). O 2º arg é a moeda de ORIGEM (aceita `$|USD|R$|BRL`); o
  valor é convertido para a moeda de exibição e formatado. `App.jsx` sincroniza a store
  durante o render (re-renderiza a árvore ao trocar USD/BRL); `main.jsx` inicializa do
  `localStorage`.
- **Aplicado**: ~30 componentes passaram a usar o `fmtMoney` compartilhado. Telas de valores
  em BRL mantêm o default `R$` via wrapper (Expenses, Tax, NetWorth, Portfolio, Forecast,
  Goals, Calendar, Home, dashboards Gastos/Investimentos/Planejamento/Relatórios).
- **Settings**: campo **USD → BRL** agora aplica na hora (sem botão "Salvar"), no estilo do
  app (fundo escuro), como a Settings antiga. Alternar USD/BRL converte tudo.
- Gate: `tsc` 0 + build verde + 232 testes verdes.

## Batch I — reorg de âncoras + Positions live + Payouts rico (executado)
- **I1 Dinheiro extinto**: módulo `dinheiro` removido. `Tax` → Gastos (aba);
  `Wallets` removido (info já vive em Contas/Accounts, agora com líquido **por moeda**);
  `Payouts e Withdrawals` → Investimentos.
- **I2 Alocar sem aba**: `/payout-center` removido; a alocação (Tax→Living→Invest→Cash)
  agora é inline em `/payouts` (modal com `PayoutCenter`).
- **I3 Holdings → Positions live (Trading)**: `/positions` (registro quebrado) saiu;
  nova `/live-positions` (`LivePositionsPage`) usa `usePlatform().livePositions` e permite
  editar SL/TP (`modifyPosition`) e fechar (`closePosition`). `quantowerAdapter.getPositions`
  passou a expor `sl`/`tp`.
- **I4 Payouts rico (ideia do app antigo)**: `Payouts.tsx` reescrito com cards de Gross/Taxas/
  Líquido, **líquido por firm com cor**, busca, filtro de status, ordenação, tabela no desktop
  + cards no mobile, export CSV e form completo (método/status/data, split por peso com
  preview por conta, comprovante). `PayoutsPage` passa `firms`.
- Estrutura final da sidebar: Home · Contas · Trading · Gastos · Investimentos · Planejamento ·
  Relatórios · Sistema.
- Gate: `tsc` 0 + build verde + 232 testes verdes.

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

## Batch X � demo seed + conex�es demo + SL/TP no bridge (executado)
- **Seed de teste** (`seedDemo.ts`): agora cria **firms** (FTMO/E8/XP com cor+�cone), vincula
  `firmId` (E8/XP), **2 contas prop** com `platformAccountId` (v�nculo demo), trades com
  **stopPrice/resultR** reais e posi��es de **renda fixa** e **outros** (Im�vel).
- **Demo mode ligado**: `FinanceProvider` roda `seedDemoData` na 1� abertura quando
  `VITE_DEMO_MODE=1` e a base est� vazia (antes nunca era chamado).
- **ConnectionsManager demo**: com `VITE_DEMO_MODE=1` e bridge offline, mostra 2 conex�es
  mock + 3 contas, permitindo ver a estrutura sem o Quantower.
- **QuantowerBridge.cs**: `/positions` agora devolve `sl`/`tp` (antes n�o vinha � a UI n�o
  conseguia mostrar os valores atuais).
- Gate: `tsc` 0 + build verde + 238 testes.

## Batch Y � Orders + SL/TP no fechamento (executado)
- **Positions & Orders**: `/live-positions` (label nav "Positions & Orders") ganhou se��o **Ordens**:
  lista ordens pendentes do bridge (tipo/qtd/pre�o/status), **cancelar** (`cancelOrder`) e
  **nova ordem** limit/stop (`placeOrder`); posi��es seguem com SL/TP + fechar. Refresh manual
  recarrega posi��es e ordens; ordens re-poll a cada 60s.
- **Adapter**: `getOrders` passou a expor `type` (`orderTypeId`); `getTrades` mapeia
  `stopPrice`/`takePrice`/`multiplier`.
- **Ingest**: `quantowerToTrade` agora usa `stopPrice` do bridge e calcula `resultR` pela
  f�rmula �nica (`tradeR` do motor) � antes era sempre `null`. Teste: `quantowerDedup.test.ts`.
- **Bridge Patch A** (`/positions/modify`): se a posi��o n�o tem SL/TP, cria ordem Stop/Limit de
  fechamento (Quantower n�o exp�e setter de SL/TP em `Position`). Antes retornava erro.
- **Bridge Patch B** (R correto): `PositionSlTpStore` registra o SL/TP via eventos do Core `PositionAdded`/`PositionRemoved`. No **fechamento** le o bracket ATIVO daquela posicao (mesmo se o SL/TP foi movido durante a operacao) e usa no `stopPrice`/`takePrice` do `TradeDto` -> R correto. Timer de 2s = so rede de seguranca.
- Gate: `tsc` 0 + build verde + 240 testes.

## Batch Z � demo auto-expiravel (executado)
- `packages/lib/db/demoMode.ts`: o seed grava os ids que criou (`demo:ids`). `hasUserData()`
  detecta a 1a conta propria; `clearDemoData()` remove SO os registros demo (contas, trades,
  payouts, goals, positions, propExt, firms do seed + transacoes) e liga `demo:disabled`.
- `FinanceProvider`: com `VITE_DEMO_MODE=1` -> banco vazio = seed; ja existe conta do usuario =
  limpa o demo e desliga (nao volta mais, nem com banco vazio).
- `ConnectionsManager`: os cards mock so aparecem enquanto `showDemo` (sem conta propria e sem
  contas reais da ponte) + aviso "Exemplo (demo) - some quando cadastrar sua 1a conta".
- Testes em `seedDemo.test.ts` (seed + expiracao). Gate: tsc 0 + build verde + 242 testes.

## Batch AA � Contas: status/simplificacao + dropdowns + demo em prod (executado)
- **Dropdowns**: regra global `select option { background:#0f1218; color:#e7eaf0 }` em
  `packages/ui/styles.css` e `main-app/src/styles.css` (varios inputs nao tinham `option`).
- **Form de conta**: removidos Moeda, "ID na plataforma"/Plataforma (link agora so via
  Conexoes) e "Peso default (rateio)" (`defaultWeight` e vestigial: nenhum motor le).
- **Status**: `PropPhase` virou `challenge|funded|live|standby` (coluna TEXT do Supabase,
  sem migration). `normalizePropPhase` mapeia legado (challenge1/2->challenge, paused/failed
  ->standby). `ACTIVE_PROP_PHASES = challenge/funded/live`.
- **Form prop enxuto**: Custo da conta, Balance (nominal), Status, Frequencia payout, Profit
  split. DD/consistencia/minDays seguem com defaults/template (motor intacto).
- **Cards**: prop mostra Balance/Custo/Profit split; removidos Target e a metrica Moeda.
- **Painel da conta**: corrigido (detail re-tenta quando `finance` fica pronto + fallback se
  `accountDashboard` falhar) � nao fica mais preso no skeleton com so "Duplicar".
- **Demo em prod**: botao "Ver exemplo (demo)" funciona em qualquer build (acao explicita e
  rotulada); o demo automatico continua so com VITE_DEMO_MODE.
- Gate: tsc 0 + build verde + 242 testes.

## Batch AB � conexao -> firm + icone (executado)
- `packages/lib/db/connectionFirms.ts`: metadados `bridge:connectionFirms` (connectionId -> firmId).
- `ConnectionsManager`: seletor "Firm da conexao" no card; a cor/icone da firm pintam o card
  (fallback brand) e a firm e' propagada para TODAS as contas da conexao (`Account.firmId`),
  alimentando a tela Contas e os widgets (firmPnl/cores). Criar/associar conta ja herda a firm.
- Firms ja suportam icone (emoji/custom) em `FirmsPage`; agora o icone aparece no card da conexao.
- Gate: tsc 0 + build verde + 242 testes.

## Batch AC � sync de meta (firms/conexoes) + form de firm sem grade (executado)
- **Por que nao sincronizava**: `meta` era local-only (sem tabela no Supabase). A firm da
  conta (`Account.firmId`) ja sincronizava; o que faltava era a definicao da firm (nome/cor/
  icone) e o vinculo conexao->firm chegarem no outro device.
- **`app_meta` (supabase/migrations/20260301000000_app_meta.sql)**: tabela `id/user_id/key/
  value jsonb/...` + RLS, para a whitelist de chaves `firms:*` e `bridge:connectionFirms`.
- **Codigo**: `meta` entrou no `entityType` (`types.ts`), em `DataService.ENTITY_TYPE_BY_STORE`
  e no `FinanceContext` (com `isSyncedMetaKey` na whitelist). `supabaseSync` mapeia `meta ->
  app_meta`, filtra por whitelist no push/pull e **degrada sem quebrar** se a migration ainda
  nao rodou (outros stores seguem sincronizando).
- **FirmsPage**: removida a grade de emojis; fica so o campo livre de icone (vazio = icone padrao).
- Testes: `supabaseSync.test.ts` cobre a whitelist. Gate: tsc 0 + build verde + 243 testes.
