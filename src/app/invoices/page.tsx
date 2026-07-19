import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  INVOICE_STATUSES,
  summarizeValidation,
  validateInvoice,
  type InvoiceInput,
} from "@/lib/validation";

type InvoiceRow = InvoiceInput & {
  id: string;
  created_at: string;
};

export default async function InvoicesDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("invoices")
    .select("id, vendor_name, invoice_number, amount, currency, status, due_date, created_at")
    .order("created_at", { ascending: false });

  const invoices: InvoiceRow[] = (data ?? []).map((row) => ({
    ...row,
    amount: row.amount === null ? null : Number(row.amount),
  }));

  const summary = summarizeValidation(invoices);
  const statusCounts = INVOICE_STATUSES.map((status) => ({
    status,
    count: invoices.filter(
      (i) => (i.status ?? "").toLowerCase() === status,
    ).length,
  }));
  const readyPct = summary.total
    ? Math.round((summary.ready / summary.total) * 100)
    : 0;

  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Invoice analysis
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Readiness of your invoices for financial processing.
            </p>
          </div>
          <Link
            href="/invoices/import"
            className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:opacity-90"
          >
            Import invoices
          </Link>
        </header>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            Could not load invoices: {error.message}
          </p>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total invoices" value={summary.total} />
          <StatCard
            label="Ready"
            value={summary.ready}
            accent="text-green-600 dark:text-green-400"
          />
          <StatCard
            label="Not ready"
            value={summary.notReady}
            accent="text-red-600 dark:text-red-400"
          />
          <StatCard label="Avg readiness" value={`${summary.averageScore}`} />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-black dark:text-zinc-50">
              Ready for processing
            </span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {readyPct}%
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.1]">
            <div
              className="h-full rounded-full bg-green-500"
              style={{ width: `${readyPct}%` }}
            />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              By status
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              {statusCounts.map(({ status, count }) => (
                <li key={status} className="flex items-center justify-between">
                  <span className="capitalize text-zinc-700 dark:text-zinc-300">
                    {status}
                  </span>
                  <span className="font-medium text-black dark:text-zinc-50">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Top readiness issues
            </h2>
            {summary.topIssues.length === 0 ? (
              <p className="text-sm text-zinc-500">No issues detected.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {summary.topIssues.slice(0, 6).map((issue) => (
                  <li
                    key={issue.rule}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                      <span
                        className={
                          issue.severity === "error"
                            ? "h-2 w-2 rounded-full bg-red-500"
                            : "h-2 w-2 rounded-full bg-amber-500"
                        }
                      />
                      {issue.rule}
                    </span>
                    <span className="font-medium text-black dark:text-zinc-50">
                      {issue.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Invoices
          </h2>
          {invoices.length === 0 ? (
            <p className="rounded-xl border border-black/[.08] bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:bg-zinc-950">
              No invoices yet.{" "}
              <Link href="/invoices/import" className="underline">
                Import some
              </Link>{" "}
              to get started.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/[.03] dark:bg-white/[.04]">
                  <tr>
                    <th className="px-3 py-2 font-medium text-black dark:text-zinc-50">
                      Readiness
                    </th>
                    <th className="px-3 py-2 font-medium text-black dark:text-zinc-50">
                      Vendor
                    </th>
                    <th className="px-3 py-2 font-medium text-black dark:text-zinc-50">
                      Number
                    </th>
                    <th className="px-3 py-2 font-medium text-black dark:text-zinc-50">
                      Amount
                    </th>
                    <th className="px-3 py-2 font-medium text-black dark:text-zinc-50">
                      Status
                    </th>
                    <th className="px-3 py-2 font-medium text-black dark:text-zinc-50">
                      Due
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const v = validateInvoice(inv);
                    return (
                      <tr
                        key={inv.id}
                        className="border-t border-black/[.06] dark:border-white/[.08]"
                      >
                        <td className="whitespace-nowrap px-3 py-2">
                          <span
                            title={v.issues.map((x) => x.message).join("\n")}
                            className={
                              v.ready
                                ? "inline-flex rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400"
                                : "inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400"
                            }
                          >
                            {v.ready
                              ? `Ready · ${v.score}`
                              : `${v.issues.length} issue${v.issues.length === 1 ? "" : "s"} · ${v.score}`}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {inv.vendor_name}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {inv.invoice_number ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {inv.amount ?? 0} {inv.currency ?? ""}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 capitalize text-zinc-700 dark:text-zinc-300">
                          {inv.status ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {inv.due_date ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      <span
        className={`text-3xl font-semibold ${accent ?? "text-black dark:text-zinc-50"}`}
      >
        {value}
      </span>
    </div>
  );
}
