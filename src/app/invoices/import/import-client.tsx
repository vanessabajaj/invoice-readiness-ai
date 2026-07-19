"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  applyMapping,
  guessMapping,
  INVOICE_FIELDS,
  parseFile,
  type ParsedSheet,
} from "@/lib/invoice-import";
import { summarizeValidation, validateInvoice } from "@/lib/validation";

const PREVIEW_ROWS = 10;

type ImportResult = { inserted: number } | { error: string };

export function ImportClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const parsed = await parseFile(file);
      if (parsed.headers.length === 0) {
        setSheet(null);
        setParseError("No columns found. Is the first row a header?");
        return;
      }
      setSheet(parsed);
      setMapping(guessMapping(parsed.headers));
    } catch {
      setSheet(null);
      setParseError("Could not read this file. Upload a valid CSV or XLSX.");
    }
  }

  const mappedRows = useMemo(
    () => (sheet ? applyMapping(sheet, mapping) : []),
    [sheet, mapping],
  );

  const validations = useMemo(
    () => mappedRows.map(validateInvoice),
    [mappedRows],
  );
  const summary = useMemo(
    () => summarizeValidation(mappedRows),
    [mappedRows],
  );

  const missingRequired = INVOICE_FIELDS.filter(
    (f) => f.required && !mapping[f.key],
  );
  const canImport =
    sheet !== null && missingRequired.length === 0 && mappedRows.length > 0;

  async function handleImport() {
    if (!canImport) return;
    setImporting(true);
    setResult(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("invoices")
      .insert(mappedRows)
      .select("id");
    if (!error) {
      await supabase.from("audit_events").insert({
        action: "invoice.import",
        entity: "invoice",
        metadata: { count: data?.length ?? 0 },
      });
    }
    setImporting(false);
    setResult(error ? { error: error.message } : { inserted: data?.length ?? 0 });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black/[.12] text-sm text-zinc-600 transition-colors hover:border-black/[.24] hover:bg-black/[.02] dark:border-white/[.16] dark:text-zinc-400 dark:hover:border-white/[.28] dark:hover:bg-white/[.02]"
        >
          <span className="font-medium text-black dark:text-zinc-50">
            {fileName ?? "Choose a CSV or XLSX file"}
          </span>
          <span>Click to browse — .csv, .xls, .xlsx</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xls,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {parseError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{parseError}</p>
        ) : null}
      </section>

      {sheet ? (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                Preview & readiness
              </h2>
              <span className="text-sm text-zinc-500">
                {sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-xl border border-black/[.08] px-4 py-2 text-sm dark:border-white/[.145]">
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {summary.ready}
                </span>{" "}
                ready
              </div>
              <div className="rounded-xl border border-black/[.08] px-4 py-2 text-sm dark:border-white/[.145]">
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {summary.notReady}
                </span>{" "}
                not ready
              </div>
              <div className="rounded-xl border border-black/[.08] px-4 py-2 text-sm dark:border-white/[.145]">
                avg score{" "}
                <span className="font-semibold text-black dark:text-zinc-50">
                  {summary.averageScore}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/[.03] dark:bg-white/[.04]">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-medium text-black dark:text-zinc-50">
                      Readiness
                    </th>
                    {sheet.headers.map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2 font-medium text-black dark:text-zinc-50"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, PREVIEW_ROWS).map((row, i) => {
                    const v = validations[i];
                    return (
                      <tr
                        key={i}
                        className="border-t border-black/[.06] dark:border-white/[.08]"
                      >
                        <td className="whitespace-nowrap px-3 py-2">
                          <span
                            title={v?.issues.map((x) => x.message).join("\n")}
                            className={
                              v?.ready
                                ? "inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400"
                                : "inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400"
                            }
                          >
                            {v?.ready
                              ? `Ready · ${v.score}`
                              : `${v?.issues.length ?? 0} issue${(v?.issues.length ?? 0) === 1 ? "" : "s"} · ${v?.score ?? 0}`}
                          </span>
                        </td>
                        {sheet.headers.map((h) => (
                          <td
                            key={h}
                            className="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300"
                          >
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sheet.rows.length > PREVIEW_ROWS ? (
              <p className="text-xs text-zinc-500">
                Showing first {PREVIEW_ROWS} of {sheet.rows.length} rows.
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Map columns
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {INVOICE_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-black dark:text-zinc-50">
                    {field.label}
                    {field.required ? (
                      <span className="text-red-600 dark:text-red-400"> *</span>
                    ) : null}
                  </span>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) =>
                      setMapping((prev) => {
                        const next = { ...prev };
                        if (e.target.value) next[field.key] = e.target.value;
                        else delete next[field.key];
                        return next;
                      })
                    }
                    className="h-10 rounded-lg border border-black/[.12] bg-white px-3 text-sm text-black dark:border-white/[.16] dark:bg-zinc-950 dark:text-zinc-50"
                  >
                    <option value="">— Not mapped —</option>
                    {sheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {missingRequired.length > 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Map required field
                {missingRequired.length === 1 ? "" : "s"}:{" "}
                {missingRequired.map((f) => f.label).join(", ")}.
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleImport}
                disabled={!canImport || importing}
                className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {importing
                  ? "Importing…"
                  : `Import ${mappedRows.length} invoice${mappedRows.length === 1 ? "" : "s"}`}
              </button>
              {result && "inserted" in result ? (
                <p className="text-sm text-green-600 dark:text-green-400">
                  Imported {result.inserted} invoice
                  {result.inserted === 1 ? "" : "s"}.{" "}
                  <Link href="/invoices" className="underline">
                    View dashboard
                  </Link>
                </p>
              ) : null}
              {result && "error" in result ? (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {result.error}
                </p>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
