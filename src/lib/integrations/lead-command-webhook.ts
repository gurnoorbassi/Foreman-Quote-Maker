import crypto from "node:crypto";

export type QuoteLeadEvent = {
  eventId: string;
  eventType: "quote.ready" | "quote.sent" | "quote.accepted";
  occurredAt: string;
  quote: {
    id: string;
    number: string;
    status: "READY" | "SENT" | "ACCEPTED";
    total: number;
    currency: "CAD";
  };
  customer: { name: string; email?: string; phone?: string };
  project: { title: string; type: string; address?: string; description?: string };
};

type DispatchResult =
  | { status: "not_applicable" | "disabled" }
  | { status: "delivered"; eventId: string }
  | { status: "failed"; eventId: string; error: string };

type QuoteInput = {
  id: string;
  quoteNumber: string;
  status: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  projectAddress?: string | null;
  projectType: string;
  projectTitle: string;
  description?: string | null;
  markup: number;
  contingency: number;
  tax: number;
  discount: number;
  items: Array<{ quantity: number; unitCost: number }>;
  occurredAt: string;
};

type DispatchOptions = {
  enabled?: boolean;
  url?: string;
  secret?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

const eligibleStatuses = new Set(["READY", "SENT", "ACCEPTED"]);

export function buildQuoteLeadEvent(input: QuoteInput): QuoteLeadEvent | undefined {
  if (!eligibleStatuses.has(input.status)) return undefined;
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const taxable = Math.max(0, subtotal * (1 + input.markup / 100 + input.contingency / 100) - input.discount);
  const status = input.status as QuoteLeadEvent["quote"]["status"];
  return {
    eventId: `foreman-quote:${input.id}:${status.toLowerCase()}`,
    eventType: `quote.${status.toLowerCase()}` as QuoteLeadEvent["eventType"],
    occurredAt: input.occurredAt,
    quote: {
      id: input.id,
      number: input.quoteNumber,
      status,
      total: Number((taxable * (1 + input.tax / 100)).toFixed(2)),
      currency: "CAD",
    },
    customer: compact({ name: input.customerName, email: input.customerEmail || undefined, phone: input.customerPhone || undefined }),
    project: compact({
      title: input.projectTitle,
      type: input.projectType,
      address: input.projectAddress || undefined,
      description: input.description || undefined,
    }),
  };
}

export async function dispatchQuoteLeadEvent(input: QuoteInput, options: DispatchOptions = {}): Promise<DispatchResult> {
  const event = buildQuoteLeadEvent(input);
  if (!event) return { status: "not_applicable" };

  const enabled = options.enabled ?? process.env.QUOTE_LEAD_WEBHOOK_ENABLED === "true";
  if (!enabled) return { status: "disabled" };
  const url = options.url ?? process.env.QUOTE_LEAD_WEBHOOK_URL;
  const secret = options.secret ?? process.env.QUOTE_LEAD_WEBHOOK_SECRET;
  if (!url || !secret) return { status: "failed", eventId: event.eventId, error: "Quote lead webhook is enabled but not fully configured" };

  const timestamp = String(Math.floor((options.now?.() ?? Date.now()) / 1000));
  const body = canonicalJson(event);
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ag-event-id": event.eventId,
        "x-ag-timestamp": timestamp,
        "x-ag-signature": `v1=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) return { status: "failed", eventId: event.eventId, error: `Lead pipeline returned HTTP ${response.status}` };
    return { status: "delivered", eventId: event.eventId };
  } catch (error) {
    return { status: "failed", eventId: event.eventId, error: error instanceof Error ? error.message : "Lead pipeline request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
