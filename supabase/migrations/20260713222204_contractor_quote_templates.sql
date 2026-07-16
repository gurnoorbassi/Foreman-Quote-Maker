create table if not exists public.contractor_quote_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  project_type text not null,
  items jsonb not null default '[]'::jsonb,
  scope text,
  markup_rate numeric(5,2) not null default 0 check (markup_rate between 0 and 100),
  contingency_rate numeric(5,2) not null default 0 check (contingency_rate between 0 and 100),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  payment_terms text,
  exclusions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contractor_quote_templates_owner_name_idx on public.contractor_quote_templates(owner_id, name);
alter table public.contractor_quote_templates enable row level security;
create policy "contractor_quote_templates_select_own" on public.contractor_quote_templates for select to authenticated using ((select auth.uid()) = owner_id);
create policy "contractor_quote_templates_insert_own" on public.contractor_quote_templates for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "contractor_quote_templates_update_own" on public.contractor_quote_templates for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "contractor_quote_templates_delete_own" on public.contractor_quote_templates for delete to authenticated using ((select auth.uid()) = owner_id);
grant select, insert, update, delete on public.contractor_quote_templates to authenticated;
