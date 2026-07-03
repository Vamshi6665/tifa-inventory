-- Tifa Inventory Management System — Database Schema
-- Run this in Supabase SQL Editor (Project → SQL Editor → New Query)

-- Enable UUID extension (Supabase usually has this on by default, safe to run anyway)
create extension if not exists "pgcrypto";

-- =========================================
-- Table: inventory_items
-- =========================================
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

-- Speeds up dashboard queries grouped by category
create index idx_inventory_items_category on inventory_items(category);
create index idx_inventory_items_status on inventory_items(status);

-- =========================================
-- Table: inventory_counts (history)
-- =========================================
create table inventory_counts (
    id serial primary key,
    item_id integer not null references inventory_items(id) on delete cascade,
    recorded_value text not null,
    recorded_at timestamptz not null default now(),
    recorded_by text,
    source text not null default 'manual' check (source in ('migrated', 'manual'))
);

create index idx_inventory_counts_item_id on inventory_counts(item_id);
create index idx_inventory_counts_recorded_at on inventory_counts(recorded_at);

-- =========================================
-- Auto-update updated_at on inventory_items
-- =========================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger set_updated_at
    before update on inventory_items
    for each row
    execute function update_updated_at_column();

-- =========================================
-- Row Level Security — only the authenticated owner can read/write
-- =========================================
alter table inventory_items enable row level security;
alter table inventory_counts enable row level security;

create policy "Authenticated users can read items"
    on inventory_items for select
    to authenticated
    using (true);

create policy "Authenticated users can insert items"
    on inventory_items for insert
    to authenticated
    with check (true);

create policy "Authenticated users can update items"
    on inventory_items for update
    to authenticated
    using (true);

create policy "Authenticated users can read counts"
    on inventory_counts for select
    to authenticated
    using (true);

create policy "Authenticated users can insert counts"
    on inventory_counts for insert
    to authenticated
    with check (true);
