# Tifa Inventory Management System

Inventory, stock counts, reordering and purchasing for **Tifa Chocolate & Gelato** (Walnut Creek, CA), a real, fast-moving small business. It replaced spreadsheets and guesswork with live stock tracking, reorder alerts and owner-controlled access. Version 2.0 rebuilds the original single-file dashboard as a typed React app with a tested permission model, an audit log and purchasing.

🔗 **Live app:** [tifa-inventory.vercel.app](https://tifa-inventory.vercel.app)

---

## Why this exists

Small businesses run on spreadsheets, sticky notes and "I think we're low on that." For a shop going through ingredients daily, that leads to stockouts and over-ordering. This is the tool the owner uses to run stock instead.

## Design principles

- **Real business data, not clean demo data.** Staff write counts the way they think: `"1new+.75"`, `"2 trays"`, `"45% remaining"`. Every feature that touches quantity uses one parse-and-flag rule: read what's clear, flag the rest for a person. The rule is tested against all 1,721 count values from the shop's original import.
- **Transparent forecasting.** Usage per day is the drop between counts divided by the days, with deliveries left out. Every suggested quantity shows its arithmetic. No black-box models.
- **Permissions in the database.** Roles and category access are enforced by Postgres Row-Level Security, not by hiding buttons.
- **No paid infrastructure required.** Supabase and Vercel free tiers. The optional AI assistant uses the Claude API, billed per use.

## What it does

| Area | What people do there |
| --- | --- |
| Overview | See what's out, low, unreadable or not counted lately, with the reason behind each insight |
| Inventory | Search, filter, sort and edit every item, including location and reorder links; open an item for its forecast, 12-week trend and count history |
| Stock count | Walk the shelves on a phone: type a count, press Enter, move to the next item; an empty Enter confirms the old count |
| Reorder | Items at or below par, plus items projected to cross par before their next order, with quantities and vendor links; order schedules, order days and vendor pages per group |
| Purchase orders | Draft → sent → received; receiving adds to plain-number counts and flags worded counts for a recount |
| Suppliers | Contacts and lead times, which feed suggested quantities |
| Analytics and reports | Run-out dates, fastest movers, weekly trends; Excel exports by category |
| Activity | Audit log of every change, written by the database |
| Team | Approve new sign-ups; set each person's role (admin, staff, viewer) and categories |

Also: ⌘K command palette, notifications, saved table views, light and dark themes, live updates across devices, and an assistant that answers questions from the inventory.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript (strict), Vite, React Router, TanStack Query / Table / Virtual, Radix UI |
| Charts and export | Chart.js (loaded on demand), write-excel-file |
| Database | Supabase: Postgres, Auth (email and Google), Row-Level Security, Realtime |
| Serverless | One Vercel function for the assistant, which reads data with the user's own permissions |
| Hosting | Vercel, deployed from GitHub |
| Testing | Vitest, React Testing Library, axe-core, PGlite (real Postgres in-process), Playwright, Lighthouse |

## Quality

- **252 automated tests:** 222 in Vitest (domain rules, real-data checks, components, pages, the migration and RLS on a reconstruction of the live database) and 30 in Playwright (flows, accessibility in both themes, 10 screen widths, keyboard use, 5,000 items).
- **Accessibility:** no axe violations on any page in either theme; Lighthouse accessibility 100.
- **Performance:** Lighthouse 100 on desktop; 174KB of JavaScript on first load.

## Run it

```bash
npm install
npm run dev:demo     # sample data in the browser, no backend needed
npm run dev          # against Supabase (copy .env.example to .env.local)
npm test             # Vitest
npm run test:e2e     # Playwright
```

## Deploy

Vercel builds every push with `npm run build` (framework preset: Vite, output `dist`). Production uses the Supabase settings in `.env.production`; pull-request previews use sample data. Database changes are in `supabase/migrations/`; see [docs/MIGRATION.md](docs/MIGRATION.md) for the rollout.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Design system](docs/DESIGN-SYSTEM.md) · [UI audit](docs/UI-AUDIT.md) · [Security](docs/SECURITY.md) · [Accessibility](docs/ACCESSIBILITY.md) · [Performance](docs/PERFORMANCE.md) · [QA](docs/QA.md) · [Migration](docs/MIGRATION.md) · [Production readiness](docs/PRODUCTION-READINESS.md) · [Technical debt](docs/TECH-DEBT.md) · [Roadmap](docs/ROADMAP.md) · [Original specification](specs/inventory-system.md)

---

Built as a working tool for Tifa Chocolate & Gelato and as a portfolio project in practical data engineering and AI-assisted development under real constraints.
