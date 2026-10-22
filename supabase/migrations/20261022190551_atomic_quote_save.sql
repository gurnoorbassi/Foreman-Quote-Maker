-- One RPC call is one transaction: a failed item replacement rolls back both
-- the quote header and its previous items. RLS continues to apply to the caller.
create or replace function public.save_contractor_quote(p_quote jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_id uuid := (p_quote->>'id')::uuid;
  v_updated_at timestamptz;
begin
  if v_owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_id is null or jsonb_typeof(p_quote->'items') is distinct from 'array' then
    raise exception 'A quote ID and items array are required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_quote->'items') not between 1 and 250 then
    raise exception 'A quote requires 1 to 250 items' using errcode = '22023';
  end if;

  -- Conflict on the stable ID locks this parent row until the entire function
  -- commits. Simultaneous saves cannot interleave their item replacements.
  -- A duplicate display number on a DIFFERENT ID remains a unique violation.
  insert into public.contractor_quotes (
    id, owner_id, quote_number, status, customer_name, customer_email,
    customer_phone, project_address, project_type, project_title, description,
    scope, payment_terms, assumptions, exclusions, markup_rate,
    contingency_rate, tax_rate, deposit_rate, discount, updated_at
  ) values (
    v_id, v_owner_id, p_quote->>'quoteNumber', p_quote->>'status',
    p_quote->>'customerName', nullif(p_quote->>'customerEmail', ''),
    nullif(p_quote->>'customerPhone', ''), nullif(p_quote->>'projectAddress', ''),
    p_quote->>'projectType', p_quote->>'projectTitle', nullif(p_quote->>'description', ''),
    nullif(p_quote->>'scope', ''), nullif(p_quote->>'paymentTerms', ''),
    nullif(p_quote->>'assumptions', ''), nullif(p_quote->>'exclusions', ''),
    (p_quote->>'markup')::numeric, (p_quote->>'contingency')::numeric,
    (p_quote->>'tax')::numeric, (p_quote->>'deposit')::numeric,
    (p_quote->>'discount')::numeric, clock_timestamp()
  ) on conflict (id) do update set
    quote_number = excluded.quote_number, status = excluded.status,
    customer_name = excluded.customer_name, customer_email = excluded.customer_email,
    customer_phone = excluded.customer_phone, project_address = excluded.project_address,
    project_type = excluded.project_type, project_title = excluded.project_title,
    description = excluded.description, scope = excluded.scope,
    payment_terms = excluded.payment_terms, assumptions = excluded.assumptions,
    exclusions = excluded.exclusions, markup_rate = excluded.markup_rate,
    contingency_rate = excluded.contingency_rate, tax_rate = excluded.tax_rate,
    deposit_rate = excluded.deposit_rate, discount = excluded.discount,
    updated_at = clock_timestamp()
  returning updated_at into v_updated_at;

  delete from public.contractor_quote_items where quote_id = v_id;
  insert into public.contractor_quote_items (
    owner_id, quote_id, name, category, quantity, unit, unit_cost, sort_order
  ) select
    v_owner_id, v_id, item->>'name', item->>'category',
    (item->>'qty')::numeric, item->>'unit', (item->>'cost')::numeric,
    (position - 1)::integer
  from jsonb_array_elements(p_quote->'items') with ordinality as items(item, position);

  return jsonb_build_object('id', v_id, 'updatedAt', v_updated_at);
end;
$$;

revoke all on function public.save_contractor_quote(jsonb) from public, anon;
grant execute on function public.save_contractor_quote(jsonb) to authenticated;
