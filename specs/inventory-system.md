# Tifa Chocolate & Gelato — Inventory Management System
## Specification Document
**Version:** 1.0
**Status:** Draft for review
**Owner:** Naina Balupari
**Last updated:** 2026-07-02

---

## 1. Overview & Goals

Tifa currently tracks inventory across 7 active paper/spreadsheet logs, hand-counted
by staff on an irregular schedule and recorded in a shared Google Sheet. The goal of
this system is to replace that process with a single, owner-accessible web
application that:

- Stores current stock levels and historical counts for every tracked item
- Surfaces which items need reordering the moment the owner logs in
- Preserves how staff actually count inventory today (exact numbers, percentages,
  or mixed notes) rather than forcing an artificial format
- Gives a single source of truth that replaces the paper/spreadsheet workflow

This is a v1 system built for one user. It is not a multi-location, multi-staff,
or point-of-sale-integrated system.

---

## 2. Roles & Access Control

| Aspect | Decision |
|---|---|
| Roles | Single role: **Owner** |
| Users | One account (Naina) |
| Auth provider | Supabase Auth (email + password) |
| Session | Standard Supabase session/cookie; re-prompts login on expiry |
| Public access | None — this system is entirely separate from the public-facing Tifa website and is not linked from it |
| Secrets | All API keys and credentials stored as environment variables, never in client-side code |

*Future consideration (not in v1): if staff need limited access later (e.g. to
submit counts but not edit thresholds or view cost data), the `users` table below
is designed so a `role` column can be added without restructuring the system.*

---

## 3. Data Model

### 3.1 Categories

Derived from your existing tabs. Six categories in v1 (Stationary excluded per your
decision, can be added later with no schema change):

1. Gelato
2. Gelato Supplies
3. Gelato / Drink / Pastry / Chocolate Supplies
4. Covertures, Waffle Mix, Coffee, Water & Soda
5. Truffles & Chocolates
6. Cookies & Pastries
7. House Supplies

Each category contains **subcategories**, matching the section headers already in
your sheet (e.g. within "Covertures...": *Covertures – Inside Container*,
*Covertures – New Box*, *Water/Soda*, *Waffle Mix*, *Coffee/Chai/Matcha*, *Syrups*,
*Flavor Concentrates*, *Flavor Powders*, etc.). Subcategories are stored as plain
text on each item — lightweight, no separate table needed for v1.

### 3.2 `inventory_items`

| Column | Type | Notes |
|---|---|---|
| `id` | serial, PK | |
| `name` | text | e.g. "Strawberry Rose Sorbetto" |
| `category` | text | one of the 6 categories above |
| `subcategory` | text, nullable | e.g. "Hot Drink Supplies" |
| `unit_type` | enum: `count`, `percentage`, `freeform` | determines how this item is counted and displayed |
| `unit_label` | text, nullable | human-readable unit definition, taken from your sheet, e.g. "1 unit = 1 box 5LB" or "1 unit = 1 tray = 12 macarons" |
| `current_value` | text | current stock — always stored as text so it can hold "12", "40%", or "1 new + 20% remaining" without loss; numeric items are parsed for comparison against threshold, see 3.4 |
| `par_level` | numeric, nullable | reorder threshold. Pre-filled from your sheet where one already existed (PAR column or "Alert if less than X" phrasing); null where no threshold exists yet — flagged for you to set |
| `par_source_note` | text, nullable | the original threshold text from your sheet, kept for reference/audit (e.g. "Alert if less than 3 cases") |
| `supplier` | text, nullable | e.g. Costco, Amazon, Webstaurant, Trader Joe's, Whole Foods, Local Stores — taken from your vendor groupings where present |
| `status` | enum: `active`, `seasonal`, `hold`, `trial`, `discontinued` | replaces ad-hoc labels like `<HOLD>`, `<TRIAL>`, "(Seasonal)" found in your sheet |
| `notes` | text, nullable | freeform — carries over notes like "Should be in Gelato Supplies" or "CAN WAIT" for your review |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### 3.3 `inventory_counts` (history)

| Column | Type | Notes |
|---|---|---|
| `id` | serial, PK | |
| `item_id` | FK → inventory_items | |
| `recorded_value` | text | the count as entered, same flexible format as `current_value` |
| `recorded_at` | timestamp | date of the count |
| `recorded_by` | text, nullable | staff initials carried over from history (RP, Rekha, Danyaal, etc.); new entries default to "Owner" but the field stays open in case you note who physically did the count |
| `source` | enum: `migrated`, `manual` | distinguishes imported historical rows from new entries going forward |

### 3.4 How thresholds compare against flexible values

Because `current_value` can be text, low-stock comparison works as follows:
- If `unit_type = count` and the value is a plain number (or a number with a
  recognizable "+something" pattern like "1 new + 3"), it's parsed to a number and
  compared directly against `par_level`
- If `unit_type = percentage`, the leading percentage is parsed and compared
  against `par_level` (also stored as a percentage in that case)
- If `unit_type = freeform` and no reliable number can be parsed, the item is
  excluded from automatic alerts and instead shown in a **"needs manual review"**
  list — so nothing is silently miscounted, but you still see it

---

## 4. Features

| ID | Feature | Description |
|---|---|---|
| F1 | Login | Email + password via Supabase Auth |
| F2 | Dashboard | All items grouped by category → subcategory, matching your current sheet structure |
| F3 | Low-stock alert | On login, shows items where `current_value` is at or below `par_level`; separately lists "needs manual review" items with no reliable threshold |
| F4 | Record a count | Add a new value for an item (numeric input for `count`/`percentage` types, free text field for `freeform` items); writes to `inventory_counts` and updates `current_value` |
| F5 | Item history | View an item's count history over time, including migrated paper-sheet history |
| F6 | Status management | Mark an item seasonal / on hold / trial / discontinued without deleting it |
| F7 | Threshold management | Set or edit `par_level` per item; pre-filled where your sheet already had one |
| F8 | Data cleanup queue | A dedicated view listing items flagged in Section 6 (duplicates, miscategorized notes) for you to resolve during setup |

---

## 5. Data Migration Plan

1. All 8 CSV exports are imported as seed data into `inventory_items`
2. Every historical count column in each sheet becomes a row in `inventory_counts`,
   preserving original dates and staff initials
3. Existing threshold text is parsed into `par_level` + `par_source_note` wherever
   confidently extractable (PAR columns, "Alert if/when less than X" phrasing)
4. Items with no extractable threshold are imported with `par_level = null` and
   appear in a "set your thresholds" queue after go-live
5. Status labels (`<HOLD>`, `<TRIAL>`, "(Seasonal)", the discontinued block in the
   Gelato tab) are mapped to the `status` enum automatically

---

## 6. Data Cleanup Needed (flagged during review — needs your input)

- **Duplicate item names across categories:** "Pistachio" appears in Gelato (flavor),
  Gelato Supplies (Costco ingredient), and Truffles & Chocs (Oasis Treasure Dubai
  Chocolate – Pistachio). These are different products and will be kept distinct by
  category, but worth a quick confirmation nothing is actually a true duplicate.
  Same applies to "Stevia Pineapple Green Tea" in the Gelato tab (appears once
  active, once in the discontinued block).
- **Miscategorized notes:** Fabbri Passion Fruit Plus / Lemon / Strawberry (in the
  Covertures tab) are annotated "Should be in Gelato Supplies" — recommend moving
  these to that category during import unless you say otherwise.
- **Ambiguous/uncertain historical entries:** cells marked "?" or "-" (e.g. Lemon
  Sorbetto, S'mores, Stevia vanilla) are imported as "unknown" rather than zero, so
  they don't falsely trigger — or falsely avoid — a low-stock alert.
- **Untracked items:** several items across tabs (e.g. most of Stationary, several
  chocolate bar varieties in Truffles & Chocs) have no count history at all. These
  import as inactive/unset until you record a first count.

---

## 7. Non-Goals (v1)

- Multiple staff logins or permissions
- Supplier ordering / automatic purchase orders / email integration
- Barcode or QR scanning
- Point-of-sale integration
- Mobile app (responsive web is sufficient)

---

## 8. Open Questions for Owner Review

1. Confirm the duplicate item names above are genuinely different products
2. Confirm the Fabbri items should move from Covertures to Gelato Supplies
3. Set `par_level` for items currently missing a threshold (system will surface
   these as a checklist after migration)
4. Confirm whether staff initials in count history should be preserved and shown,
   or simplified to "historical entry" for privacy
