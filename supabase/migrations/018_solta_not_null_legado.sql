-- 018 — Solta NOT NULL das colunas que o APP NÃO envia (sobras do schema legado).
--
-- Erro real: `pushAll accounts: null value in column "type" of relation "accounts"
-- violates not-null constraint (23502)` — a tabela `accounts` tem colunas legadas
-- (`type`, `status`, `current_funding`, `date_created`, …) que o app novo não conhece e
-- que exigiam valor. O upsert então falhava.
--
-- Solução genérica: para as tabelas do domínio, remover NOT NULL de TODAS as colunas
-- exceto `user_id` (auth) e a chave primária. Nenhum dado/tipo é alterado — só deixa de
-- exigir valor em coluna que o app não manda.

do $$
declare
  t text;
  c record;
  tables text[] := array[
    'accounts','prop_extensions','transactions','positions','trades',
    'payouts','goals','tax_records','snapshots_networth','firm_costs','cards','app_meta'
  ];
begin
  foreach t in array tables loop
    for c in
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name <> 'user_id'
        and is_nullable = 'NO'
        -- não mexe em coluna de PRIMARY KEY (Postgres recusa: 42P16)
        and column_name not in (
          select a.attname
          from pg_index i
          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
          where i.indrelid = format('public.%I', t)::regclass and i.indisprimary
        )
    loop
      execute format('alter table public.%I alter column %I drop not null', t, c.column_name);
    end loop;
  end loop;
end $$;
