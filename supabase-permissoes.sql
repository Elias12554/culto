-- VELAMINIS — CORREÇÃO DE PERMISSÕES DO REGISTRO COMPARTILHADO
-- Rode este arquivo no SQL Editor do Supabase e clique em Run.

grant usage on schema public to anon, authenticated;

grant select on table public.velaminis_members to anon, authenticated;
grant select on table public.velaminis_member_logs to anon, authenticated;

grant insert, update, delete on table public.velaminis_members to authenticated;
grant insert on table public.velaminis_member_logs to authenticated;

-- Garante que as policies continuem ativas.
alter table public.velaminis_members enable row level security;
alter table public.velaminis_member_logs enable row level security;

-- Confirmação simples: deve retornar duas linhas com os nomes das tabelas.
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('velaminis_members','velaminis_member_logs')
order by tablename;
