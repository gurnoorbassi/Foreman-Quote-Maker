import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { quoteSchema } from "../src/lib/quote-schema.ts";

const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const draft = (number: string) => ({ quoteNumber: number, status: "DRAFT", customerName: "Test customer", customerEmail: "", customerPhone: "", projectAddress: "", projectType: "Repair", projectTitle: "Original", description: "", scope: "", paymentTerms: "", assumptions: "", exclusions: "", markup: 18, contingency: 5, tax: 5, deposit: 30, discount: 0, items: [{name: "Labour", category: "Labour", qty: 2, unit: "hours", cost: 50}] });
const identity = (id: string) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
const save = async (quote: ReturnType<typeof draft>, id: string | null = null) => {
  const { rows } = await db.query<{id: string}>("select public.save_contractor_quote($1::jsonb, $2::uuid) as id", [JSON.stringify(quote), id]);
  return rows[0].id;
};
const snapshot = async (id: string) => ({
  header: (await db.query<Record<string, unknown>>("select * from public.contractor_quotes where id=$1", [id])).rows,
  items: (await db.query<Record<string, unknown>>("select * from public.contractor_quote_items where quote_id=$1 order by sort_order", [id])).rows,
});
before(async () => {
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth, public to authenticated;
    insert into auth.users values ('${owner}'), ('${other}');`);
  const initial = readFileSync(new URL("../supabase/migrations/20260713214337_contractor_quote_backend.sql", import.meta.url), "utf8");
  // Storage service is outside this local PostgreSQL test; use the real table/RLS SQL.
  await db.exec(initial.split("insert into storage.buckets")[0]);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261022184512_atomic_quote_save.sql", import.meta.url), "utf8"));
  await db.exec("set role authenticated");
  await identity(owner);
});
after(() => db.close());

test("API schema rejects overflowing numbers and invalid IDs before writes", () => {
  assert.equal(quoteSchema.safeParse(draft("bounds")).success, true);
  for (const value of [1e20, -1, Infinity, NaN]) {
    assert.equal(quoteSchema.safeParse({...draft("bounds"), discount: value}).success, false);
    assert.equal(quoteSchema.safeParse({...draft("bounds"), items: [{...draft("bounds").items[0], qty: value}]}).success, false);
    assert.equal(quoteSchema.safeParse({...draft("bounds"), items: [{...draft("bounds").items[0], cost: value}]}).success, false);
  }
  assert.equal(quoteSchema.safeParse({...draft("bounds"), id: "wrong"}).success, false);
});

test("legacy separate delete/insert loses items on overflow (reproduction)", async () => {
  const id = await save(draft("legacy"));
  await db.query("delete from public.contractor_quote_items where quote_id=$1", [id]);
  await assert.rejects(db.query("insert into public.contractor_quote_items(owner_id,quote_id,name,category,quantity,unit,unit_cost) values ($1,$2,'Bad','Labour',1e20,'hours',50)", [owner,id]));
  assert.equal((await snapshot(id)).items.length, 0);
});

test("failed item replacement rolls back metadata and original items", async () => {
  const quote = draft("rollback"); const id = await save(quote); const prior = await snapshot(id);
  await assert.rejects(save({...quote, projectTitle: "Must not persist", items: [{...quote.items[0], qty: 1e20}]}, id));
  assert.deepEqual(await snapshot(id), prior);
});

test("failed new quote leaves no partial header", async () => {
  const quote = draft("bad-new");
  await assert.rejects(save({...quote, items: [{...quote.items[0], cost: 1e20}]}));
  assert.equal((await db.query("select id from public.contractor_quotes where quote_number='bad-new'")).rows.length, 0);
});

test("duplicate new number rejects instead of overwriting; ID update replaces items", async () => {
  const quote = draft("duplicate"); const id = await save(quote); const prior = await snapshot(id);
  await assert.rejects(save({...quote, projectTitle: "Overwrite attempt"}), {code: "23505"});
  assert.deepEqual(await snapshot(id), prior);
  assert.equal(await save({...quote, quoteNumber: "renamed", projectTitle: "Changed", items: [{...quote.items[0], cost: 75}, {...quote.items[0], name: "Materials", cost: 25}]}, id), id);
  const current = await snapshot(id);
  assert.equal(current.header[0].project_title, "Changed");
  assert.equal(current.items.length, 2);
  assert.deepEqual(current.items.map(item => Number(item.unit_cost)), [75,25]);
});

test("cross-owner ID and forged payload owner cannot modify another quote", async () => {
  const quote = draft("private"); const id = await save(quote); const prior = await snapshot(id);
  await identity(other);
  try {
    assert.equal((await snapshot(id)).header.length, 0);
    await assert.rejects(save({...quote, projectTitle: "Unauthorized"}, id), {code: "P0002"});
    const own = await save(Object.assign(draft("owned-by-caller"), { owner_id: owner }));
    assert.equal((await snapshot(own)).header[0].owner_id, other);
  } finally { await identity(owner); }
  assert.deepEqual(await snapshot(id), prior);
});

test("empty items, missing ID and anonymous callers are rejected", async () => {
  await assert.rejects(save({...draft("empty"), items: []}), {code: "22023"});
  await assert.rejects(save(draft("missing"), "20000000-0000-4000-8000-000000000001"), {code: "P0002"});
  await identity("");
  try { await assert.rejects(save(draft("no-auth")), {code: "42501"}); }
  finally { await identity(owner); }
  await db.exec("reset role; set role anon");
  try { await assert.rejects(save(draft("anon")), {code: "42501"}); }
  finally { await db.exec("reset role; set role authenticated"); await identity(owner); }
});
