// Supabase connection config. Accepts either the legacy anon key name or the
// newer publishable key name. NEXT_PUBLIC_* vars are inlined at build time, so
// each variable must be referenced statically for Next.js to replace it.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;
