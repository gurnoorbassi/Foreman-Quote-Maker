# Foreman quote-save reliability

## Provenance and scope

- Original commit: `363edee59aec95d6bee866801ec495c74c6e65ea`.
- Fresh Git worktree: `foreman-worktree`, backed by the separate `foreman-source.git` repository.
- Review branch: `codex/foreman-reliability-20261022`.
- Only the requested commit was fetched. No existing pull requests or later implementation history were consulted.
- No my-team skill or specialist profiles were used. Two ordinary Codex subagents handled bounded inspection/review and editor/browser work; the primary agent implemented the database/API and integrated verification.
- No remote push, deployment, merge, hosted database changes, or live webhook calls.

## Selected problem and evidence

The original save endpoint committed three independent requests: upsert the quote
by display number, delete its old items, then insert replacements. A numeric
overflow in the final request could permanently erase pricing while retaining
only part of the requested update. Repeated short display numbers could also
overwrite a different quote.

An isolated reproduction of the original sequence started with two items. An
item cost of `10000000000` produced PostgreSQL error `22003`; the quote then had
zero items and its changed header remained committed. This is core customer-data
loss, making it more worthwhile than cosmetic improvements.

## Implementation and changed files

| File | Purpose |
| --- | --- |
| `src/app/api/quotes/route.ts` | Delegates POST to the tested save handler; removes independent delete/insert requests. |
| `src/lib/quotes/save-quote.ts` | Stable UUID validation, numeric storage bounds, malformed-JSON handling, atomic RPC, safe conflict/errors, post-commit lead dispatch. |
| `supabase/migrations/20261022190551_atomic_quote_save.sql` | Transactional header/item save, UUID conflict locking, caller RLS, authenticated-only execution, owner derived from auth identity. |
| `src/components/quote-workspace.tsx` | Retained draft identity, editable numbers, recoverable save errors, overlapping-save/navigation guards, current-content save before PDF. |
| `src/lib/quote-save-client.ts` | Draft identity creation and strict save-response confirmation. |
| `src/lib/pdf/quote.ts` | Fits and right-aligns the quote number in the PDF header. |
| `tests/quote-save-api.test.ts` | Validation, authorization, failure handling, and lead-dispatch ordering. |
| `tests/quote-save-database.test.ts` | Real SQL rollback, retry, collision, identity/file association, and RLS regression tests. |
| `tests/quote-save-integration.test.ts` | Runs the request handler through the actual migrated SQL function. |
| `tests/quote-save-client.test.ts` | Client identity, retries, conflicts, malformed acknowledgements, and lead-sync warnings. |
| `tests/quote-pdf.test.ts` | PDF generation and quote-number header bounds. |
| `tests/browser/quote-save.test.ts` | Real React editor in Chromium with controlled API responses. |
| `tests/fixtures/quote.ts`, `tests/helpers/database.ts` | Synthetic fixtures and isolated PostgreSQL/platform-schema setup. |
| `package.json`, `package-lock.json` | Reproducible test dependencies, typecheck and browser commands. |
| `tsconfig.json` | Allows the existing TypeScript test import convention. |
| `.gitignore` | Excludes Supabase CLI temporary metadata. |
| `README.md` | Save semantics, migration/release order, test instructions, and limitations. |
| `IMPLEMENTATION_REPORT.md` | Evidence and handoff record. |

The function follows Supabase's [database function security guidance](https://supabase.com/docs/guides/database/functions): caller permissions, an empty search path, and explicit execution grants. The bundled Next.js route-handler documentation was read before implementation.

## Verification results

- Baseline: 2 tests passed; ESLint passed; standalone TypeScript failed with existing `TS5097` because `.ts` test imports were disallowed.
- Final `npm test`: **23 passed, 0 failed** (includes the original 2 tests).
- Final `npm run test:browser`: **3 passed, 0 failed**. Covers network/malformed failures, retained edits and identity, conflict recovery, duplicate saves, navigation during saves, PDF request ordering, and refresh failure after a committed save. No uncaught browser errors or unexpected network requests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; production Next.js routes compiled and all 15 static-page generation steps completed.
- `git diff --check`: passed.
- Existing PDF smoke script produced a valid two-page, 3,723-byte PDF; first page rendered and visually inspected. Default and maximum-length quote-number header bounds are also tested.
- Independent review found no blocking defect. The reviewer independently reran the added PDF and request/SQL integration tests: 2 passed.

All application SQL migrations run in PGlite, including the actual constraints,
grants, policies, and new function. Only Supabase's platform schemas and identity
provider are represented by minimal local fixtures. Browser tests use explicit
API doubles and the real component; they are functional tests without application
CSS, not responsive visual or hosted authentication tests.

## Remaining issues and unverified behavior

- Hosted Supabase/PostgREST, real authentication refresh, and real multi-session concurrency have not been tested. The SQL lock design was reviewed; PGlite tests use one database session. Docker's local daemon was unavailable.
- Separate browser tabs remain last-writer-wins. Unsaved edits/draft identity are retained only while the editor remains mounted, not after a page reload or closing the browser.
- Existing precision mismatch remains: values with more than two decimals are rounded in storage while downstream lead calculations use request values.
- Existing direct item/file write policies check child ownership but do not require matching parent ownership. The new save function derives and preserves the owner and its cross-owner overwrite test passes; the broader direct-write policy issue is outside this change.
- Extremely long custom quote numbers become small in the fitted header; the existing footer has no corresponding width limit. Normal generated numbers fit. Broader PDF Unicode/layout behavior was not changed.
- Existing Node module-type warnings remain non-failing. Poppler reported missing optional system fonts, but generated the inspected raster successfully.

## Execution measurements and retries

First timed tool: **2026-10-22 19:01:50 UTC**. Final verification completed at
**19:15:43 UTC** (13 minutes 53 seconds). Documentation and local commit followed;
the final response reports the complete measured execution window.

- Agents: primary plus **2 ordinary subagents**, reused for subsequent work; no specialist profiles or model overrides.
- Failed unit/database/PDF test suites: **0**.
- Browser suite: initial run had 2 passes and one harness-selector failure; corrected and rerun successfully, then independently rerun by the primary agent. **One browser retry**, three total suite executions.
- Typecheck correction cycles after the baseline: **3** (missing webhook result field; SQL-test row typing; diagnostic script extension). All final checks pass. The baseline import configuration failure was fixed separately.
- Local commit required **one retry** because the isolated repository lacked author configuration; the retry used the already configured parent workspace identity (`Codex <codex@local>`) through command-scoped Git settings.
- Setup fallbacks: initial repository search was too broad, then authenticated repository inventory located the project; a `.mdx` guide lookup was corrected to bundled `.md`; web fetching of the Markdown changelog was replaced with a direct HTTP read; unavailable Docker was replaced by PGlite. No production actions were retried.

Available cumulative session snapshots, taken before final reporting:

| Session | Input | Cached input (subset) | Output | Total |
| --- | ---: | ---: | ---: | ---: |
| Primary, 19:15:43 UTC | 3,124,958 | 3,011,328 | 18,411 | 3,143,369 |
| Editor/browser subagent | 1,604,403 | 1,539,328 | 14,958 | 1,619,361 |
| Inspection/review subagent, 19:14:49 UTC | 928,166 | 835,456 | 4,505 | 932,671 |
| Sum of snapshots | 5,657,527 | 5,386,112 | 37,874 | 5,695,401 |

These are recorded session counters, include repeated context and cached input,
exclude subsequent reporting overhead, and are not billing or dollar-cost figures.
Reasoning tokens are included in output, not additive to it.

## Intervention needed

No intervention is needed to review or rerun the local checks. Before any future
release, apply the new migration in a test environment and verify hosted auth,
RPC behavior, and concurrent saves. Production adoption requires the migration,
the matching application version, and reloading old browser sessions because
POST now requires the stable UUID. Nothing has been applied remotely.
