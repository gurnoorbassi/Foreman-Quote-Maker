import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { canonicalJson, dispatchQuoteLeadEvent } from "../src/lib/integrations/lead-command-webhook.ts";

const quote = {
  id: "quote-1",
  quoteNumber: "Q-1001",
  status: "READY",
  customerName: "Synthetic Customer",
  customerEmail: "synthetic@example.test",
  customerPhone: "+16045550101",
  projectAddress: "100 Test Street",
  projectType: "Renovation",
  projectTitle: "Synthetic Kitchen",
  description: "Synthetic proof only",
  markup: 10,
  contingency: 5,
  tax: 12,
  discount: 25,
  items: [{ quantity: 2, unitCost: 100 }],
  occurredAt: "2026-07-21T20:00:00.000Z",
};

test("does not dispatch draft quotes", async () => {
  const result = await dispatchQuoteLeadEvent({ ...quote, status: "DRAFT" }, { enabled: true, url: "https://example.test", secret: "secret" });
  assert.equal(result.status, "not_applicable");
});

test("signs one canonical, idempotent quote event", async () => {
  let captured: RequestInit | undefined;
  const result = await dispatchQuoteLeadEvent(quote, {
    enabled: true,
    url: "https://example.test/intake",
    secret: "synthetic-secret",
    now: () => 1_721_591_111_000,
    fetchImpl: async (_url, init) => {
      captured = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  assert.deepEqual(result, { status: "delivered", eventId: "foreman-quote:quote-1:ready" });
  const body = String(captured?.body);
  const headers = new Headers(captured?.headers);
  const expected = crypto.createHmac("sha256", "synthetic-secret").update(`${headers.get("x-ag-timestamp")}.${body}`).digest("hex");
  assert.equal(headers.get("x-ag-signature"), `v1=${expected}`);
  assert.equal(body, canonicalJson(JSON.parse(body)));
  assert.equal(JSON.parse(body).quote.total, 229.6);
});
