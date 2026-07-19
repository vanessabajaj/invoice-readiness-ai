import Link from "next/link";

export default function AuthCodeError() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Authentication error
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        We couldn&apos;t sign you in. The login link may have expired or been
        used already. Please try again.
      </p>
      <Link
        href="/login"
        className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:opacity-90"
      >
        Back to sign in
      </Link>
    </main>
  );
}
