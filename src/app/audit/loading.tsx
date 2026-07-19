export default function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-1">
          <div className="h-7 w-40 animate-pulse rounded bg-black/[.08] dark:bg-white/[.1]" />
          <div className="h-4 w-72 animate-pulse rounded bg-black/[.06] dark:bg-white/[.06]" />
        </div>
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="h-14 animate-pulse rounded-xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950"
            />
          ))}
        </ul>
      </div>
    </main>
  );
}
