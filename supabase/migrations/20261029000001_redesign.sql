-- =============================================================================
-- Tifa Inventory 2.0: suppliers, purchase orders, viewer role, audit log,
-- stock RPCs and role/category-aware RLS.
--
-- Written against the live v1 schema as the v1 pages use it:
--   inventory_items      (current_value text, par_level, status, location, reorder_url, last_verified_at, ...)
--   inventory_counts     (recorded_value, recorded_at, recorded_by, source 'migrated' | 'manual')
--   subcategory_schedules(category, subcategory, reorder_frequency, reorder_day, vendor_url)
--   profiles             (id, email, full_name, role 'admin' | 'employee' | 'pending', requested_at, approved_at, approved_by)
--   category_access      (user_id, category, granted_by)
--   is_admin()
--
-- Additive: no table, column or row is dropped or renamed, and existing roles
-- and category grants carry over unchanged. The one behaviour change is that
-- the old policies are replaced: staff change stock only through the RPCs
-- below, so v1's inline edits by employees stop working once this runs.
-- Run it right before deploying 2.0. Idempotent: safe to run more than once.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Roles: v1 has admin / employee / pending. 2.0 adds viewer (read-only).
-- Works whether profiles.role is text with a CHECK or an enum.
-- ---------------------------------------------------------------------------
do $$
declare
  v_type oid;
  c record;
begin
  select a.atttypid into v_type from pg_attribute a where a.attrelid = 'public.profiles'::regclass and a.attname = 'role';
  if exists (select 1 from pg_type t where t.oid = v_type and t.typtype = 'e') then
    execute format('alter type %s add value if not exists %L', v_type::regtype, 'viewer');
  else
    for c in select con.conname from pg_constraint con
             where con.conrelid = 'public.profiles'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) ~* '\mrole\M'
    loop
      execute format('alter table public.profiles drop constraint %I', c.conname);
    end loop;
    alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'employee', 'viewer', 'pending')) not valid;
  end if;
end $$;

-- The 2.0 role of the signed-in person: admin, staff (v1 "employee"), viewer, or null (pending / unknown).
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select case p.role::text when 'admin' then 'admin' when 'employee' then 'staff' when 'viewer' then 'viewer' end
  from public.profiles p where p.id = auth.uid()
$$;

-- Keep the project's own is_admin(); define one only if it's missing.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_admin' and p.pronargs = 0) then
    execute $f$
      create function public.is_admin() returns boolean
      language sql stable security definer set search_path = public as $b$
        select coalesce(public.app_role() = 'admin', false)
      $b$;
    $f$;
  end if;
end $$;

-- Admins see every category; staff and viewers see the categories granted in category_access.
create or replace function public.can_read_category(cat text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.app_role()
    when 'admin' then true
    when 'staff' then exists (select 1 from public.category_access a where a.user_id = auth.uid() and a.category = cat)
    when 'viewer' then exists (select 1 from public.category_access a where a.user_id = auth.uid() and a.category = cat)
    else false
  end
$$;

create or replace function public.can_count_category(cat text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.app_role()
    when 'admin' then true
    when 'staff' then exists (select 1 from public.category_access a where a.user_id = auth.uid() and a.category = cat)
    else false
  end
$$;

-- Nobody can remove the last admin, demote themselves, or delete an admin's profile.
create or replace function public.guard_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.role::text = 'admin' then
      raise exception 'Admins can’t be removed. Change their role first.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.role::text = 'admin' and new.role::text <> 'admin' then
    if old.id = auth.uid() then
      raise exception 'You can’t remove your own admin access.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.profiles where role::text = 'admin' and id <> old.id) then
      raise exception 'There must be at least one admin.' using errcode = 'P0001';
    end if;
  end if;
  if new.id <> old.id then
    raise exception 'A profile’s id can’t be changed.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_change on public.profiles;
create trigger guard_profile_change before update or delete on public.profiles for each row execute function public.guard_profile_change();

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id             integer generated by default as identity primary key,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  contact_name   text check (char_length(contact_name) <= 120),
  email          text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone          text check (char_length(phone) <= 40),
  website        text check (website is null or website ~* '^https?://'),
  lead_time_days integer check (lead_time_days between 0 and 120),
  notes          text check (char_length(notes) <= 1000),
  created_at     timestamptz not null default now()
);
create unique index if not exists suppliers_name_key on public.suppliers (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- Inventory items: one new column (supplier_id) and guard rails on new writes.
-- The "if not exists" columns are already there in the live project.
-- ---------------------------------------------------------------------------
alter table public.inventory_items add column if not exists supplier_id integer references public.suppliers (id) on delete set null;
alter table public.inventory_items add column if not exists notes text;
alter table public.inventory_items add column if not exists last_verified_at timestamptz;
alter table public.inventory_items add column if not exists location text;
alter table public.inventory_items add column if not exists reorder_url text;
alter table public.inventory_items add column if not exists unit_label text;
create index if not exists inventory_items_supplier_idx on public.inventory_items (supplier_id);

do $$
begin
  -- NOT VALID: existing rows aren't re-checked; new writes are.
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_value_len') then
    alter table public.inventory_items add constraint inventory_items_value_len check (current_value is null or char_length(current_value) <= 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_par_range') then
    alter table public.inventory_items add constraint inventory_items_par_range check (par_level is null or par_level between 0 and 100000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_notes_len') then
    alter table public.inventory_items add constraint inventory_items_notes_len check (notes is null or char_length(notes) <= 1000) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Count history: a note column, and 'received' as a source for deliveries.
-- ---------------------------------------------------------------------------
alter table public.inventory_counts add column if not exists note text;

do $$
declare
  v_type oid;
  c record;
begin
  select a.atttypid into v_type from pg_attribute a where a.attrelid = 'public.inventory_counts'::regclass and a.attname = 'source';
  if exists (select 1 from pg_type t where t.oid = v_type and t.typtype = 'e') then
    execute format('alter type %s add value if not exists %L', v_type::regtype, 'received');
  else
    for c in select con.conname from pg_constraint con
             where con.conrelid = 'public.inventory_counts'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) ~* '\msource\M'
    loop
      execute format('alter table public.inventory_counts drop constraint %I', c.conname);
    end loop;
    alter table public.inventory_counts add constraint inventory_counts_source_check check (source in ('migrated', 'manual', 'received')) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Order schedules (exists in the live project; created here only for a fresh database)
-- ---------------------------------------------------------------------------
create table if not exists public.subcategory_schedules (
  category          text not null,
  subcategory       text not null,
  reorder_frequency text not null check (reorder_frequency in ('weekly', 'biweekly', 'monthly')),
  reorder_day       text,
  vendor_url        text,
  unique (category, subcategory)
);
alter table public.subcategory_schedules add column if not exists reorder_day text;
alter table public.subcategory_schedules add column if not exists vendor_url text;

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
create sequence if not exists public.purchase_order_number_seq start 1041;

create table if not exists public.purchase_orders (
  id          integer generated by default as identity primary key,
  number      text not null unique default ('PO-' || nextval('public.purchase_order_number_seq')),
  supplier_id integer not null references public.suppliers (id) on delete restrict,
  status      text not null default 'draft' check (status in ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
  notes       text check (char_length(notes) <= 1000),
  expected_on date,
  sent_at     timestamptz,
  received_at timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status);

create table if not exists public.purchase_order_lines (
  id                integer generated by default as identity primary key,
  po_id             integer not null references public.purchase_orders (id) on delete cascade,
  item_id           integer not null references public.inventory_items (id) on delete restrict,
  quantity          numeric not null check (quantity > 0 and quantity <= 100000),
  unit_label        text check (char_length(unit_label) <= 40),
  received_quantity numeric not null default 0 check (received_quantity >= 0)
);
create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines (po_id);
create index if not exists purchase_order_lines_item_idx on public.purchase_order_lines (item_id);

-- ---------------------------------------------------------------------------
-- Audit log: append-only, written only by triggers
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text not null,
  action      text not null check (action in ('insert', 'update', 'delete')),
  actor_id    uuid,
  actor_email text,
  changed     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  new_j jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else '{}'::jsonb end;
  row_j jsonb := case when tg_op = 'DELETE' then old_j else new_j end;
  diff  jsonb := '{}'::jsonb;
  k     text;
  rec   text;
begin
  for k in select jsonb_object_keys(old_j || new_j) loop
    if k = 'updated_at' then continue; end if;
    if (old_j -> k) is distinct from (new_j -> k) then
      diff := diff || jsonb_build_object(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
    end if;
  end loop;
  if tg_op = 'UPDATE' and diff = '{}'::jsonb then return new; end if;
  rec := case tg_table_name
    when 'inventory_counts' then row_j ->> 'item_id'
    when 'category_access' then row_j ->> 'user_id'
    when 'subcategory_schedules' then concat_ws('/', row_j ->> 'category', row_j ->> 'subcategory')
    else row_j ->> 'id'
  end;
  if tg_table_name = 'inventory_counts' then
    diff := jsonb_build_object('value', jsonb_build_object('from', null, 'to', new_j -> 'recorded_value'));
  end if;
  insert into public.audit_log (table_name, record_id, action, actor_id, actor_email, changed)
  values (tg_table_name, coalesce(rec, ''), lower(tg_op), auth.uid(), auth.jwt() ->> 'email', diff);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['inventory_items', 'inventory_counts', 'suppliers', 'purchase_orders', 'profiles', 'category_access', 'subcategory_schedules'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    if t = 'inventory_counts' then
      execute format('create trigger audit_%1$s after insert on public.%1$I for each row execute function public.audit_row()', t);
    else
      execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs: the only way non-admins change stock. Each checks permissions itself.
-- ---------------------------------------------------------------------------
create or replace function public.record_count(p_item_id integer, p_value text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cat text;
  v_val text := btrim(p_value);
  v_who text;
begin
  select category into v_cat from public.inventory_items where id = p_item_id;
  if v_cat is null then raise exception 'That item no longer exists.' using errcode = 'P0001'; end if;
  if not public.can_count_category(v_cat) then raise exception 'permission denied' using errcode = '42501'; end if;
  if v_val is null or char_length(v_val) = 0 or char_length(v_val) > 120 then
    raise exception 'Counts must be 1–120 characters.' using errcode = '23514';
  end if;
  select coalesce(nullif(btrim(full_name), ''), email) into v_who from public.profiles where id = auth.uid();
  update public.inventory_items set current_value = v_val, last_verified_at = now() where id = p_item_id;
  insert into public.inventory_counts (item_id, recorded_value, recorded_at, recorded_by, source, note)
  values (p_item_id, v_val, now(), v_who, 'manual', nullif(btrim(left(p_note, 500)), ''));
end $$;

-- "Count is still right": confirms without changing the value (same as v1's unchanged save).
create or replace function public.verify_items(p_ids integer[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.inventory_items where id = any (p_ids) and not public.can_count_category(category)) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update public.inventory_items set last_verified_at = now() where id = any (p_ids);
end $$;

create or replace function public.create_purchase_order(p_supplier_id integer, p_notes text, p_expected_on date, p_lines jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare v_id integer;
begin
  if not public.is_admin() then raise exception 'permission denied' using errcode = '42501'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Add at least one item to the order.' using errcode = 'P0001'; end if;
  insert into public.purchase_orders (supplier_id, notes, expected_on) values (p_supplier_id, p_notes, p_expected_on) returning id into v_id;
  insert into public.purchase_order_lines (po_id, item_id, quantity, unit_label)
  select v_id, (l ->> 'item_id')::integer, (l ->> 'quantity')::numeric, nullif(l ->> 'unit_label', '')
  from jsonb_array_elements(p_lines) l;
  return v_id;
end $$;

create or replace function public.mark_purchase_order_sent(p_id integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'permission denied' using errcode = '42501'; end if;
  update public.purchase_orders set status = 'sent', sent_at = now() where id = p_id and status = 'draft';
  if not found then raise exception 'Only drafts can be marked as sent.' using errcode = 'P0001'; end if;
end $$;

-- Empty and plain-number counts are increased; any other wording is left as
-- written and the delivery is noted for a person to recount.
create or replace function public.receive_purchase_order(p_id integer, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_number text;
  r record;
  v_cur text;
  v_new text;
  v_who text;
begin
  select status, number into v_status, v_number from public.purchase_orders where id = p_id for update;
  if v_status is null then raise exception 'That order no longer exists.' using errcode = 'P0001'; end if;
  if v_status not in ('sent', 'partially_received') then raise exception 'Only sent orders can be received.' using errcode = 'P0001'; end if;
  select coalesce(nullif(btrim(full_name), ''), email) into v_who from public.profiles where id = auth.uid();

  for r in
    select l.id, l.item_id, (x ->> 'quantity')::numeric as qty, i.category
    from jsonb_array_elements(p_lines) x
    join public.purchase_order_lines l on l.id = (x ->> 'line_id')::integer and l.po_id = p_id
    join public.inventory_items i on i.id = l.item_id
    where (x ->> 'quantity')::numeric > 0
  loop
    if not public.can_count_category(r.category) then raise exception 'permission denied' using errcode = '42501'; end if;
    update public.purchase_order_lines set received_quantity = received_quantity + r.qty where id = r.id;
    select btrim(current_value) into v_cur from public.inventory_items where id = r.item_id for update;
    if v_cur is null or v_cur = '' then
      v_new := trim_scale(r.qty)::text;
    elsif v_cur ~ '^\d+(\.\d+)?$' then
      v_new := trim_scale(v_cur::numeric + r.qty)::text;
    else
      v_new := null;
    end if;
    if v_new is not null then
      update public.inventory_items set current_value = v_new where id = r.item_id;
    end if;
    insert into public.inventory_counts (item_id, recorded_value, recorded_at, recorded_by, source, note)
    values (r.item_id, coalesce(v_new, v_cur, ''), now(), v_who, 'received',
            case when v_new is null then format('Received %s on %s; count needs updating', trim_scale(r.qty), v_number)
                 else format('Received %s on %s', trim_scale(r.qty), v_number) end);
  end loop;

  update public.purchase_orders po
  set status = case when not exists (select 1 from public.purchase_order_lines where po_id = p_id and received_quantity < quantity) then 'received' else 'partially_received' end,
      received_at = case when not exists (select 1 from public.purchase_order_lines where po_id = p_id and received_quantity < quantity) then now() else null end
  where po.id = p_id;
end $$;

-- Approve someone, change their role or categories, or send them back to pending,
-- in one transaction (v1 did these as separate requests from the browser).
-- p_role: 'admin' | 'staff' | 'viewer' | 'pending', or null to keep the current role.
-- p_categories: the full list for staff and viewers, or null to leave grants as they are.
create or replace function public.set_member_access(p_user_id uuid, p_role text, p_categories text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old  text;
  v_role public.profiles.role%type;
begin
  if not public.is_admin() then raise exception 'permission denied' using errcode = '42501'; end if;
  select role::text into v_old from public.profiles where id = p_user_id for update;
  if v_old is null then raise exception 'That person no longer exists.' using errcode = 'P0001'; end if;
  if p_role is not null and p_role not in ('admin', 'staff', 'viewer', 'pending') then
    raise exception 'Unknown role.' using errcode = 'P0001';
  end if;
  v_role := case coalesce(p_role, v_old) when 'staff' then 'employee' else coalesce(p_role, v_old) end;

  update public.profiles
  set role = v_role,
      approved_at = case when v_old = 'pending' and v_role::text <> 'pending' then now() else approved_at end,
      approved_by = case when v_old = 'pending' and v_role::text <> 'pending' then auth.uid() else approved_by end
  where id = p_user_id;

  if v_role::text = 'pending' then
    delete from public.category_access where user_id = p_user_id;
  elsif v_role::text <> 'admin' and p_categories is not null then
    delete from public.category_access where user_id = p_user_id and not (category = any (p_categories));
    insert into public.category_access (user_id, category, granted_by)
    select p_user_id, c, auth.uid() from (select distinct unnest(p_categories) as c) wanted
    where not exists (select 1 from public.category_access a where a.user_id = p_user_id and a.category = wanted.c);
  end if;
end $$;

-- Turn down a sign-up request. Only pending profiles can be removed.
create or replace function public.reject_member(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'permission denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role::text = 'pending') then
    raise exception 'Only people waiting for approval can be turned down.' using errcode = 'P0001';
  end if;
  delete from public.category_access where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end $$;

revoke all on function public.record_count(integer, text, text), public.verify_items(integer[]), public.create_purchase_order(integer, text, date, jsonb),
  public.mark_purchase_order_sent(integer), public.receive_purchase_order(integer, jsonb), public.set_member_access(uuid, text, text[]),
  public.reject_member(uuid) from public, anon;
grant execute on function public.record_count(integer, text, text), public.verify_items(integer[]), public.create_purchase_order(integer, text, date, jsonb),
  public.mark_purchase_order_sent(integer), public.receive_purchase_order(integer, jsonb), public.set_member_access(uuid, text, text[]),
  public.reject_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.category_access enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.subcategory_schedules enable row level security;
alter table public.audit_log enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_counts enable row level security;

-- Replace the v1 policies on these tables with the ones below.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('inventory_items', 'inventory_counts', 'profiles', 'category_access', 'suppliers', 'purchase_orders', 'purchase_order_lines', 'subcategory_schedules', 'audit_log')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy items_read on public.inventory_items for select to authenticated using (public.can_read_category(category));
create policy items_admin_write on public.inventory_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy counts_read on public.inventory_counts for select to authenticated
  using (exists (select 1 from public.inventory_items i where i.id = item_id and public.can_read_category(i.category)));
create policy counts_admin_insert on public.inventory_counts for insert to authenticated with check (public.is_admin());
-- No update/delete policies: count history is append-only.

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
-- A first sign-in may create its own profile, but only as pending.
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid() and role::text = 'pending');
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Deleting goes through reject_member().

create policy access_read on public.category_access for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy access_admin_write on public.category_access for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy suppliers_read on public.suppliers for select to authenticated using (public.app_role() is not null);
create policy suppliers_admin_write on public.suppliers for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy po_read on public.purchase_orders for select to authenticated using (public.app_role() is not null);
create policy po_admin_write on public.purchase_orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pol_read on public.purchase_order_lines for select to authenticated using (public.app_role() is not null);
create policy pol_admin_write on public.purchase_order_lines for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy schedules_read on public.subcategory_schedules for select to authenticated using (public.app_role() is not null);
create policy schedules_admin_write on public.subcategory_schedules for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());
-- No insert/update/delete policies: only the security-definer trigger writes here.

-- Live updates for the app
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['inventory_items', 'inventory_counts', 'suppliers', 'purchase_orders', 'profiles', 'subcategory_schedules'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

commit;
