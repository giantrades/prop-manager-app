-- 007 — Corrige o schema remoto que estava INCOMPLETO em 4 tabelas.
--
-- ACHADO (diagnóstico via PostgREST): as tabelas `trades`, `accounts`, `goals` e
-- `payouts` no projeto remoto NÃO tinham colunas centrais que o app grava (ex.:
-- trades.symbol/qty/version/updated_at/quantower_id; accounts.kind/hidden/...).
-- Com isso o `upsert` do sync falhava ("column ... does not exist") e NADA subia
-- para a nuvem — por isso o celular não via os dados do PC.
--
-- Esta migration é ADITIVA e IDEMPOTENTE (ADD COLUMN IF NOT EXISTS) e reafirma as
-- policies de RLS e as chaves usadas pelo `onConflict` do sync.

-- ---------------------------------------------------------------------------
-- 1. accounts
-- ---------------------------------------------------------------------------
alter table accounts add column if not exists kind text not null default 'prop';
alter table accounts add column if not exists institution text;
alter table accounts add column if not exists hidden boolean not null default false;
alter table accounts add column if not exists default_weight numeric not null default 1;
alter table accounts add column if not exists copy_group text;
alter table accounts add column if not exists copy_multiplier numeric;
alter table accounts add column if not exists lot_step numeric;
alter table accounts add column if not exists updated_at timestamptz not null default now();
alter table accounts add column if not exists device_id text not null default '';
alter table accounts add column if not exists version integer not null default 1;
alter table accounts add column if not exists platform_balance numeric;
alter table accounts add column if not exists platform_balance_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. trades
-- ---------------------------------------------------------------------------
alter table trades add column if not exists accounts jsonb;
alter table trades add column if not exists symbol text not null default '';
alter table trades add column if not exists qty numeric not null default 0;
alter table trades add column if not exists commission numeric not null default 0;
alter table trades add column if not exists swap numeric not null default 0;
alter table trades add column if not exists rebate numeric not null default 0;
alter table trades add column if not exists fees numeric not null default 0;
alter table trades add column if not exists slippage numeric;
alter table trades add column if not exists stop_price numeric;
alter table trades add column if not exists multiplier numeric;
alter table trades add column if not exists quantower_id text;
alter table trades add column if not exists result_r numeric;
alter table trades add column if not exists updated_at timestamptz not null default now();
alter table trades add column if not exists device_id text not null default '';
alter table trades add column if not exists version integer not null default 1;

-- ---------------------------------------------------------------------------
-- 3. goals
-- ---------------------------------------------------------------------------
alter table goals add column if not exists kind text not null default '';
alter table goals add column if not exists current_derived numeric not null default 0;
alter table goals add column if not exists deadline timestamptz;
alter table goals add column if not exists window_type text;
alter table goals add column if not exists name text;
alter table goals add column if not exists device_id text not null default '';
alter table goals add column if not exists version integer not null default 1;

-- ---------------------------------------------------------------------------
-- 4. payouts
-- ---------------------------------------------------------------------------
alter table payouts add column if not exists gross numeric not null default 0;
alter table payouts add column if not exists net numeric not null default 0;
alter table payouts add column if not exists date timestamptz;
alter table payouts add column if not exists updated_at timestamptz not null default now();
alter table payouts add column if not exists device_id text not null default '';
alter table payouts add column if not exists version integer not null default 1;

-- ---------------------------------------------------------------------------
-- 5. RLS: reafirma as policies de dono (idempotente) — sem elas nem logado lê/escreve.
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
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', 'Users manage own ' || t, t);
    execute format(
      'create policy %I on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      'Users manage own ' || t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Chaves usadas pelo `onConflict` do sync.
--    app_meta/cards usam (user_id, id); o resto usa (id) ou uma UNIQUE própria.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  -- PK em `id` nas tabelas de id simples.
  foreach t in array array[
    'accounts','trades','goals','payouts','transactions','tax_records',
    'snapshots_networth','firm_costs','positions','prop_extensions'
  ] loop
    begin
      if not exists (
        select 1
        from pg_constraint c
        join pg_class rel on rel.oid = c.conrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and rel.relname = t and c.contype = 'p'
      ) then
        execute format('alter table public.%I add primary key (%s)', t,
          case when t in ('prop_extensions') then 'account_id' else 'id' end);
      end if;
    exception when others then null;
    end;
  end loop;

  -- UNIQUE necessárias para o upsert por conflito.
  begin
    if not exists (
      select 1 from pg_constraint c join pg_class rel on rel.oid = c.conrelid
      where rel.relname = 'trades' and c.contype = 'u'
        and pg_get_constraintdef(c.oid) like '%quantower_id%'
    ) then
      alter table public.trades add constraint trades_user_quantower_key unique (user_id, quantower_id);
    end if;
  exception when others then null;
  end;
  begin
    if not exists (
      select 1 from pg_constraint c join pg_class rel on rel.oid = c.conrelid
      where rel.relname = 'positions' and c.contype = 'u'
        and pg_get_constraintdef(c.oid) like '%symbol%'
    ) then
      alter table public.positions add constraint positions_user_account_symbol_key unique (user_id, account_id, symbol);
    end if;
  exception when others then null;
  end;
end $$;

-- 7. Conferência rápida (rodar manualmente se quiser):
--    select table_name, column_name from information_schema.columns
--    where table_schema = 'public' and table_name in ('trades','accounts','goals','payouts')
--    order by table_name, ordinal_position;
