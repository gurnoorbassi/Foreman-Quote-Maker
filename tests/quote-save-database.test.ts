import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase, asOwner } from "./helpers/database.ts";
import { quote, otherOwnerId } from "./fixtures/quote.ts";

let db: PGlite;
before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("reset role; truncate public.contractor_quotes cascade");
  await asOwner(db);
});
const save = (value: unknown) => db.query<{ result: { id: string; updatedAt: string } }>(
  "select public.save_contractor_quote($1::jsonb) as result", [JSON.stringify(value)],
);
const snapshot = async () => ({
  quotes: (await db.query<Record<string, unknown>>("select * from public.contractor_quotes order by id")).rows,
  items: (await db.query<Record<string, unknown>>("select * from public.contractor_quote_items order by sort_order")).rows,
});

test("creates and replaces a complete quote, preserves identity, and supports retries", async () => {
  const first = await save(quote);
  assert.equal(first.rows[0].result.id, quote.id);
  assert.ok(first.rows[0].result.updatedAt);
  const changed = { ...quote, projectTitle: "Updated project", items: [quote.items[1]] };
  await save(changed);
  await save(changed);
  const state = await snapshot();
  assert.equal(state.quotes.length, 1);
  assert.equal(state.quotes[0].project_title, "Updated project");
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].name, "Installation");
  assert.equal(state.items[0].sort_order, 0);
});

test("item insertion failure rolls back header edits AND deletion of the original items", async () => {
  await save(quote);
  const original = await snapshot();
  await assert.rejects(save({ ...quote, projectTitle: "Must roll back", items: [{ ...quote.items[0], cost: 10_000_000_000 }] }), { code: "22003" });
  assert.deepEqual(await snapshot(), original);
});

test("a failed new quote leaves neither an orphan header nor partial items", async () => {
  await assert.rejects(save({ ...quote, items: [quote.items[0], { ...quote.items[1], qty: -1 }] }), { code: "23514" });
  assert.deepEqual(await snapshot(), { quotes: [], items: [] });
});

test("a duplicate number on a new ID fails without overwriting the existing quote", async () => {
  await save(quote);
  const original = await snapshot();
  await assert.rejects(save({ ...quote, id: "44444444-4444-4444-8444-444444444444", projectTitle: "Collision" }), { code: "23505" });
  assert.deepEqual(await snapshot(), original);
});

test("renaming a quote preserves its ID and file associations", async () => {
  await save(quote);
  await db.query(`insert into public.contractor_quote_files
    (owner_id, quote_id, storage_path, original_name, mime_type, size_bytes)
    values (auth.uid(), $1, 'synthetic/file.pdf', 'file.pdf', 'application/pdf', 100)`, [quote.id]);
  await save({ ...quote, quoteNumber: "Q-RENAMED" });
  const state = await snapshot();
  assert.equal(state.quotes.length, 1);
  assert.equal(state.quotes[0].quote_number, "Q-RENAMED");
  assert.equal((await db.query<{ quote_id: string }>("select quote_id from public.contractor_quote_files")).rows[0].quote_id, quote.id);
});

test("RLS rejects saving another owner's ID while allowing the same number for another owner", async () => {
  await save(quote);
  const original = await snapshot();
  await asOwner(db, otherOwnerId);
  await assert.rejects(save({ ...quote, projectTitle: "Unauthorized overwrite" }), { code: "42501" });
  await save({ ...quote, id: "44444444-4444-4444-8444-444444444444" });
  await asOwner(db);
  assert.deepEqual(await snapshot(), original);
});

test("function rejects unauthenticated users and grants no anonymous execution", async () => {
  await asOwner(db, "");
  await assert.rejects(save(quote), { code: "42501" });
  await db.exec("reset role; set role anon");
  await assert.rejects(save(quote), { code: "42501" });
});

test("empty, absent, or malformed items cannot erase an existing quote", async () => {
  await save(quote);
  const original = await snapshot();
  for (const items of [[], null, {}, undefined, Array.from({ length: 251 }, () => quote.items[0])]) {
    await assert.rejects(save({ ...quote, items }), { code: "22023" });
    assert.deepEqual(await snapshot(), original);
  }
});
