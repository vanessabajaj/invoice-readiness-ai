import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { InvoiceForm } from "./invoice-form";
import type { ValidationIssue } from "@/lib/validation";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) notFound();
  const { data: invoice } = await supabase.from("invoices").select("*, invoice_import_batches(id, original_filename, created_at, status)").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!invoice) notFound();
  const categories = (invoice.category_scores ?? {}) as Record<string, number>;
  const issues = (invoice.validation_issues ?? []) as ValidationIssue[];
  return <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black"><div className="flex w-full max-w-5xl flex-col gap-6"><header><Link href="/invoices" className="text-sm underline">← Dashboard</Link><h1 className="mt-3 text-2xl font-semibold">{invoice.vendor_name} · {invoice.invoice_number}</h1><p className="text-sm text-zinc-500">Imported from {invoice.invoice_import_batches?.original_filename ?? "legacy/manual record"}</p></header><section className="grid gap-3 sm:grid-cols-4"><Metric label="Readiness" value={invoice.readiness_score}/><Metric label="Passed checks" value={invoice.passed_rule_count}/><Metric label="Warnings" value={invoice.warning_count}/><Metric label="Critical errors" value={invoice.critical_error_count}/></section><section className="rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950"><h2 className="font-semibold">Category scores</h2><div className="mt-3 grid gap-2 sm:grid-cols-5">{Object.entries(categories).map(([key, value]) => <div key={key}><span className="block text-xs text-zinc-500">{key.replaceAll("_", " ")}</span><strong>{value}</strong></div>)}</div>{issues.length ? <ul className="mt-4 list-disc pl-5 text-sm">{issues.map((i) => <li key={i.ruleId}>{i.message} <span className="text-zinc-500">Suggested: {i.suggestedCorrection}</span></li>)}</ul> : <p className="mt-3 text-sm text-green-600">No validation issues.</p>}</section><InvoiceForm invoice={invoice} /></div></main>;
}
function Metric({ label, value }: { label: string; value: unknown }) { return <div className="rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950"><span className="text-xs text-zinc-500">{label}</span><strong className="block text-2xl">{String(value ?? 0)}</strong></div>; }
