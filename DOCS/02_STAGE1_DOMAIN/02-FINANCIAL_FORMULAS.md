# STAGE 1 — Financial Formulas (única implementação)

> Toda tela importa daqui. Proibido reimplementar no Dashboard. **Confirmado no código
> atual**: existem hoje pelo menos 2 Dashboards diferentes (`main-app/src/pages/Dashboard.jsx`
> e `trading-journal/src/pages/Dashboard.tsx`) cada um com sua própria versão de PnL/Sharpe/
> duration — este documento existe justamente pra matar essa duplicação, não só documentá-la.

## Trading

- `Realized PnL (trade)` = `(exit-entry)*direction*qty*multiplier - commission - fees - swap - slippage`
- `R` = `PnL / riskInicial`, `risk = |entry-stop|*qty*multiplier` (**nunca**
  `(exit-entry)/|entry-stop|` ignorando volume — é o bug atual do `TradeForm`).
  Edge case: se `stop` não foi definido no trade (comum em scalps rápidos), `R` fica
  `null`/`n/a`, nunca `0` — `0` esconde "sem stop definido" atrás de "risco zero".
- `Equity(account)` = `initialFunding + Σ PnL rateado por weight` — rateio via
  `t.accounts[]` (campo que **já existe** no schema atual, `dataStore.js:502`, mas
  hoje não é lido por `recalc`), nunca só `t.accountId` sozinho.
- `Drawdown`:
  - `maxDD` = `(peakEquity - currentEquity) / initialFunding` (ou `/nominalSize` se
    prop) desde o início da fase.
  - `trailingDD` = igual, mas `peakEquity` recalcula a cada novo pico (nunca reseta
    pra `initialFunding`).
  - `dailyDD` = `(equityAt00h - currentEquity) / equityAt00h`, `equityAt00h` fixado no
    fuso horário da PRÓPRIA firm (não o do navegador do usuário — FTMO/E8 fecham o dia
    em horário de servidor específico, geralmente UTC ou EST; guardar esse fuso em
    `PropExtension`, não hardcoded).
  - `Headroom` = `limite - usado`, sempre em valor monetário E percentual lado a lado
    (headroom de $2.580 comunica mais rápido que 8.2% pra decisão em tempo real).
- `Consistency %` (fórmula que faltava no doc original — travava `Payout Eligibility`):
  `bestSingleDayProfit / totalProfitNoFrame <= consistencyPct configurado por firm`.
  Janela = desde o início da fase atual (`challenge1`/`challenge2`/`funded`), reseta a
  cada nova fase. Se `totalProfitNoFrame <= 0`, consistency não se aplica ainda
  (mostrar "n/a", nunca dividir por zero/negativo).
- `Payout Eligibility` = `equity >= target && DDUsado < 100% && diasOperados >= minDays
  && consistencyOk`. Cada condição exposta separadamente na UI (checklist, não só
  YES/NO) — é o que permite ao trader ver exatamente o que falta.
- `Winrate` exclui breakeven (`resultNet === 0` não conta nem como win nem como loss).
- `avgR`, `expectancy = WR*avgW - LR*avgL`.
- `PF (Profit Factor) = grossWin / grossLoss`. Edge cases explícitos (faltavam no doc
  original):
  - `grossLoss = 0 E grossWin = 0` (zero trades) → mostrar `"n/a"`.
  - `grossLoss = 0 E grossWin > 0` (só ganhos, nenhuma perda) → mostrar `"∞"` como
    símbolo/estado visual próprio (badge, cor diferenciada), **nunca** o número
    JavaScript `Infinity` renderizado cru na tela.
- `Sharpe`: **só com equity base real + taxa livre de risco**, nunca
  `resultNet / constante_fixa` (bug confirmado hoje:
  `trading-journal/src/pages/Dashboard.tsx:226`, `resultNet / 10000` fixo).
  **Granularidade importa mais do que o denominador**: a série de retornos precisa ser
  **por dia** (`Σ resultNet do dia / equity no início do dia`), nunca por trade direto.
  Um day trader fazendo ~20 scalps/dia (meta do Stage 3) e anualizando com
  `sqrt(252)` sobre retorno *por trade* (como o código faz hoje,
  `Dashboard.tsx:230`) infla o Sharpe em ordem de `sqrt(20)` além do erro do
  denominador — os dois bugs se multiplicam, não somam. Se a base de dias
  operados for pequena (`< 20 dias`), mostrar `"amostra insuficiente"` em vez de
  um Sharpe de baixa confiança apresentado como número final.
- `RoR` (Risk of Ruin): **remover da UI até este documento** definir o modelo de edge
  usado (Kelly? Monte Carlo com WR/avgR reais?) — mostrar um RoR calculado sobre um
  "edge" mal definido é pior do que não mostrar nada, porque parece autoridade
  matemática sobre uma premissa não escrita em lugar nenhum.

## Patrimônio (nomes corrigidos do 3º parecer, com exemplo numérico)

Os três conceitos abaixo usam números parecidos e são frequentemente confundidos no
código atual (`Accounts.jsx` chama tudo de "ROI"). Exemplo com os mesmos números pra
deixar a diferença concreta — conta prop com `initialFunding=$100k`,
`totalPnL=$8k`, `payoutsRecebidos=$3k`, `challengeCost pago=$500`:

| Métrica | Fórmula | Neste exemplo |
|---|---|---|
| `Trading Return` | `PnL líquido / capital referência` | `$8.000 / $100.000 = 8%` |
| `Challenge ROI` | `payouts líquidos / custo challenges` (nunca chamar de "ROI" genérico sozinho) | `$3.000 / $500 = 6x` |
| `Cash-on-Cash` | `recebido / desembolsado` (desembolsado = challenge + reset + mensalidade, tudo que saiu do seu bolso) | `$3.000 / $500 = 6x` (mesmo valor de Challenge ROI neste exemplo simples, mas diverge assim que há reset ou mensalidade — Cash-on-Cash inclui, Challenge ROI como definido acima é só challenge) |

**A correção do bug confirmado em `Goals.jsx:87-89` e `:135-138`**: hoje o `case 'roi'`
faz `pnl / Σ(t.volume)` — soma o **volume em lotes** de todos os trades como se fosse
"capital investido". Isso mistura unidade (dólares ÷ lotes não é uma fração de nada).
O Goal tipo ROI precisa usar `Trading Return` (PnL / capital de referência) ou ser
renomeado pra deixar claro que mede outra coisa.

- `Net Worth` = `Σ Accounts + Positions mark-to-market + receivables - liabilities`
  (derivado, snapshot só histórico). `Positions` só entra com `lastMarkPrice` recente —
  se `lastMarkAt` for mais velho que N dias configurável, a Position entra no Net Worth
  mas some do "atualizado agora", ficando no card de proveniência (ver aposta ousada
  #1 da auditoria).
- `Cost Basis` = `Σ buys - Σ sells rateado` (método FIFO por padrão — declarar
  explicitamente, porque LIFO dá número diferente e "cost basis" sem método é
  ambíguo); `DCA` = aportes por mês.

## Fiscal (cockpit, não ERP)

Day 20%, Swing 15%, carry prejuízo, DARF prazo. Payout internacional: converter pra
BRL usando a **cotação PTAX de venda do dia do recebimento em conta** (não do
fechamento do trade, não a cotação do dia da declaração) — guardar o `rate` usado
junto da `Transaction` no momento da criação, nunca recalcular depois com cotação
atual (isso mudaria o imposto retroativamente a cada consulta). Via Carnê-Leão/PJ
(estimativa, contador decide o regime).

## Opções (novo — ver `DOCS/10_MODULES/options/00-spec.md`)

> Implementação única: `packages/lib/db/financialFormulas.ts`. Proibido calcular na UI.
> Convenção: `qty` com sinal (+ long, − short), `multiplier` do contrato (US equity = 100,
> nunca hardcode), prêmios em preço por ação, `T` em anos ACT/365, `S` = preço do
> subjacente, `K` = strike, `r` = taxa livre de risco, `q` = dividend yield, `σ` = vol
> implícita, `N(·)` = normal padrão acumulada, `n(·)` = normal padrão densidade.

- **Black-Scholes-Merton (com dividendo `q`)**:
  - `d1 = [ln(S/K) + (r - q + σ²/2)·T] / (σ·√T)`; `d2 = d1 - σ·√T`.
  - `Call = S·e^(-qT)·N(d1) - K·e^(-rT)·N(d2)`.
  - `Put = K·e^(-rT)·N(-d2) - S·e^(-qT)·N(-d1)`.
  - `T <= 0` → preço = intrínseco (`max(S-K,0)` / `max(K-S,0)`); `σ` ausente → `null`
    (nunca `0`, que produziria preço determinístico falso).
- **Gregas** (retorno por unidade de `S`; UI decide exibição por 1%):
  - `Δcall = e^(-qT)·N(d1)`; `Δput = e^(-qT)·(N(d1) - 1)`.
  - `Γ = e^(-qT)·n(d1) / (S·σ·√T)`.
  - `Vega = S·e^(-qT)·n(d1)·√T` (por 1.00 de vol).
  - `Θcall = -(S·e^(-qT)·n(d1)·σ)/(2√T) - r·K·e^(-rT)·N(d2) + q·S·e^(-qT)·N(d1)`;
    `Θput = -(S·e^(-qT)·n(d1)·σ)/(2√T) + r·K·e^(-rT)·N(-d2) - q·S·e^(-qT)·N(-d1)` (por ano; `/365` p/ dia).
  - `ρcall = K·T·e^(-rT)·N(d2)`; `ρput = -K·T·e^(-rT)·N(-d2)`.
  - `T <= 0` ou `σ <= 0` → gregas `null` (n/a), nunca zero silencioso.
- **IV (implícita)**: solver por **bisseção** com bracket `[1e-4, 5]` sobre o preço mid.
  Sem solução (preço abaixo do intrínseco, prêmio fora do arbitrário) → `null` + flag
  explícita — **nunca** chutar aproximação.
- **Payoff no vencimento (por perna)**: intrínseco `Call=max(S-K,0)` / `Put=max(K-S,0)`;
  `PnL = qty·multiplier·(intrínseco - entryPrice) - fees` (fees rateadas por perna).
- **PnL realizado (perna fechada)**: `qty·multiplier·(exitPrice - entryPrice) - fees`.
  Prêmio recebido **não é lucro**: é caixa até fechar/expirar.
- **Breakevens**: raízes de `PnL(S) = 0` por trecho linear entre strikes adjacentes,
  ordenadas; pode haver 0, 1 ou 2 (mais em ratios) — retornar lista, nunca forçar par.
- **Exposição delta**: `Δ-notional = Σ |Δi|·|qtyi|·multiplieri·S` (por subjacente);
  delta líquido com sinal `Σ Δi·qtyi·multiplieri` (em "ações equivalentes").
- **Prêmio líquido (crédito/débito do grupo)**: `-Σ(qtyi·entryPricei·multiplieri) - fees`
  (positivo = crédito recebido).
- **Assignment (put → ações)**: preço efetivo `= (K·shares - prêmioLíquidoRecebido) / shares`;
  **assignment (call → entrega)**: recebido por ação `= K + prêmioLíquido / shares`.
  A posição de ações resultante entra no Portfolio com esse cost basis (FIFO).
- **Yield de renda** (mensalizada `× 365/dias até vencimento`):
  - Covered call: `prêmioLíquido / (S·multiplier·contratos)` (ou sobre o cost basis da ação).
  - Cash-secured put: `prêmioLíquido / (K·multiplier·contratos)`.
- **Edge cases obrigatórios**: vencimento no dia (T→0), `σ`/IV ausente, taxas negativas,
  perna coberta por ações, early assignment (data-com de dividendos), `multiplier ≠ 100`,
  moeda do underlier ≠ moeda da conta (converter só na exibição, guardar a original).
  Todo caso vira teste golden (BSM vs calculadora de referência, payoff de covered
  call/CSP/vertical, assignment) antes de aparecer na UI.
