-- STAGE 7+ — app_meta. Tabela de sincronização das chaves de `meta` que fazem sentido
-- entre devices (whitelist no código: `firms:*` e `bridge:connectionFirms`).
-- O restante do `meta` continua local-only (cursores de sync, conflitos, etc.).
--
-- Rodar no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS app_meta (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_app_meta_user ON app_meta(user_id);

ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own app_meta" ON app_meta;
DROP POLICY IF EXISTS "Users insert own app_meta" ON app_meta;
DROP POLICY IF EXISTS "Users update own app_meta" ON app_meta;

CREATE POLICY "Users read own app_meta"
  ON app_meta FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own app_meta"
  ON app_meta FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own app_meta"
  ON app_meta FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
