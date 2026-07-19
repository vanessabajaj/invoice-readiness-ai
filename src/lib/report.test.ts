import { describe, expect, it } from "vitest";
import { buildReportRows, invoicesToCsvReport, toCsv } from "./report";
import type { InvoiceInput } from "./validation";

const readyInvoice: InvoiceInput = {
  vendor_name: "Acme Corp",
  invoice_number: "INV-1001",
  amount: 250.5,
  currency: "USD",
  status: "pending",
  due_date: "2030-01-15",
};

describe("buildReportRows", () => {
  it("annotates a valid invoice as ready with score 100 and no issues", () => {
    const [row] = buildReportRows([readyInvoice]);
    expect(row.ready).toBe("yes");
    expect(row.readiness_score).toBe(100);
    expect(row.issues).toBe("");
    expect(row.amount).toBe("250.5");
  });

  it("flags an invoice with errors as not ready and lists issue messages", () => {
    const [row] = buildReportRows([
      { ...readyInvoice, vendor_name: "", amount: 0 },
    ]);
    expect(row.ready).toBe("no");
    expect(row.readiness_score).toBeLessThan(100);
    expect(row.issues.length).toBeGreaterThan(0);
    expect(row.issues).toContain(";");
  });

  it("renders missing optional fields as empty strings", () => {
    const [row] = buildReportRows([
      { vendor_name: "V", invoice_number: null, amount: null },
    ]);
    expect(row.invoice_number).toBe("");
    expect(row.amount).toBe("");
    expect(row.currency).toBe("");
    expect(row.due_date).toBe("");
  });
});

describe("toCsv", () => {
  it("emits a header row plus one line per invoice", () => {
    const csv = invoicesToCsvReport([readyInvoice, readyInvoice]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      "Vendor,Invoice number,Amount,Currency,Status,Due date,Ready,Readiness score,Issues",
    );
  });

  it("escapes commas, quotes, and newlines", () => {
    const rows = buildReportRows([
      { ...readyInvoice, vendor_name: 'Ac,me "Co"' },
    ]);
    const csv = toCsv(rows);
    expect(csv).toContain('"Ac,me ""Co"""');
  });

  it("handles an empty invoice list (header only)", () => {
    const csv = invoicesToCsvReport([]);
    expect(csv).toBe(
      "Vendor,Invoice number,Amount,Currency,Status,Due date,Ready,Readiness score,Issues",
    );
  });
});
