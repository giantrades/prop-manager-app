// STAGE 2 — Domain types (app-db v3). CamelCase por contrato.
// Fonte de verdade do schema: DOCS/02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md
// Proibido snake_case aqui (só na borda Supabase, marcado // SUPABASE BOUNDARY).

export const DB_NAME = 'app-db';
export const DB_VERSION = 3;

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
  defaultWeight: number;
  copyGroup?: string;
  copyMultiplier?: number;
  lotStep?: number;
  platformAccountId?: string;
  platformName?: string;
  lastPlatformSync?: string;
}

export type PropPhase =
  | 'challenge1'
  | 'challenge2'
  | 'funded'
  | 'paused'
  | 'failed';

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
  | 'transfer'
  | 'buy'
  | 'sell'
  | 'fee'
  | 'tax_reserve';

export interface TransactionRef {
  type: 'payoutId' | 'tradeId' | 'investmentId';
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
}

export interface Position {
  id: string;
  accountId: string;
  symbol: string;
  qty: number;
  avgPrice: number;
  lastMarkPrice?: number;
  lastMarkAt?: string;
  updatedAt: string;
  deviceId: string;
  version: number;
}

export type TradeDirection = 'long' | 'short';
export type TradeSource = 'manual' | 'quantower' | 'csv';

export interface TradeAccountSplit {
  accountId: string;
  weight: number;
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
  multiplier?: number; // contract size (default 1)
  source: TradeSource;
  quantowerId?: string;
  resultNet: number;
  resultR: number | null;
  notes?: string;
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
    | 'position';
  entityIds?: string[];
}
