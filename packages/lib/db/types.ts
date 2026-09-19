// STAGE 2 — Domain types (app-db v3). CamelCase por contrato.
// Fonte de verdade do schema: DOCS/02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md
// Proibido snake_case aqui (só na borda Supabase, marcado // SUPABASE BOUNDARY).

export const DB_NAME = 'app-db';
export const DB_VERSION = 4;

/** Nomes finais das stores do IndexedDB v3 (contrato 01-DATA_CONTRACT.md). */
export type StoreName =
  | 'accounts'
  | 'prop_extensions'
  | 'transactions'
  | 'positions'
  | 'trades'
  | 'payouts'
  | 'goals'
  | 'tax_records'
  | 'snapshots_networth'
  | 'firm_costs'
  | 'cards'
  | 'meta';

export const STORE_NAMES: StoreName[] = [
  'accounts',
  'prop_extensions',
  'transactions',
  'positions',
  'trades',
  'payouts',
  'goals',
  'tax_records',
  'snapshots_networth',
  'firm_costs',
  'cards',
  'meta',
];

/** Metadados obrigatórios de TODO registro (contrato 01-DATA_CONTRACT.md). */
export interface SyncedRecord {
  id: string;
  updatedAt: string; // ISO 8601 com timezone, nunca `split('T')`
  deviceId: string;
  version: number;
}

export type AccountKind =
  | 'bank'
  | 'wallet'
  | 'investment'
  | 'crypto'
  | 'cash'
  | 'prop';

export interface Account extends SyncedRecord {
  kind: AccountKind;
  name: string;
  currency: string;
  institution?: string;
  hidden: boolean;
  // Conta DESABILITADA (soft-disable): some das listas/pickers/conexões mas o registro
  // permanece — referências antigas (payouts/trades/widgets) mostram o nome em "ghost".
  disabled?: boolean;
  disabledAt?: string;
  defaultWeight: number;
  copyGroup?: string;
  copyMultiplier?: number;
  lotStep?: number;
  platformAccountId?: string;
  platformName?: string;
  lastPlatformSync?: string;
  // Saldo informado pela PLATAFORMA (bridge) — referência; o saldo do app é derivado do
  // ledger. Atualizado a cada leitura das conexões (aditivo, sincroniza).
  platformBalance?: number;
  platformBalanceAt?: string;
  // Firms — vínculo com uma empresa (cor propaga no app). Aditivo.
  firmId?: string;
}

// Status de vida de uma conta prop (campo `phase` do PropExtension). Estados:
// challenge, funded, live, demo, standby. Persistido em coluna TEXT (sem migration).
export type PropPhase =
  | 'challenge'
  | 'funded'
  | 'live'
  | 'demo'
  | 'standby';

// Legado: valores gravados antes desta simplificação (normalizados no read).
export type LegacyPropPhase = 'challenge1' | 'challenge2' | 'paused' | 'failed';

export interface PayoutRules {
  minProfit: number;
  minDaysSincePayout: number;
  feePct: number;
  method: string;
}

export type PayoutFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface PropExtension {
  accountId: string; // FK 1:1 com Account.id
  nominalSize: number;
  challengeCost: number;
  phase: PropPhase;
  target: number;
  maxDD: number;
  trailingDD: number;
  dailyDD: number;
  consistencyPct: number;
  minDays: number;
  payoutRules: PayoutRules;
  profitSplit: number;
  payoutFrequency: PayoutFrequency;
  quantowerAccountId?: string;
  lastSync?: string;
  // Fuso horário da PRÓPRIA firm (não o do navegador) — ver FINANCIAL_FORMULAS.md
  timezoneOffsetMinutes?: number;
  updatedAt: string;
  deviceId: string;
  version: number;
}

export type TransactionKind =
  | 'payout_in'
  | 'challenge_cost'
  | 'reset_fee'
  | 'monthly_fee'
  | 'commission'
  | 'swap'
  | 'rebate'
  | 'expense'
  | 'income'
  | 'dividend'
  | 'transfer'
  | 'buy'
  | 'sell'
  | 'fee'
  | 'tax_reserve';

export interface TransactionRef {
  type: 'payoutId' | 'tradeId' | 'investmentId' | 'recurrence' | 'transfer';
  id: string;
}

export interface Transaction extends SyncedRecord {
  accountId: string;
  firmId?: string;
  kind: TransactionKind;
  amount: number;
  currency: string;
  rate?: number; // rate=0 PROIBIDO (zera cálculo silenciosamente)
  rateTimestamp?: string;
  date: string; // ISO 8601 com timezone
  ref?: TransactionRef;
  note?: string;
  category?: string; // G1 — id da categoria (ex.: 'moradia'). Aditivo; legado lê via prefixo na note.
  recurrence?: { freq: 'monthly'; day: number }; // G6 — template recorrente (a cópia gerada NÃO carrega)
  // A2 — anexos/comprovantes (base64 pequeno ou referência). Limite 300KB na UI.
  attachments?: Record<string, object>;
  // A4 — ativo da operação buy/sell (para FIFO de IR). Aditivo.
  asset?: { symbol: string; qty: number; price: number };
  // D1 — contas a pagar/receber. `undefined` = pago (legado); `false` = pendente.
  paid?: boolean;
  dueDate?: string; // ISO: vencimento da conta (a pagar/receber)
  // D2 — parcelamento: parcela atual / total + agrupador.
  installments?: { n: number; of: number; groupId: string };
  // D2 — cartão/fatura (agrupa lançamentos por cartão). `card` = nome (legado/texto);
  // `cardId` = vínculo com a entidade `Card` (quando escolhido da lista).
  card?: string;
  cardId?: string;
  // D4 — tags livres (ex.: 'viagem', 'trabalho').
  tags?: string[];
}

export interface Position {
  id: string;
  accountId: string;
  symbol: string;
  qty: number;
  avgPrice: number; // na moeda da posição
  currency?: 'BRL' | 'USD'; // default BRL
  // A8 — renda fixa: accrual automático (só 'pre' com yieldRate; 'pos'/'ipca'
  // precisam de índice externo e caem no marco manual).
  assetKind?: 'equity' | 'fixed' | 'other'; // 'other' = imóvel/obra/bem (valor manual)
  yieldRate?: number; // a.a. decimal (ex.: 0.12). Juros compostos 365d (aproximação).
  yieldType?: 'pre' | 'pos' | 'ipca';
  // A2 — alertas de preço (dispara 1x até rearmar; ver priceService).
  alerts?: Array<{ id: string; dir: 'above' | 'below'; price: number }>;
  lastMarkPrice?: number; // na moeda da posição
  lastMarkAt?: string;
  updatedAt: string;
  deviceId: string;
  version: number;
}

export type TradeDirection = 'long' | 'short';
export type TradeSource = 'manual' | 'quantower' | 'ctrader' | 'csv';

export interface TradeAccountSplit {
  accountId: string;
  weight: number;
}

/** Execução de uma ordem dentro de um trade (fill). Campo ÚNICO — fim da
 * dualidade antiga `executions vs PartialExecutions` (PascalCase). */
export interface TradeExecution {
  side: 'entry' | 'exit' | 'buy' | 'sell';
  price: number;
  quantity: number;
  timestamp: string; // ISO 8601 com timezone
  commission?: number;
  fee?: number;
  swap?: number;
}

export interface Trade extends SyncedRecord {
  accountId?: string; // fallback pra trade de 1 conta só
  accounts?: TradeAccountSplit[];
  strategyId?: string;
  symbol: string;
  direction: TradeDirection;
  entryDatetime: string;
  exitDatetime?: string;
  qty: number;
  entryPrice: number;
  exitPrice?: number;
  commission: number;
  swap: number;
  rebate: number;
  fees: number;
  slippage?: number;
  // Opcionais usados pelas fórmulas (FINANCIAL_FORMULAS.md). Aditivos, não alteram
  // os campos obrigatórios já aprovados.
  stopPrice?: number; // risco inicial p/ R (null se não definido)
  takePrice?: number; // alvo (TP) capturado da posição (null se não definido)
  multiplier?: number; // contract size (default 1)
  strategyVersion?: string; // versão do playbook usada no trade (Strategy Versioning)
  // Execuções de fill (VWAP/MAE/MFE). Único campo — substitui `PartialExecutions`.
  executions?: TradeExecution[];
  // A2 — MAE/MFE reais (bridge futuro/manual). Quando presentes, `maeMfe()` os
  // prefere ao proxy via fills. M1 verdadeiro exigiria série intra-trade (fora do schema).
  mae?: number;
  mfe?: number;
  source: TradeSource;
  quantowerId?: string;
  // F5/F6 — plataforma de origem (qualquer broker). Dedup cTrader via primary-key `ct_<id>`.
  platformName?: string;
  platformTradeId?: string;
  platformAccountId?: string;
  resultNet: number;
  resultR: number | null;
  notes?: string;
  tags?: string[]; // J12 — etiquetas livres (minúsculas, sem espaços), p/ filtro e review
}

export type PayoutStatus = 'Pending' | 'Approved' | 'Paid';

export interface PayoutSplit {
  gross: number;
  net: number;
  fee: number;
}

export interface Payout extends SyncedRecord {
  accountIds: string[];
  gross: number;
  fee: number;
  net: number;
  splitByAccount: Record<string, PayoutSplit>;
  status: PayoutStatus;
  method: string;
  attachments: Record<string, object>;
  date?: string; // data do pagamento (ISO) — usada pelo importer
}

export type GoalKind =
  | 'emergency'
  | 'networth'
  | 'property'
  | 'payout_year'
  | 'portfolio';

export interface Goal extends SyncedRecord {
  kind: GoalKind;
  targetValue: number;
  currentDerived: number; // SEMPRE derivado, nunca digitado
  deadline?: string;
  windowType?: 'calendar_year' | 'rolling_12m';
  name?: string;
}

export interface TaxRecord extends SyncedRecord {
  firmId?: string;
  accountId?: string;
  kind: 'dar' | 'carnet_leao' | 'pj';
  baseAmount: number;
  taxAmount: number;
  rate: number;
  rateTimestamp?: string;
  date: string;
  status: 'pending' | 'paid';
  note?: string;
}

export interface SnapshotNetworth extends SyncedRecord {
  netWorth: number;
  totalAccounts: number;
  totalPositions: number;
  liabilities: number;
  snapshotAt: string;
}

export type FirmCostKind =
  | 'challenge'
  | 'reset'
  | 'monthly'
  | 'commission_share';

/** Visão materializada de Transaction por firm — cache derivado, NÃO fonte de verdade. */
export interface FirmCost {
  id: string;
  firmId: string;
  accountId?: string;
  kind: FirmCostKind;
  amount: number;
  date: string;
  updatedAt: string;
  deviceId: string;
  version: number;
}

export interface Meta extends SyncedRecord {
  key: string;
  value: unknown;
}

/** Cartão de crédito como entidade (limite/fechamento/vencimento). */
export interface Card extends SyncedRecord {
  name: string;
  brand?: string;
  accountId?: string;
  currency: string;
  creditLimit: number;
  closingDay?: number;
  dueDay?: number;
}

/** Payload exato de `datastore:change` (contrato 01-DATA_CONTRACT.md). */
export interface DatastoreChangePayload {
  timestamp: number;
  source: 'local' | 'sync:pull' | 'sync:push' | 'restore' | 'quantower';
  entityType?:
    | 'account'
    | 'transaction'
    | 'trade'
    | 'payout'
    | 'goal'
    | 'position'
    | 'card'
    | 'prop_extension'
    | 'tax_record'
    | 'snapshot_networth'
    | 'firm_cost'
    | 'meta';
  entityIds?: string[];
}
