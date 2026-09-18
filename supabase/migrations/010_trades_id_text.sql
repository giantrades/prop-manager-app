-- 010 — trades.id para TEXT.
-- A 009 engoliu o erro: havia uma POLICY legada (`own_trade_tags` na tabela `trade_tags`,
-- do app antigo) que referencia `trades.id` — e o Postgres não deixa mudar o tipo de
-- uma coluna usada em policy. Aqui removemos as policies legadas que dependem das nossas
-- tabelas (as nossas são re-criadas logo em seguida) e então convertemos.

do $$
declare
  r record;
  refs text[] := array['trades','accounts','prop_extensions','transactions','positions',
                       'payouts','goals','tax_records','snapshots_networth','firm_costs'];
begin
  for r in
    select schemaname, tablename, policyname, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
    from pg_policies
    where schemaname = 'public'
  loop
    if r.tablename <> all(refs) and (
      r.qual ~* '\m(trades|accounts|prop_extensions|transactions|positions|payouts|goals|tax_records|snapshots_networth|firm_costs)\M'
      or r.with_check ~* '\m(trades|accounts|prop_extensions|transactions|positions|payouts|goals|tax_records|snapshots_networth|firm_costs)\M'
    ) then
      execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    end if;
  end loop;
end $$;

alter table public.trades alter column id type text using id::text;

-- Reafirma as nossas policies (idempotente).
do $$
declare t text;
begin
  foreach t in array array['accounts','prop_extensions','transactions','positions','trades',
                           'payouts','goals','tax_records','snapshots_networth','firm_costs'] loop
    begin
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'Users manage own ' || t, t);
      execute format(
        'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        'Users manage own ' || t, t
      );
    exception when others then null;
    end;
  end loop;
end $$;
