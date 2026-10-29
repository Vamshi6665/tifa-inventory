# Rolling out 2.0

## Two stages

**Stage 1: the new app on the existing database (no database changes).** 2.0 can go live before the migration. At startup it checks whether the 2.0 tables exist. Until they do, it reads and writes the v1 tables the same way `dashboard.html` did:

- Counts update `inventory_items` and add a row to `inventory_counts`.
- Approvals change `profiles` and `category_access` directly.
- The existing v1 policies decide who can do what.

Purchase orders, suppliers, the activity log and the Viewer role stay hidden, with a note explaining that they turn on after the update. Everything else works: overview, inventory, counting, reorder suggestions, schedules and vendor links, analytics, exports and team approvals.

**Stage 2: the database update.** Run the migration below whenever you're ready. The app notices on its next load and switches on the remaining features. No redeploy is needed.

Pull-request previews on Vercel use sample data (see "Preview deployments").

## What the migration does

`supabase/migrations/20261029000001_redesign.sql` was written against the v1 tables as `dashboard.html` and `login.html` use them, and tested on a reconstruction of that schema (`supabase/tests/fixtures/baseline.sql`, 31 tests).

- **Keeps:** every item, count, schedule, profile and category grant. Admins stay admins, employees become "Staff" in the app (still `employee` in the database), pending sign-ups stay pending.
- **Adds:** `suppliers`, `purchase_orders`, `purchase_order_lines`, `audit_log`; `inventory_items.supplier_id`; `inventory_counts.note`; `received` as a count source; `viewer` as a role.
- **Adds functions:** `record_count`, `verify_items`, `create_purchase_order`, `mark_purchase_order_sent`, `receive_purchase_order`, `set_member_access`, `reject_member`, plus `app_role`, `can_read_category`, `can_count_category`. Your existing `is_admin()` is kept as it is.
- **Replaces** the row-level security policies on the inventory, profile and schedule tables. After this, staff change stock only through the functions above.

It never drops or renames a table, column or row, and it is safe to run more than once.

## 1. Check three things the repo can't show

The code doesn't contain the live policies or the `profiles` table definition. Run this in the SQL editor and compare:

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name in ('profiles', 'category_access') order by table_name, ordinal_position;

select tgname, pg_get_triggerdef(t.oid) from pg_trigger t where tgrelid = 'auth.users'::regclass and not tgisinternal;

select pg_get_functiondef('public.is_admin'::regproc);
```

- `profiles` should have `id`, `email`, `full_name`, `role`, `requested_at`, `approved_at`, `approved_by`; `category_access` should have `user_id`, `category`, `granted_by`. (These are the columns v1 reads and writes.)
- A trigger on `auth.users` should create the pending profile for new sign-ups. If profiles are created some other way, the migration still allows a signed-in person to insert their own profile, but only as `pending`.
- `is_admin()` should check `profiles.role = 'admin'` for `auth.uid()`.

If anything differs, update `baseline.sql` to match and run `npm run test:db` before going further.

## 2. Staging

1. Create a Supabase branch, or a staging project restored from a recent backup.
2. Run the migration in its SQL editor.
3. In Vercel, add `VITE_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the **Preview** environment, pointing at staging, and redeploy the preview.
4. Sign in as an admin and as an employee: count something, approve a test sign-up, create and receive an order, export to Excel.

## 3. Running it on production

1. Back up the database.
2. Run the migration in the SQL editor.
3. Reload the app. Purchase orders, suppliers and Activity appear in the menu.
4. Smoke test: record one count and check it in Activity.

`/login.html` (the address registered for Google sign-in) opens the new sign-in page, and `/dashboard.html` redirects to the overview.

## Settings

| Setting | Where | Notes |
|---|---|---|
| Build: Vite, `npm run build`, output `dist` | `vercel.json` (committed) | Overrides the project's old static-site settings; nothing to change in Vercel |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.production` (committed) | Public by design, the same values v1 had in its HTML. Vercel variables override them |
| `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Vercel, Production (and Preview if wanted) | Server only, for `/api/assistant`. Without them the assistant answers from local rules |
| `ASSISTANT_MODEL` | Vercel, optional | Defaults to `claude-haiku-5-5` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Vercel, optional | Shared rate limit for the assistant |
| Redirect URLs | Supabase → Authentication → URL Configuration | Nothing to change: Google sign-in returns to `/login.html`, the address v1 already registered |

## Preview deployments

Vercel builds every push to the pull request. Previews use the in-browser sample data unless `VITE_DATA_SOURCE` is set for the Preview environment, so a preview can't write to the shop's database before the migration is in. Production builds never fall back to sample data: without database settings they show an error instead.

## Rollback

- **App:** redeploy the previous Vercel deployment (one click), or revert the merge. The old HTML pages still work against the migrated schema for admins, because nothing was renamed or dropped. The one exception is v1's "Reject" button, which deletes the profile directly; use the database function `reject_member` or turn the request down in 2.0.
- **Employees on v1 after the migration:** v1 updates items directly, which the new policies only allow for admins. If you must run v1 for a while, temporarily add back an update policy for employees on `inventory_items` and an insert policy on `inventory_counts`.
- **Before the migration** there is nothing to roll back in the database: stage 1 makes no schema changes.
