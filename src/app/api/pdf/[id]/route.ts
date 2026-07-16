import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateQuotePdf } from "@/lib/pdf/quote";

type QuoteItemRow = { name: string; category: string; quantity: number | string; unit: string; unit_cost: number | string; sort_order: number };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [quoteResult, profileResult] = await Promise.all([supabase.from("contractor_quotes").select("*,contractor_quote_items(*)").eq("id", id).single(), supabase.from("contractor_profiles").select("*").eq("id", userId).single()]);
  if (quoteResult.error) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const q = quoteResult.data, p = profileResult.data;
  const bytes = await generateQuotePdf({ number: q.quote_number, customerName: q.customer_name, customerEmail: q.customer_email ?? "", customerPhone: q.customer_phone ?? "", projectAddress: q.project_address ?? "", projectTitle: q.project_title, description: q.description ?? "", scope: q.scope ?? "", paymentTerms: q.payment_terms ?? "", assumptions: q.assumptions ?? "", exclusions: q.exclusions ?? "", markup: Number(q.markup_rate), contingency: Number(q.contingency_rate), tax: Number(q.tax_rate), deposit: Number(q.deposit_rate), discount: Number(q.discount), items: q.contractor_quote_items.sort((a: QuoteItemRow, b: QuoteItemRow) => a.sort_order - b.sort_order).map((item: QuoteItemRow) => ({ name: item.name, category: item.category, quantity: Number(item.quantity), unit: item.unit, unitCost: Number(item.unit_cost) })) }, { name: p?.company_name ?? "Contractor", contactName: p?.contact_name ?? "", phone: p?.phone ?? "", email: p?.email ?? "", address: p?.address ?? "" });
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${q.quote_number.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf"`, "cache-control": "private, no-store" } });
}
