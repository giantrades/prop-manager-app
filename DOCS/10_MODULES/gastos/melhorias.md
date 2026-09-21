# MELHORIAS — Gastos / Finanças (batch A)

> Um arquivo por módulo. Itens rotulados `A1, A2, ...`. Futuras melhorias: batch B (`B1...`).
> O agente analisa os `[ ]` abertos e executa um a um (código + teste + build verde).

## A1 — Recorrência inteligente
- Status: [x] executada
- Contexto: assinaturas/aluguel se repetem todo mês e hoje precisam ser lançadas à mão.
- Proposta: `Transaction.recurrence?: { freq:'monthly', day }` (aditivo). Ao virar o mês, sugerir ("lançar recorrentes?") — **sugerir, nunca criar sozinho**. Detectar candidatas: mesma categoria+valor em 3+ meses → botão "tornar recorrente".
- Arquivos: `packages/lib/db/types.ts`, `MoneyService` (gerar sugestões), `packages/ui/Expenses.tsx`
- Aceite: nada criado sem confirmação; recorrente gera 1 lançamento/mês; `tsc` 0; testes verdes; build verde.

## A2 — Anexos/comprovantes por transação
- Status: [x] executada
- Contexto: payouts já têm anexos; gastos não. Recibo fotografado resolve disputa e auditoria.
- Proposta: `Transaction.attachments?: Record<string, object>` (base64 pequeno ou referência Drive). Upload por arquivo/foto no form; thumbnail na lista. Limite 300KB com compressão client-side.
- Arquivos: `packages/lib/db/types.ts`, `packages/ui/Expenses.tsx`
- Aceite: anexo salvo/visível; quota monitorada; câmera mobile funciona; `tsc` 0; build verde.

## A3 — Import OFX/CSV do banco
- Status: [x] executada
- Contexto: digitar cada gasto não escala. Bancos exportam OFX/CSV.
- Proposta: importador OFX/CSV genérico (parser + preview + mapeamento de coluna, como `csvImport.ts`) com **dedup por (data+valor+descrição)**; categoria sugerida por palavra-chave (ex.: "UBER"→Transporte), editável no preview.
- Arquivos: novo `packages/lib/db/bankImport.ts` (+ testes), UI "Importar extrato"
- Aceite: preview antes de importar; duplicata pulada; `tsc` 0; testes verdes; build verde.

## A4 — Comparativo mês a mês + metas de economia
- Status: [x] executada
- Contexto: ver "gastei X" sem comparar com o mês passado não gera ação.
- Proposta: cards este mês vs mês passado por categoria (Δ % com seta); meta de economia mensal com barra; insight "Alimentação +22% vs mês passado".
- Arquivos: `MoneyService` (novo selector mensal), `packages/ui/Expenses.tsx`
- Aceite: comparativo correto na virada de ano; `tsc` 0; testes verdes; build verde.

## A5 — Editar/deletar transação de gasto
- Status: [x] executada na spec G8 (botões editar/excluir + undo via `onRestore`)
- Contexto: `Expenses.tsx` hoje só **adiciona** despesa. Não há editar nem excluir — impossível corrigir valor errado.
- Proposta: cada item ganha Editar (reabre form com valores) e Excluir (confirmação via toast+undo, nunca `confirm()`). Reutilizar `MoneyService` (`remove`/`update`). Mobile: ícones ≥44px.
- Arquivos: `packages/ui/Expenses.tsx`, container (ligar `onUpdate`/`onDelete`)
- Aceite: editar recalcula Free Cash; excluir com undo; `tsc` 0; testes verdes; build verde.
- Fora de escopo: categorias customizáveis (spec G9) e import OFX (A3).

## B1 — Rollover de sobra do orçamento
- Status: [x] executada
- Contexto: sobrou do orçamento de Moradia este mês? Hoje a sobra evapora; deveria somar ao mês seguinte.
- Proposta: `rolloverAmount(budgets, txs, ym)` = Σ max(0, meta − gasto) do mês anterior; orçamento efetivo = meta + rollover; UI mostra "+X de rollover" na barra. Opt-in por categoria (flag no budget).
- Arquivos: `money.ts` (motor puro + testes), `Expenses.tsx` (badge + barra)
- Aceite: virada de ano correta; opt-out volta ao comportamento atual; `tsc` 0; testes verdes; build verde.
- Fora de escopo: rollover automático sem confirmação (sempre explícito).

## B2 — Próximas contas a pagar (ideia UI/UX)
- Status: [ ] ideia (futura)
- Contexto: recorrentes + contas com vencimento existem, mas não há visão "o que vence nos próximos 15 dias".
- Proposta: seção no topo de Gastos com próximos vencimentos (dos templates + metas), ordenados por data, com total. Base: `recurringDue` estendido para N dias à frente.

## Batch C — redesign visual + UX Mobills-like (executado)
- **C1 Glass + espaçamento + botões**: hero/resumos e seções passam a usar o tema
  (gradiente + borda + sombra) em vez de `rgba(255,255,255,0.02)`; botão primário real
  (`.ex-btn-primary`) para "Novo"; chips e ghost coerentes. `Expenses.tsx` (bloco `EX_CSS` v2).
- **C2 Barra de orçamento no topo**: total gasto/meta do mês com % e estado "estourou",
  a partir de `budgetStatus` (já existente). Sem cálculo novo.
- **C3 Busca de lançamentos**: filtro por nota/categoria no mês (`q`), escondendo grupos
  vazios; estado vazio específico.
- **C4 Form em bottom sheet**: overlay + `role="dialog" aria-modal` com cabeçalho fixo,
  em vez do form que empurrava a página; desktop vira modal centrado.
- **C5 Títulos sem duplicação**: donut = "Distribuição por categoria"; lista = "Lançamentos do mês".
- **C6 Correções**: alvos de toque ≥40px (`.ex-mini`); bug real na importação —
  `en.suggested` (inexistente) → `en.suggestedCategory`, então a categoria sugerida pelo
  extrato agora é aplicada de fato.
- Gate: `vite build` verde + 220 testes verdes.

## Batch D — paridade Mobills (executado D1–D6)
- **D1 Contas a pagar/receber [x]**: `Transaction.paid?`/`dueDate?` (aditivo); `paid===false`
  fica fora do `computeFreeCash` (título pendente, não caixa) e entra ao quitar. Seletores
  `pendingBills`/`pendingSummary` (motor + testes). UI: seção "Contas a pagar/receber" com
  atraso, botão Pagar/Receber e badge "pendente" nas linhas; form com "Já pago" + vencimento.
- **D2 Parcelamento e cartão [x]**: `Transaction.installments?`/`card?`; `recordInstallments`
  cria N despesas mensais (sobra na última, `paid=false`). UI: "Parcelar em 2–48x", campo
  Cartão, badge `n/of`, seção "Fatura por cartão".
- **D3 Visão diária [x]**: toggle Categoria | Dia nos lançamentos, com subtotal por dia
  (composição, sem motor novo).
- **D4 Ranking por estabelecimento [x]**: `merchantRanking(txs, ym)` (motor + teste) agrupando
  por nota normalizada, ignora pendentes; seção "Onde mais gastei". Campo `tags?` aditivo.
- **D5 Transferência entre carteiras [x]**: `recordTransferBetween` (dupla entrada, neutro no
  caixa; corrige o `recordTransfer` de entrada única que perdia patrimônio). UI: sheet
  "Transferir" com De/Para/Valor/Data.
- **D6 Dashboard do Dinheiro [x]**: nova rota `/dinheiro` (`MoneyDashboardPage`) como porta de
  entrada do módulo — free cash, a pagar, carteiras, payouts pendentes, próximas contas, top
  categorias. Wallets **virou aba** (Resumo|Wallets|Gastos|Tax). Ver também
  `shell-ux-foundation.md` Batch G.
- Gate: `vite build` verde + 228 testes verdes (6 novos: D1/D2/D4/D5).
- Pendente (próximas rodadas): D3 saldo acumulado por dia; D4 campo merchant dedicado;
  relatório PDF; metas por estabelecimento.

## Batch D — backlog original (referência)
- **D1 Contas a pagar/receber com status**: flag paga/pendente por lançamento + badges e
  filtro "a pagar"; base para "próximas contas" (B2). Mexe em `types.ts` + `MoneyService`
  (campo aditivo, sem nova fórmula) + UI.
- **D2 Parcelamento e cartão/fatura**: `installments: { n, of }` e agrupamento por cartão;
  parcela gera N lançamentos mensais (sugerir, nunca automático).
- **D3 Visão diária / extrato**: agrupar lançamentos por dia com saldo do dia (hoje só por mês).
- **D4 Relatório por estabelecimento/tag**: além de categoria, permitir tags livres e
  ranking de estabelecimentos (ex.: iFood, Uber).
- **D5 Transferência entre carteiras** na UI de Gastos (o ledger já tem `transfer`).
- **D6 Dashboard do módulo Dinheiro**: resumo de Gastos (mês, orçamento, top categorias)
  como porta de entrada, com abas — ver `shell-ux-foundation.md` Batch G.

## Batch E � Gastos vira m�dulo pr�prio (�ncora) + dashboard (executado)
- **E1 anchor**: Gastos saiu de dentro de Dinheiro e virou �ncora da sidebar (app pr�prio),
  com dashboard `/gastos` (`GastosDashboardPage`: gasto do m�s, or�amento, a pagar, saldo,
  pr�ximas contas, top categorias, �ltimos lan�amentos) e aba "Lan�amentos" (`/expenses`).
- **E2 payouts**: Dinheiro passa a ter "Payouts e Withdrawals" (nome atualizado) + Alocar.
- **E3 criar empresa no modal da conta**: o seletor de firm em `Accounts.tsx` ganhou
  "+ Nova empresa" (cria e j� vincula � conta) � `onSaveFirm`.
- Pr�ximo (profundidade): separar or�amento/categorias/contas-a-pagar em abas pr�prias do
  m�dulo Gastos (hoje s�o toggles in-page), e dashboard com gr�ficos.

## Batch F � Resumo completo + UX estilo Mobills (executado)
- **F1 Resumo refor�ado** (`GastosDashboardPage`): "Saldo em contas" (por moeda) no topo;
  KPIs Entrou / Gastou / Saldo / A pagar / Or�amento (uso %) / Maior alta vs m�s passado.
- **F2 Gr�ficos interativos**: donut "Gastos por categoria" clic�vel (filtra e destaca) com
  **legenda mostrando % e valor**; barras "Entrou � Gastou (6 meses)" + linha de saldo.
- **F3 Cart�es de cr�dito**: se��o com fatura do m�s por cart�o, valor e "em aberto".
- **F4 Lan�amentos estilo Mobills**: cada linha com **�cone circular colorido** da categoria,
  "categoria � conta", valor e **status (pago/pendente)** em dot; bot�o pagar inline.
- **F5 Listas**: pr�ximas contas, onde mais gastei (estabelecimento) e �ltimos lan�amentos
  com �cones; tudo lado a lado no desktop.
- Gate: `tsc` 0 + build verde + 237 testes.
- Pr�ximo (Mobills): **subcategorias**, gest�o de **cart�o de cr�dito** (fatura fechada/paga,
  pagamento parcial), proje��o de saldo e dashboard cards reorden�veis.

## Batch G-mes � historico por mes na dashboard (executado)
- `GastosDashboardPage`: o `ym` saiu do loader (estava fixo no mes atual) e virou estado.
  Nova **barra de meses** (estilo Mobills): � Mes/Ano � + "Mes atual" + faixa de chips dos
  ultimos 12 meses (com saldo) � clicar seleciona o mes e TODA a dashboard reflete ele
  (KPIs, donut, orcamento, ranking, cartoes, ultimos lancamentos, "maior alta vs mes passado").
- Sem formula nova: tudo reusa `expensesByCategory/incomeByKind/budgetStatus/computeFreeCash/
  monthlySeries/compareMonths/merchantRanking`.

## Batch G-periodo � periodo global (mes/intervalo/tudo) (executado)
- Fundacao: `packages/lib/db/period.ts` (Period, periodMonths, inPeriod + agregadores por
  periodo que somam os resultados mensais do motor) e `packages/ui/PeriodPicker.tsx`.
- Estado global `PeriodProvider`/`usePeriod` (meta `ui:period`, sincroniza) � default `all`.
- `GastosDashboardPage` passou a usar o periodo em TUDO (KPIs, donut, orcamento, ranking,
  cartoes, ultimos lancamentos, "a pagar") + atalhos de mes. Grafico de 6m vira o periodo
  (cap 24 meses).
- Teste `period.test.ts`. Gate: tsc 0 + build verde + 247 testes.

## Batch G-impostos � tracker de impostos + fim do cap (executado)
- Categorias ganharam `group`; impostos viram categorias com `group=imposto` (IR, DARF, ITBI,
  IPTU, IOF, Cripto, Exterior + "Impostos"). Sem migration (categorias vivem no meta, que sincroniza).
- Widget "Impostos" no Resumo do Gastos: total do periodo + quebra por tipo + "desde o inicio",
  respeitando o periodo global.
- Tax cockpit (day/swing DARF) removido: aba e rota `/tax` eliminadas (EngineViews.TaxPage ficou
  sem rota). Forecast mantido.
- Fim do cap: graficos desenham o periodo inteiro; PnL acumulado passa a acumular DESDE O INICIO
  (inception-to-date) e so entao recorta a janela -> ultimo ponto = total real.
- Gate: tsc 0 + build verde + 247 testes.

## Batch H — Resumo/widgets, fluxo de lançamento e cartão (a executar)

> Itens `[ ]` a executar UM a um (código + teste + doc + `pnpm build:all` verde). Motor primeiro
> (selector puro + teste); UI depois. Sem fórmula financeira nova — só composição de selectors.
> Contexto vivo: `/gastos` = `GastosDashboardPage` (usa `WidgetGrid storageKey="gastos"`);
> `/expenses` = `Expenses.tsx` (toolbar única + modo filtro + bottom-sheet). Período global via
> `usePeriod`/`PeriodPicker` (meta `ui:period`). Pendências anteriores: **B2** (próximas contas)
> e D3/D4/F "próximos" — o Batch H consolida e prioriza. O **H0** reestrutura as abas do módulo;
> os itens H1+ assumem essa nova IA.

### H0 — Arquitetura de abas do módulo Gastos (Orçamento/Categorias viram abas)
- Status: [ ] a executar
- Contexto: hoje o módulo tem só **Resumo** (`/gastos`), **Lançamentos** (`/expenses`) e
  **Forecast** (`/forecast`). "Orçamento" e "Categorias" são apenas **toggles in-page**
  (`showBudget`/`showCats`) dentro de `Expenses.tsx`, escondidos e sem foco; a página de
  Lançamentos fica sobrecarregada (ledger + orçamento + editor de categorias + gráficos).
- Proposta: transformar em **abas reais do módulo**:
  `Resumo` `/gastos` · `Lançamentos` `/expenses` · `Orçamento` `/gastos/orcamento` ·
  `Categorias` `/gastos/categorias` · `Forecast` `/forecast`.
  Extrair de `Expenses.tsx` para páginas próprias: **`BudgetPage`** (orçamento por categoria +
  rollover + alerta; usa `budgetStatus`/`rolloverAmount`/`BudgetEditor`) e **`CategoriesPage`**
  (CRUD de categorias/ícone/cor; usa `CategoryEditor` — prepara H6 p/ subcategorias). Enxugar
  `Expenses.tsx` para o **ledger** (filters + lista + entrada + importar/transferir) e expandir
  ali o que ganhou foco (ver H3/H8). Registrar as rotas em `navConfig.js` (fonte única de nav,
  entra no Cmd+K automaticamente), `routeLoaders.js`/`App.jsx` e atualizar `DOCS/11_PAGE_MAP.md`.
- Arquivos: `main-app/src/navConfig.js`, `main-app/src/routeLoaders.js`, `main-app/src/App.jsx`,
  novos `main-app/src/pages/command/BudgetPage.jsx` e `CategoriasPage.jsx` (ou via `EngineViews`),
  `packages/ui/Expenses.tsx`, `DOCS/11_PAGE_MAP.md`
- Aceite: 5 abas funcionando com deep-link direto; Cmd+K encontra as novas rotas; Lançamentos sem
  os toggles (mais espaço/foco); estado vazio e mobile 360px OK; `tsc` 0; testes verdes; build verde.
- Fora de escopo: subcategorias (H6) e redução de duplicação de containers (refactor grande);
  aprofundar Orçamento/Categorias fica em H11/H12, e o importador em H10.

### H1 — Layout dos widgets do Resumo: esconder/mostrar + sincronizar
- Status: [ ] a executar
- Contexto: o `WidgetGrid` já reordena (arrastar) e alterna 1x/2x, mas persiste em
  `localStorage('widgetLayout:gastos')` — **não sincroniza** entre PC/celular — e não dá para
  esconder um widget, só reposicionar.
- Proposta: persistir o layout no `meta` (ex.: `ui:widgets:gastos`, que já sincroniza via
  Supabase) reaproveitando o mecanismo atual do `WidgetGrid`; adicionar toggle "mostrar/ocultar"
  por widget (como a Home faz com `homeWidgetsHidden`) + botão "Restaurar padrão".
- Arquivos: `packages/ui/WidgetGrid.tsx`, `packages/state/*` (se precisar de meta), `main-app/src/pages/command/GastosDashboardPage.jsx`
- Aceite: mover/ocultar no celular reflete no PC (e vice-versa); restaura padrão; 360px; `tsc` 0; testes verdes; build verde.
- Fora de escopo: layout específico por breakpoint.

### H2 — Cada widget com tendência (Δ vs período anterior + sparkline)
- Status: [ ] a executar
- Contexto: os widgets mostram o número do período, sem indicar se piorou/melhorou.
- Proposta: badge de variação (Δ%) e mini-sparkline por widget, reusando `compareMonths`/
  `monthlySeries`/`rollingExpectancy` (nada de série nova inventada); cor por sinal.
- Arquivos: `GastosDashboardPage.jsx`, `packages/lib/db/money.ts` (selector de delta se necessário + teste)
- Aceite: Δ coerente na virada de ano; sem fórmula nova; `tsc` 0; testes verdes; build verde.

### H3 — Lançamento rápido (Quick Add) em ≤3 toques
- Status: [ ] a executar
- Contexto: lançar hoje exige abrir o bottom-sheet e preencher ~6 campos. Mobills resolve com
  entrada rápida.
- Proposta: barra "Quick Add" no topo de `/expenses` (e atalho pela palette): digita/tecla o
  **valor** → escolhe **categoria** (chips com ícone) → **Salvar** (conta/carteira default
  lembrada da última vez). "Repetir último lançamento" em 1 toque. O sheet completo continua
  para casos avançados (parcelas, cartão, vencimento, anexo).
- Arquivos: novo `packages/ui/QuickAddExpense.tsx`, `packages/ui/Expenses.tsx`, `main-app/src/CommandContext` (atalho)
- Aceite: lança em ≤3 toques; default de conta/categoria lembrado (localStorage/meta); 360px; toast; `tsc` 0; testes verdes; build verde.
- Fora de escopo: entrada por linguagem natural (ver H4).

### H4 — Campo de valor com cálculo e formato BR/US
- Status: [ ] a executar
- Contexto: escrever `1.234,56` ou `12*3` no campo de valor falha/interpreta errado.
- Proposta: parser puro `parseAmount(text)` que aceita vírgula/ponto e expressões simples
  (`+ - * /`), com preview; usar no Quick Add e no sheet.
- Arquivos: novo helper em `packages/lib/db` (ou `packages/ui`) + teste, `Expenses.tsx`/`QuickAddExpense`
- Aceite: `"12*3"=36`, `"1.234,56"=1234.56`, `"45,90"=45.9`; inválido não salva; teste; `tsc` 0; build verde.

### H5 — Cartão de crédito: fatura aberta/fechada/paga + pagamento parcial
- Status: [ ] a executar
- Contexto: `Card` já tem `closingDay`/`dueDay` e existe `invoiceCycle`; `Expenses` mostra
  "fatura por cartão", mas não há estado (aberta/fechada/paga) nem baixa parcial.
- Proposta: selector puro `invoiceStatus(card, txs, ref)` → `{ competencia, fechamento, vencimento, total, pago, restante, estado: 'aberta'|'fechada'|'paga'|'parcial' }`
  (reusa `invoiceCycle` + despesas do cartão). UI: no widget "Cartões" e na fatura, botão
  **"Pagar fatura"** que cria a quitação (transferência interna, neutra no caixa) — **sugere,
  nunca cria sozinho**; pagamento parcial abate e mostra "restante".
- Arquivos: `packages/lib/db/money.ts` (+ testes), `GastosDashboardPage.jsx`, `Expenses.tsx`
- Aceite: competência correta na virada (usa `invoiceCycle`); parcial abate; nada criado sem confirmação; `tsc` 0; testes verdes; build verde.
- Fora de escopo: conciliação automática com extrato do banco.

### H6 — Categorias: subcategorias (1 nível) com roll-up
- Status: [ ] a executar
- Contexto: `CategoryDef` tem `group` (ex.: `imposto`), mas não hierarquia pai/filho.
- Proposta: `CategoryDef.parent?` (1 nível). Donut/relatórios agrupam pelo **pai** com
  drill-down (clica e abre subcategorias); o form deixa escolher subcategoria. Legado sem
  `parent` continua igual.
- Arquivos: `packages/lib/db/money.ts` (`categoryOf`/`expensesByCategory` + testes), `Expenses.tsx`, `GastosDashboardPage.jsx`
- Aceite: soma por pai = soma das filhas; legado intacto; `tsc` 0; testes verdes; build verde.
- Fora de escopo: mais de 1 nível.

### H7 — Widget "Projeção de caixa" no Resumo de Gastos
- Status: [ ] a executar
- Contexto: a projeção vive só em Planejamento (`ForecastPage`); no dia a dia de gastos não se
  vê "para onde o caixa vai".
- Proposta: widget no Resumo com projeção 30/60/90d, reusando `wealth.forecast`/`safeAvailable`
  + `recurringDue` + `pendingBills` (composição, sem duplicar fórmula). Respeita o período global.
- Arquivos: `GastosDashboardPage.jsx` (widget), reuso dos selectors existentes
- Aceite: projeção bate com a de Planejamento; sem fórmula nova; `tsc` 0; testes verdes; build verde.

### H8 — Visão por Dia com saldo acumulado (extrato)
- Status: [ ] a executar
- Contexto: o agrupamento por Dia existe com subtotal, mas não mostra o **saldo corrente**.
- Proposta: no modo "Dia", coluna de saldo acumulado do período + "saldo do dia" (parte do
  saldo inicial do período + lançamentos). Selector puro + teste.
- Arquivos: `packages/ui/Expenses.tsx`, `packages/lib/db/money.ts` (+ teste)
- Aceite: saldo final fecha com `computeFreeCash` do período; sem fórmula nova; `tsc` 0; testes verdes; build verde.

### H9 — Próximas contas a vencer (consolida o B2)
- Status: [ ] a executar
- Contexto: B2 pede a visão "o que vence nos próximos 15 dias"; hoje só existe a lista de
  pendentes (qualquer data).
- Proposta: seção/widget no topo com os próximos N dias (recorrentes + `dueDate`), ordenados
  por data, com total a pagar a receber e atalho "Pagar/Receber"; base = `pendingBills` +
  `recurringDue` estendidos para uma janela de dias (`refIso`).
- Arquivos: `packages/lib/db/money.ts` (`pendingBills`/`recurringDue` com janela + teste), `GastosDashboardPage.jsx`, `Expenses.tsx`
- Aceite: janela correta (inclui atrasados); ordenação por vencimento; `tsc` 0; testes verdes; build verde.

### H10 — Importar extrato v2 (resolve as limitações do A3)
- Status: [ ] a executar
- Contexto: o importador (`bankImport.ts` + preview em `Expenses.tsx` + `onImportBatch` em
  `EngineViews.jsx`) já lê OFX/CSV, deduplica e sugere categoria, mas tem 7 limitações:
  (a) cai tudo na **primeira conta** (`accounts[0]`); (b) moeda **fixa USD** (extrato BRL entra
  cru); (c) dedup **frágil** (data+valor+descrição exata); (d) preview mostra **só 30**; (e) sem
  **mapeamento de coluna**; (f) palavras-chave **fixas no código**; (g) `.qif` no `accept` mas
  **sem parser**.
- Proposta (resolver uma a uma):
  1. **Conta do lote**: seletor de conta no preview (default = última usada; heurística pelo nome do banco).
  2. **Moeda**: campo "moeda do extrato"; se ≠ USD, converter na data pela taxa existente
     (`getFxUSD`/`saveFxUSD`, meta `fx:USDBRL`) — **sem inventar câmbio** — guardando o valor original na nota.
  3. **Dedup forte**: usar `<FITID>` do OFX quando existir; fallback = descrição **normalizada**
     (minúscula, sem pontuação) + valor com tolerância ±0,01.
  4. **Preview completo**: listar TODOS os itens (scroll; virtualizar se preciso) + contador.
  5. **Mapeamento de coluna**: quando a auto-detecção falhar, UI para escolher data/valor/descrição;
     salvar o mapeamento por banco (meta).
  6. **Regras de categoria editáveis**: mover `KEYWORD_CATEGORY` para `meta`
     (`expense:import-rules`) com CRUD simples ("se descrição contém X → categoria Y") e
     **aprender** ao confirmar (ex.: categoria escolhida no preview vira regra).
  7. **QIF**: parser QIF (`!Type`, `D`, `T`, `P`, `M`) **ou** remover `.qif` do `accept`.
- Arquivos: `packages/lib/db/bankImport.ts` (+ testes), `packages/ui/Expenses.tsx`,
  `main-app/src/pages/command/EngineViews.jsx` (`onImportBatch` com conta + moeda)
- Aceite: importa na conta/moeda escolhidas; BRL convertido pela taxa do app; reimportar o mesmo
  arquivo não duplica (FITID); todos os itens revisáveis; regra editável aplica; QIF funciona ou
  não é aceito; `tsc` 0; testes verdes; build verde.
- Fora de escopo: Open Finance / API do banco (integração automática).

### H11 — Aba Orçamento (aprofundar além do editor atual)
- Status: [ ] a executar
- Contexto: o H0 cria a aba `/gastos/orcamento`; hoje o `BudgetEditor` só define meta por categoria.
- Proposta: na aba: **"quanto ainda posso gastar"** no período e **por dia** (restante ÷ dias
  restantes); **sugerir meta** pela média de 3 meses (reusa `monthlySeries`/`expensesByCategory`);
  **copiar orçamento** do mês anterior; visão por **grupo** (ex.: Impostos) com roll-up; alerta
  ao passar de X% (toast). Rollover (B1) explícito e visível.
- Arquivos: novo `main-app/src/pages/command/BudgetPage.jsx`, `packages/lib/db/money.ts`
  (selector "restante/dia" se necessário + teste)
- Aceite: restante/dia coerente; sugestão = média real; rollover visível; sem fórmula nova;
  `tsc` 0; testes verdes; build verde.

### H12 — Aba Categorias (aprofundar além do CRUD atual)
- Status: [ ] a executar
- Contexto: o H0 cria a aba `/gastos/categorias` com o `CategoryEditor` (nome/ícone/cor).
- Proposta: **mesclar** categorias (move os lançamentos da origem para o destino); **reatribuir**
  ao excluir (nunca deixar órfão em "outros"); **reordenar**; **preview** do impacto no donut;
  paleta de ícones/cores; pack de impostos. Base para o H6 (subcategorias).
- Arquivos: novo `main-app/src/pages/command/CategoriasPage.jsx`, `packages/lib/db/money.ts`
  (helpers de remap + teste), consumo em `Expenses.tsx`/`GastosDashboardPage.jsx`
- Aceite: mesclar move todos os lançamentos; excluir exige destino; ordem persiste (meta);
  `tsc` 0; testes verdes; build verde.

### DoD do Batch H
- Módulo Gastos com 5 abas (Resumo · Lançamentos · Orçamento · Categorias · Forecast) e cada uma
  com foco próprio (H0), aprofundadas em H11/H12.
- Resumo de Gastos com widgets organizáveis/sincronizados e com tendência; lançamento em poucos
  toques; cartão com ciclo de fatura; próximas contas e projeção visíveis.
- Nenhuma fórmula financeira nova (só selectors + composição). `tsc` 0, testes verdes, `pnpm build:all` verde.
- Mobile 360px, off-line, sem `alert`, CSS por variáveis, `aria-*` + toast.
