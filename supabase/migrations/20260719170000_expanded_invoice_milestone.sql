create type public.invoice_import_status as enum ('pending', 'processing', 'completed', 'partially_failed', 'failed');

create table public.invoice_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  submission_id uuid not null,
  original_filename text not null check (btrim(original_filename) <> ''),
  file_type text not null check (file_type in ('csv', 'xlsx')),
  status public.invoice_import_status not null default 'pending',
  total_rows integer not null default 0 check (total_rows >= 0),
  successful_rows integer not null default 0 check (successful_rows >= 0),
  warning_rows integer not null default 0 check (warning_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  mapping_json jsonb not null default '{}'::jsonb,
  average_readiness_score numeric(5,2) check (average_readiness_score between 0 and 100),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, submission_id),
  check (successful_rows + failed_rows <= total_rows)
);

create table public.invoice_import_rejected_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.invoice_import_batches(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  row_number integer not null check (row_number >= 2),
  validation_issues jsonb not null default '[]'::jsonb,
  original_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(import_batch_id, row_number)
);

alter table public.invoices
  add column invoice_date date,
  add column supplier_tax_id text,
  add column buyer_name text,
  add column buyer_tax_id text,
  add column subtotal numeric(14,2),
  add column tax_rate numeric(9,6),
  add column tax_amount numeric(14,2),
  add column total_amount numeric(14,2),
  add column purchase_order_number text,
  add column payment_terms text,
  add column import_batch_id uuid references public.invoice_import_batches(id) on delete set null,
  add column readiness_score numeric(5,2) not null default 0 check (readiness_score between 0 and 100),
  add column category_scores jsonb not null default '{}'::jsonb,
  add column validation_issues jsonb not null default '[]'::jsonb,
  add column passed_rule_count integer not null default 0 check (passed_rule_count >= 0),
  add column warning_count integer not null default 0 check (warning_count >= 0),
  add column critical_error_count integer not null default 0 check (critical_error_count >= 0);

alter table public.invoices drop constraint invoices_user_invoice_number_key;
create unique index invoices_user_supplier_number_key on public.invoices
  (user_id, lower(btrim(vendor_name)), lower(btrim(invoice_number::text)))
  where invoice_number is not null;

update public.invoices set total_amount = amount where total_amount is null;

alter table public.invoices
  add constraint invoices_subtotal_non_negative check (subtotal is null or subtotal >= 0),
  add constraint invoices_tax_amount_non_negative check (tax_amount is null or tax_amount >= 0),
  add constraint invoices_total_amount_positive check (total_amount is null or total_amount > 0),
  add constraint invoices_tax_rate_range check (tax_rate is null or tax_rate between 0 and 100);

create index invoice_batches_user_created_idx on public.invoice_import_batches(user_id, created_at desc);
create index invoices_user_batch_idx on public.invoices(user_id, import_batch_id);
create index invoices_user_score_idx on public.invoices(user_id, readiness_score desc);
create index invoices_user_date_idx on public.invoices(user_id, invoice_date desc);
create index rejected_rows_user_batch_idx on public.invoice_import_rejected_rows(user_id, import_batch_id);

alter table public.invoice_import_batches enable row level security;
alter table public.invoice_import_rejected_rows enable row level security;
grant select, insert, update, delete on public.invoice_import_batches to authenticated;
grant select, insert, update, delete on public.invoice_import_rejected_rows to authenticated;

create policy "Owners manage import batches" on public.invoice_import_batches for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners manage rejected rows" on public.invoice_import_rejected_rows for all
  using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.invoice_import_batches b where b.id = import_batch_id and b.user_id = (select auth.uid())
    )
  );

create or replace function public.enforce_invoice_batch_owner() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.import_batch_id is not null and not exists (
    select 1 from public.invoice_import_batches b where b.id = new.import_batch_id and b.user_id = new.user_id
  ) then raise exception 'invoice batch owner must match invoice owner'; end if;
  return new;
end $$;
create trigger invoices_batch_owner before insert or update of import_batch_id, user_id on public.invoices
  for each row execute function public.enforce_invoice_batch_owner();
