-- Run this in your Supabase SQL editor (https://app.supabase.com → SQL Editor)
-- Creates the deleted_trades table so deletion sync works across all devices

CREATE TABLE IF NOT EXISTS deleted_trades (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_trade_id TEXT NOT NULL,
  position_id TEXT,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (platform_trade_id)
);

ALTER TABLE deleted_trades ENABLE ROW LEVEL SECURITY;

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

-- Enable realtime so pulls get immediate updates
ALTER PUBLICATION supabase_realtime ADD TABLE deleted_trades;