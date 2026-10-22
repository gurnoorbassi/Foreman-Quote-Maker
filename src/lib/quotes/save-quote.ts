import { z } from "zod";
import { dispatchQuoteLeadEvent } from "../integrations/lead-command-webhook.ts";

// PostgreSQL stores these values as numeric(12,2). Reject values it cannot store
// rather than allowing a database overflow partway through a save.
const amount = z.number().min(0).max(9_999_999_999.99);
export const quoteSchema = z.object({
  id: z.uuid(),
  quoteNumber: z.string().trim().min(1).max(80),
  status: z.enum(["DRAFT", "READY", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]).default("DRAFT"),
  customerName: z.string().trim().min(1).max(160),
  customerEmail: z.string().email().or(z.literal("")),
  customerPhone: z.string().max(60),
  projectAddress: z.string().max(300),
  projectType: z.string().trim().min(1).max(100),
  projectTitle: z.string().trim().min(1).max(200),
  description: z.string().max(6000),
  scope: z.string().max(12000),
  paymentTerms: z.string().max(6000),
  assumptions: z.string().max(6000),
  exclusions: z.string().max(6000),
  markup: z.number().min(0).max(100),
  contingency: z.number().min(0).max(100),
  tax: z.number().min(0).max(100),
  deposit: z.number().min(0).max(100),
  discount: amount,
  items: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(100),
    qty: amount,
    unit: z.string().trim().min(1).max(50),
    cost: amount,
  })).min(1).max(250),
});

export type QuoteInput = z.infer<typeof quoteSchema>;
export type QuoteSaveClient = {
  auth: { getClaims(): Promise<{ data: { claims: { sub?: string } } | null }> };
  rpc(name: "save_contractor_quote", args: { p_quote: QuoteInput }): PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

// Kept separate from the framework adapter so validation, persistence failures,
// and post-commit webhook ordering can be tested without a live account.
export async function saveQuoteRequest(
  request: Request,
  supabase: QuoteSaveClient,
  dispatch = dispatchQuoteLeadEvent,
) {
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON request" }, { status: 400 }); }
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Quote validation failed", details: parsed.error.flatten() }, { status: 400 });

  const quote = parsed.data;
  const { data, error } = await supabase.rpc("save_contractor_quote", { p_quote: quote });
  if (error) {
    if (error.code === "23505") return Response.json({ error: "This quote number is already in use. Change the quote number and save again." }, { status: 409 });
    if (error.code === "42501") return Response.json({ error: "You do not have permission to save this quote." }, { status: 403 });
    return Response.json({ error: "Could not confirm the save. Your edits are still in the editor; retry to confirm this quote." }, { status: 500 });
  }
  const saved = z.object({ id: z.uuid(), updatedAt: z.string() }).safeParse(data);
  if (!saved.success || saved.data.id !== quote.id) {
    return Response.json({ error: "Could not confirm the save. Retry to confirm this quote." }, { status: 500 });
  }

  // Only a committed quote may produce a lead event. A downstream failure must
  // never turn a successful save into an apparent database failure.
  let leadSync: Awaited<ReturnType<typeof dispatchQuoteLeadEvent>>;
  try {
    leadSync = await dispatch({
      ...quote,
      items: quote.items.map((item) => ({ quantity: item.qty, unitCost: item.cost })),
      occurredAt: saved.data.updatedAt,
    });
  } catch {
    leadSync = { status: "failed", eventId: `foreman-quote:${quote.id}:${quote.status.toLowerCase()}`, error: "Lead sync unavailable; the quote was saved." };
  }
  return Response.json({ id: saved.data.id, saved: true, leadSync });
}
