// src/types/trade.ts
export type Execution = {
  id: string;
  date: string; // ISO date
  entry_time?: string;
  exit_time?: string;
  price: number;
  quantity: number;
  side: 'entry' | 'exit';
};

export type AccountWeight = {
  accountId: string;
  weight: number; // 0..1
};

export type Trade = {
  id: string;
  date: string; // ISO date
  entry_time?: string;
  exit_time?: string;
  asset: string;
  strategyId?: string | null;
  marketCategory?: 'Futures'|'Forex'|'Cripto'|'Personal'|string;
  accounts: AccountWeight[];
  direction: 'Long' | 'Short';
  tf_signal?: string;
  volume?: number;
  entry_price?: number;
  exit_price?: number;
  stop_loss_price?: number;
  profit_target_price?: number;
  orders_activated?: number;
  executions: Execution[];
  risk_per_R?: number;
  commission?: number;
  fees?: number;
  swap?: number;
  slippage?: number;
  tags: Record<string, boolean>;
  notes?: string;
  result_gross?: number;
  result_net?: number;
  result_R?: number;
  entryVwap?: number;
  exitVwap?: number;
  createdAt?: string;
  updatedAt?: string;
  
};

export interface EnrichedTrade extends Trade {
  // Campos enriquecidos adicionados em TradesPage.tsx
  accountType?: string; // Adicionado do primaryAccount?.type
  accountName?: string; // Adicionado do primaryAccount?.name
  account?: any; // O objeto Account completo
  accountId?: string; // O ID da conta principal (opcional, mas útil)
  strategyName?: string;
  
}