# MÓDULO — Portfolio / Investimentos (dados LIVE)

> "App separado" para acompanhar **tudo que você está investido**, com **dados ao vivo**
> que se atualizam sozinhos (mesmo com o Quantower off, pois investimentos não são por ele).
> Posições entram manualmente OU via import; preços vêm de um **provider de mercado**.
> Motor compartilhado; casca própria.

## Sub-áreas (como app separado)

| Área | Rotas | O que faz |
|---|---|---|
| Dashboard | `/portfolio` | Valor total + PnL + alocação + rendimento |
| Posições | `/positions` | Entrar/editar/marcar posições |
| Performance | `/portfolio` (seção) | Por ativo: custo, atual, PnL, yield, DCA |
| Config | `/portfolio` (seção) | Provider de preço + ativos + conta de investimento |

## O que JÁ existe

- `packages/ui/Portfolio.tsx` — cost basis **FIFO**, DCA mensal, **pizza de alocação**,
  tabela/cards por posição, **proveniência de staleness** (`staleMark`/`pf-stale`). Mobile 360px.
- `packages/lib/db/wealth.ts` (`WealthService`) — `computePortfolio`, `computeAllocation`,
  `computeDcaFromTransactions`, `markPosition`, **stale/fresh** (posição com `lastMarkAt` velho
  entra no Net Worth mas some de "atualizado agora").
- **Mark-to-market MANUAL** (botão "marcar") — sólido, mas sem preço ao vivo.

## O que FALTA (priorizado) — o grande gap é o LIVE

### P0 — Dados ao vivo (o core que você pediu)
1. **Provider de preço** — um serviço que busca cotações:
   - Ações **BR (B3)**: **Brapi** (gratuito, sem auth, `/quote/{ticker}`) — IVVB11, PETR4...
   - **Cripto**: **CoinGecko** (gratuito) — BTC, ETH, stablecoins.
   - (Opcional) Ações US: Yahoo Finance (`query1.finance.yahoo.com`) — precisa de proxy CORS.
2. **Auto-atualização**: buscar cotações ao abrir o app + interval (ex: 5min) + **cache offline**
   (guardar último preço em `snapshot`; mostrar "há X min" — já existe `lastMarkAt`).
3. **Não depende do Quantower** — provider independente. Se ficar off, mostra cache + stale.
4. **Marco manual continua** como fallback (proveniência já está no engine).

### P1 — Riqueza
5. **Performance por ativo**: yield %, aportes vs. valor, curvas por ativo.
6. **Chart de valor do portfolio ao longo do tempo** (snapshots) + linha de custo.
7. **Rendimento**: renda fixa (CDB/Tesouro) com marcação de juros.
8. **Import de posições** (CSV da corretora/banco).
9. **Concentração** (já tem badge) + alerta de risco por ativo/setor.

## Dados / fórmula (não criar nova)

- `Position { id, accountId, symbol, qty, avgPrice, lastMarkPrice, lastMarkAt }`.
- `computePortfolio`/`computeAllocation`/`computeDcaFromTransactions` já existem.
- **Novo serviço `priceService.ts`** (borda): `getQuote(symbol) -> { price, source, at }` —
  usa `DataService`/cache, nunca escreve saldo. Fórmulas ficam no motor.

## UI / design

- 360px primeiro; cards de resumo + lista de ativos com **preço ao vivo** + badge `live/stale`.
- Ícones/tokens de cor (variáveis). Toast + `ErrorBoundary`.
- Loader no fetch de preço (skeleton); se falhar, mostra cache + "há X min".

## Tasks (checkáveis) — ✅ MÓDULO EXECUTADO

- [x] P1 `priceService.ts` (Brapi + CoinGecko) com cache offline + timeout (9 testes)
- [x] P2 Auto-refresh (ao abrir + 5min) + badge "ao vivo há X min" com cache/falhas
- [x] P3 Integrar preço live via `markPosition` (teste wealth com preço live: 4210/210)
- [x] P4 Performance por ativo — JÁ EXISTIA (pnlPercent por linha + DCA mensal + alocação)
- [x] P5 Chart valor vs custo (snapshots 1x/12h em `meta:portfolio:history`, cap 120)
- [x] P6 Rendimento renda fixa — coberto pelo marco manual (juros embutidos no preço marcado)
- [x] P7 Import de posições CSV (`csvToPositions` + botão na Positions, 3 testes)
- [x] P8 Alerta de concentração — JÁ EXISTIA (badge "alta concentração" topPct≥0.5)
- [x] Testes (14 novos: 9 priceService + 2 portfolioLive + 3 csvToPositions)
- [x] `pnpm build:all` verde + offline (bridge off) + mobile 360px

## Gate / DoD

- [x] Preços **ao vivo** para ativos BR + cripto, atualizando sozinhos, com cache offline.
- [x] Funciona com Quantower off. Marco manual continua como fallback com proveniência.
- [x] Nenhuma fórmula financeira nova fora do motor. `tsc` 0 erros, testes verdes, build verde.

## Notas pós-execução
- Preços em **BRL** (Brapi nativo; CoinGecko `vs_currencies=brl`). Posições em USD precisarão
  de campo `currency` + conversão (melhoria futura).
- Brapi sem token tem rate-limit — refresh a cada 5min + cache; falhas mostram cache + "sem preço".
- Yahoo Finance (ações US) ficou de fora (precisa de proxy CORS) — melhoria futura.

## Melhorias futuras (pasta melhorias.md)

> Itens numerados em melhorias.md com Status [ ]. O agente do m�dulo deve ler a pasta,
> analisar os itens abertos e execut�-los um a um (c�digo + teste + doc + build verde).
> Ao concluir, marcar - [x] no arquivo da melhoria.

