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

## Notes / gotchas
- Node engine warnings (EBADENGINE for Node < 20.19) may appear but the build still succeeds on Node 20.18; if a step actually fails, upgrading Node to 20.19+ might be the fix.
- Kill the dev server when done: `pkill -f "next dev"`.

## Devin Secrets Needed
- None currently (no external services or auth).
