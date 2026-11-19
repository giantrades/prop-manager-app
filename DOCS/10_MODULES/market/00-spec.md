# MÓDULO — Market (terminal de mercado, estilo Bloomberg)

> "App separado" de **mercado**: painéis cross-asset com data feeds ao vivo para
> leitura de contexto antes de operar. Não escreve saldo/ledger — é **read-only**.
> Motor de dados próprio (`packages/lib/db/marketData.ts`); casca própria
> (`packages/ui/market/*` + `main-app/src/pages/market/*`).

## Decisões do dono

- **Stack de dados: grátis** — Yahoo Finance (via proxy serverless `netlify/functions/yahoo-quote.ts`,
  batch) para equities/ETFs/índices/juros/FX/commodities/cripto; Brapi (B3) e CoinGecko (cripto)
  continuam via `priceService`. Macro usa os mesmos yields do Yahoo (sem FRED/key); FRED e
  COT ficam como opcionais se houver chave fonte paga.
- **Entrega: vertical slice primeiro** — shell do módulo + Market (Environment / Heatmap / Movers)
  completo e polido; demais abas expandidas em rodadas seguintes.
- **Local: novo módulo na sidebar "Market"** (`/market`), com sub-abas via `ModuleTabs`.

## Sub-áreas

| Área | Rota | O que faz |
|---|---|---|
| Environment | `/market` | Painel cross-asset (índices, setores, juros, FX, commodities, cripto) + apetite a risco + breadth |
| Heatmap | `/market/heatmap` | Treemap setorial (S&P-like): tamanho ≈ cap, cor = variação do dia |
| Breadth | `/market/breadth` | Amplitude: adv/dec, linha A/D, distribuição das variações, volume up/down, breadth por setor |
| Themes | `/market/themes` | Cestas temáticas pontuadas (semis, biotech, quantum, nuclear, defense…) |
| Factors | `/market/factors` | Cestas de estilo/fator via ETFs (Growth, Value, Momentum, Quality, Size, Low Vol, Dividend, Equal) |
| ETF map | `/market/etf-map` | Treemap de ETFs por categoria (AUM ≈ tamanho, cor = variação) |
| Movers | `/market/movers` | Maiores altas/baixas, mais negociadas (volume) e movimentos incomuns |

## O que já existe (✅)

- **Motor** `packages/lib/db/marketData.ts` + `marketBaskets.ts`:
  - Universos curados: `MARKET_GROUPS` (Environment), `SECTORS` + `CONSTITUENTS` (~150 ações
    por setor GICS), `THEMES` (~20 cestas), `FACTORS` (8 cestas de estilo), `ETF_CATEGORIES`
    (8 categorias de ETF), `MARKET_FULL_SYMBOLS` (fetch compartilhado por todas as abas).
  - `fetchMarketQuotes(symbols, {range, interval})` — lote com chunking (60/chamada),
    cache memória + localStorage (offline-first, marca `stale`), tolerante a lote falho.
  - Builders **puros** (testados): `buildOverview`, `buildRiskComposite`, `buildHeatmap`,
    `buildBreadth`, `buildBreadthDetail`, `buildMovers`, `buildThemes`, `buildFactors`, `buildEtfMap`.
- **Proxy** `netlify/functions/yahoo-quote.ts` — modo BATCH (`?symbols=&range=&interval=`)
  além do SINGLE legado; concorrência limitada (10) e cache CDN.
- **UI** `packages/ui/market/`: `MarketOverview`, `MarketHeatmap`, `MarketBreadth`,
  `MarketBaskets` (Themes/Factors), `MarketEtfMap`, `MarketMovers`, `Sparkline`, `treemap.ts`
  (`squarify`), `useElementWidth.ts`, `marketUi.ts` (formatters/cores/CSS).
- **Containers** `main-app/src/pages/market/*` + hook `main-app/src/useMarketData.js` (SWR por
  chave + auto-refresh 60s, pausa com aba oculta; 1 fetch compartilhado).

## Macro (módulo próprio — ✅)

> Virou âncora própria na sidebar (`macro`) para não estourar a fileira de abas do Market.
> Mesmo motor de fetch (`fetchMarketQuotes`) e hook (`useMarketData`).

| Área | Rota | O que faz |
|---|---|---|
| Cross-asset | `/macro` | Desempenho normalizado (base 100, 1 mês) de índices, commodities, FX, juros, crédito e cripto |
| Session tape | `/macro/session-tape` | Intraday (barras de 5 min) normalizado no open da sessão |
| Rates & liquidity | `/macro/rates` | Yields do Treasury + ETFs de duration/crédito + stress de crédito (HY vs Treasury) |
| Vol regime | `/macro/vol` | VIX + estrutura a termo (9D/VIX/3M/6M), contango/backwardation e regime |
| Curves | `/macro/curves` | Curva US Treasury (3M/5Y/10Y/30Y) + spreads 10y−3m / 30y−10y / 10y−5y |
| Events | `/macro/events` | Calendário econômico do mês (alta importância) via fonte free |

- **Motor** `packages/lib/db/marketMacro.ts` — universos `MACRO_SYMBOLS`, `CROSS_ASSET`,
  `SESSION_TAPE`, `RATE_ROWS`, `YIELD_POINTS` + builders puros `buildCrossAssetSeries`
  (normaliza base 100, forward-fill, granularidade `day`/`5m`), `buildYieldCurve`,
  `buildYieldSpreads`, `buildRatesLiquidity`, `buildCreditStress`, `buildVolRegime`.
- **UI** `packages/ui/market/`: `MacroCrossAsset` (recharts multi-linha; reusado por
  Cross-asset e Session tape), `MacroRates`, `MacroVol`, `MacroCurves`, `MacroEvents`.
- **Containers** `main-app/src/pages/macro/*`; fetch compartilhado pelas chaves `macro`
  (range `1mo`/`1d`) e `macro-session` (range `1d`/`5m`).
- **Limitações (honestas):** sem FRED (chave) — juros vêm dos yields do Yahoo; sem 2Y no
  feed grátis (curva usa 3M/5Y/10Y/30Y); **Crypto positioning / COT** exigem fonte paga e
  ficaram de fora (não inventamos dado).

## Live (módulo próprio — ✅)

> Âncora própria (`live`). Mesmo motor de fetch/hook. Não faz **dealer gamma** (exige feed de
> opções) — fica de fora para não inventar dado.

| Área | Rota | O que faz |
|---|---|---|
| Setupboard | `/live` | Regime agregado: trend (SPY vs SMA20), breadth setorial, vol, crédito, juros, dólar → score RISK-ON/NEUTRAL/RISK-OFF |
| Intraday breadth | `/live/intraday-breadth` | % de instrumentos acima do open da sessão (barras 5 min), adv/dec e barras por instrumento |
| Alerts | `/live/alerts` | Alertas objetivos: vol spike, breadth thrust, curva invertida, estresse de crédito, movimento de BTC, dólar forte |

- **Motor** `packages/lib/db/marketLive.ts` — universos `LIVE_SYMBOLS` (diário, inclui setores,
  VIX/VIX3M, crédito, juros, FX, commodities, cripto) e `LIVE_BREADTH` (intraday) + builders
  puros `sma`, `sessionChangePct`, `buildSetupboard`, `buildIntradayBreadth`, `buildAlerts`.
- **UI** `packages/ui/market/`: `LiveSetupboard`, `LiveIntradayBreadth`, `LiveAlerts`.
- **Containers** `main-app/src/pages/live/*`; fetch compartilhado pelas chaves `live`
  (range `1mo`/`1d`) e `live-intraday` (range `1d`/`5m`).
- **Alertas são regras objetivas** sobre o feed (não notícia nem recomendação).

## Scanner (módulo próprio — ✅)

> Âncora `scanner`. **Reusa o fetch do Market** (chave `market`) → trocar Market↔Scanner é
> instantâneo; o screener só filtra/ordena o que já está em cache.

| Área | Rota | O que faz |
|---|---|---|
| Screener | `/scanner` | Screener estilo mercado: presets (Gainers/Losers/Volume/Movers/Near 5d high-low), filtros (universo, setor, direção, variação mín./máx., preço mín./máx., volume mín., busca), ordenação por coluna, limite e export CSV |

- **Motor** `packages/lib/db/marketScanner.ts` — `ScreenerFilters`/`DEFAULT_SCREENER_FILTERS`,
  `SCREENER_PRESETS`/`applyPreset` e `buildScreener(quotes, filters)`:
  - universos `stocks` (S&P-like), `sectors` (SPDR), `baskets` (temas/fatores/ETF) e `all`
    (tudo rastreado) com dedupe; filtro por setor GICS;
  - métricas de 5d por série: `change5d`, `high5d`, `low5d`, `offHigh5d`, `offLow5d`;
  - ordenação por variação (1d/5d/abs), volume, preço e distância de high/low (nulos no fim);
  - retorna `matched`, `universeTotal` e `withData` (cobertura).
- **UI** `packages/ui/market/MarketScreener.tsx` — presets, filtros, cabeçalhos ordenáveis,
  tabela com scroll horizontal no mobile e botão **CSV**. Container
  `main-app/src/pages/scanner/ScannerScreenerPage.jsx` persiste os filtros em
  `localStorage` (`scanner:filters:v1`).
- **Linguagem de regras (DSL)** `packages/lib/db/screenerRules.ts` — você escreve o scan em
  texto (`change > 2% AND volume > 1M`, `sector = tech AND absChange > 3%`,
  `symbol in (…) AND price between 10 and 500`). Parser recursivo + avaliador puros
  (`parseRule`/`evaluateRule`), com erros amigáveis; `buildScreener` aplica a regra **em cima**
  dos filtros e devolve `ruleError` (regra inválida é ignorada, não quebra o scan). Guia no app
  (a partir de `RULE_FIELDS`/`RULE_EXAMPLES`) + referência em `01-scanner-rules.md`.
  O editor tem **destaque de sintaxe** (`highlightRule`): campos, conectores, operadores,
  números e strings em cores diferentes.
- **Fundamentos & Earnings (seção separada)** — segunda caixa de regras com campos próprios
  (`FUNDAMENTAL_FIELDS`: `pe`, `forwardpe`, `eps`, `marketcap`, `divyield`, `beta`,
  `earningsindays`, `revenuegrowth`, `profitmargin`, `avgvolume`, `high52w`, `low52w`).
  Combina por AND com a regra técnica. Feed **pluggável** (`packages/lib/db/fundamentals.ts`):
  sem `VITE_FUNDAMENTALS_ENDPOINT`, a UI mostra “Aguardando feed” (nunca inventa dado).
  Contrato externo em `02-fundamentals-feed.md`.
- **Campos personalizados** — o usuário define expressões numéricas (`packages/lib/db/customFields.ts`:
  `+ - * /`, `abs/min/max/round`, built-ins + fundamentos + custom anteriores) e usa o id como
  campo normal. Persistidos em `localStorage` (`scanner:custom-fields:v1`).
- **Limitação honesta:** o feed grátis (Yahoo) não traz open/gap/RVOL por barra; o universo é
  o rastreado (S&P-like + setores + cestas), não a bolsa inteira.

## Crypto (módulo próprio — ✅)

> Âncora `crypto`. Majors via Yahoo (`BTC-USD` etc.) pelo mesmo `fetchMarketQuotes`.

| Área | Rota | O que faz |
|---|---|---|
| Overview | `/crypto` | KPIs (BTC/ETH, adv/dec, média), tiles com sparkline e tabela de majors |

- **Motor** `packages/lib/db/marketCrypto.ts` — `CRYPTO_MAJORS`/`CRYPTO_SYMBOLS` +
  `buildCryptoBoard` (adv/dec/estáveis, média, séries p/ sparkline).
- **UI** `packages/ui/market/CryptoOverview.tsx`. Container `main-app/src/pages/crypto/CryptoOverviewPage.jsx`.
- **Limitação:** sem dominância global / market cap agregado (exigiria API global do CoinGecko).

## Roadmap (próximas abas — imagens do dono)

1. **Options** — reusa `options.ts` (já existe no módulo Trading) — link/camada no Market.
2. **Live plus** (opcional) — Dealer gamma (exige feed de opções) e alertas com notificação.
3. **Macro plus** (opcional) — Crypto positioning/COT e FRED se/quando houver chave.
4. **Integrações** (opcional) — alertas de preço de posições (`getFiredAlerts`) na aba Live,
   toast de disparo e overlay "meus ativos" no Market/Scanner.

## Fórmulas / regras

- Nenhum cálculo de mercado na tela: tudo em `marketData.ts` (builders puros).
- `changePct` é **fração** (0.01 = +1%); formatação só na UI (`fmtPct`).
- Cores por variável CSS (`--green`/`--red`), nunca hex em componente novo.
- Mobile-first 360px: heatmap vira blocos empilhados por setor abaixo de 640px.
- Feed indisponível ⇒ estado `stale` explícito (usa cache); nunca tela mentirosa.

## Testes

`packages/lib/db/__tests__/marketData.test.ts` — chunking, fetch em lote (mock), tolerância a
falha, e os builders (`buildOverview`, `buildRiskComposite`, `buildHeatmap`, `buildBreadth`,
`buildBreadthDetail`, `buildMovers`).
`packages/lib/db/__tests__/marketBaskets.test.ts` — `buildThemes`, `buildFactors`, `buildEtfMap`
e `MARKET_FULL_SYMBOLS`.
`packages/lib/db/__tests__/marketMacro.test.ts` — `buildCrossAssetSeries` (normalização,
forward-fill, granularidade `5m`), `buildYieldCurve`/`buildYieldSpreads` (inversão),
`buildRatesLiquidity`, `buildCreditStress`, `buildVolRegime` (contango/backwardation).
`packages/lib/db/__tests__/marketLive.test.ts` — `sma`, `sessionChangePct`, `buildSetupboard`
(RISK-ON/RISK-OFF/NEUTRAL), `buildIntradayBreadth`, `buildAlerts` (disparo e mercado calmo).
`packages/lib/db/__tests__/marketScanner.test.ts` — `buildScreener` (universos, filtros de
direção/variação/preço/volume/setor/busca, ordenação/limite, métricas de 5d, `withData`,
integração com a DSL), `applyPreset` e `buildCryptoBoard` (adv/dec/média).
`packages/lib/db/__tests__/screenerRules.test.ts` — parser/avaliador da linguagem (campos,
aliases, %, k/M/B, `between`/`in`/`contains`, AND/OR/NOT, nulos e erros amigáveis), campos
derivados de 5d e o lexer de destaque (`highlightRule`).
`packages/lib/db/__tests__/customFields.test.ts` — expressões (operações, funções, encadeamento,
divisão por zero, ids reservados/inválidos/duplicados, erro de ciclo).
`packages/lib/db/__tests__/fundamentals.test.ts` — normalização (camelCase/snake_case/earnings
timestamp), %, dias até earnings, mapa por símbolo e feed (`not_configured`/ok/vazio/HTTP falho).
O `marketScanner.test.ts` cobre a integração (fundamentos + custom + regra separada).
