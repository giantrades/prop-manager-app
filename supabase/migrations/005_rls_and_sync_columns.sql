-- STAGE 7+ — 005. Auditoria de RLS + colunas de sync que faltavam.
--
-- Achado da auditoria (#9): `001_init.sql` liga RLS em 10 tabelas do domínio mas
-- **não cria nenhuma policy** — com RLS ligada e sem policy, o usuário autenticado
-- não lê/escreve (só service_role passa). Além disso, vários campos que o app grava
-- (categoria/cartão/parcelas/anexos etc.) não existiam nas tabelas.
--
-- Esta migration é ADITIVA e IDEMPOTENTE: só adiciona policies (drop+create) e
-- colunas (ADD COLUMN IF NOT EXISTS). Nada é removido.
--
-- Rodar: `supabase db push` ou SQL Editor.

-- ---------------------------------------------------------------------------
-- 1. Policies de dono para TODAS as tabelas do domínio (RLS já habilitada em 001).
--    Padrão único: auth.uid() = user_id (leitura e escrita).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  tables text[] := array[
    'accounts','prop_extensions','transactions','trades','positions',
    'payouts','goals','tax_records','snapshots_networth','firm_costs'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on %I', 'Users manage own ' || t, t);
    execute format(
      'create policy %I on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      'Users manage own ' || t, t
    );
  end loop;
end $$;

-- Tabelas criadas depois (002/003/004): garantir DELETE também.
drop policy if exists "Users delete own app_meta" on app_meta;
create policy "Users delete own app_meta" on app_meta for delete using (auth.uid() = user_id);
drop policy if exists "Users delete own cards" on cards;
create policy "Users delete own cards" on cards for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Colunas que o app grava e ainda não existiam (sync falhava/ignorava).
-- ---------------------------------------------------------------------------

-- accounts — vínculo com a firm (cor propaga no app).
alter table accounts add column if not exists firm_id text;

-- transactions — gastos/Mobills (categoria, recorrência, anexos, contas a pagar, cartão, tags).
alter table transactions add column if not exists category text;
alter table transactions add column if not exists recurrence jsonb;
alter table transactions add column if not exists attachments jsonb;
alter table transactions add column if not exists asset jsonb;
alter table transactions add column if not exists paid boolean;
alter table transactions add column if not exists due_date timestamptz;
alter table transactions add column if not exists installments jsonb;
alter table transactions add column if not exists card text;
alter table transactions add column if not exists card_id text;
alter table transactions add column if not exists tags jsonb;

-- trades — MAE/MFE (bridge), execuções/fills, origem da plataforma e tags.
alter table trades add column if not exists executions jsonb;
alter table trades add column if not exists mae numeric;
alter table trades add column if not exists mfe numeric;
alter table trades add column if not exists platform_name text;
alter table trades add column if not exists platform_trade_id text;
alter table trades add column if not exists platform_account_id text;
alter table trades add column if not exists tags jsonb;

-- positions — moeda, renda fixa (accrual) e alertas de preço.
alter table positions add column if not exists currency text;
alter table positions add column if not exists asset_kind text;
alter table positions add column if not exists yield_rate numeric;
alter table positions add column if not exists yield_type text;
alter table positions add column if not exists alerts jsonb;

-- ---------------------------------------------------------------------------
-- 3. Conferência rápida (opcional): listar policies por tabela.
--    select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' order by tablename, policyname;
-- ---------------------------------------------------------------------------
