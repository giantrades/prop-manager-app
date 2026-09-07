-- STAGE 2 — 001_init.sql. Schema do Sync Engine (novo app-db v3 -> Supabase).
-- Borda Supabase usa snake_case (marcado // SUPABASE BOUNDARY no código).
-- Correções do audit ULTRA:
--   * deleted_trades com UNIQUE(user_id, platform_trade_id) (antes era global, sem user_id)
--   * RLS em todas as tabelas (antes só em algumas)
--   * `.range()` no pull (ver 03-SYNC_PROTOCOL.md)
--
-- Rodar no SQL Editor do Supabase.

-- ---------------------------------------------------------------------------
-- 1. deleted_trades — UNIQUE por usuário (não global) + RLS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS deleted_trades;
CREATE TABLE deleted_trades (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_trade_id TEXT NOT NULL,
  position_id TEXT,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, platform_trade_id)
);

ALTER TABLE deleted_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own deleted trades" ON deleted_trades;
DROP POLICY IF EXISTS "Users can insert own deleted trades" ON deleted_trades;
DROP POLICY IF EXISTS "Users can upsert own deleted trades" ON deleted_trades;

CREATE POLICY "Users can read own deleted trades"
  ON deleted_trades FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own deleted trades"
  ON deleted_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can upsert own deleted trades"
  ON deleted_trades FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Tabelas do novo schema (app-db v3) — todas com user_id + RLS.
--    Convention: camelCase no IndexedDB; snake_case aqui (borda Supabase).
-- ---------------------------------------------------------------------------

-- accounts
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  institution TEXT,
  hidden BOOLEAN NOT NULL DEFAULT false,
  default_weight NUMERIC NOT NULL DEFAULT 1,
  copy_group TEXT,
  copy_multiplier NUMERIC,
  lot_step NUMERIC,
  platform_account_id TEXT,
  platform_name TEXT,
  last_platform_sync TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- prop_extensions
CREATE TABLE IF NOT EXISTS prop_extensions (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nominal_size NUMERIC NOT NULL,
  challenge_cost NUMERIC NOT NULL DEFAULT 0,
  phase TEXT NOT NULL,
  target NUMERIC NOT NULL,
  max_dd NUMERIC NOT NULL,
  trailing_dd NUMERIC NOT NULL,
  daily_dd NUMERIC NOT NULL,
  consistency_pct NUMERIC NOT NULL,
  min_days INTEGER NOT NULL,
  payout_rules JSONB NOT NULL,
  profit_split NUMERIC NOT NULL DEFAULT 0.8,
  payout_frequency TEXT NOT NULL DEFAULT 'monthly',
  quantower_account_id TEXT,
  last_sync TIMESTAMPTZ,
  timezone_offset_minutes INTEGER,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE prop_extensions ENABLE ROW LEVEL SECURITY;

-- transactions (ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  firm_id UUID,
  kind TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  rate NUMERIC,
  rate_timestamp TIMESTAMPTZ,
  date TIMESTAMPTZ NOT NULL,
  ref JSONB,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_kind ON transactions(user_id, kind);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- trades
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID,
  accounts JSONB,
  strategy_id TEXT,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry_datetime TIMESTAMPTZ NOT NULL,
  exit_datetime TIMESTAMPTZ,
  qty NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  commission NUMERIC NOT NULL DEFAULT 0,
  swap NUMERIC NOT NULL DEFAULT 0,
  rebate NUMERIC NOT NULL DEFAULT 0,
  fees NUMERIC NOT NULL DEFAULT 0,
  slippage NUMERIC,
  stop_price NUMERIC,
  multiplier NUMERIC,
  source TEXT NOT NULL DEFAULT 'manual',
  quantower_id TEXT,
  result_net NUMERIC NOT NULL DEFAULT 0,
  result_r NUMERIC,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user_id, quantower_id)
);
CREATE INDEX IF NOT EXISTS idx_trades_user_entry ON trades(user_id, entry_datetime);
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- positions
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  avg_price NUMERIC NOT NULL,
  last_mark_price NUMERIC,
  last_mark_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user_id, account_id, symbol)
);
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- payouts
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_ids JSONB NOT NULL,
  gross NUMERIC NOT NULL,
  fee NUMERIC NOT NULL,
  net NUMERIC NOT NULL,
  split_by_account JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  method TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '{}',
  date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- goals
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  current_derived NUMERIC NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ,
  window_type TEXT,
  name TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- tax_records
CREATE TABLE IF NOT EXISTS tax_records (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id UUID,
  account_id UUID,
  kind TEXT NOT NULL,
  base_amount NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL,
  rate NUMERIC NOT NULL,
  rate_timestamp TIMESTAMPTZ,
  date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE tax_records ENABLE ROW LEVEL SECURITY;

-- snapshots_networth
CREATE TABLE IF NOT EXISTS snapshots_networth (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  net_worth NUMERIC NOT NULL,
  total_accounts NUMERIC NOT NULL,
  total_positions NUMERIC NOT NULL,
  liabilities NUMERIC NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE snapshots_networth ENABLE ROW LEVEL SECURITY;

-- firm_costs (cache derivado)
CREATE TABLE IF NOT EXISTS firm_costs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL,
  account_id UUID,
  kind TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE firm_costs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Realtime (só quando visível — ver 03-SYNC_PROTOCOL.md)
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE deleted_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
