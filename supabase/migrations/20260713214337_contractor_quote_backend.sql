create table if not exists public.contractor_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default 'My Contracting Company',
  contact_name text,
  phone text,
  email text,
  address text,
  logo_path text,
  default_tax numeric(5,2) not null default 5 check (default_tax between 0 and 100),
  default_markup numeric(5,2) not null default 18 check (default_markup between 0 and 100),
  default_contingency numeric(5,2) not null default 5 check (default_contingency between 0 and 100),
  default_deposit numeric(5,2) not null default 30 check (default_deposit between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractor_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quote_number text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','SENT','ACCEPTED','REJECTED','EXPIRED')),
  customer_name text not null,
  customer_email text,
  customer_phone text,
  project_address text,
  project_type text not null,
  project_title text not null,
  description text,
  scope text,
  payment_terms text,
  assumptions text,
  exclusions text,
  markup_rate numeric(5,2) not null default 0 check (markup_rate between 0 and 100),
  contingency_rate numeric(5,2) not null default 0 check (contingency_rate between 0 and 100),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  deposit_rate numeric(5,2) not null default 0 check (deposit_rate between 0 and 100),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (owner_id, quote_number)
);

create table if not exists public.contractor_quote_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid not null references public.contractor_quotes(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  quantity numeric(12,2) not null check (quantity >= 0),
  unit text not null,
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  notes text,
  sort_order integer not null default 0
);

create table if not exists public.contractor_price_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  unit text not null,
  default_cost numeric(12,2) not null check (default_cost >= 0),
  supplier_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractor_quote_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid references public.contractor_quotes(id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_at timestamptz not null default now()
);

create index if not exists contractor_quotes_owner_status_idx on public.contractor_quotes(owner_id, status, created_at desc);
create index if not exists contractor_quote_items_quote_idx on public.contractor_quote_items(quote_id, sort_order);
create index if not exists contractor_price_items_owner_name_idx on public.contractor_price_items(owner_id, name);
create index if not exists contractor_quote_files_owner_quote_idx on public.contractor_quote_files(owner_id, quote_id);

alter table public.contractor_profiles enable row level security;
alter table public.contractor_quotes enable row level security;
alter table public.contractor_quote_items enable row level security;
alter table public.contractor_price_items enable row level security;
alter table public.contractor_quote_files enable row level security;

create policy "contractor_profiles_select_own" on public.contractor_profiles for select to authenticated using ((select auth.uid()) = id);
create policy "contractor_profiles_insert_own" on public.contractor_profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "contractor_profiles_update_own" on public.contractor_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "contractor_quotes_select_own" on public.contractor_quotes for select to authenticated using ((select auth.uid()) = owner_id);
create policy "contractor_quotes_insert_own" on public.contractor_quotes for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "contractor_quotes_update_own" on public.contractor_quotes for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "contractor_quotes_delete_own" on public.contractor_quotes for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "contractor_quote_items_select_own" on public.contractor_quote_items for select to authenticated using ((select auth.uid()) = owner_id);
create policy "contractor_quote_items_insert_own" on public.contractor_quote_items for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "contractor_quote_items_update_own" on public.contractor_quote_items for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "contractor_quote_items_delete_own" on public.contractor_quote_items for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "contractor_price_items_select_own" on public.contractor_price_items for select to authenticated using ((select auth.uid()) = owner_id);
create policy "contractor_price_items_insert_own" on public.contractor_price_items for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "contractor_price_items_update_own" on public.contractor_price_items for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "contractor_price_items_delete_own" on public.contractor_price_items for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "contractor_quote_files_select_own" on public.contractor_quote_files for select to authenticated using ((select auth.uid()) = owner_id);
create policy "contractor_quote_files_insert_own" on public.contractor_quote_files for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "contractor_quote_files_delete_own" on public.contractor_quote_files for delete to authenticated using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.contractor_profiles to authenticated;
grant select, insert, update, delete on public.contractor_quotes to authenticated;
grant select, insert, update, delete on public.contractor_quote_items to authenticated;
grant select, insert, update, delete on public.contractor_price_items to authenticated;
grant select, insert, update, delete on public.contractor_quote_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contractor-quote-documents',
  'contractor-quote-documents',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "contractor_documents_select_own" on storage.objects for select to authenticated
using (bucket_id = 'contractor-quote-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "contractor_documents_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'contractor-quote-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "contractor_documents_update_own" on storage.objects for update to authenticated
using (bucket_id = 'contractor-quote-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'contractor-quote-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "contractor_documents_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'contractor-quote-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
