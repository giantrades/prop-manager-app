-- 008 — IDs do app são TEXT (não UUID) + schema remoto alinhado ao app.
--
-- CAUSA DO SYNC FALHAR (400 Bad Request no POST /payouts):
--   O app gera ids como 'acct-mu5e3csr-dtvf', 'trade-…', 'payout-…' (TEXT), mas as
--   tabelas do Supabase declaravam `id UUID PRIMARY KEY`. O Postgres rejeita com
--   22P02 (invalid input syntax for type uuid) → o upsert falhava e NADA sincronizava.
--   (`cards` já usava TEXT, por isso ele era o único sem esse problema.)
--
-- Esta migration: para cada tabela do domínio, se ela estiver VAZIA, recria com o
-- schema do app (ids TEXT, colunas do app, RLS). Se tiver linhas, NÃO toca.
-- Idempotente e não destrutivo para dados existentes.

do $$
declare
  spec record;
  n bigint;
begin
  for spec in
    select * from (values
      ('accounts',
        'id text primary key, kind text not null default ''prop'', name text not null default '''', currency text not null default ''USD'', institution text, hidden boolean not null default false, default_weight numeric not null default 1, copy_group text, copy_multiplier numeric, lot_step numeric, platform_account_id text, platform_name text, last_platform_sync timestamptz, platform_balance numeric, platform_balance_at timestamptz, firm_id text, updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1'),
      ('prop_extensions',
        'account_id text primary key, nominal_size numeric not null default 0, challenge_cost numeric not null default 0, phase text not null default ''challenge'', target numeric not null default 0, max_dd numeric not null default 0, trailing_dd numeric not null default 0, daily_dd numeric not null default 0, consistency_pct numeric not null default 0, min_days integer not null default 0, payout_rules jsonb not null default ''{}''::jsonb, profit_split numeric not null default 0.8, payout_frequency text not null default ''monthly'', quantower_account_id text, last_sync timestamptz, timezone_offset_minutes integer, updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1'),
      ('transactions',
        'id text primary key, account_id text, firm_id text, kind text not null default '''', amount numeric not null default 0, currency text not null default ''BRL'', rate numeric, rate_timestamp timestamptz, date timestamptz not null default now(), ref jsonb, note text, category text, recurrence jsonb, attachments jsonb, asset jsonb, paid boolean, due_date timestamptz, installments jsonb, card text, card_id text, tags jsonb, updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1'),
      ('positions',
        'id text primary key, account_id text, symbol text not null default '''', qty numeric not null default 0, avg_price numeric not null default 0, last_mark_price numeric, last_mark_at timestamptz, currency text, asset_kind text, yield_rate numeric, yield_type text, alerts jsonb, updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1, unique (user_id, account_id, symbol)'),
      ('trades',
        'id text primary key, account_id text, accounts jsonb, strategy_id text, strategy_version text, symbol text not null default '''', direction text not null default ''long'', entry_datetime timestamptz not null default now(), exit_datetime timestamptz, qty numeric not null default 0, entry_price numeric not null default 0, exit_price numeric, commission numeric not null default 0, swap numeric not null default 0, rebate numeric not null default 0, fees numeric not null default 0, slippage numeric, stop_price numeric, take_price numeric, multiplier numeric, source text not null default ''manual'', quantower_id text, result_net numeric not null default 0, result_r numeric, notes text, executions jsonb, mae numeric, mfe numeric, platform_name text, platform_trade_id text, platform_account_id text, tags jsonb, updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1, unique (user_id, quantower_id)'),
      ('payouts',
        'id text primary key, account_ids jsonb not null default ''[]''::jsonb, gross numeric not null default 0, fee numeric not null default 0, net numeric not null default 0, split_by_account jsonb not null default ''{}''::jsonb, status text not null default ''Pending'', method text not null default ''Wise'', attachments jsonb not null default ''{}''::jsonb, date timestamptz, updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1'),
      ('goals',
        'id text primary key, kind text not null default '''', target_value numeric not null default 0, current_derived numeric not null default 0, deadline timestamptz, window_type text, name text, updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1'),
      ('tax_records',
        'id text primary key, firm_id text, account_id text, kind text not null default '''', base_amount numeric not null default 0, tax_amount numeric not null default 0, rate numeric not null default 0, rate_timestamp timestamptz, date timestamptz not null default now(), status text not null default ''pending'', note text, updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1'),
      ('snapshots_networth',
        'id text primary key, net_worth numeric not null default 0, total_accounts numeric not null default 0, total_positions numeric not null default 0, liabilities numeric not null default 0, snapshot_at timestamptz not null default now(), updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1'),
      ('firm_costs',
        'id text primary key, firm_id text, account_id text, kind text not null default '''', amount numeric not null default 0, date timestamptz not null default now(), updated_at timestamptz not null default now(), device_id text not null default '''', version integer not null default 1')
    ) as t(name, cols)
  loop
    -- Só recria se a tabela não existir OU estiver VAZIA (protege dados).
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = spec.name) then
      execute format('select count(*) from public.%I', spec.name) into n;
      if n = 0 then
        execute format('drop table public.%I cascade', spec.name);
      else
        continue; -- tem dados: não toca
      end if;
    end if;

    execute format(
      'create table public.%I (user_id uuid not null references auth.users(id) on delete cascade, %s)',
      spec.name, spec.cols
    );
    execute format('create index if not exists %I on public.%I (user_id)', 'idx_' || spec.name || '_user', spec.name);
    execute format('alter table public.%I enable row level security', spec.name);
    execute format('drop policy if exists %I on public.%I', 'Users manage own ' || spec.name, spec.name);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      'Users manage own ' || spec.name, spec.name
    );
  end loop;
end $$;
