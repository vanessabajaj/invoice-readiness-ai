"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { invoicesToCsvReport, type ReportInvoice } from "@/lib/report";

type ExportStatus = "idle" | "working" | "error";

export function ExportReportButton({
  invoices,
}: {
  invoices: ReportInvoice[];
}) {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const disabled = invoices.length === 0 || status === "working";

  async function handleExport() {
    if (invoices.length === 0) return;
    setStatus("working");
    setError(null);
    try {
      const csv = invoicesToCsvReport(invoices);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoice-readiness-report-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const supabase = createClient();
      const { error: auditError } = await supabase
        .from("audit_events")
        .insert({
          action: "report.export",
          entity: "report",
          metadata: { format: "csv", count: invoices.length },
        });
      if (auditError) throw auditError;
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not export the report.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={disabled}
        title={
          invoices.length === 0 ? "Import invoices to export a report" : undefined
        }
        className="flex h-10 items-center justify-center rounded-full border border-black/[.12] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.16] dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        {status === "working" ? "Exporting…" : "Export report (CSV)"}
      </button>
      {status === "error" && error ? (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      ) : null}
    </div>
  );
}
