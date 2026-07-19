import Papa from "papaparse"; import { createClient } from "@/utils/supabase/server";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient(); const { data: batch } = await supabase.from("invoice_import_batches").select("id, original_filename").eq("id", id).maybeSingle(); if (!batch) return new Response("Not found", { status: 404 });
  const { data } = await supabase.from("invoice_import_rejected_rows").select("row_number, validation_issues, original_row").eq("import_batch_id", id).order("row_number");
  const rows = (data ?? []).map((row) => ({ row_number: row.row_number, validation_errors: (row.validation_issues as { message?: string }[]).map((i) => i.message).join(" | "), ...(row.original_row as Record<string, string>) }));
  return new Response(Papa.unparse(rows, { escapeFormulae: true }), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${batch.original_filename.replace(/[^a-z0-9_.-]/gi, "_")}-failed.csv"`, "Cache-Control": "private, no-store" } });
}
