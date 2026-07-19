"use client";

import { useState } from "react";
import type { Provider } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

export function OAuthButtons() {
  const [loading, setLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: Provider) {
    setError(null);
    setLoading(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => signIn("google")}
        disabled={loading !== null}
        className="flex h-11 items-center justify-center gap-2 rounded-full border border-black/[.08] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        {loading === "google" ? "Redirecting…" : "Continue with Google"}
      </button>
      <button
        type="button"
        onClick={() => signIn("github")}
        disabled={loading !== null}
        className="flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {loading === "github" ? "Redirecting…" : "Continue with GitHub"}
      </button>
      {error ? (
        <p className="text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
