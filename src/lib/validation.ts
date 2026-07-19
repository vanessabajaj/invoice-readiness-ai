export type ValidationSeverity = "critical" | "warning";
export type ValidationCategory =
  | "required_fields"
  | "financial_calculations"
  | "tax_consistency"
  | "data_formatting"
  | "duplicate_anomaly";

export type ValidationIssue = {
  ruleId: string;
  rule: string;
  category: ValidationCategory;
  field: string;
  severity: ValidationSeverity;
  message: string;
  actualValue: unknown;
  expectedValue?: unknown;
  suggestedCorrection: string;
};

export type InvoiceInput = {
  vendor_name?: string | null;
  supplier_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  currency?: string | null;
  subtotal?: number | string | null;
  tax_rate?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  amount?: number | string | null;
  supplier_tax_id?: string | null;
  buyer_tax_id?: string | null;
  status?: string | null;
};

export type DuplicateContext = {
  sameBatch?: boolean;
  existing?: boolean;
};

export const INVOICE_STATUSES = ["draft", "pending", "ready", "rejected"] as const;
const CURRENCIES = new Set(["AED", "AUD", "BRL", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP", "HKD", "INR", "JPY", "MXN", "NOK", "NZD", "SAR", "SEK", "SGD", "USD", "ZAR"]);
const CATEGORY_WEIGHTS: Record<ValidationCategory, number> = {
  required_fields: 30,
  financial_calculations: 25,
  tax_consistency: 20,
  data_formatting: 15,
  duplicate_anomaly: 10,
};

export type ValidationResult = {
  ready: boolean;
  score: number;
  overallScore: number;
  categoryScores: Record<ValidationCategory, number>;
  passedRuleCount: number;
  warningCount: number;
  criticalErrorCount: number;
  issues: ValidationIssue[];
};

const blank = (value: unknown) => value == null || String(value).trim() === "";
const decimal = (value: unknown): number | null => {
  if (blank(value)) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const cents = (value: number) => Math.round(value * 100);

export function normalizeCurrency(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export function parseIsoDate(value: unknown): Date | null {
  if (blank(value)) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!match) return null;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return date.getUTCFullYear() === +match[1] && date.getUTCMonth() === +match[2] - 1 && date.getUTCDate() === +match[3] ? date : null;
}

function issue(category: ValidationCategory, ruleId: string, field: string, severity: ValidationSeverity, message: string, actualValue: unknown, expectedValue: unknown, suggestedCorrection: string): ValidationIssue {
  return { category, ruleId, rule: ruleId, field, severity, message, actualValue, expectedValue, suggestedCorrection };
}

export function validateInvoice(invoice: InvoiceInput, duplicates: DuplicateContext = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const supplier = invoice.vendor_name ?? invoice.supplier_name;
  const total = decimal(invoice.total_amount ?? invoice.amount);
  const subtotal = decimal(invoice.subtotal);
  const tax = decimal(invoice.tax_amount);
  const rate = decimal(invoice.tax_rate);
  const required: [string, unknown][] = [
    ["vendor_name", supplier], ["invoice_number", invoice.invoice_number], ["invoice_date", invoice.invoice_date],
    ["currency", invoice.currency], ["subtotal", subtotal], ["total_amount", total],
  ];
  for (const [field, value] of required) if (blank(value)) issues.push(issue("required_fields", `${field}_required`, field, "critical", `${field.replaceAll("_", " ")} is required.`, value, "A non-empty value", `Enter a ${field.replaceAll("_", " ")}.`));

  if (subtotal !== null && subtotal < 0) issues.push(issue("financial_calculations", "subtotal_non_negative", "subtotal", "critical", "Subtotal must not be negative.", subtotal, ">= 0", "Enter a non-negative subtotal."));
  if (tax !== null && tax < 0) issues.push(issue("financial_calculations", "tax_amount_non_negative", "tax_amount", "critical", "Tax amount must not be negative.", tax, ">= 0", "Enter a non-negative tax amount."));
  if (total !== null && total <= 0) issues.push(issue("financial_calculations", "total_amount_positive", "total_amount", "critical", "Total amount must be greater than zero.", total, "> 0", "Enter a positive total amount."));
  if (subtotal !== null && tax !== null && total !== null && Math.abs(cents(subtotal + tax) - cents(total)) > 1) issues.push(issue("financial_calculations", "total_equals_subtotal_plus_tax", "total_amount", "critical", "Subtotal plus tax amount must equal total amount within 0.01.", total, subtotal + tax, "Correct the subtotal, tax amount, or total."));
  if (subtotal !== null && tax !== null && rate !== null) {
    const expected = subtotal * (rate > 1 ? rate / 100 : rate);
    if (Math.abs(cents(expected) - cents(tax)) > 1) issues.push(issue("tax_consistency", "tax_rate_matches_amount", "tax_amount", "critical", "Tax amount does not agree with subtotal × tax rate.", tax, Number(expected.toFixed(2)), "Correct the tax rate or tax amount."));
  }

  const invoiceDate = parseIsoDate(invoice.invoice_date);
  const dueDate = parseIsoDate(invoice.due_date);
  if (!blank(invoice.invoice_date) && !invoiceDate) issues.push(issue("data_formatting", "invoice_date_valid", "invoice_date", "critical", "Invoice date must be a real YYYY-MM-DD calendar date.", invoice.invoice_date, "YYYY-MM-DD", "Enter a real calendar date."));
  if (!blank(invoice.due_date) && !dueDate) issues.push(issue("data_formatting", "due_date_valid", "due_date", "critical", "Due date must be a real YYYY-MM-DD calendar date.", invoice.due_date, "YYYY-MM-DD", "Enter a real calendar date."));
  if (invoiceDate && dueDate && dueDate < invoiceDate) issues.push(issue("data_formatting", "due_date_not_before_invoice_date", "due_date", "critical", "Due date cannot be earlier than invoice date.", invoice.due_date, `On or after ${invoice.invoice_date}`, "Move the due date on or after the invoice date."));
  const currency = normalizeCurrency(invoice.currency);
  if (!blank(invoice.currency) && !/^[A-Z]{3}$/.test(currency)) issues.push(issue("data_formatting", "currency_format", "currency", "critical", "Currency must be a three-letter code.", invoice.currency, "ISO-style three-letter code", "Enter a three-letter currency code."));
  else if (currency && !CURRENCIES.has(currency)) issues.push(issue("data_formatting", "currency_unknown", "currency", "critical", `Currency ${currency} is not recognised.`, currency, "A recognised currency code", "Choose a recognised currency."));
  for (const [field, value] of [["supplier_tax_id", invoice.supplier_tax_id], ["buyer_tax_id", invoice.buyer_tax_id]] as const) if (!blank(value) && !/^[A-Z0-9][A-Z0-9 .\/-]{4,29}$/i.test(String(value).trim())) issues.push(issue("tax_consistency", `${field}_format`, field, "warning", "Tax ID does not match the configured generic format.", value, "5–30 letters, numbers, spaces, dots, slashes or hyphens", "Check the identifier or configure a jurisdiction-specific format."));
  if (duplicates.sameBatch) issues.push(issue("duplicate_anomaly", "duplicate_same_batch", "invoice_number", "critical", "Supplier and invoice number are repeated in this import batch.", invoice.invoice_number, "Unique within this batch", "Review both rows; do not silently discard either."));
  if (duplicates.existing) issues.push(issue("duplicate_anomaly", "duplicate_existing_invoice", "invoice_number", "critical", "A matching supplier and invoice number exists in an earlier import.", invoice.invoice_number, "Unique for this supplier", "Review the existing invoice before importing."));

  const allRules: Record<ValidationCategory, number> = { required_fields: 6, financial_calculations: 4, tax_consistency: 3, data_formatting: 4, duplicate_anomaly: 2 };
  const categoryScores = Object.fromEntries(Object.keys(CATEGORY_WEIGHTS).map((category) => {
    const failures = issues.filter((i) => i.category === category).reduce((sum, i) => sum + (i.severity === "critical" ? 1 : 0.5), 0);
    return [category, Math.max(0, Math.round(100 * (1 - failures / allRules[category as ValidationCategory])))];
  })) as Record<ValidationCategory, number>;
  const overallScore = Math.round(Object.entries(CATEGORY_WEIGHTS).reduce((sum, [category, weight]) => sum + categoryScores[category as ValidationCategory] * weight / 100, 0));
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const criticalErrorCount = issues.filter((i) => i.severity === "critical").length;
  return { ready: criticalErrorCount === 0, score: overallScore, overallScore, categoryScores, passedRuleCount: Object.values(allRules).reduce((a, b) => a + b, 0) - issues.length, warningCount, criticalErrorCount, issues };
}

export function summarizeValidation(invoices: InvoiceInput[]) {
  const results = invoices.map((invoice) => validateInvoice(invoice));
  const counts = new Map<string, { severity: ValidationSeverity; count: number; message: string }>();
  for (const result of results) for (const i of result.issues) { const current = counts.get(i.ruleId); counts.set(i.ruleId, { severity: i.severity, count: (current?.count ?? 0) + 1, message: i.message }); }
  return { total: results.length, ready: results.filter((r) => r.ready).length, notReady: results.filter((r) => !r.ready).length, failed: results.filter((r) => r.overallScore < 50).length, averageScore: results.length ? Math.round(results.reduce((s, r) => s + r.overallScore, 0) / results.length) : 0, topIssues: [...counts.entries()].map(([rule, value]) => ({ rule, ...value })).sort((a, b) => b.count - a.count) };
}
