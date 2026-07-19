"use server";

import { revalidatePath } from "next/cache";
import { applyMapping, type ParsedSheet } from "@/lib/invoice-import";
import { importPayloadSchema } from "@/lib/schemas";
import { validateInvoice } from "@/lib/validation";
import { createClient } from "@/utils/supabase/server";

export type ImportActionResult = { ok: true; batchId: string; inserted: number; failed: number } | { ok: false; error: string };

export async function importInvoices(payload: unknown): Promise<ImportActionResult> {
  const parsed = importPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be authenticated." };
  const input = parsed.data;
  const { data: prior } = await supabase.from("invoice_import_batches").select("id").eq("submission_id", input.submissionId).maybeSingle();
  if (prior) return { ok: false, error: "This import was already submitted." };
  const invoices = applyMapping({ headers: Object.keys(input.rows[0] ?? {}), rows: input.rows } satisfies ParsedSheet, input.mapping);
  const { data: existing, error: existingError } = await supabase.from("invoices").select("vendor_name, invoice_number");
  if (existingError) return { ok: false, error: existingError.message };
  const existingKeys = new Set((existing ?? []).map((row) => `${row.vendor_name.trim().toLowerCase()}\u0000${String(row.invoice_number ?? "").trim().toLowerCase()}`));
  const counts = new Map<string, number>();
  const keys = invoices.map((row) => `${row.vendor_name.trim().toLowerCase()}\u0000${row.invoice_number.trim().toLowerCase()}`);
  keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  const validations = invoices.map((row, index) => validateInvoice(row, { sameBatch: (counts.get(keys[index]) ?? 0) > 1, existing: existingKeys.has(keys[index]) }));
  const successfulRows = validations.filter((result) => result.ready).length;
  const warningRows = validations.filter((result) => result.ready && result.warningCount > 0).length;
  const failedRows = invoices.length - successfulRows;
  const average = validations.length ? validations.reduce((sum, value) => sum + value.overallScore, 0) / validations.length : 0;
  const status = successfulRows === 0 ? "failed" : failedRows ? "partially_failed" : "completed";
  const { data: batch, error: batchError } = await supabase.from("invoice_import_batches").insert({ user_id: user.id, submission_id: input.submissionId, original_filename: input.originalFilename, file_type: input.fileType, status, total_rows: invoices.length, successful_rows: successfulRows, warning_rows: warningRows, failed_rows: failedRows, mapping_json: input.mapping, average_readiness_score: average, completed_at: new Date().toISOString() }).select("id").single();
  if (batchError || !batch) return { ok: false, error: batchError?.message ?? "Could not create import batch." };
  const accepted = invoices.flatMap((invoice, index) => validations[index].ready ? [{ ...invoice, user_id: user.id, import_batch_id: batch.id, currency: invoice.currency.toUpperCase(), readiness_score: validations[index].overallScore, category_scores: validations[index].categoryScores, validation_issues: validations[index].issues, passed_rule_count: validations[index].passedRuleCount, warning_count: validations[index].warningCount, critical_error_count: validations[index].criticalErrorCount }] : []);
  if (accepted.length) { const { error } = await supabase.from("invoices").insert(accepted); if (error) return { ok: false, error: `Batch recorded but invoice insertion failed: ${error.message}` }; }
  const rejected = input.rows.flatMap((row, index) => validations[index].ready ? [] : [{ import_batch_id: batch.id, user_id: user.id, row_number: index + 2, validation_issues: validations[index].issues, original_row: row }]);
  if (rejected.length) { const { error } = await supabase.from("invoice_import_rejected_rows").insert(rejected); if (error) return { ok: false, error: `Batch recorded but rejected rows could not be saved: ${error.message}` }; }
  revalidatePath("/invoices"); revalidatePath("/invoices/imports");
  return { ok: true, batchId: batch.id, inserted: accepted.length, failed: rejected.length };
}
