import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { describeAudit, type AuditEvent } from "@/lib/audit";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default async function AuditHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("audit_events")
    .select("id, action, entity, entity_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const events: AuditEvent[] = data ?? [];

  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Audit history
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              A record of imports and report exports on your account.
            </p>
          </div>
          <Link
            href="/invoices"
            className="flex h-10 items-center justify-center rounded-full border border-black/[.12] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.16] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Back to dashboard
          </Link>
        </header>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            Could not load audit history: {error.message}
          </p>
        ) : events.length === 0 ? (
          <p className="rounded-xl border border-black/[.08] bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:bg-zinc-950">
            No activity yet. Import invoices or export a report to see events
            here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => {
              const { title, detail } = describeAudit(event);
              return (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-black dark:text-zinc-50">
                      {title}
                    </span>
                    {detail ? (
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {detail}
                      </span>
                    ) : null}
                  </div>
                  <time
                    dateTime={event.created_at}
                    className="whitespace-nowrap text-xs text-zinc-500"
                  >
                    {formatTimestamp(event.created_at)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
