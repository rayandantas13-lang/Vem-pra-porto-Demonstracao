-- Executar apenas depois de preparar migration_private.sheet_rows.
-- Perfis são atribuídos de forma administrativa; registrar-se não concede acesso.
create table public.vpp_profiles (id uuid primary key references auth.users(id) on delete cascade, nome text not null, email text not null, usuario text not null, papel text not null check (papel in ('admin','operador')), ativo boolean not null default true, criado_em timestamptz not null default now());
create table public.vpp_vouchers (id text primary key, data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id));
create table public.vpp_gastos (id text primary key, data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id));
create table public.vpp_config (id boolean primary key default true check (id), data jsonb not null check (jsonb_typeof(data) = 'object'));
create or replace function public.vpp_is_member() returns boolean language sql stable security definer set search_path = pg_catalog, public as $$ select exists(select 1 from public.vpp_profiles where id = auth.uid() and ativo) $$;
create or replace function public.vpp_is_admin() returns boolean language sql stable security definer set search_path = pg_catalog, public as $$ select exists(select 1 from public.vpp_profiles where id = auth.uid() and ativo and papel = 'admin') $$;
revoke all on function public.vpp_is_member() from public, anon;
revoke all on function public.vpp_is_admin() from public, anon;
grant execute on function public.vpp_is_member(), public.vpp_is_admin() to authenticated;
alter table public.vpp_profiles enable row level security;
alter table public.vpp_vouchers enable row level security;
alter table public.vpp_gastos enable row level security;
alter table public.vpp_config enable row level security;
revoke all on public.vpp_profiles, public.vpp_vouchers, public.vpp_gastos, public.vpp_config from public, anon, authenticated;
grant select on public.vpp_profiles to authenticated;
grant select, insert, update, delete on public.vpp_vouchers, public.vpp_gastos to authenticated;
grant select, update on public.vpp_config to authenticated;
create policy profiles_read on public.vpp_profiles for select to authenticated using ((id = auth.uid() and ativo) or public.vpp_is_admin());
create policy vouchers_member on public.vpp_vouchers for all to authenticated using (public.vpp_is_member()) with check (public.vpp_is_member());
create policy gastos_member on public.vpp_gastos for all to authenticated using (public.vpp_is_member()) with check (public.vpp_is_member());
create policy config_read on public.vpp_config for select to authenticated using (public.vpp_is_member());
create policy config_write on public.vpp_config for update to authenticated using (public.vpp_is_admin()) with check (public.vpp_is_admin());
insert into public.vpp_vouchers(id,data) select data->>'id', (data - 'clientes' - 'passeios') || jsonb_build_object('clientes',(data->>'clientes')::jsonb, 'passeios',(data->>'passeios')::jsonb) from migration_private.sheet_rows where sheet='vouchers';
insert into public.vpp_gastos(id,data) select data->>'id', data from migration_private.sheet_rows where sheet='gastos';
insert into public.vpp_config(id,data) select true,jsonb_object_agg(data->>'chave', case when data->>'chave'='servicos' then (data->>'valor')::jsonb else to_jsonb(data->>'valor') end) from migration_private.sheet_rows where sheet='config';
