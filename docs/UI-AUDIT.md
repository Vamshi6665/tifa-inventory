# UI audit of the current system (v1)

**Basis.** This audit covers the v1 pages in the repository (`login.html`, `dashboard.html` with its Browse, Reorder schedule, Trends and Manage access tabs, and the one-off `migrate.html`). Every finding was checked against that code. Line numbers refer to `dashboard.html` at commit `e4da6ad`. Severity: Critical, High, Medium, Low. Priority: P1 fix now, P2 next, P3 later.

| # | Screen | Finding | Evidence | Severity | Priority | Resolution in 2.0 |
|---|---|---|---|---|---|---|
| 1 | Global | Icons, Supabase client, SheetJS and Chart.js load from CDNs at runtime; `@supabase/supabase-js@2` floats to whatever version is latest, with no integrity hash | lines 9–12 | High | P1 | Everything bundled from npm with a lockfile; no runtime third-party scripts |
| 2 | Global | Names and messages are inserted with `innerHTML` without escaping (item names, categories, people's names, database error text) | e.g. lines 856, 1099, 2090 | High | P1 | React escapes all text; raw HTML is banned by lint (see SECURITY.md S8) |
| 3 | Dashboard | One 2,705-line file holds markup, styles and logic; every render rebuilds the whole table and re-attaches listeners | `render()` lines 1023–1159 | High | P1 | Feature folders, typed components, a shared data grid with targeted updates |
| 4 | Dashboard | Quantity rule takes the first number anywhere in the text, so "1new+.75" reads as 1 and "Tifa logo-1 boxes" as −1 | `parseValue()` line 825 | High | P1 | Parser checked against all 1,721 real values: same number for 95%, fixes 7 wrong alerts, flags 25 ambiguous entries (quantity.real.test.ts) |
| 5 | Dashboard | No automated tests | repository | High | P1 | 222 Vitest + 30 Playwright tests |
| 6 | Browse | Search matches item names only, and tables can't be sorted, filtered by value, or have columns hidden | line 1092 | Medium | P2 | `DataGrid`: search across item, group, location and supplier; sort, filters, columns, saved views |
| 7 | Browse | Delete is a trash icon on every row, and deleting an item deletes its count history (`on delete cascade`) | line 1130; schema | High | P1 | Delete is admin-only behind a confirm that suggests "Retired" instead; history is append-only |
| 8 | Browse | Every row has a status dropdown, so a mis-tap retires an item; employees can change status too | line 1120 | Medium | P2 | Status is edited by admins only, and changes are logged with who made them |
| 9 | Counting | No count workflow: counting means editing values inside long category tables | — | High | P1 | Phone-first count page: Enter saves and moves on, empty Enter confirms, progress bar |
| 10 | Mobile | Layout stacks below 900px, but item tables keep all 8 columns on phones and scroll sideways | lines 69–76 | Medium | P2 | Card lists on phones, bottom tab bar, bottom-sheet dialogs, no sideways scroll at 320px (tested) |
| 11 | Reorder | Suggested quantity and days-to-threshold are only visible inside the Trends chart pop-up, one item at a time | `buildReorderInsight()` line 2473 | Medium | P2 | Reorder page lists every item to order with quantity, usage and run-out date, and one click makes a purchase order |
| 12 | Trends | Sparklines and the detail chart are canvas only; no text alternative | lines 2400, 2564 | Medium | P2 | Every chart has a "Show as table" view; sparklines have descriptive labels |
| 13 | Global | Keyboard: no skip link, no shortcuts, no focus management when switching tabs; only 4 ARIA attributes in the page | grep | Medium | P2 | Skip link, ⌘K palette, `/` search, focus moves to each page heading, dialogs trap and return focus |
| 14 | Global | Hover effects carry no meaning, but row actions are small icons without text labels | lines 1130, 1067 | Low | P3 | Labelled buttons; icon-only buttons have accessible names |
| 15 | Access | Approving, removing access and changing categories are several separate requests from the browser, so a failure part-way leaves someone half-approved | lines 2136–2145 | Medium | P2 | One database function (`set_member_access`) does it in a single transaction |
| 16 | Global | No dark mode, density or reduced-motion settings | — | Low | P3 | System/light/dark, compact density, reduce motion |
| 17 | Data | Supabase lists cap at 1,000 rows; paging was added to Trends only, while the Browse load reads counts in one request | lines 850 vs 2232 | High | P1 | Paging centralised in the data layer and tested at 2,345 rows |
| 18 | Audit | No record of who changed a par level, deleted an item or changed someone's access | — | Medium | P2 | Database-written, append-only audit log with field-level changes |
| 19 | Import | `migrate.html` is still deployed and has a "Clear All Data" button | migrate.html | High | P1 | Removed in 2.0 (kept in git history) |

## What 2.0 keeps from v1

Features people rely on carry over: per-item location and reorder links, per-group vendor links, order days and frequencies (with the same category defaults), the "confirmed, still the same" check, the approval flow for new sign-ups, category-scoped access, Excel export, and transparent usage-based reorder quantities.
