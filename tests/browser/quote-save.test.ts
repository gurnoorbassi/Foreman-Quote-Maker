import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect, type Browser, type Page, type Route } from "@playwright/test";

// Browser regressions against the actual React component. All API responses below
// are explicit test doubles: no Next auth bypass, account, database, or remote API.
type SubmittedQuote = { id: string; quoteNumber: string; customerName: string; projectTitle: string; [key: string]: unknown };
const existingId = "9738f83a-d36c-44ac-9b6e-725d8c692cf0";
const existingQuote = {
  id: existingId, quoteNumber: "Q-2026-EXISTING", status: "DRAFT", customerName: "Existing customer",
  customerEmail: "", customerPhone: "", projectAddress: "Test address", projectTitle: "Original project", projectType: "Custom",
  description: "Original description", scope: "Test scope", paymentTerms: "On completion", assumptions: "", exclusions: "",
  markup: 18, contingency: 5, tax: 5, deposit: 30, discount: 0,
  items: [{ id: "existing-item", name: "Test work", category: "Labour", qty: 1, unit: "each", cost: 100 }],
};
const metrics = { totalQuotes: 0, createdThisMonth: 0, drafts: 0, sent: 0, accepted: 0, totalValue: 0 };
let browser: Browser;
let server: Server;
let origin: string;

before(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const result = await build({
    stdin: {
      contents: 'import { createRoot } from "react-dom/client"; import QuoteWorkspace from "./src/components/quote-workspace"; createRoot(document.getElementById("root")).render(<QuoteWorkspace userEmail="browser-test@example.invalid" />);',
      resolveDir: root,
      loader: "tsx",
    },
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
  });
  const javascript = result.outputFiles[0].text;
  server = createServer((request, response) => {
    if (request.url === "/app.js") {
      response.writeHead(200, { "content-type": "application/javascript" });
      response.end(javascript);
    } else if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>');
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function workspace(t: TestContext, options: { existing?: boolean; save: (route: Route, payload: SubmittedQuote) => Promise<void> }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  t.after(() => context.close());
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  const state = { submissions: [] as SubmittedQuote[], pdfRequests: [] as string[], failRefresh: false, listRequests: 0 };
  page.on("pageerror", (error) => pageErrors.push(error.message));
  t.after(() => { assert.deepEqual(pageErrors, [], "No uncaught browser errors"); assert.deepEqual(unexpectedRequests, [], "No unexpected network requests"); });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpectedRequests.push(url.href); await route.abort(); return; }
    const path = url.pathname;
    if (path === "/" || path === "/app.js") { await route.continue(); return; }
    if (path === "/api/quotes" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as SubmittedQuote;
      state.submissions.push(payload);
      await options.save(route, payload);
      return;
    }
    if (path === "/api/quotes") {
      state.listRequests += 1;
      if (state.failRefresh) { await route.fulfill({ status: 503, json: { error: "Test list refresh unavailable" } }); return; }
      const quotes = options.existing ? [{ ...existingQuote, number: existingQuote.quoteNumber, total: 129.15, createdAt: "2026-10-22T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z" }] : [];
      await route.fulfill({ json: { quotes, metrics } }); return;
    }
    if (path === `/api/quotes/${existingId}`) { await route.fulfill({ json: { quote: existingQuote } }); return; }
    if (path === "/api/price-items") { await route.fulfill({ json: { items: [] } }); return; }
    if (path === "/api/templates") { await route.fulfill({ json: { templates: [] } }); return; }
    if (path === "/api/uploads") { await route.fulfill({ json: { files: [] } }); return; }
    if (path === "/api/settings") {
      await route.fulfill({ json: { settings: { companyName: "Test company", contactName: "Test contractor", phone: "", email: "", address: "", defaultTax: 5, defaultMarkup: 18, defaultContingency: 5, defaultDeposit: 30 } } }); return;
    }
    if (path.startsWith("/api/pdf/")) {
      state.pdfRequests.push(path);
      // Download routing/order is under test; PDF rendering is tested separately.
      await route.fulfill({ contentType: "application/pdf", headers: { "content-disposition": 'attachment; filename="test-quote.pdf"' }, body: "%PDF-1.4\n% Mock PDF response" }); return;
    }
    unexpectedRequests.push(path); await route.abort();
  });
  await page.goto(origin);
  await expect(page.getByRole("heading", { name: "Your quoting command centre" })).toBeVisible();
  return { page, state };
}

async function newDraft(page: Page) {
  await page.getByRole("button", { name: "New quote", exact: true }).click();
  await page.getByLabel("Customer name", { exact: true }).fill("Retry customer");
  await page.getByLabel("Project title", { exact: true }).fill("Retained project");
  await page.getByRole("textbox", { name: "Project description", exact: true }).fill("Keep these edits after a failed save");
}

test("network/malformed saves retain edits; conflict correction retries the same draft UUID", { timeout: 30_000 }, async (t) => {
  let attempt = 0;
  const { page, state } = await workspace(t, { save: async (route, payload) => {
    attempt += 1;
    if (attempt === 1) { await route.abort("failed"); return; }
    if (attempt === 2) { await route.fulfill({ status: 502, contentType: "text/html", body: "Unavailable" }); return; }
    if (attempt === 3) { await route.fulfill({ status: 409, json: { error: "A quote already uses that number. Change the quote number and try again." } }); return; }
    await route.fulfill({ json: { id: payload.id, saved: true, leadSync: { status: "skipped" } } });
  } });
  await newDraft(page);
  const originalNumber = await page.getByLabel("Quote number", { exact: true }).inputValue();
  for (let failure = 0; failure < 2; failure += 1) {
    await page.getByRole("button", { name: "Save quote", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("save could not be confirmed");
    await expect(page.getByRole("button", { name: "Save quote", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("Retry customer");
    await expect(page.getByRole("textbox", { name: "Project description", exact: true })).toHaveValue("Keep these edits after a failed save");
  }
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Change the quote number");
  await page.getByLabel("Quote number", { exact: true }).fill("Q-RECOVERED");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.getByText("Quote saved to the database", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  assert.equal(state.submissions.length, 4);
  assert.match(state.submissions[0].id, /^[a-f0-9-]{36}$/);
  assert.equal(new Set(state.submissions.map((quote) => quote.id)).size, 1);
  assert.deepEqual(state.submissions.slice(0, 3).map((quote) => quote.quoteNumber), [originalNumber, originalNumber, originalNumber]);
  assert.equal(state.submissions[3].quoteNumber, "Q-RECOVERED");
  assert.equal(state.submissions[3].projectTitle, "Retained project");
});

test("a delayed save prevents duplicate submissions and switching into a new draft", { timeout: 30_000 }, async (t) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  t.after(() => release());
  const { page, state } = await workspace(t, { save: async (route, payload) => {
    await pending;
    await route.fulfill({ json: { id: payload.id, saved: true } });
  } });
  await newDraft(page);
  const originalNumber = await page.getByLabel("Quote number", { exact: true }).inputValue();
  // Same-turn clicks also exercise the ref guard, before relying on disabled UI.
  await page.getByRole("button", { name: "Save quote", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => state.submissions.length).toBe(1);
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "New quote", exact: true }).click();
  await expect(page.getByText("Please wait for the quote to finish saving", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Quote number", { exact: true })).toHaveValue(originalNumber);
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("Retry customer");
  await page.getByRole("button", { name: "All quotes", exact: true }).click();
  await expect(page.getByLabel("Project title", { exact: true })).toHaveValue("Retained project");
  release();
  await expect(page.getByText("Quote saved to the database", { exact: true })).toBeVisible();
  assert.equal(state.submissions.length, 1);
  await page.getByRole("button", { name: "New quote", exact: true }).click();
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Quote number", { exact: true })).not.toHaveValue(originalNumber);
});

test("existing-quote PDF saves current edits first; refresh failure preserves successful save", { timeout: 30_000 }, async (t) => {
  let attempt = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  t.after(() => release());
  const { page, state } = await workspace(t, { existing: true, save: async (route, payload) => {
    attempt += 1;
    if (attempt === 1) { await route.fulfill({ status: 500, json: { error: "Test save failed" } }); return; }
    await pending;
    await route.fulfill({ json: { id: payload.id, saved: true } });
  } });
  await page.getByRole("button", { name: /Q-2026-EXISTING/ }).click();
  await page.getByLabel("Project title", { exact: true }).fill("Latest unsaved project title");
  await page.getByRole("button", { name: "Preview & PDF", exact: true }).click();
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Test save failed");
  await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeEnabled();
  assert.deepEqual(state.pdfRequests, []);
  assert.equal(state.submissions[0].id, existingId);
  assert.equal(state.submissions[0].projectTitle, "Latest unsaved project title");

  state.failRefresh = true;
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await expect.poll(() => state.submissions.length).toBe(2);
  await expect(page.getByRole("button", { name: "Preparing…", exact: true })).toBeDisabled();
  assert.deepEqual(state.pdfRequests, [], "No PDF request while the save is pending");
  const download = page.waitForEvent("download");
  release();
  await download;
  await expect(page.getByText("Quote saved; the quote list could not refresh", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  assert.equal(state.submissions[1].id, existingId);
  assert.equal(state.submissions[1].projectTitle, "Latest unsaved project title");
  assert.deepEqual(state.pdfRequests, [`/api/pdf/${existingId}`]);
  assert.equal(state.listRequests, 2);
});
