# invoice-readiness-ai

A [Next.js](https://nextjs.org) application (TypeScript, App Router, Tailwind CSS) bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use Node.js 22 (see `.nvmrc`) and install dependencies from the lockfile:

```bash
npm ci
```

Configure Supabase environment variables. Copy `.env.example` to `.env.local` and fill in your project's values (Supabase dashboard → Project Settings → API):

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
# Provide one of these (the app accepts either name):
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the app. Edit `src/app/page.tsx` and the page auto-updates.

## Authentication

Uses [Supabase](https://supabase.com) OAuth (Google and GitHub) via `@supabase/ssr`.

- `src/utils/supabase/*` — browser, server, and proxy Supabase clients.
- `src/proxy.ts` — refreshes the session on every request and redirects unauthenticated users to `/login`.
- `src/app/login` — sign-in page with Google/GitHub buttons.
- `src/app/auth/callback` — OAuth code-exchange route.
- `/` is protected and shows the signed-in user with a sign-out button.

Enable the Google and GitHub providers in your Supabase dashboard (Authentication → Providers) and add `<your-app-url>/auth/callback` (e.g. `http://localhost:3000/auth/callback`) as a redirect URL under Authentication → URL Configuration.

## Invoice import

Signed-in users can bulk-import invoices from a spreadsheet at `/invoices/import`:

- Upload a **CSV or XLSX** file up to 5 MB (parsed client-side with `papaparse` / `exceljs`). Imports are limited to 5,000 rows, 50 columns, 10,000 characters per cell, 200 XLSX archive entries, and 25 MB of expanded XLSX content.
- Preview the first rows of the detected sheet.
- Map source columns to invoice fields (`vendor_name`, `invoice_number`, `amount`, `currency`, `status`, `due_date`); the mapping is auto-guessed from the headers and can be adjusted. `vendor_name`, `invoice_number`, and `amount` are required. Blank currency/status values default to `USD`/`draft`.
- Every row must pass readiness validation before import. Ambiguous amounts and non-ISO dates are rejected.
- Import writes rows into the `invoices` table via the Supabase client. The `user_id` default assigns the authenticated user and RLS enforces ownership. A per-user invoice-number constraint makes retries and repeated files idempotent.

## Validation & readiness

`src/lib/validation.ts` is a small, dependency-free rules engine that scores each
invoice's readiness for financial processing:

- `validateInvoice(invoice)` → `{ ready, score, issues }`. `ready` is `true` when
  there are no `error`-severity issues; `score` is 0–100 (errors deduct more than
  warnings).
- Rules cover required fields (`vendor_name`, `invoice_number`, `amount`), positive
  amounts, ISO-4217 currency format/recognition, valid `YYYY-MM-DD` due dates, and
  known statuses.
- `summarizeValidation(invoices)` aggregates ready/not-ready counts, average score,
  and the most frequent issues.

Readiness is surfaced in the import preview (per-row) and on the analysis dashboard.

Run the unit tests:

```bash
npm test
```

Run local database/RLS integration tests (requires Docker):

```bash
npm run test:db
```

## Dashboard

`/invoices` is a protected analysis dashboard showing total/ready/not-ready counts,
average readiness score, a status breakdown, the top readiness issues, and a table
of the current user's invoices with per-row readiness.

## Database

SQL migrations live in `supabase/migrations/` and are managed with the [Supabase CLI](https://supabase.com/docs/guides/local-development):

- `profiles` — one row per auth user, auto-created on signup via an `auth.users` trigger.
- `invoices` — per-user invoices (`user_id` defaults to `auth.uid()`).

Both tables have Row Level Security enabled so each user can only access their own rows.

Run migrations against a local stack:

```bash
npx supabase start   # boots local Postgres + Auth (requires Docker)
npx supabase db reset  # applies all migrations from scratch
```

Push to a linked remote project:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint
- `npm test` — run unit tests (Vitest)
- `npm run typecheck` — run TypeScript without emitting files
- `npm run test:db` — reset local Supabase and run two-user RLS/integrity tests
- `npm run verify` — run unit tests, lint, typecheck, and production build

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
