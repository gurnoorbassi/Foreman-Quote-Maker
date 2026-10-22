# Foreman — Contractor Quote Generator

A focused, responsive contractor quoting application. It deliberately excludes CRM, scheduling, invoicing, payroll, job tracking, payments, and subcontractor management.

## Included

- Contractor quote dashboard and responsive quote editor
- Live calculation of subtotal, markup, contingency, discount, tax, final total, and deposit
- Editable/reorder-ready cost item model with no negative-cost inputs
- Customer/project details, scope, payment terms, assumptions, exclusions, and customer preview
- Direct, server-generated customer PDF download (never a page screenshot)
- Live Supabase PostgreSQL backend with row-level security on every contractor table
- Passwordless Supabase authentication with server-validated claims and protected routes
- Private Supabase Storage bucket with per-user paths, MIME validation, 15 MB limits, and signed access
- Persistent quotes, quote items, statuses, templates, saved prices, company settings, and file metadata
- Quote search/filter, document preview/download/delete, and database-backed dashboard totals
- Server-only Anthropic assistant endpoint with a strict price guard and input validation
- Environment template and clear error response when the AI key is absent

## Run locally

1. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key. Add `ANTHROPIC_API_KEY` only if you want AI suggestions enabled.
2. Install dependencies: `npm install`
3. Apply the SQL files under `supabase/migrations` to the target Supabase project.
4. Start the app: `npm run dev`
5. Visit `http://localhost:3000` and sign in with an email magic link.

## Reliable quote saves

Quote saves use a stable UUID, independent of the editable quote number. Retrying
after a lost response updates the same quote. Reusing another quote's number
returns a conflict; change the number in Job details to retry safely.

The `save_contractor_quote` database function saves the header and replaces all
items in one transaction. Any failure rolls back the entire save. Updates lock
the parent quote until the item replacement completes, preventing interleaved
item sets. The function runs as the caller with existing row-level security and
derives ownership from `auth.uid()`. Lead sync runs only after a confirmed save.

Before releasing this version, apply
`supabase/migrations/20261022190551_atomic_quote_save.sql` to the intended database,
then release the matching application and reload older browser sessions. The
save API now requires `id` (a UUID); the migration alone does not switch older
application instances to atomic saves. No migration is run by the build or tests.

Save failures leave edits in the open editor and clear the busy state. PDF
download saves the current editor first. Unsaved drafts do not survive a browser
reload, and separate tabs still use last-writer-wins rather than conflict detection.

## Verification

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:browser
```

Database tests execute all application SQL migrations in an isolated PGlite
PostgreSQL engine with synthetic users and minimal Supabase platform schemas.
They cover rollback, retries, identity, number conflicts, and RLS boundaries.
The browser suite renders the real editor with controlled API responses; it
does not authenticate against a hosted project. These checks require no secrets,
production data, or external webhooks. Hosted Supabase/PostgREST integration and
true simultaneous database sessions require separate staging verification.

## Netlify deployment

Connect this folder to Netlify and let it detect Next.js. The included `netlify.toml` uses Node 22 and runs the production build. Add these environment variables in Netlify project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` when AI is enabled

In Supabase Authentication URL settings, set the Site URL to the production Netlify domain and allow both `https://your-domain/auth/confirm` and `http://localhost:3000/auth/confirm` as redirect URLs.

## Security notes

- The Anthropic key is read exclusively in `src/app/api/ai/organize/route.ts`; it is never exposed to the browser.
- Server routes validate Supabase JWT claims. Database RLS independently enforces the same owner boundary.
- Uploaded documents use the private `contractor-quote-documents` bucket and paths beginning with the authenticated user ID.
- AI output is always an unpriced proposal and must be explicitly accepted by the contractor before it is added to a quote.
