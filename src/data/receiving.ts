/**
 * Receiving stock into a free-form count. Mirrors the SQL in
 * receive_purchase_order(): an empty count or a plain number is added to;
 * anything else ("2 trays", "1 new + 3") is left as written and the delivery is
 * recorded as a note, because rewriting someone's wording would lose detail.
 */
export function applyReceipt(current: string | null, received: number): { value: string | null; reconciled: boolean } {
  const trimmed = current?.trim() ?? '';
  if (trimmed === '') return { value: formatQty(received), reconciled: true };
  if (/^\d+(\.\d+)?$/.test(trimmed)) return { value: formatQty(Number(trimmed) + received), reconciled: true };
  return { value: current, reconciled: false };
}

export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}
