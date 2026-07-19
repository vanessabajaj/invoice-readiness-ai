begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'first@example.test', '{"full_name":"First"}'),
  ('22222222-2222-2222-2222-222222222222', 'second@example.test', '{}');

insert into public.invoices (user_id, vendor_name, invoice_number, amount)
values ('22222222-2222-2222-2222-222222222222', 'Second vendor', 'SHARED-1', 20);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);

do $$
declare
  visible_profiles integer;
begin
  select count(*) into visible_profiles from public.profiles;
  if visible_profiles <> 1 then
    raise exception 'expected one owner profile, got %', visible_profiles;
  end if;
end;
$$;

insert into public.invoices (vendor_name, invoice_number, amount)
values ('First vendor', 'FIRST-1', 10);

insert into public.invoice_import_batches (submission_id, original_filename, file_type, total_rows)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'first.csv', 'csv', 1);

do $$
declare
  visible_invoices integer;
begin
  select count(*) into visible_invoices from public.invoices;
  if visible_invoices <> 1 then
    raise exception 'expected one owner invoice, got %', visible_invoices;
  end if;

  if (select count(*) from public.invoice_import_batches) <> 1 then
    raise exception 'expected one owner import batch';
  end if;

  begin
    insert into public.invoices (user_id, vendor_name, invoice_number, amount)
    values ('22222222-2222-2222-2222-222222222222', 'Attack', 'ATTACK-1', 1);
    raise exception 'cross-user insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.invoices
      set user_id = '22222222-2222-2222-2222-222222222222'
      where invoice_number = 'FIRST-1';
    raise exception 'ownership transfer unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.invoice_import_batches (user_id, submission_id, original_filename, file_type)
    values ('22222222-2222-2222-2222-222222222222', gen_random_uuid(), 'attack.csv', 'csv');
    raise exception 'cross-user batch insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
begin
  insert into public.invoices (vendor_name, invoice_number, amount)
  values ('First vendor', ' first-1 ', 10);
  raise exception 'case-insensitive duplicate unexpectedly succeeded';
exception when unique_violation then
  null;
end;
$$;

do $$
declare
  affected integer;
begin
  update public.invoices set amount = 99 where invoice_number = 'SHARED-1';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'cross-user update affected % rows', affected;
  end if;

  delete from public.invoices where invoice_number = 'SHARED-1';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'cross-user delete affected % rows', affected;
  end if;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$
begin
  begin
    perform count(*) from public.invoices;
    raise exception 'anonymous select unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.invoices (vendor_name, invoice_number, amount)
    values ('Anonymous', 'ANON-1', 1);
    raise exception 'anonymous insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
