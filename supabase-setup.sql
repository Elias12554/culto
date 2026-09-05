-- ============================================================
-- VELAMINIS — REGISTRO COMPARTILHADO DE MEMBROS
-- Rode este arquivo UMA VEZ no SQL Editor do seu projeto Supabase.
--
-- IMPORTANTE DEPOIS DE RODAR:
-- 1. Vá em Authentication > Users e crie o seu usuário administrador.
-- 2. Em Authentication > Providers > Email, DESATIVE novos cadastros públicos.
--    Assim, somente contas criadas por você poderão editar.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.velaminis_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  order_name text not null default 'Não definida',
  rank_name text not null default 'Iniciado',
  status text not null default 'espera' check (status in ('ativo','espera','saiu')),
  entry_date date,
  exit_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.velaminis_member_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.velaminis_members(id) on delete set null,
  action text not null,
  person text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.velaminis_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists velaminis_members_touch_updated_at on public.velaminis_members;
create trigger velaminis_members_touch_updated_at
before update on public.velaminis_members
for each row execute function public.velaminis_touch_updated_at();

alter table public.velaminis_members enable row level security;
alter table public.velaminis_member_logs enable row level security;

-- Permissões explícitas para a API pública do Supabase.
-- As policies de RLS dizem QUAIS linhas podem ser acessadas; os GRANTs abaixo
-- dizem QUAIS operações cada papel pode executar.
grant usage on schema public to anon, authenticated;
grant select on table public.velaminis_members to anon, authenticated;
grant select on table public.velaminis_member_logs to anon, authenticated;
grant insert, update, delete on table public.velaminis_members to authenticated;
grant insert on table public.velaminis_member_logs to authenticated;

-- Qualquer visitante pode VER o registro.
drop policy if exists "velaminis_members_public_read" on public.velaminis_members;
create policy "velaminis_members_public_read"
on public.velaminis_members
for select
to anon, authenticated
using (true);

drop policy if exists "velaminis_logs_public_read" on public.velaminis_member_logs;
create policy "velaminis_logs_public_read"
on public.velaminis_member_logs
for select
to anon, authenticated
using (true);

-- Somente usuários autenticados podem ALTERAR.
-- Como o site não possui cadastro, crie apenas a(s) conta(s) de administrador no painel.
drop policy if exists "velaminis_members_admin_insert" on public.velaminis_members;
create policy "velaminis_members_admin_insert"
on public.velaminis_members
for insert
to authenticated
with check (true);

drop policy if exists "velaminis_members_admin_update" on public.velaminis_members;
create policy "velaminis_members_admin_update"
on public.velaminis_members
for update
to authenticated
using (true)
with check (true);

drop policy if exists "velaminis_members_admin_delete" on public.velaminis_members;
create policy "velaminis_members_admin_delete"
on public.velaminis_members
for delete
to authenticated
using (true);

drop policy if exists "velaminis_logs_admin_insert" on public.velaminis_member_logs;
create policy "velaminis_logs_admin_insert"
on public.velaminis_member_logs
for insert
to authenticated
with check (true);

-- Ativa atualização em tempo real para quem estiver com a página aberta.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'velaminis_members'
  ) then
    alter publication supabase_realtime add table public.velaminis_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'velaminis_member_logs'
  ) then
    alter publication supabase_realtime add table public.velaminis_member_logs;
  end if;
end $$;
