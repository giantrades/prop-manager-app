-- 016 — Definitivo: TODA coluna uuid (exceto `user_id`, que é o login) vira TEXT.
--
-- Motivo: o app usa ids TEXT em tudo ('acct-…', 'trade-…', 'payout-…', 'firm-mffu', …) e
-- o remoto tinha várias colunas uuid espalhadas → cada uma quebrava o upsert do sync com
-- 22P02. Em vez de caçar uma por uma, esta migration varre information_schema e converte.
--
-- Também recria as policies de dono (para QUALQUER tabela public com user_id), garante as
-- UNIQUE do onConflict e deixa uma tabela `_sync_audit` com o retrato do schema (eu leio
-- via API para conferir). Nada de try/catch: se algo falhar, o push mostra o erro.

-- 1) Solta policies e FKs de public (nossas são recriadas no fim).
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
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

-- 2) Converte TODAS as colunas uuid (menos user_id) para text.
do $$
declare r record;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.data_type = 'uuid'
      and c.column_name <> 'user_id'
      and c.table_name <> '_sync_audit'
  loop
    execute format(
      'alter table public.%I alter column %I type text using %I::text',
      r.table_name, r.column_name, r.column_name
    );
  end loop;
end $$;

-- 3) Policies de dono para toda tabela public com user_id.
do $$
declare r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.column_name = 'user_id'
      and c.table_name <> '_sync_audit'
    group by c.table_name
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('drop policy if exists %I on public.%I', 'Users manage own ' || r.table_name, r.table_name);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      'Users manage own ' || r.table_name, r.table_name
    );
  end loop;
end $$;

-- 4) UNIQUE usadas pelo onConflict.
do $$
begin
  begin
    if not exists (select 1 from pg_constraint c join pg_class rel on rel.oid = c.conrelid
      where rel.relname = 'trades' and c.contype = 'u' and pg_get_constraintdef(c.oid) like '%quantower_id%') then
      alter table public.trades add constraint trades_user_quantower_key unique (user_id, quantower_id);
    end if;
  exception when others then null; end;
  begin
    if not exists (select 1 from pg_constraint c join pg_class rel on rel.oid = c.conrelid
      where rel.relname = 'positions' and c.contype = 'u' and pg_get_constraintdef(c.oid) like '%symbol%') then
      alter table public.positions add constraint positions_user_account_symbol_key unique (user_id, account_id, symbol);
    end if;
  exception when others then null; end;
end $$;

-- 5) Auditoria do schema (eu leio via API para conferir; removo depois).
drop table if exists public._sync_audit;
create table public._sync_audit (
  table_name text,
  column_name text,
  data_type text
);
insert into public._sync_audit (table_name, column_name, data_type)
select c.table_name, c.column_name, c.data_type
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema and t.table_name = c.table_name
where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by c.table_name, c.ordinal_position;
alter table public._sync_audit enable row level security;
create policy "audit read" on public._sync_audit for select using (true);
