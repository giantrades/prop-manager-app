# STAGE 1 — Domain Model (centro do sistema)

> Adota a correção do 3º parecer: centro = Account unificada, não "Prop Account" isolada.
> Verificado contra o código real (`f26cea5`): vários campos abaixo **já existem** hoje
> em formato pré-unificado — este documento é tanto o schema alvo quanto o mapa de
> migração campo-a-campo. Onde marco `[JÁ EXISTE]`, é rename/regroup, não criação do zero.

## Entidades fundamentais (só estas criam verdade)

```ts
Account {
  id: string, kind: 'bank'|'wallet'|'investment'|'crypto'|'cash'|'prop',
  name: string, currency: string, institution?: string,
  hidden: boolean,                        // [JÁ EXISTE] Account.hidden
  defaultWeight: number,                  // [JÁ EXISTE] usado em rateio multi-conta
  // Copy-trade (novo, exigido pelo Bridge v2 / mobile)
  copyGroup?: string,                     // ex: "grupo-e8" — contas que replicam juntas
  copyMultiplier?: number,                // ex: 0.5 — fração do lote da conta-mestre
  lotStep?: number,                       // menor incremento negociável do símbolo/conta
                                           // (sem isso copyMultiplier não sabe arredondar)
  // Integração de plataforma
  platformAccountId?: string,             // [JÁ EXISTE]
  platformName?: string,                  // [JÁ EXISTE]
  lastPlatformSync?: string,              // [JÁ EXISTE] ISO 8601 com timezone
  // Metadados de sync (obrigatório em TODO registro, ver DATA_CONTRACT.md)
  updatedAt: string, deviceId: string, version: number,
}

PropExtension {                           // só quando Account.kind === 'prop'
  accountId: string,                      // FK 1:1 com Account.id
  nominalSize: number,
  challengeCost: number,                  // custo pago pra abrir ESSE challenge/fase
  phase: 'challenge1'|'challenge2'|'funded'|'paused'|'failed',
  target: number, maxDD: number, trailingDD: number, dailyDD: number,
  consistencyPct: number,                 // ver 02-FINANCIAL_FORMULAS.md pra fórmula exata
  minDays: number,
  payoutRules: { minProfit: number, minDaysSincePayout: number, feePct: number, method: string },
  profitSplit: number,                    // [JÁ EXISTE] Account.profitSplit hoje (0.8 default)
  payoutFrequency: 'daily'|'weekly'|'biweekly'|'monthly', // [JÁ EXISTE]
  quantowerAccountId?: string,            // = Account.platformAccountId quando platformName='quantower'
  lastSync?: string,
}
// ÍNDICES: PropExtension.accountId (único), PropExtension.phase (pra filtrar Risk Center
// só nas contas ativas: WHERE phase IN ('challenge1','challenge2','funded'))

Transaction {
  id: string, accountId: string, firmId?: string,
  kind: 'payout_in'|'challenge_cost'|'reset_fee'|'monthly_fee'|'commission'|'swap'|
        'rebate'|'expense'|'transfer'|'buy'|'sell'|'fee'|'tax_reserve',
  amount: number, currency: string, rate?: number, rateTimestamp?: string,
                                           // rate=0 PROIBIDO (zera cálculo silenciosamente)
  date: string,                           // ISO 8601 com timezone, nunca `split('T')`
  ref?: { type: 'payoutId'|'tradeId'|'investmentId', id: string },
  note?: string,
  updatedAt: string, deviceId: string, version: number,
}
// ÍNDICES: (accountId, date), (firmId, date), (kind, date) — Firm P&L e Wallets fazem
// range query por data o tempo todo; sem índice composto isso vira full-scan em memória
// (hoje já é assim em `dataStore.js`, com <5k registros não dói, com histórico de anos dói).
// Ledger LEAN v1: começa só como log unificado do que hoje está espalhado.
// Não é double-entry completo. Payouts e snapshots atuais são migrados como Transactions
// seed (agressivo, com backup — ver DATA_CONTRACT.md § Migração).

FirmCost {                                // visão materializada de Transaction por firm,
                                           // NÃO é fonte de verdade — é cache derivado
  id: string, firmId: string, accountId?: string,
  kind: 'challenge'|'reset'|'monthly'|'commission_share', amount: number, date: string,
}

Position {                                // investimento/crypto, mark-to-market manual
  id: string, accountId: string, symbol: string, qty: number, avgPrice: number,
  lastMarkPrice?: number, lastMarkAt?: string,   // novo — sem isso Net Worth não sabe
                                                  // se o preço usado é de hoje ou de 12 dias
  updatedAt: string,
}
// ÍNDICES: (accountId, symbol) único — não pode haver 2 Position pra mesmo símbolo/conta,
// isso é o que garante Cost Basis correto (ver FINANCIAL_FORMULAS.md).

Trade {
  id: string,
  accountId?: string,                     // [JÁ EXISTE] fallback pra trade de 1 conta só
  accounts?: Array<{ accountId: string, weight: number }>,
                                           // [JÁ EXISTE, HOJE INCONSISTENTE] o campo
                                           // `Trade.accounts[]` já existe no código
                                           // (`dataStore.js:502`) mas `recalc`/`computeSplit`
                                           // não o leem — Stage 0 T0.6/T0.7 conserta isso
                                           // ANTES deste schema virar código.
  strategyId?: string, symbol: string, direction: 'long'|'short',
  entryDatetime: string, exitDatetime?: string,   // ISO 8601 com TZ — ver nota de rename abaixo
  qty: number, entryPrice: number, exitPrice?: number,
  commission: number, swap: number, rebate: number, fees: number, slippage?: number,
  source: 'manual'|'quantower'|'csv',
  quantowerId?: string,
  resultNet: number, resultR: number,             // ver nota de rename abaixo
  notes?: string,
  updatedAt: string, deviceId: string, version: number,
}
// ÍNDICES: (accountId, entryDatetime), (strategyId, entryDatetime), (quantowerId) único
// pra dedup.
// Trade NUNCA atualiza equity direto — só cria Transaction via DataChainEngine.

Payout {
  id: string, accountIds: string[], gross: number, fee: number, net: number,
  splitByAccount: Record<string, { gross: number, net: number, fee: number }>,
  status: 'Pending'|'Approved'|'Paid',
  method: string, attachments: Record<string, object>,
  updatedAt: string, deviceId: string, version: number,
}

Goal {
  id: string, kind: 'emergency'|'networth'|'property'|'payout_year'|'portfolio',
  targetValue: number, currentDerived: number,     // SEMPRE derivado, nunca digitado
  deadline?: string,
  windowType?: 'calendar_year'|'rolling_12m',       // novo — resolve o gap de "payout
                                                     // anual" virar ambíguo na virada do ano
}
```

Exemplo: `C6, Wise, XP, Binance, FTMO, E8, Cash` são todos `Account`. Só `kind=prop` tem
`PropExtension`.

## Rename obrigatório na migração (schema atual → schema alvo)

O `Trade` de hoje (`dataStore.js:createTrade`) **já mistura convenções**: campos de
data/preço em snake_case (`entry_datetime`, `exit_datetime`, `entry_price`, `exit_price`,
`result_net`, `result_R`) convivendo com campos de identidade em camelCase (`accountId`,
`strategyId`, `platformTradeId`) **no mesmo registro**. Isso não é só "o forceResync
converte errado" (bug já corrigido no Stage 0) — é o dado de origem que já nasce
inconsistente. A migração v1→v3 precisa de uma tabela de rename explícita, não só
"parar de converter":

| Campo hoje (`dataStore.js`) | Campo no schema alvo | Observação |
|---|---|---|
| `entry_datetime` | `entryDatetime` | rename |
| `exit_datetime` | `exitDatetime` | rename |
| `entry_price` | `entryPrice` | rename |
| `exit_price` | `exitPrice` | rename |
| `result_net` | `resultNet` | rename |
| `result_R` | `resultR` | rename |
| `PartialExecutions` | `executions` | rename + normaliza casing (hoje é PascalCase) |
| `volume` | `qty` | rename, confirmar unidade (lote vs contrato) por symbol antes de migrar |
| `Account.type` (string livre: 'Forex', 'Futures'...) | `Account.kind` (enum fechado) | precisa de mapa manual — `type` hoje mistura classe de ativo (Forex/Futures) com o que devia ser `kind` (prop/bank/etc); ex: uma conta "Forex" pode ser prop OU cash dependendo de qual prop firm, decisão manual conta por conta na migração, não automatizável |
| `Account.currentFunding` | *(removido)* | vira 100% derivado — ver "Regra de ouro" abaixo. As 10 escritas diretas encontradas no código (Stage 0 T0.9) precisam sair ANTES desta migração, ou o valor migrado já nasce potencialmente errado |
| `Account.initialFunding` | `PropExtension.nominalSize` (quando kind=prop) ou descartado (quando kind≠prop, vira só o saldo inicial da Transaction seed) | |

## Regra de ouro (anti-currentFunding)

```
Trade -> Realized PnL -> Account Ledger (Transaction) -> Equity (derivado)
```

Proibido: `Trade -> incrementa currentFunding/equity/dashboard/goal` em múltiplos lugares.
Isso não é teórico — **confirmei 10 pontos de escrita direta em `Account.currentFunding`
no código atual**, em 4 arquivos diferentes (`JournalContext.jsx` em 2 pontos,
`dataStore.js` em 2 pontos, `Accounts.jsx` em 2 pontos — inclusive um `<input>` editável
à mão — e `Payouts.jsx` em 4 pontos).
`Account balance, Net Worth, Goal progress, Portfolio value` = derivados. Snapshots só
histórico.

## Ledger — por que precisa (resposta direta)

Sem ledger você nunca responde "quanto gastei com cada propfirm / comissões / rebates"
porque hoje isso está em 4+ lugares: `payout.fee`, `trade.commission`,
`account.initialFunding` editado na mão, e custo de challenge nem existe no schema
(confirmado: `Account` hoje não tem `challengeCost` nem `resetFee` — só
`initialFunding/currentFunding/profitSplit/payoutFrequency/defaultWeight`).

Ledger LEAN = 1 tabela `transactions` que unifica o que você já tem:
- payouts existentes viram `payout_in` + `fee`
- trades existentes viram `commission/swap` derivados (campos que **já existem** soltos
  no `Trade` mas nunca somados por firm)
- custo de challenge/reset/mensalidade vira `challenge_cost/reset_fee` (campo novo)
- rebates viram `rebate` (positivo)

Sem isso, o painel de "quanto recebi vs gastei por firm" continua confuso para sempre.
Com isso, Firm dashboard = `Σ payouts - Σ costs - Σ fees + Σ rebates` por `firmId`. Simples.

Migração: como você confirmou que não há nada a preservar além de payouts/snapshots,
migração pode ser AGRESSIVA desde o Stage 1 (backup + seed Transactions a partir de
payouts/trades). Sem tela escrevendo saldo direto — saldo é sempre derivado do ledger.

## Versionamento de schema

`app-db v3` é a versão alvo deste documento. Qualquer mudança de campo depois da
aprovação do Stage 1 precisa de `app-db v4` explícito com migração própria — nunca
alterar `v3` in-place depois que Stage 2+ já escreveu código contra ele (isso quebra
todo o `DataChainEngine` sem aviso).
