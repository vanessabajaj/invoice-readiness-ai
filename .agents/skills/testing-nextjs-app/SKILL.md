---
name: testing-nextjs-app
description: Test the Next.js app end-to-end (dev server + default/home page rendering). Use when verifying the invoice-readiness-ai frontend builds and renders.
---

# Testing the Next.js app

## Setup
- `npm install` (Node 20+; the blueprint installs Node 20 and runs `npm install`).
- Verify it builds/lints before UI testing: `npm run build` and `npm run lint`.

## Run locally
- `npm run dev` serves http://localhost:3000 (Turbopack). It's ready in ~1s.
- Quick smoke check without a browser: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` should return `200`.

## UI verification
- Maximize the browser (`wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`), start a recording, then load http://localhost:3000.
- The scaffolded home page lives in `src/app/page.tsx`. Assert against the actual heading text there (currently "To get started, edit the page.tsx file.") plus the Next.js logo and action buttons. Read `src/app/page.tsx` first, since the page content may change as the app is built out.

## Testing authenticated flows (invoices import / dashboard)
Auth is OAuth-only (Google/GitHub) and providers may be disabled in the hosted project, so full OAuth login often can't be completed. Test against a LOCAL Supabase stack instead:
- `npx supabase start` (Docker). Grab `API_URL` (http://127.0.0.1:54321) and `ANON_KEY` from the output.
- Point `.env.local` at the local stack: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>`. Restart `npm run dev` so env reloads.
- **Seeding a session:** local GoTrue autoconfirms sign-ups, so a temporary email/password sign-in works. Add a temporary "dev sign in" button to `src/app/login/oauth-buttons.tsx` that calls the app's browser client `supabase.auth.signInWithPassword` (fallback to `signUp`) — this uses the real `@supabase/ssr` cookie plumbing so protected routes work. **Revert this temp edit before finishing** (`git checkout src/app/login/oauth-buttons.tsx`); it must not land in the PR.
- **File uploads:** the import file `<input type=file>` is hidden. The native OS dialog is flaky; instead drive uploads via `playwright-core` over the existing Chrome CDP endpoint (`chromium.connectOverCDP('http://localhost:29229')`), find the visible page by URL, and `page.locator('input[type=file]').setInputFiles(path)`. Install with `npm install --no-save playwright-core` (connects to existing Chrome, no browser download). Run node with `NODE_PATH=$(pwd)/node_modules`.
- **Reset data between runs:** `docker exec supabase_db_invoice-readiness-ai psql -U postgres -d postgres -c "truncate table public.invoices;"` (host has no `psql`; use the container).
- **Import DB constraints (gotcha):** `invoices.status` and `.currency` are `not null` and `.due_date` is a `date`. `applyMapping` passes these through raw, so rows with an invalid date, blank currency, or unknown/blank status make the whole batch insert fail. Craft test CSVs with valid statuses/currencies/dates if you want the import to succeed; use other rules (amount<=0, blank vendor, missing invoice number) to create readiness variety.

## Notes / gotchas
- Node engine warnings (EBADENGINE for Node < 20.19) may appear but the build still succeeds on Node 20.18; if a step actually fails, upgrading Node to 20.19+ might be the fix.
- Editing files while `npm run dev` is running can leave already-loaded pages with stale server-action IDs (e.g. sign-out throws "An unexpected response was received from the server"). A fresh page load fixes it — reload before concluding it's a real bug.
- Validation engine unit tests: `npm test` (Vitest). Run these for `src/lib/validation.ts` changes.
- Kill the dev server when done: `pkill -f "next dev"`.

## Devin Secrets Needed
- None for local testing (uses the local Supabase stack's default keys). Hosted end-to-end OAuth would need Google/GitHub providers enabled in the Supabase dashboard.
