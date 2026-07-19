import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

export type InvoiceField = {
  key: string;
  label: string;
  required: boolean;
  /** Header substrings used to auto-guess the source column. */
  aliases: string[];
};

// Target columns in the `invoices` table that can be populated from a file.
export const INVOICE_FIELDS: InvoiceField[] = [
  {
    key: "vendor_name",
    label: "Vendor name",
    required: true,
    aliases: ["vendor", "supplier", "company", "payee", "biller"],
  },
  {
    key: "invoice_number",
    label: "Invoice number",
    required: false,
    aliases: ["invoice number", "invoice no", "invoice #", "number", "inv"],
  },
  {
    key: "amount",
    label: "Amount",
    required: true,
    aliases: ["amount", "total", "sum", "value", "price"],
  },
  {
    key: "currency",
    label: "Currency",
    required: false,
    aliases: ["currency", "ccy"],
  },
  {
    key: "status",
    label: "Status",
    required: false,
    aliases: ["status", "state"],
  },
  {
    key: "due_date",
    label: "Due date",
    required: false,
    aliases: ["due date", "due", "payment date", "date"],
  },
];

const norm = (value: string) => value.trim().toLowerCase();

function toSheet(headers: string[], rawRows: unknown[][]): ParsedSheet {
  const cleanHeaders = headers.map((h) => String(h ?? "").trim());
  const rows = rawRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      cleanHeaders.forEach((header, i) => {
        if (header) record[header] = String(row[i] ?? "").trim();
      });
      return record;
    });
  return { headers: cleanHeaders.filter(Boolean), rows };
}

export async function parseFile(file: File): Promise<ParsedSheet> {
  const isCsv =
    file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");

  if (isCsv) {
    const text = await file.text();
    const result = Papa.parse<string[]>(text, {
      skipEmptyLines: "greedy",
    });
    const [headerRow, ...dataRows] = result.data;
    if (!headerRow) return { headers: [], rows: [] };
    return toSheet(headerRow, dataRows);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });
  const [headerRow, ...dataRows] = matrix;
  if (!headerRow) return { headers: [], rows: [] };
  return toSheet(headerRow.map((h) => String(h ?? "")), dataRows);
}

/** Best-effort mapping from target field key -> source header. */
export function guessMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const field of INVOICE_FIELDS) {
    const match = headers.find((header) => {
      if (used.has(header)) return false;
      const h = norm(header);
      return (
        h === field.key ||
        h === norm(field.label) ||
        field.aliases.some((alias) => h.includes(alias))
      );
    });
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    }
  }
  return mapping;
}

export type MappedInvoice = {
  vendor_name: string;
  invoice_number: string | null;
  amount: number;
  currency: string | null;
  status: string | null;
  due_date: string | null;
};

const ALLOWED_STATUSES = ["draft", "pending", "ready", "rejected"];

function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Apply a mapping to parsed rows, producing rows shaped for the invoices table. */
export function applyMapping(
  sheet: ParsedSheet,
  mapping: Record<string, string>,
): MappedInvoice[] {
  const get = (row: Record<string, string>, key: string) => {
    const header = mapping[key];
    return header ? (row[header] ?? "") : "";
  };

  return sheet.rows.map((row) => {
    const status = get(row, "status").toLowerCase();
    const currency = get(row, "currency").toUpperCase();
    return {
      vendor_name: get(row, "vendor_name"),
      invoice_number: get(row, "invoice_number") || null,
      amount: parseAmount(get(row, "amount")),
      currency: currency || null,
      status: ALLOWED_STATUSES.includes(status) ? status : null,
      due_date: get(row, "due_date") || null,
    };
  });
}
