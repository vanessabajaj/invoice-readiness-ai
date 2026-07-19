import { z } from "zod";

const nullableText = z.preprocess((value) => value === "" ? null : value, z.union([z.string().trim().max(255), z.null()]).optional());
const money = z.preprocess((value) => value === "" ? null : value, z.union([z.number().finite(), z.string().trim().max(40), z.null()]).optional());
export const invoiceSchema = z.object({
  vendor_name: z.string().trim().max(255).default(""), invoice_number: z.string().trim().max(120).default(""),
  invoice_date: nullableText, due_date: nullableText, currency: z.string().trim().max(3).default(""),
  subtotal: money, tax_rate: money, tax_amount: money, total_amount: money, amount: money,
  supplier_tax_id: nullableText, buyer_name: nullableText, buyer_tax_id: nullableText,
  purchase_order_number: nullableText, payment_terms: nullableText,
  status: z.enum(["draft", "pending", "ready", "rejected"]).default("draft"),
});
export const mappingSchema = z.record(z.string().max(80), z.string().max(255)).refine((mapping) => ["vendor_name", "invoice_number", "invoice_date", "currency", "subtotal", "total_amount"].every((key) => Boolean(mapping[key])), "All required fields must be mapped.");
export const importPayloadSchema = z.object({ submissionId: z.uuid(), originalFilename: z.string().trim().min(1).max(255), fileType: z.enum(["csv", "xlsx"]), mapping: mappingSchema, rows: z.array(z.record(z.string(), z.string().max(10000))).min(1).max(5000) });
export const invoiceUpdateSchema = invoiceSchema.extend({ id: z.uuid() });
