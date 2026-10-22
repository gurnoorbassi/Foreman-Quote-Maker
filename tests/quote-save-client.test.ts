import assert from "node:assert/strict";
import test from "node:test";
import { downloadSavedQuote, persistQuote } from "../src/lib/quote-save-client.ts";

function response(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

test("save sends the existing quote id and current edits", async () => {
  const payload = { id: "existing-id", quoteNumber: "Q-test", projectTitle: "Latest revision" };
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, "/api/quotes");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), payload);
    return new Response(JSON.stringify({ id: "existing-id" }));
  };
  assert.equal((await persistQuote(payload, request)).id, "existing-id");
});

test("network rejection, invalid JSON, API rejection and missing id cannot confirm a save", async () => {
  await assert.rejects(persistQuote({}, async () => { throw new Error("Offline"); }), /Could not confirm/);
  await assert.rejects(persistQuote({}, async () => new Response("bad JSON")), /Could not confirm/);
  await assert.rejects(persistQuote({}, response({ error: "Quote no longer exists" }, 404)), /no longer exists/);
  await assert.rejects(persistQuote({}, response({})), /Could not confirm/);
});

test("PDF waits for a successful save of current edits before navigating", async () => {
  let finish!: (id: string) => void;
  const saved = new Promise<string>((resolve) => { finish = resolve; });
  const navigations: string[] = [];
  let saves = 0;
  const download = downloadSavedQuote(() => { saves++; return saved; }, (url) => navigations.push(url));
  assert.equal(saves, 1);
  assert.deepEqual(navigations, []);
  finish("saved-current-version");
  await download;
  assert.deepEqual(navigations, ["/api/pdf/saved-current-version"]);
});

test("PDF never navigates when save returns no id or throws", async () => {
  const navigations: string[] = [];
  for (const save of [async () => null, async () => { throw new Error("Offline"); }]) {
    await assert.rejects(downloadSavedQuote(save, (url) => navigations.push(url)));
  }
  assert.deepEqual(navigations, []);
});
