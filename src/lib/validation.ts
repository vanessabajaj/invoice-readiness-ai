// Invoice readiness validation engine.
//
// Given an invoice, each rule reports zero or more issues. An invoice is
// "ready" for financial processing when it has no `error`-severity issues.
// A 0-100 readiness score is derived by deducting each issue's weight.

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  /** Target field the issue relates to, or "invoice" for whole-record checks. */
  field: string;
  /** Stable rule identifier, useful for grouping/analytics. */
  rule: string;
  severity: ValidationSeverity;
  message: string;
};

export type InvoiceInput = {
  vendor_name?: string | null;
  invoice_number?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  due_date?: string | null;
};

export type ValidationResult = {
  ready: boolean;
  /** 0-100; 100 means no issues. */
  score: number;
  issues: ValidationIssue[];
};

export const INVOICE_STATUSES = [
  "draft",
  "pending",
  "ready",
  "rejected",
] as const;

// Common ISO 4217 codes. Unknown-but-well-formed codes are only a warning.
const KNOWN_CURRENCIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "INR",
  "SEK",
  "NOK",
  "DKK",
  "SGD",
  "HKD",
  "NZD",
  "MXN",
  "BRL",
  "ZAR",
]);

const WEIGHTS: Record<ValidationSeverity, number> = {
  error: 25,
  warning: 8,
};

type Rule = (invoice: InvoiceInput) => ValidationIssue | null;

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || String(v).trim() === "";

// YYYY-MM-DD, validated for a real calendar date.
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

const RULES: Rule[] = [
  (inv) =>
    isBlank(inv.vendor_name)
      ? {
          field: "vendor_name",
          rule: "vendor_name_required",
          severity: "error",
          message: "Vendor name is required.",
        }
      : null,

  (inv) =>
    isBlank(inv.invoice_number)
      ? {
          field: "invoice_number",
          rule: "invoice_number_required",
          severity: "error",
          message: "Invoice number is required.",
        }
      : null,

  (inv) => {
    if (inv.amount === null || inv.amount === undefined || Number.isNaN(inv.amount)) {
      return {
        field: "amount",
        rule: "amount_required",
        severity: "error",
        message: "Amount is required.",
      };
    }
    if (inv.amount <= 0) {
      return {
        field: "amount",
        rule: "amount_positive",
        severity: "error",
        message: "Amount must be greater than zero.",
      };
    }
    return null;
  },

  (inv) => {
    if (isBlank(inv.currency)) {
      return {
        field: "currency",
        rule: "currency_missing",
        severity: "warning",
        message: "Currency is missing; defaulting is discouraged.",
      };
    }
    const code = String(inv.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      return {
        field: "currency",
        rule: "currency_format",
        severity: "error",
        message: `Currency "${inv.currency}" is not a 3-letter ISO code.`,
      };
    }
    if (!KNOWN_CURRENCIES.has(code)) {
      return {
        field: "currency",
        rule: "currency_unknown",
        severity: "warning",
        message: `Currency "${code}" is not a recognized code.`,
      };
    }
    return null;
  },

  (inv) => {
    if (isBlank(inv.due_date)) {
      return {
        field: "due_date",
        rule: "due_date_missing",
        severity: "warning",
        message: "Due date is missing.",
      };
    }
    if (!parseIsoDate(String(inv.due_date))) {
      return {
        field: "due_date",
        rule: "due_date_format",
        severity: "error",
        message: `Due date "${inv.due_date}" is not a valid YYYY-MM-DD date.`,
      };
    }
    return null;
  },

  (inv) => {
    if (isBlank(inv.status)) return null;
    const status = String(inv.status).trim().toLowerCase();
    return (INVOICE_STATUSES as readonly string[]).includes(status)
      ? null
      : {
          field: "status",
          rule: "status_unknown",
          severity: "warning",
          message: `Status "${inv.status}" is not one of ${INVOICE_STATUSES.join(", ")}.`,
        };
  },
];

export function validateInvoice(invoice: InvoiceInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const rule of RULES) {
    const issue = rule(invoice);
    if (issue) issues.push(issue);
  }

  const deduction = issues.reduce((sum, i) => sum + WEIGHTS[i.severity], 0);
  const score = Math.max(0, 100 - deduction);
  const ready = !issues.some((i) => i.severity === "error");

  return { ready, score, issues };
}

export type ValidationSummary = {
  total: number;
  ready: number;
  notReady: number;
  averageScore: number;
  /** Count of issues keyed by rule id, most frequent first. */
  topIssues: { rule: string; severity: ValidationSeverity; count: number }[];
};

export function summarizeValidation(
  invoices: InvoiceInput[],
): ValidationSummary {
  const results = invoices.map(validateInvoice);
  const ready = results.filter((r) => r.ready).length;
  const scoreSum = results.reduce((sum, r) => sum + r.score, 0);

  const counts = new Map<string, { severity: ValidationSeverity; count: number }>();
  for (const result of results) {
    for (const issue of result.issues) {
      const existing = counts.get(issue.rule);
      if (existing) existing.count += 1;
      else counts.set(issue.rule, { severity: issue.severity, count: 1 });
    }
  }

  const topIssues = [...counts.entries()]
    .map(([rule, v]) => ({ rule, severity: v.severity, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: results.length,
    ready,
    notReady: results.length - ready,
    averageScore: results.length
      ? Math.round(scoreSum / results.length)
      : 0,
    topIssues,
  };
}
