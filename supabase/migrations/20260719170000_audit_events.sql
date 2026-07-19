-- Audit history: an append-only log of user actions (imports, exports, etc.).
-- Each event is owned by the user who performed it; no cross-user visibility.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_user_id_created_at_idx
  on public.audit_events (user_id, created_at desc);

alter table public.audit_events enable row level security;

-- Audit rows are append-only: owners may read and insert their own events,
-- but not update or delete them.
grant select, insert on public.audit_events to authenticated;

create policy "Users can view their own audit events"
  on public.audit_events
  for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own audit events"
  on public.audit_events
  for insert
  with check ((select auth.uid()) = user_id);
