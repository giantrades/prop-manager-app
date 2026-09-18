-- 014 — Converte para TEXT TODAS as colunas de referência (firm_id/account_id/...).
--
-- A 009 tentou isso, mas engolia erros (try/catch): as policies legadas dependiam das
-- colunas e o ALTER falhava silenciosamente. Resultado: `accounts.firm_id` continuou
-- uuid e o upsert do sync passou a falhar com
--   invalid input syntax for type uuid: "firm-mffu" (22P02)
--
-- Aqui: removemos TODAS as policies de public (as nossas são recriadas no fim), soltamos
-- as FKs e então convertemos — SEM engolir erro, para qualquer problema aparecer no push.

-- 1) Policies (inclusive legadas do app antigo, tipo `own_trade_tags`).
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 2) FKs de public (o app não depende de FK para integridade).
do $$
declare r record;
begin
  for r in
    select c.conname, rel.relname as tbl
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and c.contype = 'f'
  loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- 3) Conversões (sem try/catch: erro aparece).
alter table accounts         alter column id type text using id::text;
alter table accounts         alter column firm_id type text using firm_id::text;
alter table prop_extensions  alter column account_id type text using account_id::text;
alter table transactions     alter column id type text using id::text;
alter table transactions     alter column account_id type text using account_id::text;
alter table transactions     alter column firm_id type text using firm_id::text;
alter table positions        alter column id type text using id::text;
alter table positions        alter column account_id type text using account_id::text;
alter table trades           alter column id type text using id::text;
alter table trades           alter column account_id type text using account_id::text;
alter table payouts          alter column id type text using id::text;
alter table goals            alter column id type text using id::text;
alter table tax_records      alter column id type text using id::text;
alter table tax_records      alter column account_id type text using account_id::text;
alter table tax_records      alter column firm_id type text using firm_id::text;
alter table snapshots_networth alter column id type text using id::text;
alter table firm_costs       alter column id type text using id::text;
alter table firm_costs       alter column account_id type text using account_id::text;
alter table firm_costs       alter column firm_id type text using firm_id::text;

-- 4) UNIQUE usadas pelo onConflict do sync.
do $$
begin
  begin
    if not exists (
      select 1 from pg_constraint c join pg_class rel on rel.oid = c.conrelid
      where rel.relname = 'trades' and c.contype = 'u' and pg_get_constraintdef(c.oid) like '%quantower_id%'
    ) then
      alter table public.trades add constraint trades_user_quantower_key unique (user_id, quantower_id);
    end if;
  exception when others then null;
  end;
  begin
    if not exists (
      select 1 from pg_constraint c join pg_class rel on rel.oid = c.conrelid
      where rel.relname = 'positions' and c.contype = 'u' and pg_get_constraintdef(c.oid) like '%symbol%'
    ) then
      alter table public.positions add constraint positions_user_account_symbol_key unique (user_id, account_id, symbol);
    end if;
  exception when others then null;
  end;
end $$;

-- 5) RLS + policies nossas (idempotente).
do $$
declare t text;
begin
  foreach t in array array['accounts','prop_extensions','transactions','positions','trades',
                           'payouts','goals','tax_records','snapshots_networth','firm_costs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'Users manage own ' || t, t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      'Users manage own ' || t, t
    );
  end loop;
end $$;
