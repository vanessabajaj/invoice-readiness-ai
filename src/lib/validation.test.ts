import { describe, expect, it } from "vitest";
import {
  summarizeValidation,
  validateInvoice,
  type InvoiceInput,
} from "./validation";

const validInvoice: InvoiceInput = {
  vendor_name: "Acme Corp",
  invoice_number: "INV-1001",
  amount: 250.5,
  currency: "USD",
  status: "pending",
  due_date: "2030-01-15",
};

function rules(input: InvoiceInput): string[] {
  return validateInvoice(input).issues.map((i) => i.rule);
}

describe("validateInvoice", () => {
  it("marks a complete invoice ready with a perfect score", () => {
    const result = validateInvoice(validInvoice);
    expect(result.ready).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
  });

  it("flags missing required fields as errors and blocks readiness", () => {
    const result = validateInvoice({});
    expect(result.ready).toBe(false);
    expect(rules({})).toEqual(
      expect.arrayContaining([
        "vendor_name_required",
        "invoice_number_required",
        "amount_required",
      ]),
    );
    // required errors present -> not ready, score reduced
    expect(result.score).toBeLessThan(100);
  });

  it("rejects non-positive amounts", () => {
    expect(rules({ ...validInvoice, amount: 0 })).toContain("amount_positive");
    expect(rules({ ...validInvoice, amount: -5 })).toContain("amount_positive");
  });

  it("treats NaN amount as missing", () => {
    expect(rules({ ...validInvoice, amount: Number.NaN })).toContain(
      "amount_required",
    );
  });

  it("errors on malformed currency but warns on unknown codes", () => {
    expect(rules({ ...validInvoice, currency: "US" })).toContain(
      "currency_format",
    );
    expect(rules({ ...validInvoice, currency: "123" })).toContain(
      "currency_format",
    );
    const unknown = validateInvoice({ ...validInvoice, currency: "XYZ" });
    expect(unknown.ready).toBe(true); // warning only
    expect(unknown.issues.map((i) => i.rule)).toContain("currency_unknown");
  });

  it("warns (not errors) when currency is missing", () => {
    const result = validateInvoice({ ...validInvoice, currency: null });
    expect(result.ready).toBe(true);
    expect(result.issues.map((i) => i.rule)).toContain("currency_missing");
  });

  it("validates due_date as a real calendar date", () => {
    expect(rules({ ...validInvoice, due_date: "2030-13-01" })).toContain(
      "due_date_format",
    );
    expect(rules({ ...validInvoice, due_date: "2030-02-30" })).toContain(
      "due_date_format",
    );
    expect(rules({ ...validInvoice, due_date: "not-a-date" })).toContain(
      "due_date_format",
    );
    expect(rules({ ...validInvoice, due_date: "2030-01-15" })).not.toContain(
      "due_date_format",
    );
  });

  it("warns on unrecognized status only", () => {
    const result = validateInvoice({ ...validInvoice, status: "archived" });
    expect(result.ready).toBe(true);
    expect(result.issues.map((i) => i.rule)).toContain("status_unknown");
    expect(rules({ ...validInvoice, status: "draft" })).not.toContain(
      "status_unknown",
    );
  });

  it("deducts more for errors than warnings", () => {
    const errorResult = validateInvoice({ ...validInvoice, amount: 0 });
    const warnResult = validateInvoice({ ...validInvoice, currency: null });
    expect(100 - errorResult.score).toBeGreaterThan(100 - warnResult.score);
  });
});

describe("summarizeValidation", () => {
  it("aggregates readiness counts, average score, and top issues", () => {
    const summary = summarizeValidation([
      validInvoice, // ready, 100
      { ...validInvoice, vendor_name: "" }, // error
      { ...validInvoice, invoice_number: "" }, // error
      { ...validInvoice, currency: null }, // warning only -> ready
    ]);

    expect(summary.total).toBe(4);
    expect(summary.ready).toBe(2); // validInvoice + currency-null (warning only)
    expect(summary.notReady).toBe(2); // blank vendor_name + blank invoice_number
    expect(summary.averageScore).toBeGreaterThan(0);
    expect(summary.averageScore).toBeLessThanOrEqual(100);
    expect(summary.topIssues.length).toBeGreaterThan(0);
    // topIssues sorted descending by count
    const counts = summary.topIssues.map((i) => i.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("returns zeroed summary for empty input", () => {
    expect(summarizeValidation([])).toEqual({
      total: 0,
      ready: 0,
      notReady: 0,
      averageScore: 0,
      topIssues: [],
    });
  });
});
