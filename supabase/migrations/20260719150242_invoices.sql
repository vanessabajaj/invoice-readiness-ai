-- Invoices table: each invoice is owned by the user who created it.

create type public.invoice_status as enum ('draft', 'pending', 'ready', 'rejected');

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vendor_name text not null,
  invoice_number text,
  amount numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  status public.invoice_status not null default 'draft',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_user_id_idx on public.invoices (user_id);

alter table public.invoices enable row level security;

-- Grant table access to the API role; RLS still restricts rows to the owner.
grant select, insert, update, delete on public.invoices to authenticated;

-- Owners have full access to their own invoices; no cross-user visibility.
create policy "Users can view their own invoices"
  on public.invoices
  for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own invoices"
  on public.invoices
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own invoices"
  on public.invoices
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own invoices"
  on public.invoices
  for delete
  using ((select auth.uid()) = user_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row
  execute function public.set_updated_at();
