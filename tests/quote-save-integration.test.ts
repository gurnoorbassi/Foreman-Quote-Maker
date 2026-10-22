import assert from "node:assert/strict";
import test from "node:test";
import { createTestDatabase, asOwner } from "./helpers/database.ts";
import { quote, ownerId } from "./fixtures/quote.ts";
import { saveQuoteRequest, type QuoteSaveClient } from "../src/lib/quotes/save-quote.ts";

test("save request persists through the actual SQL function and rejects collisions end to end", async () => {
  const db = await createTestDatabase();
  try {
    await asOwner(db);
    const client: QuoteSaveClient = {
      auth: { getClaims: async () => ({ data: { claims: { sub: ownerId } } }) },
      rpc: async (_, args) => {
        try {
          const result = await db.query<{ result: unknown }>("select public.save_contractor_quote($1::jsonb) as result", [JSON.stringify(args.p_quote)]);
          return { data: result.rows[0].result, error: null };
        } catch (error) {
          return { data: null, error: error as { code: string; message: string } };
        }
      },
    };
    const dispatched: string[] = [];
    const dispatch = async (value: { id: string }) => {
      // Check the data is committed and visible before the downstream event.
      const saved = await db.query("select id from public.contractor_quotes where id = $1", [value.id]);
      assert.equal(saved.rows.length, 1);
      dispatched.push(value.id);
      return { status: "disabled" as const };
    };
    const send = (body: unknown) => saveQuoteRequest(new Request("http://localhost/api/quotes", {
      method: "POST", body: JSON.stringify(body),
    }), client, dispatch);
    const response = await send(quote);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, quote.id);
    const collision = await send({ ...quote, id: "55555555-5555-4555-8555-555555555555" });
    assert.equal(collision.status, 409);
    assert.equal(dispatched.length, 1);
    const retry = await send({ ...quote, projectTitle: "Retried edit" });
    assert.equal(retry.status, 200);
    const state = await db.query<{ project_title: string }>("select project_title from public.contractor_quotes");
    assert.deepEqual(state.rows, [{ project_title: "Retried edit" }]);
    assert.equal((await db.query("select id from public.contractor_quote_items")).rows.length, 2);
  } finally {
    await db.close();
  }
});
