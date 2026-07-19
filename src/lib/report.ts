// Builds an exportable readiness report from invoices and serializes it to CSV.

import { validateInvoice, type InvoiceInput } from "./validation";

export type ReportInvoice = InvoiceInput;

export type ReportRow = {
  vendor_name: string;
  invoice_number: string;
  amount: string;
  currency: string;
  status: string;
  due_date: string;
  ready: string;
  readiness_score: number;
  issues: string;
};

const REPORT_COLUMNS: { key: keyof ReportRow; header: string }[] = [
  { key: "vendor_name", header: "Vendor" },
  { key: "invoice_number", header: "Invoice number" },
  { key: "amount", header: "Amount" },
  { key: "currency", header: "Currency" },
  { key: "status", header: "Status" },
  { key: "due_date", header: "Due date" },
  { key: "ready", header: "Ready" },
  { key: "readiness_score", header: "Readiness score" },
  { key: "issues", header: "Issues" },
];

export function buildReportRows(invoices: ReportInvoice[]): ReportRow[] {
  return invoices.map((invoice) => {
    const { ready, score, issues } = validateInvoice(invoice);
    return {
      vendor_name: invoice.vendor_name ?? "",
      invoice_number: invoice.invoice_number ?? "",
      amount:
        invoice.amount === null || invoice.amount === undefined
          ? ""
          : String(invoice.amount),
      currency: invoice.currency ?? "",
      status: invoice.status ?? "",
      due_date: invoice.due_date ?? "",
      ready: ready ? "yes" : "no",
      readiness_score: score,
      issues: issues.map((i) => i.message).join("; "),
    };
  });
}

// RFC-4180-ish escaping: wrap in quotes when the value contains a comma,
// quote, or newline, doubling any embedded quotes.
function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: ReportRow[]): string {
  const header = REPORT_COLUMNS.map((c) => escapeCsv(c.header)).join(",");
  const lines = rows.map((row) =>
    REPORT_COLUMNS.map((c) => escapeCsv(String(row[c.key]))).join(","),
  );
  return [header, ...lines].join("\r\n");
}

/** Convenience: invoices -> CSV report string. */
export function invoicesToCsvReport(invoices: ReportInvoice[]): string {
  return toCsv(buildReportRows(invoices));
}
