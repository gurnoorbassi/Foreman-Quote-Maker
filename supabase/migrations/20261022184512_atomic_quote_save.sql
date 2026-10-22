-- Save the header and items atomically. Invoker privileges retain existing RLS.
create or replace function public.save_contractor_quote(p_quote jsonb, p_quote_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved_id uuid;
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_quote->'items') is distinct from 'array' then
    raise exception 'Items must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_quote->'items') not between 1 and 250 then
    raise exception 'Supply between 1 and 250 items' using errcode = '22023';
  end if;
  if p_quote_id is null then
    insert into public.contractor_quotes (owner_id, quote_number, status, customer_name, customer_email, customer_phone, project_address, project_type, project_title, description, scope, payment_terms, assumptions, exclusions, markup_rate, contingency_rate, tax_rate, deposit_rate, discount, updated_at)
    values (actor, p_quote->>'quoteNumber', coalesce(p_quote->>'status', 'DRAFT'), p_quote->>'customerName', nullif(p_quote->>'customerEmail', ''), nullif(p_quote->>'customerPhone', ''), nullif(p_quote->>'projectAddress', ''), p_quote->>'projectType', p_quote->>'projectTitle', nullif(p_quote->>'description', ''), nullif(p_quote->>'scope', ''), nullif(p_quote->>'paymentTerms', ''), nullif(p_quote->>'assumptions', ''), nullif(p_quote->>'exclusions', ''), (p_quote->>'markup')::numeric, (p_quote->>'contingency')::numeric, (p_quote->>'tax')::numeric, (p_quote->>'deposit')::numeric, (p_quote->>'discount')::numeric, now()) returning id into saved_id;
  else
    -- UPDATE locks the quote row, serializing item replacement for this quote.
    update public.contractor_quotes set
      quote_number = p_quote->>'quoteNumber',
      status = coalesce(p_quote->>'status', 'DRAFT'),
      customer_name = p_quote->>'customerName',
      customer_email = nullif(p_quote->>'customerEmail', ''),
      customer_phone = nullif(p_quote->>'customerPhone', ''),
      project_address = nullif(p_quote->>'projectAddress', ''),
      project_type = p_quote->>'projectType',
      project_title = p_quote->>'projectTitle',
      description = nullif(p_quote->>'description', ''),
      scope = nullif(p_quote->>'scope', ''),
      payment_terms = nullif(p_quote->>'paymentTerms', ''),
      assumptions = nullif(p_quote->>'assumptions', ''),
      exclusions = nullif(p_quote->>'exclusions', ''),
      markup_rate = (p_quote->>'markup')::numeric,
      contingency_rate = (p_quote->>'contingency')::numeric,
      tax_rate = (p_quote->>'tax')::numeric,
      deposit_rate = (p_quote->>'deposit')::numeric,
      discount = (p_quote->>'discount')::numeric,
      updated_at = now()
    where id = p_quote_id and owner_id = actor
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Quote not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.contractor_quote_items where quote_id = saved_id and owner_id = actor;
  insert into public.contractor_quote_items
    (owner_id, quote_id, name, category, quantity, unit, unit_cost, sort_order)
  select actor, saved_id, item->>'name', item->>'category', (item->>'qty')::numeric,
    item->>'unit', (item->>'cost')::numeric, (ordinality - 1)::integer
  from jsonb_array_elements(p_quote->'items') with ordinality as entries(item, ordinality);
  return saved_id;
end;
$$;

revoke all on function public.save_contractor_quote(jsonb, uuid) from public, anon;
grant execute on function public.save_contractor_quote(jsonb, uuid) to authenticated;
