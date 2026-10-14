-- 022 — Defaults para TODAS as colunas NOT NULL sem default nas tabelas sincronizadas.
--
-- POR QUÊ (recorrente): o app-db v3 faz upsert mandando SÓ os campos definidos no registro
-- (camelToSnake; `undefined` some no JSON). Uma coluna NOT NULL SEM default → o Postgres
-- recebe NULL e o push quebra com 23502. Já aconteceu várias vezes:
--   • 012 corrigiu colunas pontuais; 018 soltou NOT NULL do legado; 020 tentou
--     `ADD COLUMN IF NOT EXISTS accounts.disabled BOOLEAN NOT NULL DEFAULT false` — mas
--     "IF NOT EXISTS" é NO-OP quando a coluna JÁ EXISTE (foi o caso), então ela continuou
--     NOT NULL sem default e o pushAll falhou em `accounts`.
--
-- Esta migration é SISTEMÁTICA e idempotente: varre o schema e, para cada coluna NOT NULL
-- sem default das tabelas sincronizadas, aplica um default por tipo. Assim um campo opcional
-- omitido pelo app nunca mais derruba o sync. Não toca em `user_id` (sempre enviado pelo push)
-- nem nas chaves primárias.

-- 1. Alvo direto do erro atual (explícito e à prova de regressão).
alter table public.accounts alter column disabled set default false;

-- 2. Rede de segurança para TODAS as colunas NOT NULL sem default das tabelas sincronizadas.
do $$
declare
  r record;
  def text;
begin
  for r in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.is_nullable = 'NO'
      and c.column_default is null
      and c.table_name in (
        'accounts','prop_extensions','transactions','positions','trades',
        'payouts','goals','tax_records','snapshots_networth','firm_costs','cards','app_meta'
      )
      and c.column_name <> 'user_id'          -- sempre enviado pelo push
      and c.column_name <> 'id'               -- chave primária (o app sempre envia)
      and not (c.table_name = 'prop_extensions' and c.column_name = 'account_id') -- PK do prop
  loop
    def := case
      when r.data_type in ('text', 'character varying', 'character') then ''''''
      when r.data_type in ('numeric', 'integer', 'bigint', 'smallint', 'double precision', 'real') then '0'
      when r.data_type = 'boolean' then 'false'
      when r.data_type like 'timestamp%' or r.data_type = 'date' then 'now()'
      when r.data_type in ('jsonb', 'json') then '''{}''::jsonb'
      when r.data_type = 'uuid' then 'gen_random_uuid()'
      else null
    end;
    if def is null then
      raise notice '[022] SEM default (tipo %): %.%', r.data_type, r.table_name, r.column_name;
    else
      execute format('alter table public.%I alter column %I set default %s', r.table_name, r.column_name, def);
      raise notice '[022] default % em %.%', def, r.table_name, r.column_name;
    end if;
  end loop;
end $$;
