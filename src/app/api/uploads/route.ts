import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const maxSize = 15 * 1024 * 1024;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const quoteId = new URL(request.url).searchParams.get("quoteId");
  let query = supabase.from("contractor_quote_files").select("id,quote_id,storage_path,original_name,mime_type,size_bytes,created_at").order("created_at", { ascending: false });
  if (quoteId) query = query.eq("quote_id", quoteId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const files = await Promise.all(data.map(async (file) => { const { data: signed } = await supabase.storage.from("contractor-quote-documents").createSignedUrl(file.storage_path, 300); return { id: file.id, quoteId: file.quote_id, name: file.original_name, type: file.mime_type, size: Number(file.size_bytes), createdAt: file.created_at, url: signed?.signedUrl ?? null }; }));
  return NextResponse.json({ files });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const quoteId = String(form.get("quoteId") ?? "").trim() || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "Select a file to upload" }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, WebP, PDF, DOC, and DOCX files are allowed" }, { status: 400 });
  if (file.size <= 0 || file.size > maxSize) return NextResponse.json({ error: "Files must be between 1 byte and 15 MB" }, { status: 400 });
  if (quoteId) {
    const { data: quote } = await supabase.from("contractor_quotes").select("id").eq("id", quoteId).maybeSingle();
    if (!quote) return NextResponse.json({ error: "Save or open a valid quote before uploading files" }, { status: 400 });
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("contractor-quote-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  const { data, error } = await supabase.from("contractor_quote_files").insert({ owner_id: userId, quote_id: quoteId, storage_path: path, original_name: file.name, mime_type: file.type, size_bytes: file.size }).select("id").single();
  if (error) {
    await supabase.storage.from("contractor-quote-documents").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data: signed } = await supabase.storage.from("contractor-quote-documents").createSignedUrl(path, 300);
  return NextResponse.json({ id: data.id, name: file.name, url: signed?.signedUrl ?? null }, { status: 201 });
}
