create index if not exists contractor_quote_items_owner_idx on public.contractor_quote_items(owner_id);
create index if not exists contractor_quote_files_quote_idx on public.contractor_quote_files(quote_id);
