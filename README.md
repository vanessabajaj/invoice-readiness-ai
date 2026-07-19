# invoice-readiness-ai

A [Next.js](https://nextjs.org) application (TypeScript, App Router, Tailwind CSS) bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Install dependencies:

```bash
npm install
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

- Upload a **CSV or XLSX** file (parsed client-side with `papaparse` / `xlsx`).
- Preview the first rows of the detected sheet.
- Map source columns to invoice fields (`vendor_name`, `invoice_number`, `amount`, `currency`, `status`, `due_date`); the mapping is auto-guessed from the headers and can be adjusted. `vendor_name` and `amount` are required.
- Import writes rows into the `invoices` table via the Supabase client; RLS assigns each row to the current user.

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

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
