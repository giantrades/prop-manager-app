-- 015 — Repõe as policies de `cards` e `app_meta`.
-- A 014 derrubou TODAS as policies de public (para destravar os ALTERs) e recriou só as
-- 10 tabelas de domínio. Estas duas ficaram com RLS ligada e SEM policy (inacessíveis).
-- Padrão único: auth.uid() = user_id.

do $$
declare t text;
begin
  foreach t in array array['cards','app_meta'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'Users manage own ' || t, t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      'Users manage own ' || t, t
    );
  end loop;
end $$;
