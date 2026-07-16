import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(3000).default(""),
  unit: z.string().trim().min(1).max(40),
  cost: z.number().min(0).max(10000000),
  supplier: z.string().trim().max(160).default(""),
  notes: z.string().trim().max(3000).default(""),
});

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub };
}

export async function GET() {
  const { supabase, userId } = await authenticatedClient();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("contractor_price_items").select("id,name,category,description,unit,default_cost,supplier_name,notes").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data.map((item) => ({ id: item.id, name: item.name, category: item.category, description: item.description ?? "", unit: item.unit, cost: Number(item.default_cost), supplier: item.supplier_name ?? "", notes: item.notes ?? "" })) });
}

export async function POST(request: Request) {
  const { supabase, userId } = await authenticatedClient();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = itemSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid saved price item", details: parsed.error.flatten() }, { status: 400 });
  const item = parsed.data;
  const { data, error } = await supabase.from("contractor_price_items").insert({ owner_id: userId, name: item.name, category: item.category, description: item.description || null, unit: item.unit, default_cost: item.cost, supplier_name: item.supplier || null, notes: item.notes || null }).select("id,name,category,description,unit,default_cost,supplier_name,notes").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: { id: data.id, name: data.name, category: data.category, description: data.description ?? "", unit: data.unit, cost: Number(data.default_cost), supplier: data.supplier_name ?? "", notes: data.notes ?? "" } }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { supabase, userId } = await authenticatedClient();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing item id" }, { status: 400 });
  const { error } = await supabase.from("contractor_price_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
