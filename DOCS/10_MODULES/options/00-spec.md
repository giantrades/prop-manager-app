# MÓDULO — Opções (Options Analytics + renda + portfólio)

> "App separado" para operar opções de ponta a ponta, inspirado no **Option Analytics**
> da Quantower (Options Desk + Analyzer + Volatility Smile + Papers/Positions/Working
> Orders) e adaptado ao produto: **gerar renda mensal**, **trades rápidos** e **compor o
> portfólio** (assignments viram posições). Motor compartilhado; casca própria.
>
> Status: **SPEC APROVADA — aguardando execução por fases (F0–F4)**. Nada existe no código
> hoje (greenfield; único resíduo é `Trade.multiplier`/contract size). Fonte de verdade
> quantower: `https://help.quantower.com/quantower/analytics-panels/option-analytics`.

## Decisões de placement (aprovadas nesta spec)

| Onde | O que entra | Por quê |
|---|---|---|
| **Trading** (aba nova) | `/options` — Desk · Analyzer · Smile · Posições | é a mesa de operação: chain, payoff/gregas, ordens, posições vivas |
| Ordem das abas | Resumo | Journal | Trades | **Opções** | Positions & Orders | opções são "live" como posições — ficam lado a lado |
| **Investimentos** (aba nova) | `/options` compartilhada — visão carteira/renda (cobertura, assignments, prêmios, exposição) | opções como classe de ativo e fonte de renda, não só trade |
| Ordem das abas | Resumo | Portfolio | **Opções** | Payouts e Withdrawals | renda de prêmios dialoga com proventos/payouts |
| Trading Resumo | widgets: prêmios do mês, Δ-notional, vencimentos da semana | leitura rápida sem abrir a mesa |
| Investimentos Resumo | widget "Renda de opções" (série mensal) | composição de renda com a carteira |
| Portfolio | posições de opções como classe + cobertura (covered call) + shares de assignment | assignment = evento de portfólio |
| Home | card de renda mensal + próximos vencimentos | command center |
| Calendar | vencimentos + data-com (risco de early assignment) | evita surpresa de exercício |
| Risk | exposição por underlier, Δ-notional, collateral/margem | risco real da carteira |
| Trades/Journal | trades de opções entram na análise por subjacente | performance consolidada |
| Money/Payouts | prêmio recebido = Transaction de renda (kind próprio) | cadeia única: prêmio → ledger → Net Worth |

## Sub-áreas (como app separado, paridade Quantower)

| Área | Rota | O que faz (Quantower equivalent) |
|---|---|---|
| **Desk** | `/options` (sub-aba) | Chain por vencimento: strikes × calls/puts com bid/ask/last, IV, OI, volume e gregas; profundidade de strikes; coluna Paper; "joint mode" com o Analyzer |
| **Analyzer** | `/options/analyzer` (sub-aba) | Payoff/P&L do portfólio (expirado e T+0) + overlays Δ Γ Θ V ρ + **What-If** (vol e decaimento, até 5 curvas tracejadas) + 37 estratégias pré-definidas (Alta/Baixa/Vol/Arbitragem) + builder |
| **Smile** | `/options/smile` (sub-aba) | IV por strike (smile/skew) e term structure por vencimento |
| **Posições** | `/options/positions` (sub-aba) | Pernas reais + paper + ordens de trabalho, agrupadas por estratégia (covered call, CSP, vertical, etc.), P&L real vs teórico, prêmio recebido, status de assignment, fechar/rolar |
| **Config** | `/options` (seção) | Subjacentes favoritos, fonte de gregas (bridge vs calculada), profundidade default, dia/lote, conta |

## UX (mobile-first 360px, tokens do tema)

- **Desk** (desktop): matriz com coluna "Strike" sticky + blocos Calls | Puts; linha ATM
  destacada; headers clicáveis (escolher colunas — paridade com right-click da Quantower);
  células Ask/Bid clicáveis abrem ordem (toque ≥40px). **Mobile**: cards por strike (Call
  em cima, Put embaixo), scroll horizontal por vencimento, nunca tabela espremida.
- **Analyzer**: gráfico recharts (área/linha) de P&L × preço do ativo, com:
  linha de preço atual, strikes marcados, breakevens, max profit/loss, linhas **What-If**
  tracejadas (`strokeDasharray`), e seletor de grandeza (P/L, Δ, Γ, Θ, V, ρ) + overlay
  com curva secundária em eixo direito. Legs listadas à direita (mobile: embaixo).
- **Smile**: LineChart IV × strike por vencimento (cores por série), tooltip com IV/OI.
- **Posições**: cards por estratégia (legs aninhadas), badge `live/stale/teórico`, cores
  `--green/--red` para P&L, "prêmio recebido" com sinal, botões Fechar/Rolar/Analisar.
- Regras duras de UI: nada <10px, cores só por variável CSS, `aria-*` em tabs/tabelas,
  toast (nunca alert), `ErrorBoundary`, skeleton no fetch da chain, offline com cache.

## O que JÁ existe (verificado — reuso)

- `Trade.multiplier` (contract size, default 1) e `Position.assetKind` — a base para
  opções precisa de `multiplier` real do contrato (US equity options = 100; **nunca
  hardcode**, vem do contrato/bridge).
- `quantowerIngest.ts` (dedup por `quantowerId`, correção de contract size em futuros),
  `DataChainEngine` (ledger idempotente), `MoneyService` (Transações/kinds),
  `WealthService` (Portfolio/cost basis FIFO), `RiskService`, `priceService.ts` (quote
  de underlier BR/cripto — opções US virão do bridge).
- Shell: `navConfig.js` (aba nova = 1 linha), `ModuleTabs`, `WidgetGrid`,
  `EntityDrawer`, `usePageData`, `financialFormulas.ts` (fórmulas únicas).
- **Não existe nada de opções** (grep `option|greeks|strike|call|put` = 0 em código).

## Modelo de dados proposto (entra em `types.ts` na F0/F1)

```ts
type OptionRight = 'call' | 'put';
type Greeks = { delta: number; gamma: number; theta: number; vega: number; rho: number };

type OptionLeg = {
  id: string;
  accountId: string;
  underlying: string;            // PETR4, AAPL, ES...
  symbol: string;                // código do contrato (PETRH250)
  right: OptionRight;
  strike: number;
  expiry: string;                // ISO date (vencimento)
  qty: number;                   // contratos; + long, - short (nunca used "side" duplicado)
  multiplier: number;            // 100 p/ equity options — do contrato, nunca fixo
  entryPrice: number;            // prêmio por ação (não por contrato)
  entryDatetime: string;
  exitPrice?: number;
  exitDatetime?: string;
  fees: number;                  // comissões + emolumentos
  ivEntry?: number;
  ivExit?: number;
  greeksEntry?: Greeks;
  groupId?: string;              // agrupa pernas da mesma estratégia
  strategyId?: string;           // playbook/journal
  source: 'manual' | 'quantower';
  quantowerId?: string;
  tags?: string[];
};

type OptionStrategyTemplate = {
  id: string; name: string;
  category: 'up' | 'down' | 'vol' | 'arb';
  legs: { right: OptionRight; qty: number; strikeOffset: 'atm' | number }[];
  description: string;
};

type OptionChainQuote = {      // cache (nunca fonte de verdade de posição)
  underlying: string; expiry: string; strike: number; right: OptionRight;
  bid: number; ask: number; last: number;
  iv?: number; oi?: number; volume?: number;
  greeks?: Greeks; at: string;   // proveniência: bridge | computed
  source: 'bridge' | 'computed';
};
```

Stores IndexedDB novos (registrar em `01-DATA_CONTRACT.md` + `appDb.ts` na F1):
`optionLegs` (keyPath `id`, índices `underlying_expiry`, `account_entry`, `quantowerId`),
`optionChain` (cache volátil com TTL, limpo pelo app), `optionTemplates` (custom; os 37
built-ins ficam no código). Estratégias/posições = **derivadas** de `optionLegs` por
`groupId` (regra da casa: nada de saldo/posição duplicada).

## Fórmulas (contrato único — ver `DOCS/02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md § Opções`)

Black-Scholes-Merton (com dividend yield `q`), gregas Δ/Γ/Θ/V/ρ, IV (solver Brent com
vega), payoff no vencimento por perna, breakevens, Δ-notional, prêmio realizado,
cost basis de assignment e yields (covered call / CSP). **Toda fórmula vive em
`financialFormulas.ts` e é testada com valores-ouro** — proibido calcular na UI.

Casos de borda obrigatórios: vencimento no dia (T→0), IV ausente/zero, taxas negativas,
perna coberta por ações, early assignment (dividendos), multiplier ≠ 100, moeda do
underlier ≠ moeda da conta.

## Ingest Quantower (bridge) — ver `DOCS/04_STAGE3_TRADING_OS/06-OPTIONS_BRIDGE_SPEC.md`

- `GET /options/expiries`, `GET /options/chain` (quotes + gregas + IV + OI).
- `GET /options/positions` (pernas com `underlying/strike/right/expiry/qty/avgPrice`).
- `POST /options/order` (single-leg limit; multi-leg quando o bridge suportar — senão
  pernas sequenciais com `clientOrderId` próprio e aviso explícito na UI).
- Mesmo contrato de auth/idempotência do v2 (`X-Bridge-Token`, `clientOrderId`, ErrorPayload).
- Proveniência: grega vinda do bridge vs calculada localmente = badge (regra "números com
  procedência").
- Se o bridge estiver off: Desk/Analyzer funcionam com **cotação manual + paper** e cache.

## Fases de execução (checkáveis)

- [ ] **F0 — Contratos**: tipos/modelo acima em `types.ts`; atualizar `01-DATA_CONTRACT.md`
      (schema + eventos) e este spec; criar `.opencode/agent/module-options.md` apontando
      para esta pasta; add seção Opções no formula doc. Gate: docs aprovadas, `build:all` verde.
      → **FEITO**: tipos `OptionLeg`/`OptionChainQuote`/`OptionStrategyTemplate`; stores
      `option_legs`/`option_templates`/`option_chain` (DB_VERSION 5) + repos; data contract
      atualizado; agente criado; § Opções no formula doc.
- [ ] **F1 — Motor**: `options.ts` (BSM, gregas, IV, payoff, breakevens, templates 37,
      agregação por grupo, assignments) + `financialFormulas.ts` § Opções + stores/repos no
      `DataService` + sync (`supabaseSync` objeto novo) + testes golden (BSM vs calculadora,
      payoff de covered call/CSP/vertical, assignment). Gate: testes verdes, zero fórmula na UI.
      → **FEITO (exceto sync Supabase)**: `financialFormulas.ts § Opções` + `options.ts` +
      `options.test.ts` (19 testes). Sync fica para a F4 (sem tabela ainda).
- [ ] **F2 — UI offline**: rota `/options` (navConfig + routeLoaders + App), sub-abas
      Desk/Analyzer/Smile/Posições com cotação manual + Paper + What-If + overlays; mobile
      360; skeleton/toast/aria. Gate: funciona com bridge off, build verde.
      → **PARCIAL**: rota `/options` + **Analyzer offline** (`OptionAnalyzer.tsx`: 37 templates,
      payoff/breakevens/gregas/prêmio) + **Desk** (`OptionDesk.tsx`: chain com IV/Δ/OI + paper),
      **Smile** (`OptionSmile.tsx`) e **Posições** (`OptionPositions.tsx`). Tudo offline via
      cache `option_chain`; o live é F3.
      → **Rodada 2 (completa offline)**: Analyzer com pernas editáveis (template/paper/posição),
      curva T+0, What-If (até 5 curvas) e overlays Δ Γ Θ V ρ; Desk com cards por strike no mobile,
      seletor de colunas e Bid/Ask clicáveis; aba **Cotações** (manual + CSV, IV/gregas calculadas
      marcadas "calc"); **Posições** com spot por subjacente, P/L teórico × mercado, proveniência,
      fechar, rolar, exercer (só ITM) e excluir com confirmação; registrar operação real + CSV;
      risk gate (A2); parâmetros persistidos em `meta`; ErrorBoundary/skeleton/empty states.
      → **Rodada 3 (integrações)**: data-com no Calendar + alertas na página (A1); **Journal**
      (`OptionAnalytics`: prêmio, win rate, P/L médio e R por subjacente); **Investimentos**
      (`OptionIncomeDetail`: cobertura, yield/anualizado de calls e puts vendidas, risco de
      data-com, assignments → ações); `optionMaxProfitLoss` passa a avaliar o piso S=0.
- [ ] **F3 — Live bridge**: extensão bridge (spec `06-...`) + ingest + posições reais +
      fechar/rolar + proveniência bridge/calculada/manual. Gate: posição real reconciliada,
      editor não some com a ordem.
      → **CLIENTE PRONTO / BRIDGE PENDENTE**: `optionsIngest.ts` (`normalizeOptionChain`,
      `normalizeOptionPositions`, `mergeOptionLegs`) + métodos `getOptionExpiries/Chain/Positions`
      no `QuantowerAdapter` + testes. Falta o lado C# do bridge (externo) e o wiring do ingest.
      → ingest corrigido: multiplier nunca chutado (rejeita a linha), `mergeOptionLegs` preserva
      data de entrada/grupo/IV/saída e só atualiza dados de mercado.
- [ ] **F4 — Integrações**: Investimentos (aba carteira/renda + cobertura + assignment→
      Position), Trading/Investimentos widgets, Money (kind de prêmio), Risk (Δ-notional/
      margem), Home, Calendar (vencimento/data-com), Trades/Journal (analytics por
      subjacente). Gate: cadeia prêmio→ledger→Net Worth fim-a-fim + build/testes verdes.
      → **QUASE**: widget **Renda de opções** (`OptionIncome.tsx`, com **cobertura CC**) no
      Trading, Investimentos Resumo e **Home**; **Money** — kind `option_premium` entra em
      `INCOME_KINDS`/`PERSONAL_INCOME_KINDS` + `recordOptionPremium` (ledger); **Risk** —
      `optionPortfolioExposure` (Δ-notional/margem por subjacente); **assignment→Position** —
      `optionAssignment` + botão "Exercer" em Posições (grava a ação e fecha a perna);
      **Calendar** — camada "Opções" com vencimentos. Faltam: data-com (early assignment),
      wiring do ingest live, risk gate de naked (melhoria A2) e analytics por subjacente no Journal.

## Melhorias futuras

Itens abertos em `melhorias.md` (batch A), executados depois da F4 ou em paralelo quando
não bloquearem fase.

## Armadilhas mapeadas (não repetir)

1. **Multiplier fixo 100**: errado para B3/índices/cripto — sempre do contrato.
2. **IV de fonte ambígua**: nunca mostrar IV calculada como se fosse do broker (badge).
3. **Early assignment americano**: checar data-com de dividendos; alertar antes.
4. **Paper virando real**: paper é efêmero (análise); só grava `optionLegs` com `source`.
5. **Prêmio confundido com lucro**: prêmio é passivo até fechar/expirar; P&L realizado é
   credit − debit − fees (fórmula única).
6. **Multi-leg não atômico**: se o bridge não suportar, executar perna a perna com
   `clientOrderId` por perna e mostrar o que falhou — nunca prometer atomicidade.
7. **Fuso/vencimento**: vencimento é data do mercado do ativo (não do navegador).
8. **Saldo/margem direto**: collateral e exposição são derivados; nunca escrever saldo.
