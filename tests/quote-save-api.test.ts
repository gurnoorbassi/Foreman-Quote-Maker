import assert from "node:assert/strict";
import test from "node:test";
import { saveQuoteRequest, type QuoteSaveClient } from "../src/lib/quotes/save-quote.ts";
import { quote, ownerId } from "./fixtures/quote.ts";

const request = (body: unknown = quote) => new Request("http://localhost/api/quotes", { method: "POST", body: JSON.stringify(body) });
function harness(error: { code: string; message: string } | null = null) {
  const calls: string[] = [];
  const client: QuoteSaveClient = {
    auth: { getClaims: async () => ({ data: { claims: { sub: ownerId } } }) },
    rpc: async (name, args) => {
      calls.push(name);
      assert.equal(args.p_quote.id, quote.id);
      assert.equal("owner_id" in args.p_quote, false);
      return { data: error ? null : { id: quote.id, updatedAt: "2026-10-22T00:00:00Z" }, error };
    },
  };
  const dispatch = async () => { calls.push("dispatch"); return { status: "disabled" as const }; };
  return { client, calls, dispatch };
}

test("authenticated save invokes one atomic RPC before dispatching the lead", async () => {
  const h = harness();
  const r = await saveQuoteRequest(request({ ...quote, owner_id: "untrusted" }), h.client, h.dispatch);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { id: quote.id, saved: true, leadSync: { status: "disabled" } });
  assert.deepEqual(h.calls, ["save_contractor_quote", "dispatch"]);
});

test("unauthenticated requests cannot save or dispatch", async () => {
  const h = harness();
  h.client.auth.getClaims = async () => ({ data: null });
  assert.equal((await saveQuoteRequest(request(), h.client, h.dispatch)).status, 401);
  assert.deepEqual(h.calls, []);
});

test("malformed JSON and invalid data return 400 before persistence", async () => {
  const h = harness();
  const invalid = new Request("http://localhost/api/quotes", { method: "POST", body: "{" });
  assert.equal((await saveQuoteRequest(invalid, h.client, h.dispatch)).status, 400);
  for (const body of [null, {}, { ...quote, id: undefined }, { ...quote, id: "invalid" }, { ...quote, items: [] },
    { ...quote, items: [{ ...quote.items[0], cost: 10_000_000_000 }] },
    { ...quote, items: [{ ...quote.items[0], qty: -1 }] },
    { ...quote, discount: 10_000_000_000 }, { ...quote, projectTitle: " " }]) {
    assert.equal((await saveQuoteRequest(request(body), h.client, h.dispatch)).status, 400);
  }
  assert.deepEqual(h.calls, []);
});

test("database conflict, authorization, and other failures never dispatch a lead", async () => {
  for (const [code, status] of [["23505", 409], ["42501", 403], ["22003", 500]] as const) {
    const h = harness({ code, message: "Internal SQL details must not leak" });
    const r = await saveQuoteRequest(request(), h.client, h.dispatch);
    assert.equal(r.status, status);
    assert.doesNotMatch(await r.text(), /Internal SQL/);
    assert.deepEqual(h.calls, ["save_contractor_quote"]);
  }
});

test("invalid persistence acknowledgement cannot claim a confirmed save", async () => {
  const h = harness();
  h.client.rpc = async () => ({ data: null, error: null });
  assert.equal((await saveQuoteRequest(request(), h.client, h.dispatch)).status, 500);
  assert.deepEqual(h.calls, []);
});

test("unexpected webhook failure still returns a successful committed save", async () => {
  const h = harness();
  const r = await saveQuoteRequest(request({ ...quote, status: "READY" }), h.client, async () => { throw new Error("network unavailable"); });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.saved, true);
  assert.equal(body.leadSync.status, "failed");
});
