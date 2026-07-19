# Expanded validation milestone

## Decisions and database changes

The existing App Router/Supabase architecture and UI language were retained. One forward-only migration adds the requested invoice fields, persisted validation snapshots, import batches and rejected rows. `numeric` is used for money and rates. Legacy `amount` remains usable and is copied to `total_amount`. Normalized supplier/invoice uniqueness replaces invoice-number-only uniqueness.

## Validation and scoring

Validation is deterministic and server-authoritative. Category weights are 30/25/20/15/10 for required, financial, tax, formatting, and duplicate/anomaly rules. Calendar parsing rejects rollovers such as February 30. Monetary comparison converts values to integer cents and permits a one-cent tolerance. Currency is normalized before persistence. Tax identifiers use a documented generic format and make no legal-certification claim.

## Import and correction security

The browser parses only for a fast preview. The import Server Action authenticates, Zod-validates mapping/rows, detects normalized same-batch and earlier duplicates, computes results, and derives ownership. Invoice correction likewise authenticates, confirms ownership, validates, recalculates and persists. RLS covers invoices, batches and rejected rows; a database trigger prevents cross-owner batch links.

## Test coverage and results

Unit coverage includes required fields, negative/zero values, decimal arithmetic, tax calculations, lowercase/unknown currencies, impossible/date ordering, duplicate contexts, generic tax IDs, parsing limits, malformed CSV, alternate headers, empty files, and batch summaries. SQL tests exercise anonymous denial and two-user profile, invoice and batch isolation. Exact executed results are recorded in the implementation handoff rather than claimed here.

## Remaining limitations

- The multi-table import is not yet wrapped in a single database transaction/RPC; failures after batch creation are surfaced but can leave a failed partial record.
- Existing legacy invoices have migrated values but require revalidation/editing to populate rich scores.
- Tax rules are configurable only at code level and are not jurisdiction-specific.
- OAuth/organization roles, immutable edit audit logs, and full browser E2E fixtures remain future work.
