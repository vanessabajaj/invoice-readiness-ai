# Test Plan: Supabase OAuth auth flow

App running via `npm run dev` on http://localhost:3000 with the real project URL + publishable key in `.env.local`.
Code refs: `src/proxy.ts:4-19`, `src/utils/supabase/middleware.ts:31-39` (redirect), `src/app/login/page.tsx`, `src/app/login/oauth-buttons.tsx:16-27` (signInWithOAuth), `src/app/page.tsx:12-14` (protected).

## Test 1: Unauthenticated user is redirected to /login (proxy protection)
Steps:
1. In Chrome, navigate to http://localhost:3000/.

Pass criteria:
- URL bar ends on `/login` (not `/`).
- The protected home ("Signed in as…") is NOT shown.

Fail if: the home page renders without a session, or a Next error overlay appears.

## Test 2: Login page renders both OAuth providers
Pass criteria:
- "Sign in" heading + "Continue to invoice-readiness-ai" subtitle visible.
- Two buttons: "Continue with Google" and "Continue with GitHub".

## Test 3: Clicking a provider initiates OAuth against the real Supabase project (live connection)
Steps:
1. Click "Continue with GitHub".

Pass criteria (proves live connection + correct redirectTo):
- Browser leaves localhost and navigates to `https://onvfxndrsnibdnzmwhuw.supabase.co/auth/v1/authorize?provider=github...` (or onward to github.com if the provider is enabled).
- If the provider is NOT enabled in the project, Supabase returns a "provider is not enabled"/`validation_failed` error page served from the `*.supabase.co` domain — this still confirms the app reached the real project. Record whichever occurs.

Fail if: clicking does nothing, the button stays on localhost with a client error, or the redirect targets a wrong/placeholder domain.
