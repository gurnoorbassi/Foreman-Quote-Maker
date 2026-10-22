import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteIdentity, saveQuoteRequest } from "../src/lib/quote-save-client.ts";

const id = "9738f83a-d36c-44ac-9b6e-725d8c692cf0";
const payload = { id, quoteNumber: "Q-TEST", customerName: "Test customer", items: [{ name: "Work", qty: 1, cost: 20 }] };

test("new drafts get independent UUIDs and UUID-derived display numbers", () => {
  const first = createQuoteIdentity();
  const second = createQuoteIdentity();
  assert.match(first.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.quoteNumber, second.quoteNumber);
  assert.ok(first.quoteNumber.endsWith(first.id.replaceAll("-", "").slice(0, 8).toUpperCase()));
});

test("a lost response and retry send exactly the same identity and edits", async () => {
  const received: unknown[] = [];
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, "/api/quotes");
    assert.equal(options?.method, "POST");
    received.push(JSON.parse(String(options?.body)));
    if (received.length === 1) throw new TypeError("Connection lost after commit");
    return Response.json({ id, saved: true, leadSync: { status: "sent" } });
  };
  await assert.rejects(saveQuoteRequest(payload, request), /could not be confirmed/);
  assert.deepEqual(await saveQuoteRequest(payload, request), { id, saved: true, leadSync: { status: "sent" } });
  assert.deepEqual(received, [payload, payload]);
});

test("conflicts surface the server error without a success result", async () => {
  await assert.rejects(saveQuoteRequest(payload, async () => Response.json({ error: "Quote number already exists" }, { status: 409 })), /Quote number already exists/);
});

test("a malformed response never confirms persistence", async () => {
  for (const response of [new Response("<html>Unavailable</html>", { status: 502 }), Response.json(null), Response.json({ id, saved: false }), Response.json({ id: "another-quote", saved: true }), Response.json({ id })]) {
    await assert.rejects(saveQuoteRequest(payload, async () => response), /could not be confirmed/);
  }
});

test("a failed optional lead sync does not turn a confirmed database save into an error", async () => {
  assert.deepEqual(await saveQuoteRequest(payload, async () => Response.json({ id, saved: true, leadSync: { status: "failed", error: "Timed out" } })), { id, saved: true, leadSync: { status: "failed", error: "Timed out" } });
});
