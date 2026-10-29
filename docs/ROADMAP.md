# Roadmap

Everything here is **planned, not built**. Items are ordered by fit for the shop and value for the people using it.

## Next (small, high value)
1. **Low-stock push and email alerts** — reuse `needsReorder()` and the notification rules; a daily digest through a Vercel cron, push via the PWA manifest already in place.
2. **Barcode scanning in count mode** — phone camera via the BarcodeDetector API, matching a new `barcode` column on items.
3. **Supabase MFA for admins** and an error-reporting service.
4. **Generated database types** to replace the hand-written row mappers.

## Later (needs data the shop doesn't capture yet)
5. **Sales** — import daily sales from the point-of-sale system so usage comes from sales, not just count drops. This is what would make forecasts meaningfully better.
6. **Customers** — only if there's a reason to track them (e.g. wholesale or catering orders); not useful for walk-in gelato sales.
7. **Supplier price lists and order costs** — unit prices on purchase-order lines, spend by supplier and month.
8. **Waste logging** — previously built and rolled back because expiry dates couldn't be maintained in a fast-moving shop; revisit only as a simple "discarded" count source, without expiry tracking.

## Only if the business grows
9. **Multiple locations (multi-tenant)** — add `location_id` to items, counts and orders; extend RLS with location membership. The permission functions are the single place to change.
10. **Server-rendered shell** for mobile performance (see PERFORMANCE.md).
11. **Offline count mode** — queue counts on the phone when the back room has no signal, sync when back online.
