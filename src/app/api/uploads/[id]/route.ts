import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabase.from("contractor_quote_files").select("storage_path").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const { error: storageError } = await supabase.storage.from("contractor-quote-documents").remove([data.storage_path]);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });
  const { error: deleteError } = await supabase.from("contractor_quote_files").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
