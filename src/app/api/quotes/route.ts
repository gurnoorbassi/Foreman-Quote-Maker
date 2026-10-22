import { NextResponse } from "next/server";
import { quoteSchema } from "@/lib/quote-schema";
import { createClient } from "@/lib/supabase/server";
import { dispatchQuoteLeadEvent } from "@/lib/integrations/lead-command-webhook";



export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const status = url.searchParams.get("status")?.trim();
  let query = supabase.from("contractor_quotes").select("id,quote_number,status,customer_name,project_address,project_type,project_title,markup_rate,contingency_rate,tax_rate,discount,created_at,updated_at,contractor_quote_items(quantity,unit_cost)").order("updated_at", { ascending: false });
  if (status && status !== "ALL") query = query.eq("status", status);
  if (search) query = query.or(`customer_name.ilike.%${search.replace(/[,%]/g, "")}%,project_address.ilike.%${search.replace(/[,%]/g, "")}%,quote_number.ilike.%${search.replace(/[,%]/g, "")}%,project_type.ilike.%${search.replace(/[,%]/g, "")}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const quotes = data.map((quote) => {
    const subtotal = quote.contractor_quote_items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_cost), 0);
    const taxable = Math.max(0, subtotal * (1 + Number(quote.markup_rate) / 100 + Number(quote.contingency_rate) / 100) - Number(quote.discount));
    return { id: quote.id, number: quote.quote_number, status: quote.status, customerName: quote.customer_name, projectAddress: quote.project_address ?? "", projectType: quote.project_type, projectTitle: quote.project_title, total: taxable * (1 + Number(quote.tax_rate) / 100), createdAt: quote.created_at, updatedAt: quote.updated_at };
  });
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  return NextResponse.json({ quotes, metrics: { totalQuotes: quotes.length, createdThisMonth: quotes.filter((quote) => new Date(quote.createdAt) >= monthStart).length, drafts: quotes.filter((quote) => quote.status === "DRAFT").length, sent: quotes.filter((quote) => quote.status === "SENT").length, accepted: quotes.filter((quote) => quote.status === "ACCEPTED").length, totalValue: quotes.reduce((sum, quote) => sum + quote.total, 0) } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON request" }, { status: 400 }); }
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Quote validation failed", details: parsed.error.flatten() }, { status: 400 });
  const quote = parsed.data;
  const occurredAt = new Date().toISOString();
  // One database transaction: a failed item write rolls back the header and all items.
  // New quotes never overwrite another quote merely because their number matches.
  const { data: savedId, error } = await supabase.rpc("save_contractor_quote", {
    p_quote: quote,
    p_quote_id: quote.id ?? null,
  });
  if (error) {
    const status = error.code === "23505" ? 409 : error.code === "P0002" ? 404 :
      ["22003", "22023", "23514"].includes(error.code) ? 400 : 500;
    const message = status === 409 ? "This quote number already exists. Reload your quotes before saving again." :
      status === 404 ? "Quote not found" : status === 400 ? "Quote values are outside the supported range" :
      "Could not save quote. Your draft has been kept; check your saved quotes before retrying.";
    return NextResponse.json({ error: message }, { status });
  }
  if (typeof savedId !== "string") return NextResponse.json({ error: "Save was not confirmed" }, { status: 500 });
  const leadSync = await dispatchQuoteLeadEvent({
    id: savedId,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    customerName: quote.customerName,
    customerEmail: quote.customerEmail,
    customerPhone: quote.customerPhone,
    projectAddress: quote.projectAddress,
    projectType: quote.projectType,
    projectTitle: quote.projectTitle,
    description: quote.description,
    markup: quote.markup,
    contingency: quote.contingency,
    tax: quote.tax,
    discount: quote.discount,
    items: quote.items.map((item) => ({ quantity: item.qty, unitCost: item.cost })),
    occurredAt,
  });
  return NextResponse.json({ id: savedId, saved: true, leadSync });
}
