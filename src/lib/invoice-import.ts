import ExcelJS from "exceljs";
import JSZip from "jszip";
import Papa from "papaparse";

export const IMPORT_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxRows: 5_000,
  maxColumns: 50,
  maxCellCharacters: 10_000,
  maxArchiveEntries: 200,
  maxExpandedBytes: 25 * 1024 * 1024,
} as const;

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

export type InvoiceField = {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
};

export const INVOICE_FIELDS: InvoiceField[] = [
  {
    key: "vendor_name",
    label: "Supplier name",
    required: true,
    aliases: ["vendor", "supplier", "company", "payee", "biller"],
  },
  {
    key: "invoice_number",
    label: "Invoice number",
    required: true,
    aliases: ["invoice number", "invoice no", "invoice #", "number", "inv"],
  },
  {
    key: "invoice_date", label: "Invoice date", required: true, aliases: ["invoice date", "issued", "date"],
  },
  { key: "subtotal", label: "Subtotal", required: true, aliases: ["subtotal", "net amount", "net"] },
  {
    key: "total_amount",
    label: "Total amount",
    required: true,
    aliases: ["amount", "total", "sum", "value", "price"],
  },
  {
    key: "currency",
    label: "Currency",
    required: true,
    aliases: ["currency", "ccy"],
  },
  {
    key: "status",
    label: "Status",
    required: false,
    aliases: ["status", "state"],
  },
  { key: "tax_rate", label: "Tax rate", required: false, aliases: ["tax rate", "vat rate"] },
  { key: "tax_amount", label: "Tax amount", required: false, aliases: ["tax amount", "vat amount", "tax"] },
  { key: "supplier_tax_id", label: "Supplier tax ID", required: false, aliases: ["supplier tax", "vendor tax", "trn"] },
  { key: "buyer_name", label: "Buyer name", required: false, aliases: ["buyer", "customer"] },
  { key: "buyer_tax_id", label: "Buyer tax ID", required: false, aliases: ["buyer tax", "customer tax"] },
  { key: "purchase_order_number", label: "Purchase order", required: false, aliases: ["purchase order", "po number", "po"] },
  { key: "payment_terms", label: "Payment terms", required: false, aliases: ["payment terms", "terms"] },
  {
    key: "due_date",
    label: "Due date",
    required: false,
    aliases: ["due date", "due", "payment date", "date"],
  },
];

const norm = (value: string) => value.trim().toLowerCase();

function isoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return isoDate(value);
  if (typeof value === "object") {
    const cell = value as {
      result?: unknown;
      text?: unknown;
      richText?: { text?: unknown }[];
    };
    if (cell.result !== undefined) return cellText(cell.result);
    if (cell.text !== undefined) return cellText(cell.text);
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((part) => cellText(part.text)).join("");
    }
    throw new Error("Unsupported spreadsheet cell value.");
  }
  return String(value).trim();
}

function toSheet(rawHeaders: unknown[], rawRows: unknown[][]): ParsedSheet {
  if (rawHeaders.length > IMPORT_LIMITS.maxColumns) {
    throw new Error(`Files may contain at most ${IMPORT_LIMITS.maxColumns} columns.`);
  }
  if (rawRows.length > IMPORT_LIMITS.maxRows) {
    throw new Error(`Files may contain at most ${IMPORT_LIMITS.maxRows} rows.`);
  }

  const headers = rawHeaders.map(cellText);
  const populatedHeaders = headers.filter(Boolean);
  const normalizedHeaders = populatedHeaders.map(norm);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error("Column headers must be unique.");
  }

  const rows = rawRows
    .filter((row) => row.some((cell) => cellText(cell) !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (!header) return;
        const value = cellText(row[index]);
        if (value.length > IMPORT_LIMITS.maxCellCharacters) {
          throw new Error(
            `Cells may contain at most ${IMPORT_LIMITS.maxCellCharacters} characters.`,
          );
        }
        record[header] = value;
      });
      return record;
    });

  return { headers: populatedHeaders, rows };
}

export async function parseFile(file: File): Promise<ParsedSheet> {
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    throw new Error("File is larger than 5 MB.");
  }

  const name = file.name.toLowerCase();
  const isCsv = file.type === "text/csv" || name.endsWith(".csv");
  if (isCsv) {
    const contents = await file.text();
    if (!contents.trim()) throw new Error("Spreadsheet file is empty.");
    const result = Papa.parse<string[]>(contents, {
      skipEmptyLines: "greedy",
    });
    if (result.errors.length > 0) {
      throw new Error(result.errors[0]?.message ?? "Malformed CSV file.");
    }
    const [headerRow, ...dataRows] = result.data;
    return headerRow ? toSheet(headerRow, dataRows) : { headers: [], rows: [] };
  }

  if (!name.endsWith(".xlsx")) {
    throw new Error("Only CSV and XLSX files are supported.");
  }

  const buffer = await file.arrayBuffer();
  const archive = await JSZip.loadAsync(buffer);
  const entries = Object.values(archive.files);
  if (entries.length > IMPORT_LIMITS.maxArchiveEntries) {
    throw new Error(
      `XLSX files may contain at most ${IMPORT_LIMITS.maxArchiveEntries} archive entries.`,
    );
  }
  const expandedBytes = entries.reduce((total, entry) => {
    const metadata = entry as typeof entry & {
      _data?: { uncompressedSize?: number };
    };
    return total + (metadata._data?.uncompressedSize ?? 0);
  }, 0);
  if (expandedBytes > IMPORT_LIMITS.maxExpandedBytes) {
    throw new Error("Expanded XLSX content is larger than 25 MB.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };
  if (worksheet.actualColumnCount > IMPORT_LIMITS.maxColumns) {
    throw new Error(`Files may contain at most ${IMPORT_LIMITS.maxColumns} columns.`);
  }
  if (worksheet.actualRowCount - 1 > IMPORT_LIMITS.maxRows) {
    throw new Error(`Files may contain at most ${IMPORT_LIMITS.maxRows} rows.`);
  }

  const matrix: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    matrix.push(values);
  });
  const [headerRow, ...dataRows] = matrix;
  return headerRow ? toSheet(headerRow, dataRows) : { headers: [], rows: [] };
}

export function guessMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const field of INVOICE_FIELDS) {
    const match = headers.find((header) => {
      if (used.has(header)) return false;
      const normalized = norm(header);
      return (
        normalized === field.key ||
        normalized === norm(field.label) ||
        field.aliases.some((alias) => normalized.includes(alias))
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
  invoice_number: string;
  invoice_date: string | null;
  subtotal: number;
  tax_rate: number | null;
  tax_amount: number;
  total_amount: number;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  supplier_tax_id: string | null;
  buyer_name: string | null;
  buyer_tax_id: string | null;
  purchase_order_number: string | null;
  payment_terms: string | null;
};

const CURRENCY_SYMBOLS = /^[\s$€£¥₹]+|[\s$€£¥₹]+$/g;

export function parseAmount(value: string | undefined): number {
  if (!value) return Number.NaN;
  let cleaned = value.trim().replace(CURRENCY_SYMBOLS, "");
  const parenthesized = /^\((.*)\)$/.exec(cleaned);
  if (parenthesized) cleaned = `-${parenthesized[1]}`;
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(cleaned)) {
    return Number.NaN;
  }
  const amount = Number(cleaned.replaceAll(",", ""));
  return Number.isSafeInteger(Math.round(amount * 100)) ? amount : Number.NaN;
}

export function applyMapping(
  sheet: ParsedSheet,
  mapping: Record<string, string>,
): MappedInvoice[] {
  const get = (row: Record<string, string>, key: string) => {
    const header = mapping[key];
    return header ? (row[header] ?? "").trim() : "";
  };

  return sheet.rows.map((row) => ({
    vendor_name: get(row, "vendor_name"),
    invoice_number: get(row, "invoice_number"),
    invoice_date: get(row, "invoice_date") || null,
    subtotal: parseAmount(get(row, "subtotal")),
    tax_rate: get(row, "tax_rate") ? parseAmount(get(row, "tax_rate")) : null,
    tax_amount: get(row, "tax_amount") ? parseAmount(get(row, "tax_amount")) : 0,
    total_amount: parseAmount(get(row, "total_amount")),
    amount: parseAmount(get(row, "total_amount")),
    currency: get(row, "currency").toUpperCase(),
    status: (get(row, "status") || "draft").toLowerCase(),
    due_date: get(row, "due_date") || null,
    supplier_tax_id: get(row, "supplier_tax_id") || null,
    buyer_name: get(row, "buyer_name") || null,
    buyer_tax_id: get(row, "buyer_tax_id") || null,
    purchase_order_number: get(row, "purchase_order_number") || null,
    payment_terms: get(row, "payment_terms") || null,
  }));
}

export function duplicateInvoiceRows(invoices: MappedInvoice[]): Set<number> {
  const firstRow = new Map<string, number>();
  const duplicates = new Set<number>();
  invoices.forEach((invoice, index) => {
    const key = `${invoice.vendor_name.trim().toLowerCase()}\u0000${invoice.invoice_number.trim().toLowerCase()}`;
    if (!key) return;
    const previous = firstRow.get(key);
    if (previous === undefined) firstRow.set(key, index);
    else {
      duplicates.add(previous);
      duplicates.add(index);
    }
  });
  return duplicates;
}
