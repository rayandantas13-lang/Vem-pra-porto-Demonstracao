-- Visão de consulta sem substituir os vouchers operacionais nem seus dados.
-- security_invoker mantém as políticas RLS da tabela original em vigor.
create view public.vpp_vouchers_tabela with (security_invoker = true) as
select
  row_number() over (order by data->>'criadoEm', id) as numero,
  data->>'codigo' as codigo,
  array_to_string(array(select jsonb_array_elements_text(case when jsonb_typeof(data->'clientes') = 'array' then data->'clientes' else '[]'::jsonb end)), ', ') as clientes,
  data->>'pessoas' as pessoas,
  data->>'hotel' as hotel,
  data->>'telefone' as telefone,
  (select string_agg(p->>'nome', ' + ' order by ord) from jsonb_array_elements(case when jsonb_typeof(data->'passeios') = 'array' then data->'passeios' else '[]'::jsonb end) with ordinality as passeios(p, ord)) as passeios,
  (select string_agg(distinct d, ' / ' order by d) from jsonb_array_elements(case when jsonb_typeof(data->'passeios') = 'array' then data->'passeios' else '[]'::jsonb end) as passeio(p) cross join lateral (values (p->>'data'), (p->>'dataVolta')) as datas(d) where coalesce(d, '') <> '') as datas,
  data->>'total' as total,
  data->>'entrada' as entrada,
  -- Saldo histórico original, não um cálculo nem uma correção automática.
  data->>'aReceber' as a_receber,
  data->>'status' as status
from public.vpp_vouchers;

revoke all on public.vpp_vouchers_tabela from public, anon, authenticated;
grant select on public.vpp_vouchers_tabela to authenticated;
