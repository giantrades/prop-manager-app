-- STAGE 7+ — 004. Cartões como entidade (limite/fechamento/vencimento) + versão da estratégia no trade.
-- Aditivo e idempotente (IF NOT EXISTS): não destrutivo.

CREATE TABLE IF NOT EXISTS cards (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  account_id TEXT,
  currency TEXT NOT NULL DEFAULT 'BRL',
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  closing_day INTEGER,
  due_day INTEGER,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id);

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own cards" ON cards;
DROP POLICY IF EXISTS "Users insert own cards" ON cards;
DROP POLICY IF EXISTS "Users update own cards" ON cards;

CREATE POLICY "Users read own cards" ON cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own cards" ON cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cards" ON cards FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Versão da estratégia no trade (Strategy Versioning).
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy_version TEXT;
