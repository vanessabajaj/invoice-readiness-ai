import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { signOut } from "./auth/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const name =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center gap-8 rounded-2xl border border-black/[.08] bg-white p-10 text-center dark:border-white/[.145] dark:bg-zinc-950">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="Avatar"
            width={72}
            height={72}
            className="rounded-full"
          />
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Welcome{name ? `, ${name}` : ""}
          </h1>
          {user?.email ? (
            <p className="text-zinc-600 dark:text-zinc-400">{user.email}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:opacity-90"
          >
            Dashboard
          </Link>
          <Link
            href="/invoices/import"
            className="flex h-11 items-center justify-center rounded-full border border-black/[.08] px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Import
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex h-11 items-center justify-center rounded-full border border-black/[.08] px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
