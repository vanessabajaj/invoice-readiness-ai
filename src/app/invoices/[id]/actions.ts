"use server";
import { revalidatePath } from "next/cache";
import { invoiceUpdateSchema } from "@/lib/schemas";
import { normalizeCurrency, validateInvoice } from "@/lib/validation";
import { createClient } from "@/utils/supabase/server";

export type UpdateState = { status: "idle" | "success" | "error"; message: string; issues?: string[] };
export async function updateInvoice(_previous: UpdateState, formData: FormData): Promise<UpdateState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = invoiceUpdateSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Check the highlighted values.", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "You must be authenticated." };
  const { data: owned } = await supabase.from("invoices").select("id").eq("id", parsed.data.id).eq("user_id", user.id).maybeSingle();
  if (!owned) return { status: "error", message: "Invoice was not found or you are not authorized." };
  const invoice = { ...parsed.data, currency: normalizeCurrency(parsed.data.currency) };
  const validation = validateInvoice(invoice);
  const { id, ...values } = invoice;
  const { error } = await supabase.from("invoices").update({ ...values, amount: values.total_amount, readiness_score: validation.overallScore, category_scores: validation.categoryScores, validation_issues: validation.issues, passed_rule_count: validation.passedRuleCount, warning_count: validation.warningCount, critical_error_count: validation.criticalErrorCount }).eq("id", id).eq("user_id", user.id);
  if (error) return { status: "error", message: error.message };
  revalidatePath(`/invoices/${id}`); revalidatePath("/invoices");
  return { status: "success", message: `Saved and revalidated. Readiness score: ${validation.overallScore}.`, issues: validation.issues.map((i) => i.message) };
}
