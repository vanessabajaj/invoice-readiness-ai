import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  applyMapping,
  duplicateInvoiceRows,
  guessMapping,
  IMPORT_LIMITS,
  parseAmount,
  parseFile,
  type ParsedSheet,
} from "./invoice-import";

const mapping = {
  vendor_name: "Vendor",
  invoice_number: "Invoice",
  invoice_date: "Invoice Date",
  subtotal: "Subtotal",
  total_amount: "Total",
  currency: "Currency",
  status: "Status",
  due_date: "Due",
};

function csvFile(contents: string, name = "invoices.csv") {
  return new File([contents], name, { type: "text/csv" });
}

describe("parseAmount", () => {
  it.each([
    ["1,234.56", 1234.56],
    ["$ 20.00", 20],
    ["(10.25)", -10.25],
    ["0", 0],
  ])("parses canonical amount %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "12abc34", "1.234,56", "1e3", "1.234", "999999999999999.99"])(
    "rejects ambiguous or unsafe amount %s",
    (input) => expect(parseAmount(input)).toBeNaN(),
  );
});

describe("mapping", () => {
  it("guesses distinct columns", () => {
    expect(guessMapping(["Supplier", "Invoice #", "Invoice Date", "Subtotal", "Total"])).toEqual({
      vendor_name: "Supplier",
      invoice_number: "Invoice #",
      invoice_date: "Invoice Date",
      subtotal: "Subtotal",
      total_amount: "Total",
    });
  });

  it("defaults blank optional values without hiding invalid supplied values", () => {
    const sheet: ParsedSheet = {
      headers: Object.values(mapping),
      rows: [
        {
          Vendor: "Acme",
          Invoice: "INV-1",
          "Invoice Date": "2030-01-01", Subtotal: "10.00", Total: "10.25",
          Currency: "usd",
          Status: "ARCHIVED",
          Due: "2030-01-01",
        },
      ],
    };
    expect(applyMapping(sheet, mapping)).toEqual([
      {
        vendor_name: "Acme",
        invoice_number: "INV-1",
        invoice_date: "2030-01-01", subtotal: 10, tax_rate: null, tax_amount: 0, total_amount: 10.25, amount: 10.25,
        currency: "USD", supplier_tax_id: null, buyer_name: null, buyer_tax_id: null, purchase_order_number: null, payment_terms: null,
        status: "archived",
        due_date: "2030-01-01",
      },
    ]);
  });

  it("detects duplicate invoice numbers case-insensitively", () => {
    const invoices = applyMapping(
      {
        headers: Object.values(mapping),
        rows: [
          { Vendor: "A", Invoice: "INV-1", "Invoice Date": "2030-01-01", Subtotal: "1", Total: "1" },
          { Vendor: "A", Invoice: " inv-1 ", "Invoice Date": "2030-01-01", Subtotal: "2", Total: "2" },
        ],
      },
      mapping,
    );
    expect([...duplicateInvoiceRows(invoices)]).toEqual([0, 1]);
  });
});

describe("file parsing", () => {
  it("rejects an empty spreadsheet file with a clear error", async () => {
    await expect(parseFile(csvFile(""))).rejects.toThrow("empty");
  });

  it("parses CSV and rejects duplicate headers", async () => {
    await expect(parseFile(csvFile("Vendor,Invoice,Amount\nAcme,I-1,10"))).resolves.toEqual({
      headers: ["Vendor", "Invoice", "Amount"],
      rows: [{ Vendor: "Acme", Invoice: "I-1", Amount: "10" }],
    });
    await expect(parseFile(csvFile("Vendor,vendor\nA,B"))).rejects.toThrow(
      "Column headers must be unique",
    );
  });

  it("rejects malformed, unsupported, and oversized files", async () => {
    await expect(parseFile(csvFile('Vendor,Invoice\n"broken'))).rejects.toThrow();
    await expect(parseFile(new File(["x"], "legacy.xls"))).rejects.toThrow(
      "Only CSV and XLSX",
    );
    const oversized = new File(
      [new Uint8Array(IMPORT_LIMITS.maxFileBytes + 1)],
      "large.csv",
      { type: "text/csv" },
    );
    await expect(parseFile(oversized)).rejects.toThrow("larger than 5 MB");
  });

  it("parses XLSX dates into ISO strings", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Invoices");
    worksheet.addRow(["Vendor", "Invoice", "Amount", "Due"]);
    worksheet.addRow(["Acme", "I-1", 10, new Date(Date.UTC(2030, 0, 15))]);
    const bytes = await workbook.xlsx.writeBuffer();
    const parsed = await parseFile(
      new File([new Uint8Array(bytes)], "invoices.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    expect(parsed.rows[0]?.Due).toBe("2030-01-15");
  });

  it("rejects XLSX archives with excessive entries before workbook parsing", async () => {
    const archive = new JSZip();
    for (let index = 0; index <= IMPORT_LIMITS.maxArchiveEntries; index += 1) {
      archive.file(`entry-${index}.xml`, "x");
    }
    const bytes = await archive.generateAsync({ type: "uint8array" });
    await expect(
      parseFile(new File([bytes.slice().buffer as ArrayBuffer], "oversized.xlsx")),
    ).rejects.toThrow("archive entries");
  });
});
