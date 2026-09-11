# MÓDULO — Gastos / Finanças (Mobills-like)

> "App separado" para trackear **ganhos e gastos** de forma bonita (ícones por categoria),
> com orçamento e gráficos. Motor compartilhado (`Transaction` + `MoneyService`); casca própria.

## Sub-áreas (como app separado)

| Área | Rotas | O que faz |
|---|---|---|
| Dashboard | `/expenses` | Resumo do mês + gráficos (pizza por categoria, evolução) |
| Ganhos | `/expenses` (seção) | Lista de entradas (payouts, salário, outros) |
| Gastos | `/expenses` (seção) | Lista de despesas + ícones por categoria |
| Orçamento | `/expenses` (seção) | Meta mensal por categoria + alerta de estouro |
| Config | `/expenses` (seção) | Categorias (nome + ícone + cor) |

## O que JÁ existe

- `packages/ui/Expenses.tsx` — lista de despesas com **categoria em texto** (9 fixas), valor,
  nota, card "Free Cash" (income - expenses). Mobile-first 360px.
- `packages/lib/db/money.ts` (`MoneyService`) + `Transaction` ledger (`payout_in`,
  `expense`, `transfer`, etc.).
- `computeDcaFromTransactions`, `firmPnlByFirm` no motor.

## O que FALTA (priorizado) — pra virar Mobills

### P0 — Fundamentos do "bonito e útil"
1. **Ícones por categoria** (Mobills-like): `Moradia 🏠`, `Alimentação 🍔`, `Transporte 🚗`,
   `Saúde 💊`, `Lazer 🎮`, `Impostos 🏛️`, `Trading 📈`, `Invest 💼`, `Educação 📚`.
   Guardar `icon`/`color` na `Transaction`/categoria (não hardcode na UI).
2. **Rastrear ganhos** (não só despesas): listar `payout_in`, salário, outros, com ícones.
3. **Gráficos**: pizza por categoria + barras por mês + linha de evolução do saldo.
4. **Lista agrupada por categoria** com subtotal (hoje é lista plana).

### P1 — Profundidade
5. **Orçamento mensal por categoria** + barra de progresso + alerta de estouro.
6. **Despesas recorrentes** (assinaturas, aluguel) — auto-registrar por mês.
7. **Filtros** (mês, categoria, tipo ganho/gasto).
8. **Deletar/editar transação** (hoje só adiciona? verificar).
9. **Categorias customizáveis** (o usuário cria com ícone + cor).

## Dados / fórmula (não criar nova)

- Usar `Transaction` (`kind`, `amount`, `date`, `currency`, `ref`) + `MoneyService`.
- `Free Cash = Σ income - Σ expense` do mês (derivado).
- Não virar YNAB completo (sem envelope burocrático). Não virar banco digital.

## UI / design

- Ícones via `lucide-react` (já é dep). Cor por categoria via token (variável, nunca hex cru).
- Mobile 360px; card de resumo no topo (Receitas / Despesas / Saldo do mês).
- Toast + `ErrorBoundary`. Sem `alert()`.

## Tasks (checkáveis) — ✅ MÓDULO EXECUTADO

- [x] G1 Modelo de categoria `{id,name,icon,color}` + `Transaction.category` (legado via prefixo na note) + `list/saveCategory` em meta
- [x] G2 Ícones por categoria (lucide, cor via token) na lista
- [x] G3 Ganhos (`incomeByKind`: payouts/rebates/income) + despesas agrupadas com ícone/subtotal
- [x] G4 Pizza por categoria + barras Receitas/Despesas + linha Saldo (6 meses)
- [x] G5 Orçamento mensal por categoria + barra + alerta ⚠️ + editor (`get/saveBudget`, `budgetStatus`)
- [x] G6 Recorrentes: `Transaction.recurrence` + banner "pendentes" + `generateRecurring` idempotente
- [x] G7 Filtros mês/categoria/tipo (ganho/gasto)
- [x] G8 Editar/deletar (com undo via `onRestore`) — ver também `melhorias.md` A5 (executado aqui)
- [x] G9 Categorias customizáveis (editor com ícone + cor)
- [x] Testes: 12 novos em `expenses.test.ts` (valores à mão, sem regressão no `money.test.ts`)
- [x] `pnpm build:all` verde + mobile 360px + offline

## Gate / DoD

- [x] Tela de gastos com **ícones**, **ganhos + despesas**, **gráficos** e **orçamento**.
- [x] Funciona offline; usa só `DataService`/`MoneyService`.
- [x] Nenhuma fórmula financeira nova. `tsc` 0 erros, testes verdes, build verde.

## Notas pós-execução
- Kind novo `'income'` (ganho manual: salário/outros) adicionado ao union + `INCOME_KINDS`;
  `computeFreeCash` agora usa o set (comportamento idêntico para kinds antigos).
- `recordExpense` grava categoria em campo (note limpa); legado com prefixo continua lendo.
- Ganhos agrupados por kind (Payouts/Rebates/Outros); sem categoria própria (decisão).

## Melhorias futuras (pasta melhorias.md)

> Itens numerados em melhorias.md com Status [ ]. O agente do m�dulo deve ler a pasta,
> analisar os itens abertos e execut�-los um a um (c�digo + teste + doc + build verde).
> Ao concluir, marcar - [x] no arquivo da melhoria.

