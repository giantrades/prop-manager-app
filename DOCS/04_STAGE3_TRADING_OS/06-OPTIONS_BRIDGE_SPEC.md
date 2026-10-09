# BRIDGE — OPÇÕES (extensão v3 do contrato)

> Extensão do contrato v2 (`04-BRIDGE_V2_SPEC.md`). Mesma autenticação
> (`X-Bridge-Token`), mesmo contrato de erro (`ErrorPayload`), mesma idempotência
> (`clientOrderId`). Vale a regra: **não inventar rota sem confirmar a API do Quantower**
> — os nomes de endpoint abaixo são a proposta de contrato; antes de implementar, validar
> na documentação/SDK do Quantower (mesmo tratamento dado ao `GET /orders` do v2, que ficou
> como "NÃO VERIFICADO").
>
> Depende de: `DOCS/10_MODULES/options/00-spec.md` (F3) e
> `DOCS/02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md § Opções`.

## Rotas novas

```
GET /options/expiries?underlying=PETR4
  200: { underlying, expiries: [{ expiry, eod: boolean, code: 'PETRH25' }] }

GET /options/chain?underlying=PETR4&expiry=2026-11-21&depth=15
  200: {
    underlying, expiry, spot,
    quotes: [{
      strike, right: 'call'|'put', symbol,
      bid, ask, last,      // pode vir null se sem book
      iv, oi, volume,      // null quando o feed não fornecer
      greeks?: { delta, gamma, theta, vega, rho },   // pode ser null
      multiplier,          // tamanho do contrato (nunca presumir 100)
      at                   // timestamp do dado
    }]
  }

GET /options/positions
  200: { positions: [{
    platformPositionId, accountId, underlying, symbol, right, strike, expiry,
    qty,                  // com sinal (+ long, - short)
    avgPrice,             // prêmio por ação
    multiplier, marketPrice, greeks?, iv?,
    marketValue, unrealizedPnl
  }] }

POST /options/order
  body: {
    accountId, underlying, symbol, right, strike, expiry,
    side: 'buy'|'sell', qty, type: 'limit'|'market', price?, sl?, tp?,
    clientOrderId
  }
  200: { success: true, platformOrderId, filledPrice?, filledQty? }

POST /options/close
  body: { platformPositionId, qty?, price?, clientOrderId }
  200: { success: true, platformOrderId }
```

## Multi-leg (spreads/covered call)

- **v1**: enviar perna a perna, cada uma com `clientOrderId` próprio. A UI mostra o
  progresso por perna e o que falhou — **nunca** prometer atomicidade que o bridge não tem.
- **v2 (só se o Quantower expuser ordem multi-leg atômica)**: `POST /options/order-multi`
  com `legs[]` e um único `clientOrderId`; contrato de resposta idêntico ao v2.
- Covered call (ação + call short): a perna de ação é posição existente; só a call é
  enviada por `/options/order`. O app valida cobertura antes (Risk gate — melhoria A2).

## Formato de derivativos (dados que o app NUNCA calcula com fonte ambígua)

- `greeks` e `iv` quando vêm do feed/bridge levam `source: 'bridge'`; quando o app calcula
  (BSM/IV do motor), `source: 'computed'`; cotação digitada à mão, `source: 'manual'`.
  O badge de procedência é obrigatório na UI (aposta #1 do roadmap).
- `multiplier` sempre presente e não nulo; o app recusa a linha (e loga) se vier ausente —
  multiplicador presumido é a armadilha nº 1 de opções.
- `expiry` em ISO date no fuso do mercado do ativo; o bridge é responsável por mandar a
  data do mercado, não a do servidor local do app.

## Reconciliação

- Dedup por `quantowerId`/impressão digital como nos trades (`quantowerIngest.ts`).
- Posição de opção fechada no bridge some da lista → app marca `closed` na `OptionLeg`
  local (mesmo reconcile de `positionReconcile`), sem apagar histórico.
- Assignment/exercise: se a plataforma reportar `exercise`/`assignment` nas posições,
  o ingest gera a `Transaction` de prêmio + a mudança de posição de ações; se não
  reportar, o usuário registra manual e o app reconcilia depois (fase F4).

## Testes (demo, antes de conta real)

- [ ] `/options/chain` sem token → `401`; com token e symbol inválido → `ErrorPayload`.
- [ ] Ordem limit de call com `clientOrderId` repetido → mesma resposta, sem 2ª ordem.
- [ ] Posição real de opção aparece no app com as mesmas pernas/quantidades do Quantower.
- [ ] Bridge off no meio de `/options/order` → app mostra `retryable:true`, nunca sucesso falso.
- [ ] Multileg perna-a-perna: falha de uma perna mostra exatamente qual falhou (sem rollback silencioso).
- [ ] `multiplier` ausente na chain → app recusa a linha com aviso (não assume 100).

## Implementado (bridge v3) — resumo

- Endpoints em `quantower-bridge/QuantowerBridge.cs`: `GET /options/expiries?underlying=`,
  `GET /options/chain?underlying=&expiry=&depth=`, `GET /options/positions`.
- Fonte: `Core.Instance.Symbols` (tipo Option). **IV, Δ/Γ/Θ/V/ρ, OI, ExpirationDate,
  Root/Underlier, Bid/Ask/Last, LotSize** vêm direto do `Symbol`
  (confirmado em `api.quantower.com/docs/TradingPlatform.BusinessLayer.Symbol.html`).
- **Strike/right NÃO são derivados no bridge**: o payload manda o `symbol` cru e o APP deriva
  (`parseOptionSymbol` em `packages/lib/db/optionsIngest.ts`). Assim, variação de nomenclatura
  se corrige no app sem recompilar o bridge. `depth` é aplicado no app (após derivar o strike).
- App: `packages/lib/db/optionsSync.ts` (`syncOptionsFromBridge`) puxa e grava em
  `option_chain`/`option_legs` (merge por `quantowerId`); botão "Sincronizar Quantower" na aba Opções.
- **VALIDAR AO VIVO** (não testável aqui): o nome do membro do enum `SymbolType.Option` e a
  unidade do multiplicador (`LotSize`). Se o enum tiver outro nome, é 1 palavra no bridge.
