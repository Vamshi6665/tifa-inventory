# tifa-inventory
Internal inventory management for Tifa Chocolate &amp; Gelato
# Tifa Inventory Management System

A production inventory management system built for **Tifa Chocolate & Gelato** (Walnut Creek, CA) — a real, fast-moving small business. Designed to replace spreadsheets and guesswork with real-time stock tracking, reorder alerting, and admin-controlled access, running at **$0/month** in infrastructure cost.

🔗 **Live app:** [tifa-inventory.vercel.app](https://tifa-inventory.vercel.app)

---

## Why this exists

Small businesses run on spreadsheets, sticky notes, and "I think we're low on that." For a shop moving through ingredients daily, that isn't a system — it's a daily guessing game that leads to stockouts and over-ordering.

This project replaces that with a lightweight, always-on inventory tool the owner actually uses to run the business — built deliberately without enterprise infrastructure, build pipelines, or recurring cost.

---

## Design principles

- **Zero infrastructure cost.** Free tiers only, all the way down.
- **No build step.** Plain HTML/CSS/JS served as-is — no framework overhead, no bundler, no compile stage.
- **Real business data, not clean demo data.** Quantities are free-form text (`"6 x 5kg buckets"`), so every feature that touches quantity uses a *parse-and-flag* pattern rather than assuming clean numbers.
- **Ship directly.** GitHub web editor → Vercel auto-deploy. No local environment required.
- **Owner-controlled.** Row-level security and an admin gate keep write access with the business owner.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Plain HTML / CSS / JavaScript (no build step) |
| Charts | Chart.js |
| Icons | Tabler Icons (webfont via CDN) |
| Spreadsheet I/O | SheetJS |
| Database | Supabase — PostgreSQL + Auth + Row-Level Security |
| Serverless | Vercel serverless functions |
| Deployment | Vercel (GitHub auto-deploy) |
| Data import | Python scripts from Excel / CSV source files |

---

## Architecture

```
┌─────────────────────┐        ┌──────────────────────┐
│   Browser (client)  │        │       Supabase       │
│  index.html + JS    │◀──────▶│  PostgreSQL + Auth    │
│  Chart.js / Tabler  │  RLS   │  Row-Level Security   │
└──────────┬──────────┘        │  is_admin() function  │
           │                   └──────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Vercel (hosting +  │
│  serverless funcs)  │
│  GitHub auto-deploy │
└─────────────────────┘
```

- The client talks directly to Supabase using its JS client, with RLS enforcing who can read and write.
- Admin-only actions are gated by the existing `is_admin()` Postgres function.
- Deployment is fully hands-off: commit via the GitHub web editor, Vercel builds and ships automatically.

---

## Data model

The core inventory table is intentionally simple and reflects how the business actually records stock.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key |
| `current_value` | text | **Free-form** quantity, e.g. `"6 x 5kg buckets"` |
| `par_level` | numeric | Reorder threshold — the minimum before restocking |
| *(item metadata)* | — | Name, category, and related descriptive fields |

> **Key design decision — `current_value` is free-form text.**
> Because real staff record stock in human language, quantity can't be treated as a clean number. Any feature touching quantity/reorder logic uses a **parse-and-skip** pattern: cleanly numeric values are compared against `par_level`; free-text entries are flagged for manual review rather than triggering false alarms.

---

## Features

- **Real-time stock dashboard** — current levels across every SKU at a glance.
- **Reorder / low-stock detection** — `needsReorder()` compares parsed quantities against `par_level` and surfaces items that need restocking.
- **Robust quantity parsing** — `parseValue()` extracts numeric quantities from free-form text and defers anything ambiguous to manual review.
- **Admin-gated writes** — edits and administrative actions are restricted via Supabase RLS and the `is_admin()` function.
- **Data import** — Python scripts load and reconcile inventory from existing Excel / CSV records.
- **Visual reporting** — Chart.js visualizations for stock status.

### On the roadmap

- **Low-stock push notifications** — reusing the dashboard's existing `needsReorder()` logic, `parseValue()` parser, and `par_level` column to alert the owner when stock drops below threshold.

---

## Deployment

No local build or CI/CD pipeline. The workflow is:

1. Edit files via the **GitHub web editor**.
2. Commit to the repository.
3. **Vercel auto-deploys** the new commit.

Database migrations are run through the **Supabase SQL Editor**. (Note: because of connection-pooler incompatibility, some migrations use temp-table workarounds.)

---

## Environment / configuration

The client is configured with the project's Supabase URL and anonymous public key. Access control is enforced server-side by Row-Level Security and the `is_admin()` function — the anon key alone does not grant write access.

---

## Project status

**Live and in use** by the business owner as the day-to-day inventory tool. Actively developed feature-by-feature using a spec-driven workflow: each feature is scoped, its logic tested against real relative dates and the actual schema, then shipped.

---

## About

Built as both a real operational tool for Tifa Chocolate & Gelato and a portfolio project demonstrating pragmatic data engineering, applied AI-assisted development, and end-to-end system design under real-world constraints.
