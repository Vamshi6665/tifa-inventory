# Production readiness checklist

Status: ✅ done and verified · 🟡 done, needs a step in your environment · ⬜ not done

## Code and tests
- ✅ TypeScript strict, no type errors; ESLint (incl. accessibility rules) clean
- ✅ 222 Vitest tests and 30 Playwright tests passing
- ✅ Migration and permission rules tested against a reconstruction of the v1 database in real Postgres (PGlite)
- ✅ Quantity rules tested against the shop's 1,721 real count values
- ✅ CI workflow: typecheck, lint, contrast, tests with coverage, bundle budget, E2E
- 🟡 CI runs on GitHub for the pull request (workflow file is in place)
- ⬜ Firefox and WebKit E2E runs

## Data and migration
- ✅ Migration reconciled with the v1 code (tables, columns, roles, approvals, schedules)
- 🟡 Check the three things the repo can't show: live policies, `profiles` columns, sign-up trigger (MIGRATION.md §1)
- 🟡 Run on a staging project; verify roles and a test approval on the Team page
- 🟡 Backup before production migration
- ✅ Migration is idempotent, additive, transactional; rollback plan written

## Security
- ✅ RLS by role and category; RPC permission checks; append-only history and audit log
- ✅ Security headers and CSP in `vercel.json`
- ✅ No service-role key in the app or the function; `npm audit` clean
- ✅ Supabase URL in the CSP matches the project v1 uses
- 🟡 Add production and preview URLs to Supabase Auth redirect URLs
- ⬜ Enable MFA for admin accounts in Supabase
- 🟡 Configure Upstash for shared rate limits on the assistant

## Accessibility and performance
- ✅ axe: 0 violations on every page, both themes; Lighthouse accessibility 100
- ✅ Desktop Lighthouse performance 100; no sideways scrolling from 320px to 2560px
- 🟡 Mobile Lighthouse 86–93 (target 95; see PERFORMANCE.md)
- ⬜ Manual screen-reader pass (VoiceOver, NVDA)
- ⬜ Run the k6 load test against staging

## Operations
- 🟡 Switch the Vercel framework preset to Vite; optional assistant variables (MIGRATION.md, Settings)
- ✅ Production database settings committed (public values, same as v1); previews use sample data
- ⬜ Error monitoring (e.g. Sentry) — the route error screen is in place, but errors aren't reported anywhere yet
- ⬜ Uptime check on the production URL
- ⬜ Vercel Speed Insights for field performance data
- ✅ Old URLs redirect (`/login.html`, `/dashboard.html`)

## People
- ⬜ Walk the owner through the new count and reorder flows on her phone
- ⬜ Decide who is admin, staff and viewer before cutover
