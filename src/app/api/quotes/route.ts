import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveQuoteRequest } from "@/lib/quotes/save-quote";

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
  return saveQuoteRequest(request, await createClient());
}
