# Verification audit

Audit date: 2026-07-19 (UTC)  
Repository: `invoice-readiness-ai`  
Scope: implementation verification only; no product code or schema was changed.

## Executive summary

The repository is a small, coherent Next.js 16 App Router application. It genuinely implements Supabase OAuth entry points, server-side route protection, client-side CSV/XLS/XLSX parsing and column mapping, direct browser-to-Supabase bulk invoice insertion, a deterministic readiness rules engine, and a server-rendered invoice dashboard. With Node 22, the lockfile install, 11 unit tests, ESLint, TypeScript, and the production build pass. A local Supabase database was started, both migrations applied, two consecutive clean resets passed, and live SQL assertions confirmed that invoice/profile RLS prevents ordinary authenticated users from reading or mutating another user's rows.

The implementation is nevertheless not production-ready. The highest risks are the vulnerable and unbounded `xlsx` parser, lossy numeric/date conversion, a mismatch between optional import mappings and `NOT NULL` database columns, no duplicate-import protection, and insufficient test coverage outside the validation engine. Missing environment variables make every route return HTTP 500 rather than producing a controlled configuration failure. The OAuth callback trusts `x-forwarded-host` in production. Database ownership isolation is sound in the tested authenticated-role scenarios, but important domain constraints and duplicate-prevention indexes are absent.

No AI feature or PDF upload exists. No exposed application secret was found in tracked source. The only credential-like values observed were Supabase CLI local-development defaults printed by the CLI; they were not written to the repository.

## Current implemented features

- Google and GitHub OAuth buttons are implemented in `src/app/login/oauth-buttons.tsx:7-50` using Supabase's browser client.
- PKCE code exchange is implemented at `src/app/auth/callback/route.ts:4-25`, with a dedicated error page at `src/app/auth/auth-code-error/page.tsx:3-20`.
- Proxy-level session refresh and unauthenticated redirects are implemented at `src/proxy.ts:4-18` and `src/utils/supabase/middleware.ts:5-42`; protected pages also call `auth.getUser()` independently (`src/app/page.tsx:7-15`, `src/app/invoices/page.tsx:16-24`, `src/app/invoices/import/page.tsx:5-13`).
- Sign-out is a server action (`src/app/auth/actions.ts:6-10`).
- CSV and spreadsheet parsing, header normalization, auto-mapping, and row mapping are implemented in `src/lib/invoice-import.ts:18-165`.
- The import UI includes file selection, parse errors, a ten-row preview, mapping controls, readiness summary, in-progress state, and insert success/error feedback (`src/app/invoices/import/import-client.tsx:19-275`).
- The validation engine checks required values, positive amounts, currency, real calendar dates, and known statuses and calculates scores/summaries (`src/lib/validation.ts:68-245`).
- The dashboard loads invoices through the server Supabase client and computes readiness and status aggregates in application memory (`src/app/invoices/page.tsx:16-45`), then renders summary cards, issue counts, an empty state, an error notice, and a table (`src/app/invoices/page.tsx:47-263`).
- Profiles and invoices, ownership foreign keys, timestamps, an enum, triggers, grants, RLS, and CRUD policies are defined in `supabase/migrations/20260719150241_profiles.sql:3-73` and `supabase/migrations/20260719150242_invoices.sql:3-50`.

Not implemented: AI functionality, PDF ingestion, invoice editing/deletion UI, server-side import orchestration, persisted readiness results, background processing, duplicate detection, field-mapping tests, import tests, auth tests, dashboard tests, or automated RLS tests.

## Repository architecture

### Next.js routes and component boundaries

| Route | Type | Purpose |
|---|---|---|
| `/` | Dynamic Server Component | Revalidates the user, renders identity/avatar and navigation (`src/app/page.tsx:7-65`). |
| `/login` | Dynamic Server Component plus `OAuthButtons` Client Component | Redirects an existing user home; otherwise renders OAuth controls (`src/app/login/page.tsx:5-30`, `src/app/login/oauth-buttons.tsx:1-52`). |
| `/auth/callback` | GET Route Handler | Exchanges OAuth code for a session and redirects (`src/app/auth/callback/route.ts:4-25`). |
| `/auth/auth-code-error` | Static Server Component | Generic callback failure page (`src/app/auth/auth-code-error/page.tsx:3-20`). |
| `/invoices` | Dynamic Server Component | Fetches the current user's RLS-filtered rows and computes dashboard aggregates (`src/app/invoices/page.tsx:16-45`). |
| `/invoices/import` | Dynamic Server Component plus `ImportClient` Client Component | Revalidates auth server-side and hosts interactive parsing/import (`src/app/invoices/import/page.tsx:5-31`, `src/app/invoices/import/import-client.tsx:1-275`). |

The root layout and pages are Server Components by default. Browser state, file APIs, and direct inserts are isolated to two explicit Client Components (`src/app/login/oauth-buttons.tsx:1`, `src/app/invoices/import/import-client.tsx:1`). This matches the bundled Next.js 16 server/client-component guidance. `src/proxy.ts` uses the Next.js 16 `proxy` convention rather than deprecated `middleware`; async `cookies()` in `src/utils/supabase/server.ts:5-7` is also correct for this version.

No route-level `loading.tsx`, `error.tsx`, or `not-found.tsx` exists under `src/app/`.

### Supabase clients and session flow

- Shared public configuration is read in `src/utils/supabase/config.ts:1-7`. Both variables are intentionally public because the browser requires the project URL and publishable/anon key; authorization depends on RLS, not key secrecy.
- `src/utils/supabase/client.ts:4-6` creates browser clients for OAuth and invoice inserts.
- `src/utils/supabase/server.ts:5-25` creates cookie-aware server clients. Cookie writes from a Server Component are caught because proxy performs refreshes.
- `src/utils/supabase/middleware.ts:5-42` creates a cookie-aware proxy client, calls `auth.getUser()` (server-verified rather than trusting local session data), copies refreshed cookies to the request/response, and redirects unauthenticated requests except `/login` and `/auth*`.
- Each sensitive page repeats `getUser()`, which is a useful defense rather than relying exclusively on proxy (`src/app/page.tsx:8-15`, `src/app/invoices/page.tsx:17-24`, `src/app/invoices/import/page.tsx:6-13`).
- OAuth begins in the browser with `redirectTo` set to the current origin (`src/app/login/oauth-buttons.tsx:11-24`). The callback exchanges the code into cookie-backed session state (`src/app/auth/callback/route.ts:9-22`).

### Invoice import flow

The browser reads the whole selected file into memory, treats `.csv` or `text/csv` as CSV, and treats every other accepted file as a workbook (`src/lib/invoice-import.ts:73-100`). It uses the first workbook sheet only (`src/lib/invoice-import.ts:89-99`), removes blank rows, trims all cells, guesses mappings by substring aliases (`src/lib/invoice-import.ts:102-123`), converts rows (`src/lib/invoice-import.ts:136-165`), validates them for display, and sends the entire mapped array in one PostgREST insert (`src/app/invoices/import/import-client.tsx:47-77`). No `user_id` is supplied by the UI; the database default supplies `auth.uid()` and RLS verifies it (`supabase/migrations/20260719150242_invoices.sql:7,31-34`).

The bulk `.insert(mappedRows)` is one PostgREST insert statement, so ordinary constraint failure should roll back that statement rather than create partial rows. That atomicity was inferred from the single request/statement and was not exercised end-to-end through PostgREST.

### Validation and dashboard data flow

Validation is pure in-process TypeScript with one issue maximum per rule, fixed deductions of 25 for errors and 8 for warnings, and `ready` determined only by absence of errors (`src/lib/validation.ts:63-68,193-204`). Summaries re-run validation over every invoice and aggregate issue frequencies (`src/lib/validation.ts:216-245`).

The dashboard performs an unpaginated select ordered by `created_at`, converts Postgres numeric strings with `Number`, and computes all aggregates in memory (`src/app/invoices/page.tsx:26-45`). RLS, rather than an explicit `.eq("user_id", user.id)`, restricts ownership.

### Database and RLS

`profiles.id` is both primary key and `auth.users` foreign key (`20260719150241_profiles.sql:3-10`). A `SECURITY DEFINER` trigger function with an empty search path creates a profile from the new auth user (`20260719150241_profiles.sql:50-73`). `invoices.user_id` is non-null, defaults to `auth.uid()`, references `auth.users`, and cascades on deletion (`20260719150242_invoices.sql:5-16`).

Both tables have RLS enabled (`20260719150241_profiles.sql:12`, `20260719150242_invoices.sql:20`). Profiles have SELECT/INSERT/UPDATE policies and grants (`20260719150241_profiles.sql:15-32`) but intentionally no DELETE API capability. Invoices have SELECT/INSERT/UPDATE/DELETE grants and matching owner policies, including `WITH CHECK` on INSERT and UPDATE (`20260719150242_invoices.sql:23-45`). The live policy catalog matched these definitions.

## Commands executed and exact results

The default shell selected Node `v16.20.2` and npm `8.19.4`; compatible Node `v22.22.1` was also preinstalled. Authoritative application checks used Node 22 because Next 16.2.10 requires Node `>=20.9.0` and installed Supabase JS 2.110.7 declares Node `>=22.0.0`.

| Command | Result |
|---|---|
| `npm ci` (Node 16, sandbox) | Exit 1: `esbuild` postinstall failed `spawnSync ... EPERM`; many `EBADENGINE` warnings. |
| `npm ci` (Node 16, escalated) | Exit 0: 417 packages installed; audit summary 8 vulnerabilities. Engine warnings remained. |
| `npm ci` (Node 22, escalated) | Completed clean lockfile reinstall; installed native optional bindings needed by Tailwind/Vitest. |
| `npm test` (Node 16) | Exit 1 before tests: `crypto.getRandomValues is not a function`. |
| `npm run lint` (Node 16) | Exit 2 before linting: `structuredClone is not defined`. |
| `npm run build` (Node 16) | Exit 1: Next requires Node `>=20.9.0`. |
| `npx tsc --noEmit` (Node 16) | Exit 0. |
| `npm test` (Node 22 before clean reinstall) | Exit 1 before tests: missing Tailwind native binding. |
| `npm test` (Node 22 after clean reinstall) | Exit 0: 1 test file, 11 tests passed in 492 ms; Vite CJS API deprecation warning. |
| `npm run lint` (Node 22) | Exit 0; no ESLint findings. |
| `npm run build` (Node 22, sandbox) | Exit 1: sandbox could not reach Google Fonts. |
| `npm run build` (Node 22, network allowed) | Exit 0: compiled in 15.0 s, TypeScript in 6.7 s, generated 9 static pages; routes `/`, `/auth/callback`, `/invoices`, `/invoices/import`, and `/login` recognized. |
| `npx tsc --noEmit` (Node 22) | Exit 0. |
| `npm audit --json` | Exit 1: 8 vulnerabilities (5 moderate, 2 high, 1 critical). Direct affected packages include `xlsx`, `vitest`, and `next`; details under Security findings. |
| `npm run dev` without Supabase env | Server started, but `/login`, `/`, `/invoices`, and `/invoices/import` each returned HTTP 500: “project's URL and Key are required” at `src/utils/supabase/middleware.ts:8`. |
| `npm run dev` with local Supabase public URL/key | Server ready. `/login` returned 200 and contained both OAuth buttons; `/`, `/invoices`, and `/invoices/import` each returned 307 `Location: /login`; bogus callback code returned 307 to `/auth/auth-code-error`. |
| `npx --yes supabase@latest start` | Both migrations applied, but exit 1 because optional analytics/vector health checks failed. |
| Minimal-service `supabase start` | Exit 0; migrations applied to a clean local Postgres database. |
| Live SQL RLS assertions | Cross-user invoice insert failed with an RLS error; ownership transfer failed with an RLS error; user A saw one A-owned row only; cross-user UPDATE/DELETE affected 0; own INSERT/UPDATE/DELETE succeeded; profile trigger created A's profile; A could not see/update B's profile. |
| `npx --yes supabase@latest db reset && ... db reset` | Exit 0: both consecutive clean resets applied both migrations successfully. |
| `npx --yes supabase@latest stop` | Exit 0; temporary services stopped. |

## Critical issues

### C1. Critical advisory in the test toolchain

`npm audit` reports Vitest `<3.2.6` vulnerable to arbitrary file read/execution when its UI server is listening (GHSA-5xrq-8626-4rwp). This repository uses `vitest ^2.1.9` (`package.json:31`). The configured script runs one-shot CLI tests, not the UI (`package.json:10`), which reduces normal exposure, but developer/CI dependencies should still be updated and the UI must not be network-exposed.

No critical application-runtime vulnerability or verified cross-user access bypass was found. The high-risk XLSX issue below is directly on the untrusted upload path.

## High-priority issues

### H1. Untrusted spreadsheets are processed by a vulnerable parser without resource limits

The browser passes the complete attacker-controlled workbook to `XLSX.read` and materializes the first sheet (`src/lib/invoice-import.ts:87-99`). There is no file-size, decompressed-size, row-count, column-count, or cell-length limit in the file handler (`src/app/invoices/import/import-client.tsx:28-45`). `npm audit` reports high-severity prototype-pollution and ReDoS advisories for direct dependency `xlsx 0.18.5`, with no registry fix available (`package.json:19`). A crafted file can freeze or compromise the browser context. Replace or isolate the parser and enforce limits before production import.

### H2. Optional mappings produce rows that violate required database columns

The UI marks only vendor and amount as mapping-required (`src/lib/invoice-import.ts:18-55`, `src/app/invoices/import/import-client.tsx:61-65`). Unmapped/blank currency and status become `null` (`src/lib/invoice-import.ts:153-163`), but both columns are `NOT NULL` (`supabase/migrations/20260719150242_invoices.sql:11-12`). Consequently, a normal import that follows the UI's “optional” choices fails as a whole. Unknown source statuses are silently converted to `null`, so the validation engine never displays its `status_unknown` warning before insertion (`src/lib/invoice-import.ts:154-162`, `src/lib/validation.ts:179-190`).

### H3. Numeric and date coercion can silently change invoice meaning

`parseAmount` strips every character except digits, period, and minus, then accepts the numeric prefix via `parseFloat` (`src/lib/invoice-import.ts:136-141`). Examples include parenthesized negatives becoming positive, malformed `12abc34` becoming `1234`, and locale-formatted values being misinterpreted. Invalid/missing amounts become `0`, which the database accepts because it has a default and no positive check (`20260719150242_invoices.sql:10`). XLSX is parsed with formatted strings (`raw: false`), so spreadsheet dates may become locale-dependent display values rather than `YYYY-MM-DD` (`src/lib/invoice-import.ts:92-99`); invalid dates then fail PostgreSQL insertion. This is data-integrity risk, not merely presentation.

### H4. Imports are not idempotent and duplicates are unconstrained

There is no unique constraint/index on `(user_id, invoice_number)` or another source identity; the only secondary index is `user_id` (`20260719150242_invoices.sql:18`). The import sends every parsed row and the successful import button remains usable (`src/app/invoices/import/import-client.tsx:67-77,243-268`). Re-importing a file, repeated clicks after completion, retries after an ambiguous network result, and duplicate rows within one file all create duplicates.

### H5. Production callback redirect trusts a forwarded host

After successful code exchange, production redirects to an absolute URL built directly from `x-forwarded-host` (`src/app/auth/callback/route.ts:13-20`). Unless the deployment platform strips/normalizes that header, an attacker may influence the post-login host. The `next` query value is also concatenated without restricting it to a safe same-origin path (`src/app/auth/callback/route.ts:7,16-20`). Use an explicitly configured application origin and validate `next` as a local path.

## Medium-priority issues

### M1. Environment configuration has no validation or controlled failure

Non-null assertions are used without runtime validation (`src/utils/supabase/config.ts:4-7`). The production build passes with missing values, but proxy constructs a client on every request and throws, causing even `/login` to return HTTP 500 (`src/utils/supabase/middleware.ts:5-8`). Add schema/startup validation with actionable errors and document the supported Node version.

### M2. Validation does not gate import and conflicts with database semantics

`canImport` checks only mapping presence and row count (`src/app/invoices/import/import-client.tsx:61-65`); rows with validation errors can be inserted (`src/app/invoices/import/import-client.tsx:67-75`). `invoice_number` is required by readiness (`src/lib/validation.ts:100-108`) but optional in mapping and nullable in SQL (`src/lib/invoice-import.ts:25-30`, `20260719150242_invoices.sql:9`). Blank vendor names and zero amounts are rejected by readiness but accepted by database constraints (`20260719150242_invoices.sql:8-10`). The product must decide whether readiness is advisory or an import invariant and make UI/database behavior explicit.

### M3. Dashboard is unbounded and errors are presented alongside misleading zero metrics

The dashboard selects every invoice with no pagination or server-side aggregation (`src/app/invoices/page.tsx:26-45`). On query failure it shows an error but still maps `data ?? []`, displays zero metrics, “No issues detected,” and the empty invoice message (`src/app/invoices/page.tsx:31-36,67-86,128-169`). This can make a failed load look like a valid empty account.

### M4. Authentication loses the originally requested destination

Proxy rewrites the path to `/login` without preserving it (`src/utils/supabase/middleware.ts:31-38`), OAuth does not pass a `next` value (`src/app/login/oauth-buttons.tsx:15-20`), and callback defaults to `/` (`src/app/auth/callback/route.ts:7`). A user opening `/invoices/import` must navigate back manually after login.

### M5. Proxy masks unknown routes for unauthenticated users

The broad matcher covers almost every non-asset route (`src/proxy.ts:8-18`) and unauthenticated users are redirected for any path not beginning `/login` or `/auth` (`src/utils/supabase/middleware.ts:31-38`). Thus an unknown URL returns login rather than a 404 until authenticated. Prefix matching also treats paths such as `/login-malicious` and `/authentication` as public.

### M6. Domain constraints and query indexes are incomplete

SQL permits blank vendor names, non-positive amounts, arbitrary currency strings, and duplicate invoice numbers (`20260719150242_invoices.sql:8-13`). The dashboard filters by owner and orders by creation time (`src/app/invoices/page.tsx:26-29`), but only a single-column `user_id` index exists (`20260719150242_invoices.sql:18`); a composite `(user_id, created_at desc)` index would better serve this query. Schema changes should be designed in the next milestone, not silently applied during this audit.

### M7. Node runtime requirements are unspecified and unenforced

`package.json:1-33` has no `engines` field or package-manager declaration. The default environment's Node 16 allowed installation with warnings but could not run Next, ESLint, or Vitest. The current dependency set effectively requires Node 22 because Supabase packages declare it.

## Low-priority issues

### L1. Missing route-level loading and error boundaries

There are no `loading.tsx` or `error.tsx` files. Server-side auth/data latency has no intentional loading UI, and unexpected page errors fall through to framework handling. The import component does provide parse, insertion, and importing states (`src/app/invoices/import/import-client.tsx:24-26,103-105,245-268`), and the dashboard provides an explicit empty state (`src/app/invoices/page.tsx:161-169`).

### L2. Accessibility semantics are incomplete

The visual readiness bar has no `role="progressbar"` or value attributes (`src/app/invoices/page.tsx:88-103`). Tables have headings but no captions or `scope="col"` (`src/app/invoices/page.tsx:170-235`, `src/app/invoices/import/import-client.tsx:139-190`). Detailed issues are available only through `title` tooltips (`src/app/invoices/page.tsx:202-214`, `src/app/invoices/import/import-client.tsx:164-176`), which are poor for keyboard, touch, and assistive-technology users. The hidden file input has no associated label (`src/app/invoices/import/import-client.tsx:83-102`), although the visible button has meaningful text.

### L3. Scaffold metadata remains

The page title and description are still “Create Next App” / “Generated by create next app” (`src/app/layout.tsx:15-18`), confirmed by the `/login` smoke test.

### L4. Parse diagnostics are discarded

Papa Parse errors are ignored (`src/lib/invoice-import.ts:77-84`), and the UI catch replaces every thrown detail with one generic message (`src/app/invoices/import/import-client.tsx:41-44`). Duplicate or blank headers can also collapse fields in object construction and produce duplicate React keys (`src/lib/invoice-import.ts:59-70`, `src/app/invoices/import/import-client.tsx:146-152,178-185`).

### L5. Sign-out errors are ignored

The server action redirects regardless of the result of `auth.signOut()` (`src/app/auth/actions.ts:6-10`), so a failed revocation cannot be communicated.

## Security findings

- **Cross-user isolation passed locally.** Both tables had RLS enabled. Authenticated-role SQL tests proved owner-only visibility and mutation and rejected explicit foreign `user_id` and ownership transfer. Relevant policy definitions: `20260719150241_profiles.sql:18-32` and `20260719150242_invoices.sql:26-45`.
- **Client trust is appropriately bounded for ownership, but not validation.** Direct browser inserts (`src/app/invoices/import/import-client.tsx:71-75`) rely on RLS for ownership, which passed. All other input validation is client-side and bypassable; current SQL accepts several invalid domain values (`20260719150242_invoices.sql:8-13`).
- **No exposed production secret found.** `.env.example:1-8` contains placeholders only. Public Supabase keys are designed for browser use. `.gitignore:33-34` excludes untracked `.env*` files; the already-tracked example remains present despite that broad rule.
- **OAuth callback host trust is unsafe.** See H5 (`src/app/auth/callback/route.ts:13-20`). Full provider behavior was not tested because Google/GitHub were not configured.
- **Dependency audit:** 8 total advisories: 5 moderate, 2 high, 1 critical. Direct production `xlsx` is high and has no npm-audit fix; direct `next 16.2.10` is reported moderate through bundled PostCSS; direct dev `vitest 2.1.9` is critical and pulls vulnerable Vite/esbuild packages (`package.json:15,19,31`). Assess actual upstream patched releases rather than applying npm audit's anomalous suggestion to downgrade Next to 9.3.3.
- **Denial-of-service exposure:** unbounded file reads and parsing are in `src/lib/invoice-import.ts:73-99`; mapped rows are also inserted in one unbounded payload (`src/app/invoices/import/import-client.tsx:67-75`).
- **No RLS bypass found for ordinary authenticated roles.** Service-role/table-owner bypass remains expected administrative behavior; `FORCE ROW LEVEL SECURITY` is not enabled (`20260719150241_profiles.sql:12`, `20260719150242_invoices.sql:20`).

## Database/RLS findings

1. RLS is enabled on both tables and confirmed in `pg_tables` (`20260719150241_profiles.sql:12`, `20260719150242_invoices.sql:20`).
2. Invoice SELECT/INSERT/UPDATE/DELETE policies are ownership-correct. INSERT and UPDATE have `WITH CHECK`, so users cannot specify or transfer to another `user_id` (`20260719150242_invoices.sql:26-45`). Live tests passed.
3. Profile SELECT/INSERT/UPDATE policies are ownership-correct (`20260719150241_profiles.sql:18-32`). DELETE is neither granted nor governed by a policy; profiles are deleted via the auth-user cascade (`20260719150241_profiles.sql:4,15`). Document this as intentional if it is the desired lifecycle.
4. Policies are declared to `public` rather than explicitly `authenticated`, but table grants are only issued to `authenticated` (`20260719150241_profiles.sql:15`, `20260719150242_invoices.sql:23`). No anonymous table grant was observed, so no anonymous access was demonstrated. Explicit policy roles would make intent clearer.
5. The profile trigger is appropriately `SECURITY DEFINER` with `search_path = ''` and schema-qualified objects (`20260719150241_profiles.sql:51-68`). It uses `ON CONFLICT DO NOTHING`, and live user insertion created the expected profile. The trigger function copies provider metadata without application validation (`20260719150241_profiles.sql:58-64`), which is acceptable for display data but must not become authorization data.
6. Foreign keys cascade from auth users and prevent orphan owners (`20260719150241_profiles.sql:4`, `20260719150242_invoices.sql:7`). Primary keys and the `invoices_user_id_idx` exist (`20260719150242_invoices.sql:6,18`).
7. Missing constraints/indexes: no unique `(user_id, invoice_number)`, no nonblank vendor check, no positive amount check, no currency-format constraint, and no dashboard-oriented `(user_id, created_at)` index (`20260719150242_invoices.sql:5-18`).
8. Two consecutive clean `supabase db reset` executions succeeded, so clean repeatability passed. The raw migration files are not idempotent on an already-migrated database because `CREATE POLICY`, `CREATE TRIGGER`, and `CREATE TYPE` are unconditional (`20260719150241_profiles.sql:18-32,45-48,70-73`; `20260719150242_invoices.sql:3,26-50`). Normal migration history prevents reapplying them; manual replay does not.
9. The shared `set_updated_at` trigger function is created before the invoice trigger consumes it, and timestamp triggers exist for both tables (`20260719150241_profiles.sql:34-48`, `20260719150242_invoices.sql:47-50`). Migration ordering is therefore valid.

## Test coverage gaps

Only `src/lib/validation.test.ts:1-132` exists. It covers 11 happy/edge cases for readiness and summary behavior. There is no coverage report configuration (`vitest.config.ts:3-7`), and no import, component, route, or database test is part of `npm test`.

Important missing tests:

1. Browser/server/proxy session refresh, expired cookies, logout failure, `/login` redirect for authenticated users, and protected-route redirects (`src/utils/supabase/middleware.ts:5-42`, `src/app/auth/actions.ts:6-10`).
2. OAuth initiation URL, provider errors, callback exchange success/error, forwarded-host handling, and safe `next` validation (`src/app/login/oauth-buttons.tsx:11-24`, `src/app/auth/callback/route.ts:4-25`).
3. Header guessing collisions, duplicate/blank headers, manual mapping, and aliases (`src/lib/invoice-import.ts:57-70,102-123`).
4. Empty/corrupt/truncated/oversized CSV, XLS, and XLSX files; parser diagnostics; zip bombs; excessive rows/cells (`src/lib/invoice-import.ts:73-100`).
5. Amount formats (currency symbols, thousands separators, decimals, negative parentheses, exponent notation, locale formats, overflow), workbook date serials/formats, and invalid status/currency handling (`src/lib/invoice-import.ts:134-165`).
6. Bulk insert success/failure, atomic rollback, retry/duplicate behavior, empty optional mappings, and surfaced PostgREST errors (`src/app/invoices/import/import-client.tsx:61-77`).
7. Automated RLS tests for anonymous access and every owner/cross-owner SELECT/INSERT/UPDATE/DELETE operation; profile trigger and cascade behavior (`supabase/migrations/20260719150241_profiles.sql:12-73`, `20260719150242_invoices.sql:20-50`). The audit ran these manually, but they are not regression tests.
8. Dashboard query errors, numeric conversion, empty data, status counts, readiness percentage, top-issue ordering, large datasets/pagination, and user separation (`src/app/invoices/page.tsx:26-45,67-237`).
9. Validation edge cases including `Infinity`, extreme amounts, whitespace/case normalization, years `0000`/very large years, repeated issues hitting score zero, deterministic tie ordering, and mutation safety (`src/lib/validation.ts:73-87,193-245`).
10. Accessibility and route rendering checks for the login, home, dashboard, and import pages.

## README versus implementation discrepancies

1. README says “RLS assigns each row to the current user” (`README.md:53`). In fact, the column default assigns `auth.uid()` and RLS only permits it (`20260719150242_invoices.sql:7,31-34`). The security outcome is correct, but the mechanism is misstated.
2. README describes currency/status/due date as mappable without warning that leaving currency or status unmapped produces `null` and violates `NOT NULL` (`README.md:52`; `src/lib/invoice-import.ts:153-163`; `20260719150242_invoices.sql:11-13`).
3. README says vendor and amount are required mappings (`README.md:52`), while readiness also requires invoice number (`README.md:63`; `src/lib/validation.ts:100-108`) and the database allows it to be null (`20260719150242_invoices.sql:9`). These three definitions of “required” disagree.
4. README advertises CSV/XLSX (`README.md:50`), while the UI also explicitly accepts legacy XLS (`src/app/invoices/import/import-client.tsx:91-97`).
5. README says readiness is surfaced in preview and dashboard (`README.md:69-81`), which is implemented, but it does not disclose that readiness errors do not block import (`src/app/invoices/import/import-client.tsx:61-75`).
6. README's “both tables ... each user can only access their own rows” claim (`README.md:90`) was verified for ordinary authenticated roles. It should clarify that profiles have no DELETE API policy and administrative/service roles bypass RLS by design (`20260719150241_profiles.sql:15-32`).
7. README setup uses `npm install` (`README.md:7-11`) and does not state the effective Node 22 requirement. The lockfile-backed reproducible command is `npm ci`, and Node 16 demonstrably cannot run the toolchain (`package.json:1-33`).
8. README's dashboard feature claims are substantially implemented (`README.md:77-81`, `src/app/invoices/page.tsx:47-237`), but aggregation is client-application logic on an unpaginated server fetch, not database aggregation (`src/app/invoices/page.tsx:26-45`).

## Required environment setup

### Required for local application checks

- Node 22 (the installed Supabase 2.110.7 packages declare Node `>=22`; Next 16.2.10 declares `>=20.9`). Add this requirement to `package.json` and developer docs (`package.json:13-19`).
- `NEXT_PUBLIC_SUPABASE_URL` plus either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, as shown in `.env.example:1-8` and consumed at `src/utils/supabase/config.ts:4-7`.
- Network access during production build, because `next/font/google` downloads Geist (`src/app/layout.tsx:1-13`), or a future change to locally hosted fonts.

### Required for configured Supabase checks

- Docker and Supabase CLI for local reset/RLS integration tests (`README.md:83-97`, `supabase/config.toml`). The audit completed clean migration and manual RLS checks locally.
- A remote project is required only to verify its deployed migration state, URL allowlist, provider configuration, and production proxy headers. Those remote checks were not performed.

### Required for OAuth checks

- Google and/or GitHub provider credentials enabled in Supabase and the application callback URL allowlisted (`README.md:34-44`).
- Full browser interaction with the actual providers. The audit verified button rendering, unauthenticated redirects, and the callback error path only; it did not invent credentials or claim a successful provider login.

## Recommended next milestone

Make spreadsheet import trustworthy and regression-tested before adding any new product capability. The milestone should align mapping/default/database semantics, replace or safely isolate vulnerable XLSX handling, implement strict conversion and limits, introduce duplicate/idempotency protection, and add local-Supabase integration tests for auth, import, dashboard ownership, and RLS. UI redesign, AI, and PDF work should remain out of scope until this foundation is stable.

## Numbered remediation plan

1. Standardize Node 22 in `package.json`, CI, and README; make `npm ci`, tests, lint, typecheck, build, and Supabase reset mandatory CI gates.
2. Upgrade Vitest/Vite and Next/PostCSS to confirmed patched releases; replace `xlsx 0.18.5` with a maintained/patched option or isolate it in a worker with hard limits. Re-run `npm audit` and document accepted residual risk.
3. Define the import contract: required fields, defaults, accepted statuses/currencies, whether not-ready rows may persist, and canonical date/amount formats. Align `src/lib/invoice-import.ts`, validation, UI labels, and SQL in a planned migration.
4. Implement strict, locale-explicit numeric/date parsing that rejects ambiguous input rather than coercing it. Preserve row/field error details and block invalid database payloads.
5. Add file-size, decompressed-size, sheet/row/column/cell, and insert-batch limits; validate extension, MIME, and actual file structure; move heavy parsing off the UI thread.
6. Design duplicate protection and idempotency, likely with a per-owner natural key or import fingerprint plus a database unique constraint. Disable/replace the import action after success and make retries safe.
7. Add automated local-Supabase tests covering anonymous and two-user RLS CRUD, ownership transfer, profile trigger/cascade, import atomicity, duplicates, and database constraints.
8. Add unit/component/route tests for mapping, malformed files, auth redirects/callbacks, dashboard aggregation/error handling, and validation boundaries. Add coverage reporting with meaningful thresholds.
9. Validate environment variables at startup, use a configured trusted application origin in OAuth callback redirects, validate local `next` paths, and preserve the originally requested protected destination.
10. Add dashboard pagination/server-side aggregation, separate error from empty state, and add route-level loading/error boundaries.
11. Address accessibility with progress semantics, table captions/scopes, persistent issue text, and a properly labelled file input; replace scaffold metadata.
12. Document verified behavior accurately, including RLS's role versus column defaults, profile DELETE behavior, optional-field defaults, and checks that require provider/remote configuration.

## Five most important next actions

1. Remove the vulnerable/unbounded XLSX parsing path from production exposure.
2. Align import mapping, strict conversions, validation, and database constraints so valid-looking imports do not fail or silently change values.
3. Add database-backed duplicate/idempotency protection before users can re-import invoices.
4. Build automated two-user RLS/auth/import integration tests on local Supabase.
5. Standardize Node 22 and add CI gates for `npm ci`, test, lint, typecheck, build, audit review, and clean database reset.
