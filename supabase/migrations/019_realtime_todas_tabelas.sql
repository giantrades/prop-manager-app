-- 019 — Habilita Realtime (postgres_changes) para TODAS as tabelas do app.
--
-- Antes só `trades`/`transactions` estavam assinadas e publicadas, então uma mudança
-- feita no celular (conta, prop_extension, meta/categorias, payout, goal…) não aparecia
-- no PC até recarregar. O app agora assina todas as tabelas; aqui garantimos que elas
-- estão na publicação `supabase_realtime`.
--
-- Idempotente: ignora "já é membro" (42710) e publicação ausente (42704).

do $$
declare
  t text;
  tabelas text[] := array[
    'accounts','prop_extensions','transactions','positions','trades','payouts',
    'goals','tax_records','snapshots_networth','firm_costs','cards','app_meta'
  ];
begin
  foreach t in array tabelas loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- já publicada
      when undefined_object then null;   -- sem publicação supabase_realtime
    end;
  end loop;
end $$;

-- Leitura consistente do registro antigo em UPDATE/DELETE (o app só usa o evento como
-- gatilho de re-pull, mas FULL evita payload incompleto em alguns clientes).
do $$
declare
  t text;
  tabelas text[] := array[
    'accounts','prop_extensions','transactions','positions','trades','payouts',
    'goals','tax_records','snapshots_networth','firm_costs','cards','app_meta'
  ];
begin
  foreach t in array tabelas loop
    begin
      execute format('alter table public.%I replica identity full', t);
    exception when others then null;
    end;
  end loop;
end $$;
