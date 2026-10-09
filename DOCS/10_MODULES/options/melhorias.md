# MÓDULO Opções — Melhorias (batch A)

> Futuras melhorias **só entram aqui** (nunca doc solto). Ao concluir, marcar `- [x]`.
> Executar depois da F4 da spec (`00-spec.md`) ou em paralelo quando não bloquear fase.

## A1 — Alerta de vencimento e data-com no Calendar

- **Status**: `[~]` (vencimento feito; data-com pendente)
- **Contexto**: vencimento de opções e data-com de dividendos (risco de early assignment
  em calls cobertas) não aparecem no calendário unificado.
- **Proposta**: expiries + data-com entram no `FinancialCalendar` como eventos; toast/ação
  "rolar" quando vencer amanhã com perna aberta.
- **Arquivos**: `packages/ui/FinancialCalendar.tsx`, `options.ts`, `CalendarPage.jsx`.
- **Aceite**: evento visível no dia certo (fuso do mercado), com drill-down para a perna.
- **Progresso**: camada "Opções" no `FinancialCalendar` + `optionExpiryEvents` no
  `CalendarPage` (vencimentos de pernas abertas em 60d). Falta o data-com de dividendos.

## A2 — Risk gate de opções (fricção antes de vender naked)

- **Status**: `[x]` (feito: perda máxima + estresse; **margem de corretora segue fora** — cada broker difere)
- **Contexto**: venda descoberta (naked call/put) tem risco de cauda; a "aposta #2" do
  roadmap já pede risk gate por fricção para ações.
- **Proposta**: antes de enviar ordem short sem cobertura, exigir confirmação com
  exposição máxima/margem estimada em destaque.
- **Arquivos**: `options.ts` (exposição/margem), `packages/ui/options/*`, `RiskService`.
- **Aceite**: ordem short descoberta não sai sem confirmação explícita; exposição exibida.
- **Progresso**: `optionNakedExposure` (§ Opções) + gate na `OptionsPage` (salvar paper,
  registrar operação e rolagem) com perda máxima/estresse e limite de estresse configurável.
  Também alerta permanente no card da posição. Teste: `optionsLifecycle.test.ts`.

## A3 — Rolling sugerido (tempo/Δ)

- **Status**: `[~]` (rolagem a mesmo strike com cotações da cadeia; sugestão por Δ pendente)
- **Contexto**: renda mensal exige rolar posições; fazer isso "na mão" é onde mora o erro.
- **Proposta**: sugestão de roll (mesmo Δ, vencimento seguinte, crédito/débito estimado)
  com simulação no Analyzer.
- **Arquivos**: `options.ts`, `packages/ui/options/Analyzer*`.
- **Aceite**: sugestão abre pré-preenchida no builder; nada é enviado sem confirmar.
- **Progresso**: `buildRollPlan` + painel "Rolar" em Posições (preview crédito/débito, só confirma
  com plano completo, passa pelo risk gate). Falta sugerir o strike por Δ e abrir no Analyzer.

## A4 — Probabilidade de profit / métricas probabilísticas

- **Status**: `[ ]`
- **Contexto**: PoP depende de IV/vol realizada; a spec da F1 deliberadamente não define
  PoP para não mostrar número decorativo (armadilha "estatística decorativa").
- **Proposta**: só depois do contrato de vol: PoP, IV rank/percentil, vol realizada vs
  implícita, com amostra mínima declarada.
- **Arquivos**: `financialFormulas.ts`, `options.ts`, `packages/ui/options/Smile*`.
- **Aceite**: fórmula no contrato + teste golden; badge quando amostra insuficiente.

## A5 — Fiscal de prêmios (cockpit)

- **Status**: `[ ]`
- **Contexto**: prêmio recebido tem tratamento fiscal próprio (day/swing, exterior);
  o TaxCockpit não conhece opções.
- **Proposta**: mapear o kind de prêmio no cockpit com o mesmo critério de data (recebimento
  em conta) já usado para payouts/PTAX.
- **Arquivos**: `packages/lib/db/money.ts`, `packages/ui/TaxCockpit.tsx`.
- **Aceite**: prêmio aparece no cockpit sem retroatividade de cotação.

## A6 — Import CSV de opções (corretoras B3/US)

- **Status**: `[~]` (parser genérico feito; falta validar com extrato real anonimizado)
- **Contexto**: nem toda corretora tem bridge; import é o fallback (padrão do app).
- **Proposta**: parser de extrato de opções → `optionLegs` com dedup por impressão digital
  (mesmo padrão do `csvImport`/trades).
- **Arquivos**: novo `optionsImport.ts` + UI em `/options` (config).
- **Aceite**: import idempotente, teste com extrato real anonimizado.
- **Progresso**: `optionsImport.ts` — `parseOptionChainCsv` e `parseOptionLegsCsv` (`;`/`,`, vírgula
  decimal, datas BR, IV em %, multiplicador obrigatório, ids determinísticos ⇒ reimportar não
  duplica). UI: abas Cotações e Posições. Falta o formato real de B3/US.

## A7 — Multi-conta / colateral por conta

- **Status**: `[ ]`
- **Contexto**: covered calls e CSPs ficam presas por conta; collateral precisa ser visível
  por conta (prop vs corretora).
- **Proposta**: visão de colateral/exposição por conta no Desk e no Risk.
- **Arquivos**: `options.ts`, `RiskService`, `AccountsDashboardPage.jsx`.
- **Aceite**: collateral por conta bate com soma manual; nenhum saldo escrito direto.
