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

## Batch D — paridade Mobills (backlog priorizado)
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
