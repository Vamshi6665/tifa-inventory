# Architecture

## Shape of the system

```
Browser (React SPA, Vercel static)
 ├─ features/*        pages: one folder per business area
 ├─ design-system/    tokens, components, data grid
 ├─ data/             DataSource interface + Supabase and demo implementations, query hooks
 ├─ domain/           pure TypeScript: quantities, forecasting, reorder rules, permissions, search
 ├─ stores/           device preferences and saved views (Zustand, localStorage)
 └─ app/              router, providers, shell (sidebar, top bar, palette, notifications)

Vercel function  api/assistant.ts   verifies the user's token, reads data under RLS, calls Claude
Supabase         v1 tables (inventory_items, inventory_counts, subcategory_schedules, profiles,
                 category_access) + 2.0 tables, RLS, RPCs, audit triggers, Realtime    supabase/migrations/
```

Dependencies point inward: `features → data/design-system → domain`. `domain/` imports nothing from React or Supabase, which is why its rules can be tested in isolation (99% line coverage) and shared by the UI, the demo backend and the assistant.

## Key decisions

**1. A `DataSource` interface between the UI and the backend.** Pages call hooks; hooks call `DataSource`; two implementations exist. The Supabase one is production; the in-memory demo one mirrors the database rules (role and category checks, audit entries, order lifecycle) so the public demo behaves like the real thing and end-to-end tests run without touching live data. Swapping backends is one file.

**2. Permissions live in the database.** Roles come from v1's `profiles` table (admin, employee shown as Staff, viewer, pending) and categories from `category_access`. Row-Level Security policies and security-definer RPCs enforce them. `domain/permissions.ts` mirrors them only to hide controls people can't use. The 22 database tests prove the boundary with real Postgres; the UI can be wrong without opening a hole.

**3. Stock changes go through RPCs.** `record_count`, `verify_items`, `receive_purchase_order` and friends update the item and write history in one transaction, check permissions themselves, and are the only way non-admins change stock. Count history is append-only.

**4. Free-form quantities stay free-form.** Counts like "1new+.75" or "2 trays" are legitimate. `parseQuantity` reads plain numbers, a leading count with unit words, percentages, fractions and same-unit sums; mixed units and lists are flagged for review rather than guessed. Percentage items compare in percent of one container ("1 new + 20%" is 120%). The rules were checked against all 1,721 real values from the shop's import. Forecasts, alerts and the assistant all use this one rule.

**5. Forecasts are transparent.** Usage rate = drops between counts ÷ days, deliveries excluded. Every forecast carries a sentence explaining its math. Black-box models were rejected earlier for good reason and that stands.

**6. Server state in TanStack Query, UI state in Zustand.** Query handles caching, retries, optimistic edits (inline count edits feel instant and roll back on error) and live invalidation from Realtime. Zustand holds only device preferences and saved views.

**7. One data grid.** Every table uses `DataGrid`: sorting (multi-column), facet filters with counts, search with highlighting, column resize/reorder/visibility, row selection with shift-ranges, bulk actions, inline editing with validation, CSV/Excel export, saved views, virtualization past 80 rows, keyboard row navigation, and a card layout on phones.

**8. Performance by default.** Route-level code splitting, the current page preloaded in parallel with auth, charts/grid/palette/assistant/xlsx loaded on demand, font preloaded, a 190KB first-load budget enforced in CI.

## Folder structure

```
src/
  app/            Providers.tsx, router.tsx, nav.ts, shell/
  design-system/  tokens.css, global.css, components/, datagrid/
  domain/         types, quantity, trends, reorder, permissions, insights, search, dates
  data/           source.ts, supabaseSource.ts, demo/, hooks.ts, derived.ts, keys.ts
  features/       dashboard, inventory, count, reorder, orders, suppliers, analytics,
                  reports, activity, team, settings, assistant, auth, charts
  stores/         preferences.ts, views.ts
  lib/            csv (export + formula-injection guard), hotkeys, media queries
api/              assistant.ts (+ tests)
supabase/         migrations/, tests/ (PGlite RLS suite)
e2e/              Playwright suites
scripts/          contrast check, bundle budget/report, k6 load test, screenshots
```

## Data flow for a count

1. Person types `7` in a cell and presses Enter → `EditableCell` validates with the shared zod rule.
2. `useRecordCount` updates the cached item immediately (optimistic) and calls `DataSource.recordCount`.
3. Supabase runs `record_count`: checks `can_count_category`, updates the item, inserts history, and the audit trigger records who did it.
4. Realtime notifies every other open session; their queries refetch. On error the optimistic change rolls back and a toast explains what happened in plain words.
