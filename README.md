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
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
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

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
