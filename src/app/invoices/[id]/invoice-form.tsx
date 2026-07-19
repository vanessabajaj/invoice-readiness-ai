"use client";
import { useActionState } from "react";
import { updateInvoice, type UpdateState } from "./actions";

const initial: UpdateState = { status: "idle", message: "" };
const fields = [
  ["vendor_name", "Supplier"], ["invoice_number", "Invoice number"], ["invoice_date", "Invoice date"], ["due_date", "Due date"], ["currency", "Currency"], ["subtotal", "Subtotal"], ["tax_rate", "Tax rate (%)"], ["tax_amount", "Tax amount"], ["total_amount", "Total amount"], ["supplier_tax_id", "Supplier tax ID"], ["buyer_name", "Buyer name"], ["buyer_tax_id", "Buyer tax ID"], ["purchase_order_number", "Purchase-order number"], ["payment_terms", "Payment terms"],
] as const;

export function InvoiceForm({ invoice }: { invoice: Record<string, unknown> }) {
  const [state, action, pending] = useActionState(updateInvoice, initial);
  return <form action={action} className="grid gap-4 rounded-2xl border border-black/[.08] bg-white p-5 sm:grid-cols-2 dark:border-white/[.145] dark:bg-zinc-950">
    <input type="hidden" name="id" value={String(invoice.id)} />
    {fields.map(([name, label]) => <label key={name} className="flex flex-col gap-1"><span className="text-sm font-medium">{label}</span><input name={name} type={name.includes("date") ? "date" : "text"} defaultValue={String(invoice[name] ?? "")} className="h-10 rounded-lg border border-black/[.12] bg-transparent px-3 text-sm dark:border-white/[.16]" /></label>)}
    <label className="flex flex-col gap-1"><span className="text-sm font-medium">Status</span><select name="status" defaultValue={String(invoice.status ?? "draft")} className="h-10 rounded-lg border border-black/[.12] bg-transparent px-3 text-sm dark:border-white/[.16]"><option>draft</option><option>pending</option><option>ready</option><option>rejected</option></select></label>
    <div className="flex flex-col gap-2 sm:col-span-2"><button disabled={pending} className="h-11 w-fit rounded-full bg-foreground px-6 text-sm font-medium text-background disabled:opacity-50">{pending ? "Saving…" : "Save and revalidate"}</button>{state.message ? <p className={state.status === "success" ? "text-sm text-green-600" : "text-sm text-red-600"}>{state.message}</p> : null}{state.issues?.length ? <ul className="list-disc pl-5 text-sm text-zinc-600">{state.issues.map((value) => <li key={value}>{value}</li>)}</ul> : null}</div>
  </form>;
}
