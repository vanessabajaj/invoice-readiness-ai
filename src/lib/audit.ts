// Shared types and helpers for the audit history.

export type AuditAction = "invoice.import" | "report.export";

export type AuditMetadata = {
  count?: number;
  format?: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: AuditMetadata | null;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  "invoice.import": "Imported invoices",
  "report.export": "Exported readiness report",
};

export function describeAudit(event: AuditEvent): {
  title: string;
  detail: string;
} {
  const title = ACTION_LABELS[event.action] ?? event.action;
  const count = event.metadata?.count;
  const format = event.metadata?.format;

  const parts: string[] = [];
  if (typeof count === "number") {
    parts.push(`${count} invoice${count === 1 ? "" : "s"}`);
  }
  if (format) {
    parts.push(format.toUpperCase());
  }

  return { title, detail: parts.join(" · ") };
}
