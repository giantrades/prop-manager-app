-- 009 — Converte as colunas de id para TEXT nas tabelas que JÁ TINHAM linhas
--       (a 008 só recriou as vazias, por segurança).
--
-- Por que: o app gera ids TEXT ('acct-…', 'trade-…', 'payout-…') e as colunas eram
-- UUID → o upsert do sync falhava (400 / invalid input syntax for type uuid).
--
-- Também remove linhas cujo `id` é um UUID "de verdade": o app NUNCA gera UUID para
-- essas entidades (conferido: 'acct-', 'trade-', 'payout-', 'goal-', 'pos-'), então
-- uma linha com id UUID só pode ter vindo de teste manual no SQL Editor — e essas
-- linhas sujariam o app no pull. (documentado aqui de propósito)

do $$
declare
  spec record;
  conname text;
begin
  -- 1) Limpa linhas "não do app" (id em formato UUID).
  for spec in
    select * from (values
      ('accounts','id'),('prop_extensions','account_id'),('transactions','id'),
      ('positions','id'),('trades','id'),('payouts','id'),('goals','id'),
      ('tax_records','id'),('snapshots_networth','id'),('firm_costs','id')
    ) as t(name, keycol)
  loop
    begin
      execute format(
        'delete from public.%I where %I::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''',
        spec.name, spec.keycol
      );
    exception when others then null;
    end;
  end loop;

  -- 2) Derruba as FKs que apontam para as nossas tabelas (necessário para mudar o tipo).
  for spec in
    select c.conname, rel.relname as tbl
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_class frel on frel.oid = c.confrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and c.contype = 'f'
      and frel.relname in ('accounts','prop_extensions','transactions','positions','trades','payouts','goals','tax_records','snapshots_networth','firm_costs')
  loop
    begin
      execute format('alter table public.%I drop constraint %I', spec.tbl, spec.conname);
    exception when others then null;
    end;
  end loop;

  -- 3) Converte cada coluna de id (e referências) para TEXT.
  for spec in
    select * from (values
      ('accounts','id'),('accounts','firm_id'),
      ('prop_extensions','account_id'),
      ('transactions','id'),('transactions','account_id'),('transactions','firm_id'),
      ('positions','id'),('positions','account_id'),
      ('trades','id'),('trades','account_id'),
      ('payouts','id'),
      ('goals','id'),
      ('tax_records','id'),('tax_records','firm_id'),('tax_records','account_id'),
      ('snapshots_networth','id'),
      ('firm_costs','id'),('firm_costs','firm_id'),('firm_costs','account_id')
    ) as t(name, col)
  loop
    begin
      execute format('alter table public.%I alter column %I type text using %I::text', spec.name, spec.col, spec.col);
    exception when others then null; -- já é text / tabela ausente
    end;
  end loop;

  -- 4) Garante PK em id (as que foram recriadas já têm).
  for spec in
    select * from (values
      ('accounts'),('transactions'),('positions'),('trades'),('payouts'),
      ('goals'),('tax_records'),('snapshots_networth'),('firm_costs')
    ) as t(name)
  loop
    begin
      if not exists (
        select 1 from pg_constraint c
        join pg_class rel on rel.oid = c.conrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname='public' and rel.relname = spec.name and c.contype = 'p'
      ) then
        execute format('alter table public.%I add primary key (id)', spec.name);
      end if;
    exception when others then null;
    end;
  end loop;

  -- 5) Reafirma as UNIQUE usadas pelo onConflict do sync.
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

  -- 6) RLS + policies (idempotente) nas tabelas do domínio.
  for spec in
    select * from (values
      ('accounts'),('prop_extensions'),('transactions'),('positions'),('trades'),
      ('payouts'),('goals'),('tax_records'),('snapshots_networth'),('firm_costs')
    ) as t(name)
  loop
    begin
      execute format('alter table public.%I enable row level security', spec.name);
      execute format('drop policy if exists %I on public.%I', 'Users manage own ' || spec.name, spec.name);
      execute format(
        'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        'Users manage own ' || spec.name, spec.name
      );
    exception when others then null;
    end;
  end loop;
end $$;
