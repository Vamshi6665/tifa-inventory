-- A stand-in for Supabase's auth schema plus the Tifa v1 database, so the 2.0
-- migration and its RLS policies can be tested in PGlite (real Postgres).
--
-- inventory_items / inventory_counts follow specs/inventory-schema.sql from the
-- v1 repo, plus the columns v1's dashboard.html reads and writes later
-- (location, reorder_url, last_verified_at). profiles, category_access,
-- subcategory_schedules and is_admin() are reconstructed from how
-- login.html and dashboard.html use them; their v1 policies here are a
-- plausible version of "category-scoped access" and get replaced by the migration.

create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;

-- Supabase's default grants: RLS, not table privileges, is the gate.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;

-- ---- specs/inventory-schema.sql (v1) ----
create table inventory_items (
    id serial primary key,
    name text not null,
    category text not null,
    subcategory text,
    unit_type text not null check (unit_type in ('count', 'percentage', 'freeform')),
    unit_label text,
    current_value text,
    par_level numeric,
    par_source_note text,
    supplier text,
    status text not null default 'active'
        check (status in ('active', 'seasonal', 'hold', 'trial', 'discontinued')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table inventory_counts (
    id serial primary key,
    item_id integer not null references inventory_items(id) on delete cascade,
    recorded_value text not null,
    recorded_at timestamptz not null default now(),
    recorded_by text,
    source text not null default 'manual' check (source in ('migrated', 'manual'))
);
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;
create trigger set_updated_at before update on inventory_items for each row execute function update_updated_at_column();

-- ---- added later in v1 (used by dashboard.html) ----
alter table inventory_items add column location text;
alter table inventory_items add column reorder_url text;
alter table inventory_items add column last_verified_at timestamptz;

create table subcategory_schedules (
    id serial primary key,
    category text not null,
    subcategory text not null,
    reorder_frequency text not null check (reorder_frequency in ('weekly', 'biweekly', 'monthly')),
    reorder_day text,
    vendor_url text,
    unique (category, subcategory)
);

create table profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text,
    full_name text,
    role text not null default 'pending' check (role in ('admin', 'employee', 'pending')),
    requested_at timestamptz not null default now(),
    approved_at timestamptz,
    approved_by uuid
);
create table category_access (
    id serial primary key,
    user_id uuid not null references profiles (id) on delete cascade,
    category text not null,
    granted_by uuid,
    granted_at timestamptz not null default now()
);

create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- New sign-ups wait for approval.
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role) values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'pending');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---- v1-style policies (replaced by the migration) ----
alter table inventory_items enable row level security;
alter table inventory_counts enable row level security;
alter table profiles enable row level security;
alter table category_access enable row level security;
alter table subcategory_schedules enable row level security;
create policy "Authenticated users can read items" on inventory_items for select to authenticated using (true);
create policy "Authenticated users can update items" on inventory_items for update to authenticated using (true);
create policy "Authenticated users can insert counts" on inventory_counts for insert to authenticated with check (true);
create policy "Authenticated users can read counts" on inventory_counts for select to authenticated using (true);
create policy "own profile" on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy "admin manages profiles" on profiles for all to authenticated using (is_admin());
create policy "own access" on category_access for select to authenticated using (user_id = auth.uid() or is_admin());
create policy "admin manages access" on category_access for all to authenticated using (is_admin());
create policy "anyone reads schedules" on subcategory_schedules for all to authenticated using (true);
