import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const quoteSchema = z.object({
  quoteNumber: z.string().trim().min(1).max(80),
  status: z.enum(["DRAFT", "READY", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]).default("DRAFT"),
  customerName: z.string().trim().min(1).max(160),
  customerEmail: z.string().email().or(z.literal("")),
  customerPhone: z.string().max(60),
  projectAddress: z.string().max(300),
  projectType: z.string().min(1).max(100),
  projectTitle: z.string().min(1).max(200),
  description: z.string().max(6000),
  scope: z.string().max(12000),
  paymentTerms: z.string().max(6000),
  assumptions: z.string().max(6000),
  exclusions: z.string().max(6000),
  markup: z.number().min(0).max(100),
  contingency: z.number().min(0).max(100),
  tax: z.number().min(0).max(100),
  deposit: z.number().min(0).max(100),
  discount: z.number().min(0),
  items: z.array(z.object({ name: z.string().min(1).max(200), category: z.string().min(1).max(100), qty: z.number().min(0), unit: z.string().min(1).max(50), cost: z.number().min(0) })).min(1).max(250),
});

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
  const parsed = quoteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Quote validation failed", details: parsed.error.flatten() }, { status: 400 });
  const quote = parsed.data;
  const { data, error } = await supabase.from("contractor_quotes").upsert({ owner_id: userId, quote_number: quote.quoteNumber, status: quote.status, customer_name: quote.customerName, customer_email: quote.customerEmail || null, customer_phone: quote.customerPhone || null, project_address: quote.projectAddress || null, project_type: quote.projectType, project_title: quote.projectTitle, description: quote.description || null, scope: quote.scope || null, payment_terms: quote.paymentTerms || null, assumptions: quote.assumptions || null, exclusions: quote.exclusions || null, markup_rate: quote.markup, contingency_rate: quote.contingency, tax_rate: quote.tax, deposit_rate: quote.deposit, discount: quote.discount, updated_at: new Date().toISOString() }, { onConflict: "owner_id,quote_number" }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: deleteError } = await supabase.from("contractor_quote_items").delete().eq("quote_id", data.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  const { error: itemError } = await supabase.from("contractor_quote_items").insert(quote.items.map((item, index) => ({ owner_id: userId, quote_id: data.id, name: item.name, category: item.category, quantity: item.qty, unit: item.unit, unit_cost: item.cost, sort_order: index })));
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  return NextResponse.json({ id: data.id, saved: true });
}
