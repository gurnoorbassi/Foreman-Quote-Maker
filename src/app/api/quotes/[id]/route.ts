import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type QuoteItemRow = { id: string; name: string; category: string; quantity: number | string; unit: string; unit_cost: number | string; sort_order: number };

async function context(params: Promise<{ id: string }>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub, id: (await params).id };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, id } = await context(params);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("contractor_quotes").select("*,contractor_quote_items(*)").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json({ quote: { id: data.id, quoteNumber: data.quote_number, status: data.status, customerName: data.customer_name, customerEmail: data.customer_email ?? "", customerPhone: data.customer_phone ?? "", projectAddress: data.project_address ?? "", projectType: data.project_type, projectTitle: data.project_title, description: data.description ?? "", scope: data.scope ?? "", paymentTerms: data.payment_terms ?? "", assumptions: data.assumptions ?? "", exclusions: data.exclusions ?? "", markup: Number(data.markup_rate), contingency: Number(data.contingency_rate), tax: Number(data.tax_rate), deposit: Number(data.deposit_rate), discount: Number(data.discount), items: data.contractor_quote_items.sort((a: QuoteItemRow, b: QuoteItemRow) => a.sort_order - b.sort_order).map((item: QuoteItemRow) => ({ id: item.id, name: item.name, category: item.category, qty: Number(item.quantity), unit: item.unit, cost: Number(item.unit_cost) })) } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, id } = await context(params);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ status: z.enum(["DRAFT", "READY", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid quote status" }, { status: 400 });
  const { error } = await supabase.from("contractor_quotes").update({ status: parsed.data.status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, id } = await context(params);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: files, error: fileError } = await supabase.from("contractor_quote_files").select("storage_path").eq("quote_id", id);
  if (fileError) return NextResponse.json({ error: fileError.message }, { status: 500 });
  if (files.length) {
    const { error: storageError } = await supabase.storage.from("contractor-quote-documents").remove(files.map((file) => file.storage_path));
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });
  }
  const { error } = await supabase.from("contractor_quotes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
