import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  notes: z.string().trim().min(10).max(6000),
  task: z.enum(["cost_items", "scope", "categories", "terms"]),
});

const PRICE_GUARD = `You assist a contractor preparing a renovation quote. You must NEVER invent, estimate, calculate, imply, or include prices, costs, rates, quantities, totals, currency, price ranges, or budgets. Every proposed cost item must explicitly have price fields omitted. Return only concise, customer-safe content for the requested task. Cost item suggestions must be unpriced, and must be clearly presented as suggestions awaiting contractor approval. Do not claim code compliance or building-code review.`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI is not configured. Add ANTHROPIC_API_KEY on the server to enable suggestions." }, { status: 503 });
  }
  try {
    const input = requestSchema.parse(await request.json());
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 900,
      system: PRICE_GUARD,
      messages: [{ role: "user", content: `Task: ${input.task}\nJob notes:\n${input.notes}` }],
    });
    const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    return NextResponse.json({ suggestion: text, requiresApproval: true, pricingIncluded: false });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Provide 10–6,000 characters of job notes and a valid AI task." }, { status: 400 });
    console.error("AI organization request failed", error);
    return NextResponse.json({ error: "Unable to create a suggestion right now." }, { status: 500 });
  }
}
