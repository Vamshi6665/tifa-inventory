# Security review

Scope: the v1 pages in the repository, the 2.0 client, the `/api/assistant` function, the Supabase schema in `supabase/migrations/`, deployment headers, and dependencies. Risk ratings consider likelihood and impact for a small business with a handful of staff accounts.

## Findings and fixes

| # | Area | Finding | Risk | Status |
|---|---|---|---|---|
| S1 | Authorization | `specs/inventory-schema.sql` gives every signed-in account read, insert and update on all items and counts (`using (true)`). Category scoping was added later by a patch that isn't in the repo, so the live policies can't be confirmed from code | **Critical** if still in place | Fixed: the migration replaces every policy on these tables with role- and category-aware ones; 31 tests against a copy of the v1 schema |
| S2 | XSS | v1 builds pages with `innerHTML` and doesn't escape text. A person's `full_name` is shown to admins on the Manage access tab (line 2090), so a sign-up with a crafted name could run script in an admin's session and read their token | **High** (verify whether open sign-ups are enabled) | Fixed: React escapes all text; `dangerouslySetInnerHTML` is banned by lint; strict CSP `script-src 'self'` |
| S3 | Supply chain | v1 loads `@supabase/supabase-js@2` (floating version), SheetJS, Chart.js and an icon font from CDNs with no integrity hashes | High | Fixed: dependencies bundled from npm with a lockfile; `npm audit`: 0 vulnerabilities; CSP blocks third-party scripts |
| S4 | Data loss | `migrate.html` is deployed with a "Clear All Data" button that deletes every item and count the signed-in account is allowed to delete | High | Fixed: removed from the 2.0 branch |
| S5 | Authorization | Staff could change par, status or values through the REST API, not just the screen | High | Fixed: item writes are admin-only; staff change stock only through `record_count`, `verify_items` and `receive_purchase_order`, which check category access |
| S6 | Integrity | Deleting an item cascades to its count history; history rows could be edited | High | Fixed: no update or delete policies on `inventory_counts`; delete is admin-only behind a confirmation that suggests retiring instead |
| S7 | Accountability | No audit trail | Medium | Fixed: security-definer trigger writes `audit_log`, which has no write policies, so not even admins can edit it (tested) |
| S8 | Privilege | An admin could demote themselves or remove the last admin and lock the shop out; approvals were three separate browser requests | Medium | Fixed: `guard_profile_change` trigger and the transactional `set_member_access` function; tested |
| S9 | Onboarding | New sign-ups must not get access by default | — | Kept from v1: new accounts are pending until an admin approves them; pending accounts see nothing (tested) |
| S10 | Input validation | Counts, par levels and notes unbounded | Medium | Fixed: zod in the browser, CHECK constraints in Postgres, validation inside RPCs |
| S11 | CSV/formula injection | Item names starting with `=`, `+`, `-`, `@` would execute in Excel | Medium | Fixed: exports prefix them with `'`; tested |
| S12 | AI endpoint | Prompt injection through item names; cost abuse; data leakage across roles | High | Fixed: token verified with Supabase Auth; data read with the caller's token so RLS applies; never a service key; item text stripped of `<>` and fenced as data; 500-character limit; 20 requests per 10 minutes per user; `no-store`; 10 tests |
| S13 | Headers | No CSP, framing protection or HSTS on the static site | Medium | Fixed in `vercel.json`: CSP, HSTS (preload), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP |
| S14 | Errors | Raw database messages shown to users (v1 prints `error.message` into the page) | Low | Fixed: errors mapped to plain-language messages; tested that constraint and JWT text doesn't leak |
| S15 | Session | Data from one account cached for the next person on a shared tablet | Medium | Fixed: sign-out clears the query cache and the cached profile |

## Category checklist

- **Authentication:** Supabase Auth (email/password, Google OAuth with PKCE). Tokens auto-refresh.
- **Authorization:** RLS on every table; security-definer functions pin `search_path`; RPC `EXECUTE` revoked from `anon`.
- **CSRF:** The API uses bearer tokens in the `Authorization` header, not cookies, so cross-site requests can't carry credentials. `/api/assistant` requires the header.
- **SQL injection:** PostgREST parameterises queries; RPCs take typed parameters; the only dynamic SQL is in the migration, using `format('%I')`.
- **Secrets:** The anon key is public by design. The service-role key is not used anywhere. `ANTHROPIC_API_KEY` exists only server-side.

## Residual risks and recommendations

| Risk | Rating | Recommendation |
|---|---|---|
| Session token in localStorage (Supabase default) would be exposed by any XSS | Medium | Keep CSP strict; consider `@supabase/ssr` with httpOnly cookies if a server layer is added |
| `style-src 'unsafe-inline'` needed by runtime styles (toasts, positioning) | Low | Acceptable; styles can't execute script |
| No MFA for admins | Medium | Turn on Supabase MFA (TOTP) for admin accounts |
| Rate limit is per server instance unless Upstash is configured | Low | Set `UPSTASH_REDIS_REST_URL/TOKEN` (already used by the customer site) |
| Cached profile can briefly show admin controls to a just-demoted user | Low | Server rejects the action; cache is revalidated on load |
| Audit log stores actor emails (personal data) | Low | Readable by admins only; add a retention policy if staff turnover grows |
| Live policies, `profiles` DDL and the sign-up trigger aren't in the repo | — | The migration was written from how v1's code uses them and tested on a reconstruction; run it on a staging copy first (MIGRATION.md) |
