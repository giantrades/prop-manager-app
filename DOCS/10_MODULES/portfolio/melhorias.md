# MELHORIAS — Portfolio / Investimentos (batch A)

> Um arquivo por módulo. Itens rotulados `A1, A2, ...`. Futuras melhorias: batch B (`B1...`).
> O agente analisa os `[ ]` abertos e executa um a um (código + teste + build verde).

## A1 — Dividendos e proventos
- Status: [x] executada
- Contexto: posição rende não só por valorização: dividendos/JCP entram no retorno real e hoje não são registrados.
- Proposta: `Transaction kind='dividend'` com `ref.investmentId` + data + valor. Portfolio soma proventos no PnL total e mostra **yield on cost** por ativo. UI: "registrar provento" na linha do ativo + total de proventos.
- Arquivos: `packages/lib/db/types.ts`, `wealth.ts` (`computePortfolio` inclui proventos), `packages/ui/Portfolio.tsx`
- Aceite: provento entra no PnL e no yield sem duplicar cost basis; `tsc` 0; testes verdes; build verde.

## A2 — Alertas de preço
- Status: [x] executada
- Contexto: com preço live, o passo natural é avisar quando o ativo bate um nível.
- Proposta: `Position.alerts?: Array<{ id, dir:'above'|'below', price }>` (aditivo). Após refresh do `priceService`, comparar e emitir `price:alert` (entra no Action Center). Alerta dispara 1x até rearmar.
- Arquivos: `packages/lib/db/types.ts`, `priceService.ts`, Action Center
- Aceite: alerta 1x por travessia; rearme manual; sem spam (histerese/cooldown); `tsc` 0; testes verdes; build verde.

## A3 — Benchmark (CDI/Ibovespa) no gráfico
- Status: [x] executada
- Contexto: "+12% no ano" sem referência não diz se foi bom.
- Proposta: linha de benchmark no chart de valor: CDI acumulado + Ibovespa (série manual mensal primeiro, depois via provider). Começar por CDI.
- Arquivos: `priceService.ts` ou série manual, chart do Portfolio
- Aceite: chart mostra portfolio vs CDI no mesmo período; sem benchmark, chart atual inalterado; `tsc` 0; testes verdes; build verde.

## A4 — Imposto sobre vendas linkado ao Tax
- Status: [x] executada
- Contexto: vender ação com lucro gera IR (15% swing / 20% day-trade) e hoje o Tax Cockpit não recebe isso automaticamente.
- Proposta: ao registrar venda (`sell`), sugerir lançamento no Tax (`tax_records` com base = venda − cost basis FIFO da quantidade vendida). **Sugerir, nunca lançar sozinho.** Link `ref`.
- Arquivos: `wealth.ts`, Tax Cockpit, tipos (`tax_records`)
- Aceite: venda sugere lançamento fiscal correto; sem venda, nada muda; `tsc` 0; testes verdes; build verde.

## A5 — Posições em USD (moeda + conversão)
- Status: [x] executada
- Contexto: o `priceService` devolve preços em **BRL**. Posições em USD ficariam com valor errado se marcadas com preço BRL.
- Proposta: `Position.currency?: 'BRL'|'USD'` (default 'BRL'). Para USD usar Yahoo/Brapi + converter com taxa guardada na `Transaction`/`meta` (PTAX-like). `computePortfolio` converte para moeda-base.
- Arquivos: `packages/lib/db/types.ts`, `priceService.ts`, `wealth.ts`
- Aceite: posição USD aparece em BRL com taxa citável; sem taxa, não inventa conversão (aviso de proveniência); `tsc` 0; testes verdes; build verde.
- Fora de escopo: atualização automática da taxa de câmbio (separada).

## A6 — Ações US (Yahoo Finance / proxy CORS)
- Status: [x] executada
- Contexto: B3 (Brapi) e cripto (CoinGecko) cobertos. Ações US ficaram de fora — `query1.finance.yahoo.com` bloqueia CORS no browser.
- Proposta: proxy CORS (Netlify Function/Cloudflare Worker); rota `quoteUS` no `priceService` com o mesmo contrato `{ price, source:'yahoo', at }`, convertendo para BRL via taxa (A5). Fallback: cache + stale.
- Arquivos: `packages/lib/db/priceService.ts`, Netlify Function, `.env`
- Aceite: ticker US (ex.: AAPL) retorna preço ao vivo convertido com proveniência; proxy falhou → cache + stale; nenhum CORS na console; `tsc` 0; testes verdes; build verde.
- Fora de escopo: dados intraday em tempo real (separado).

## A7 — Brapi com token / backoff de rate-limit
- Status: [x] executada
- Contexto: Brapi sem token tem rate-limit baixo. Refresh a cada 5min com muitas posições pode estourar e voltar cache/stale mais que o necessário.
- Proposta: suporte a `VITE_BRAPI_TOKEN`; `priceService` com **backoff exponencial** e **cooldown por símbolo** (não re-buscar símbolo que falhou há <2min); sem token, intervalo maior + prioridade a símbolos sem preço recente.
- Arquivos: `packages/lib/db/priceService.ts`, `.env.example`
- Aceite: com token usa endpoint autenticado; sem token respeita cooldown/backoff; símbolo que falhou não é re-buscado a cada tick; `tsc` 0; testes verdes; build verde.
- Fora de escopo: cache de cotações em servidor (backend dedicado).

## A8 — Renda fixa com marcação de juros (accrual)
- Status: [x] executada
- Contexto: o spec marcou P6 como "coberto pelo marco manual", mas CDB/Tesouro rendem juros diários e marcar à mão perde o rendimento.
- Proposta: `Position.kind?: 'fixed'` com `yieldRate?` (a.a.) e `yieldType: 'pre'|'pos'|'ipca'`. `computePortfolio` calcula accrual desde `lastMarkAt`/compra até hoje. UI: badge "renda fixa" + "juros acumulados" separado do custo.
- Arquivos: `packages/lib/db/types.ts`, `wealth.ts`
- Aceite: CDB/Tesouro com taxa cresce diariamente sem marcação manual; sem `yieldRate`, idêntico ao atual; `tsc` 0; testes verdes; build verde.
- Fora de escopo: curva de juros/mercado (dados externos — separado).

## B1 — Dividendos anunciados (data-com)
- Status: [x] executada
- Contexto: o app sabe o que você RECEBEU (A1), mas não o que está por vir. Acompanhar data-com evita vender véspera e planeja renda.
- Proposta: `DividendEvent {symbol, exDate, amountPerShare?, confirmed}` em meta (`dividends:announced`); seção "Próximos proventos" (exDate ≥ hoje, ordenado) + botão "marcar como recebido" (cria `dividend` via `recordDividend`). Sem data-com passada, some da lista.
- Arquivos: `wealth.ts` ou `money.ts` (helpers meta), `Portfolio.tsx` (seção + form simples), testes
- Aceite: anunciado vira recebido em 1 clique; passado some; `tsc` 0; testes verdes; build verde.
- Fora de escopo: buscar agenda de proventos automaticamente (provider — separado).

## B2 — Alocação alvo vs real (ideia UI/UX)
- Status: [ ] ideia (futura)
- Contexto: a pizza mostra onde você ESTÁ, não onde queria estar.
- Proposta: metas de alocação por ativo/classe (%) em meta + barras "alvo vs real" com hint de rebalanceamento ("venda X de Y, compre Z"). Puro display sobre `computeAllocation`.
