-- 011 — Limpa o "legado" das tabelas de domínio.
--
-- Contexto: este projeto Supabase era usado pelo app ANTIGO; ele deixou linhas nas
-- nossas tabelas (ex.: ~106 trades sem conta), que apareciam no celular após o pull e
-- faziam os aparelhos divergirem. O PC é a fonte da verdade.
--
-- Depois de rodar esta migration, use no PC: Settings → Avançado → "Reenviar tudo para
-- a nuvem (reparar)". Aí o celular puxa exatamente o que existe no PC.
--
-- IMPORTANTE: apaga TODAS as linhas destas tabelas (projeto de usuário único).
do $$
declare
  t text;
begin
  foreach t in array array[
    'trades','accounts','prop_extensions','transactions','positions',
    'payouts','goals','tax_records','snapshots_networth','firm_costs','cards'
  ] loop
    begin
      execute format('delete from public.%I', t);
    exception when others then null; -- tabela ausente: segue
    end;
  end loop;
end $$;
