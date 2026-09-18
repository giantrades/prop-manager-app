-- 012 — Defaults nas colunas que o app pode omitir.
--
-- Por quê: algumas tabelas ainda têm colunas NOT NULL SEM default (do 001). Se o registro
-- local não trouxer o campo (ex.: prop_extensions.max_dd, positions.avg_price), o upsert
-- do sync falha com 400 (null value in column ... violates not-null constraint).
-- Aqui damos default sensato a essas colunas — aditivo e idempotente.

-- prop_extensions
alter table prop_extensions alter column nominal_size set default 0;
alter table prop_extensions alter column target set default 0;
alter table prop_extensions alter column max_dd set default 0;
alter table prop_extensions alter column trailing_dd set default 0;
alter table prop_extensions alter column daily_dd set default 0;
alter table prop_extensions alter column consistency_pct set default 0;
alter table prop_extensions alter column min_days set default 0;
alter table prop_extensions alter column phase set default 'challenge';

-- positions
alter table positions alter column qty set default 0;
alter table positions alter column avg_price set default 0;

-- transactions
alter table transactions alter column date set default now();
alter table transactions alter column currency set default 'BRL';
alter table transactions alter column kind set default '';
alter table transactions alter column amount set default 0;

-- trades
alter table trades alter column entry_datetime set default now();
alter table trades alter column direction set default 'long';
alter table trades alter column symbol set default '';

-- goals
alter table goals alter column target_value set default 0;
alter table goals alter column kind set default '';

-- payouts
alter table payouts alter column method set default 'Wise';
-- account_ids: o tipo é corrigido na 013 (é pg uuid[] no remoto, app manda TEXT).
alter table payouts alter column split_by_account set default '{}'::jsonb;
alter table payouts alter column attachments set default '{}'::jsonb;
alter table payouts alter column gross set default 0;
alter table payouts alter column fee set default 0;
alter table payouts alter column net set default 0;

-- snapshots / firm_costs / tax_records
alter table snapshots_networth alter column net_worth set default 0;
alter table snapshots_networth alter column total_accounts set default 0;
alter table snapshots_networth alter column total_positions set default 0;
alter table snapshots_networth alter column snapshot_at set default now();
alter table firm_costs alter column amount set default 0;
alter table firm_costs alter column date set default now();
alter table tax_records alter column base_amount set default 0;
alter table tax_records alter column tax_amount set default 0;
alter table tax_records alter column rate set default 0;
alter table tax_records alter column date set default now();
