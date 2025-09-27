// src/types/trade.ts
export type Execution = {
  id: string;
  date: string; // ISO date
  time?: string; // hh:mm
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
  time?: string;
  asset: string;
  strategyId?: string | null;
  marketCategory?: 'Futures'|'Forex'|'Cripto'|'Personal'|string;
  accounts: AccountWeight[];
  direction: 'Long' | 'Short';
  tf_signal?: string;
  volume?: number;
  entry_price?: number;
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
