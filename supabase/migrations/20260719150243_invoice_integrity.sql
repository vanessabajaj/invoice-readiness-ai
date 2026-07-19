-- Enforce the import contract and make retries idempotent per user.

create extension if not exists citext with schema extensions;

alter table public.invoices
  alter column invoice_number type extensions.citext;

alter table public.invoices
  add constraint invoices_vendor_name_not_blank
    check (btrim(vendor_name) <> ''),
  add constraint invoices_invoice_number_not_blank
    check (invoice_number is null or btrim(invoice_number::text) <> ''),
  add constraint invoices_amount_positive
    check (amount > 0),
  add constraint invoices_currency_iso_format
    check (currency ~ '^[A-Z]{3}$'),
  add constraint invoices_user_invoice_number_key
    unique (user_id, invoice_number);

create index invoices_user_created_at_idx
  on public.invoices (user_id, created_at desc);
