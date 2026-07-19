# Invoice Readiness AI

A Next.js 16 and Supabase prototype that imports CSV/XLSX invoice data, applies deterministic readiness checks, records row-level failures, and supports correction and revalidation.

> This application is a prototype invoice-readiness analyzer and is not an officially certified tax-compliance platform.

## Implemented features

- Anonymous Supabase authentication with owner-scoped Row-Level Security.
- Browser CSV/XLSX parsing and mapping preview; authenticated server-side batch creation, validation, duplicate detection, and insertion.
- Expanded invoice fields, safe PostgreSQL decimal columns, category scores, detailed issues, batch history, rejected-row review, and failed-row CSV export.
- Invoice detail/correction at `/invoices/[id]`; edits are authorized, Zod-validated, revalidated, and scored server-side.
- Search, readiness/status/currency/batch filters, sorting, pagination, summary cards, and clickable common-error filters.

## Architecture

The App Router UI lives in `src/app`. Server Actions own mutations. `src/lib/invoice-import.ts` performs bounded file parsing/mapping and `src/lib/validation.ts` is the deterministic rules engine. Supabase Postgres stores invoices, batches, rejected rows and validation snapshots. The publishable/anon key is used with the authenticated cookie session; no service-role key is present in browser code.

## Database

Migrations in `supabase/migrations` create `profiles`, `invoices`, `invoice_import_batches`, and `invoice_import_rejected_rows`. Monetary columns use `numeric`, invoice ownership and batch ownership are enforced with RLS, and a trigger prevents linking an invoice to another user's batch. The expanded migration backfills legacy `amount` into `total_amount`.

## Validation methodology

The server calculates a weighted score: required fields 30%, financial calculations 25%, tax consistency 20%, data formatting 15%, and duplicate/anomaly checks 10%. Rules check required values, cent-safe arithmetic with a 0.01 tolerance, tax math, real calendar dates, currency recognition, generic configurable tax-ID formatting, and normalized supplier/invoice duplicates. Issues include rule ID, field, severity, actual/expected values, message, and a suggested correction.

## Import workflow

Upload a CSV or XLSX file (5 MB, 5,000 rows, 50 columns), review and map it, then submit. The server authenticates the session, validates the payload and every row, checks existing records, creates an idempotent batch, inserts only ready invoices, and records rejected original rows. Visit `/invoices/imports` for history and exports.

## Local and Supabase setup

Use Node 22 and Docker:

```bash
npm ci
cp .env.example .env.local
npx supabase start
npx supabase db reset
npm run dev
```

Enable anonymous sign-ins in Supabase Auth. Configure:

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
# NEXT_PUBLIC_SUPABASE_ANON_KEY is also accepted
```

## Tests and CI

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run test:db
```

GitHub Actions runs the application checks on pushes and pull requests and a clean local Supabase reset plus two-user SQL isolation tests.

## Security model

Identity always comes from `supabase.auth.getUser()` or `auth.uid()`. Server mutations validate untrusted payloads with Zod and scope reads/writes by the authenticated user; RLS provides a second boundary. Browser scores, validation output, owner IDs, and service credentials are never trusted. Original rejected rows may contain business data, so access is owner-only and CSV responses are private/no-store.

## Known limitations and roadmap

Tax-ID validation is generic rather than jurisdiction-specific. Import persistence is coordinated by the Server Action but is not yet a single database transaction. Anonymous browser identity is unsuitable for durable multi-device accounts. There is no PDF/OCR, ERP, Peppol, FTA connectivity, AI chatbot, or certification claim. Next priorities are transactional import RPCs, jurisdiction rule profiles, authenticated organizations/roles, audit history, and maintained Playwright fixtures.
