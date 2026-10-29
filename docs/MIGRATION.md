# Rolling out 2.0

The live site keeps running from `main` until the pull request is merged. Pull-request previews on Vercel use sample data (see "Preview deployments"), so nothing here touches the shop's data until step 3.

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

## 3. Cutover

Do these together, because v1's inline edits by employees stop working once the new policies are in place:

1. Back up the database.
2. Run the migration on production.
3. Merge the pull request. Vercel builds and deploys 2.0, and old links (`/login.html`, `/dashboard.html`) redirect to the new pages.
4. Smoke test: sign in, open Inventory, record one count, check it in Activity.

## Settings

| Setting | Where | Notes |
|---|---|---|
| Framework preset: **Vite** (build `npm run build`, output `dist`) | Vercel → Settings → Build and Deployment | v1 deployed static files with no build step |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.production` (committed) | Public by design, the same values v1 had in its HTML. Vercel variables override them |
| `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Vercel, Production (and Preview if wanted) | Server only, for `/api/assistant`. Without them the assistant answers from local rules |
| `ASSISTANT_MODEL` | Vercel, optional | Defaults to `claude-haiku-5-5` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Vercel, optional | Shared rate limit for the assistant |
| Redirect URLs | Supabase → Authentication → URL Configuration | Add `https://tifa-inventory.vercel.app/**` so Google sign-in returns to the new pages |

## Preview deployments

Vercel builds every push to the pull request. Previews use the in-browser sample data unless `VITE_DATA_SOURCE` is set for the Preview environment, so a preview can't write to the shop's database before the migration is in. Production builds never fall back to sample data: without database settings they show an error instead.

## Rollback

- **App:** redeploy the previous Vercel deployment (one click), or revert the merge. The old HTML pages still work against the migrated schema for admins, because nothing was renamed or dropped. The one exception is v1's "Reject" button, which deletes the profile directly; use the database function `reject_member` or turn the request down in 2.0.
- **Employees on v1 after the migration:** v1 updates items directly, which the new policies only allow for admins. If you must run v1 for a while, temporarily add back an update policy for employees on `inventory_items` and an insert policy on `inventory_counts`.
