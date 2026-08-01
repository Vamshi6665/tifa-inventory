/* ============================================================
 * Tifa Inventory — FEFO expiry + waste logging (front end)
 * CORRECTED for real schema. Plain JS, no build step.
 * Assumes a Supabase client named `supabase` is initialized.
 *
 * Wire-up (after items load):
 *   const ordered = TifaExpiry.init({ items });
 *   TifaWaste.mountForm('#waste-form-mount', items);
 *   TifaWaste.renderMonthlyStat('#waste-stat');
 * ============================================================ */

const CONFIG = {
  idCol: 'id',
  nameCol: 'name',
  categoryCol: 'category',
  valueCol: 'current_value',   // free-form text, e.g. "6 x 5kg buckets"
  parCol: 'par_level',         // numeric
  expiryCol: 'expiry_date',
  nearExpiryDays: 7,
};

/* ---------- shared helpers ---------- */

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / 86400000);
}

function expiryStatus(dateStr) {
  const n = daysUntil(dateStr);
  if (n === null) return 'none';
  if (n < 0) return 'expired';
  if (n <= CONFIG.nearExpiryDays) return 'expiring_soon';
  return 'ok';
}

/* Parse current_value ONLY when it is a clean leading number.
 * Free-text ("1 new box", "45% remaining", "-") returns null and is
 * never used for low-stock comparison. We do not guess. */
function parseQty(raw) {
  if (raw == null) return null;
  const m = String(raw).trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*$/);
  return m ? parseFloat(m[1]) : null;
}

const STATUS_META = {
  expired:       { label: 'Expired',       color: '#B00020', bg: '#FDECEC' },
  expiring_soon: { label: 'Expiring soon', color: '#8A6D00', bg: '#FFF6E0' },
  ok:            { label: 'Fresh',         color: '#2AAE72', bg: '#E8F7EF' },
  none:          { label: '\u2014',        color: '#3A5C47', bg: '#F0F4F1' },
};

/* ============================================================
 * FEFO
 * ============================================================ */

const TifaExpiry = {
  sortFEFO(items) {
    return [...items].sort((a, b) => {
      const ea = a[CONFIG.expiryCol], eb = b[CONFIG.expiryCol];
      if (!ea && !eb) return 0;
      if (!ea) return 1;
      if (!eb) return -1;
      return new Date(ea) - new Date(eb);
    });
  },

  badgeHTML(item) {
    const status = expiryStatus(item[CONFIG.expiryCol]);
    const meta = STATUS_META[status];
    const n = daysUntil(item[CONFIG.expiryCol]);
    let text = meta.label;
    if (status === 'expiring_soon') text = `${n}d left`;
    else if (status === 'expired')  text = `${Math.abs(n)}d ago`;
    return `<span class="tifa-expiry-badge" style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;color:${meta.color};background:${meta.bg};">${text}</span>`;
  },

  bannerHTML(items) {
    const flagged = items.filter(i => {
      const s = expiryStatus(i[CONFIG.expiryCol]);
      return s === 'expired' || s === 'expiring_soon';
    });
    if (flagged.length === 0) return '';
    const expired = flagged.filter(i => expiryStatus(i[CONFIG.expiryCol]) === 'expired');
    const soon = flagged.filter(i => expiryStatus(i[CONFIG.expiryCol]) === 'expiring_soon');
    const parts = [];
    if (expired.length) parts.push(`<strong>${expired.length}</strong> expired`);
    if (soon.length) parts.push(`<strong>${soon.length}</strong> expiring within ${CONFIG.nearExpiryDays} days`);
    const names = TifaExpiry.sortFEFO(flagged).slice(0, 5).map(i => i[CONFIG.nameCol]).join(', ');
    return `<div class="tifa-expiry-banner" style="border-left:4px solid #B00020;background:#FDECEC;color:#0D2418;padding:12px 16px;border-radius:8px;margin:12px 0;font-size:14px;"><i class="ti ti-alert-triangle" style="color:#B00020;"></i><span style="margin-left:6px;">${parts.join(' \u00b7 ')} \u2014 ${names}${flagged.length > 5 ? ', \u2026' : ''}</span></div>`;
  },

  init({ items, bannerMount = '#expiry-banner-mount' }) {
    const el = document.querySelector(bannerMount);
    if (el) el.innerHTML = TifaExpiry.bannerHTML(items);
    return TifaExpiry.sortFEFO(items);
  },
};

/* ============================================================
 * Low stock (parse-and-skip) — for optional client-side display
 * ============================================================ */

const TifaLowStock = {
  /* Returns { low: [...], skipped: [...] }.
   * low     = clean-number value <= par_level
   * skipped = par_level set but value not a clean number (review manually) */
  evaluate(items) {
    const low = [], skipped = [];
    for (const i of items) {
      const par = i[CONFIG.parCol];
      if (par == null) continue;
      const q = parseQty(i[CONFIG.valueCol]);
      if (q === null) { skipped.push(i); continue; }
      if (q <= Number(par)) low.push(i);
    }
    return { low, skipped };
  },
};

/* ============================================================
 * Waste logging (admin-only writes enforced by RLS)
 * ============================================================ */

const TifaWaste = {
  REASONS: ['expired', 'damaged', 'spoiled', 'other'],

  mountForm(selector, items) {
    const mount = document.querySelector(selector);
    if (!mount) return;
    const options = items.map(i => `<option value="${i[CONFIG.idCol]}">${i[CONFIG.nameCol]}</option>`).join('');
    const reasonOpts = TifaWaste.REASONS.map(r => `<option value="${r}">${r}</option>`).join('');
    mount.innerHTML = `
      <div class="tifa-waste-form" style="background:#F0F4F1;border-radius:12px;padding:16px;max-width:420px;">
        <h3 style="margin:0 0 12px;color:#0D2418;font-family:'Playfair Display',serif;">Log waste</h3>
        <label style="display:block;font-size:13px;color:#3A5C47;">Item
          <select id="tw-item" style="width:100%;padding:8px;margin:4px 0 10px;">${options}</select></label>
        <label style="display:block;font-size:13px;color:#3A5C47;">Quantity
          <input id="tw-qty" type="number" min="0" step="any" style="width:100%;padding:8px;margin:4px 0 10px;" /></label>
        <label style="display:block;font-size:13px;color:#3A5C47;">Reason
          <select id="tw-reason" style="width:100%;padding:8px;margin:4px 0 10px;">${reasonOpts}</select></label>
        <label style="display:block;font-size:13px;color:#3A5C47;">Note (optional)
          <input id="tw-note" type="text" style="width:100%;padding:8px;margin:4px 0 12px;" /></label>
        <button id="tw-submit" style="background:#2AAE72;color:#fff;border:none;border-radius:8px;padding:10px 18px;font-weight:600;cursor:pointer;">Save</button>
        <span id="tw-msg" style="margin-left:10px;font-size:13px;"></span>
      </div>`;
    mount.querySelector('#tw-submit').addEventListener('click', async () => {
      const msg = mount.querySelector('#tw-msg');
      const item_id = parseInt(mount.querySelector('#tw-item').value, 10);
      const quantity = parseFloat(mount.querySelector('#tw-qty').value);
      const reason = mount.querySelector('#tw-reason').value;
      const note = mount.querySelector('#tw-note').value || null;
      if (!(quantity > 0)) { msg.textContent = 'Enter a quantity greater than 0.'; msg.style.color = '#B00020'; return; }
      const { data: userData } = await supabase.auth.getUser();
      const logged_by = userData?.user?.id ?? null;
      const { error } = await supabase.from('waste_log').insert({ item_id, quantity, reason, note, logged_by });
      if (error) { msg.textContent = 'Error: ' + error.message; msg.style.color = '#B00020'; }
      else {
        msg.textContent = 'Logged \u2713'; msg.style.color = '#2AAE72';
        mount.querySelector('#tw-qty').value = ''; mount.querySelector('#tw-note').value = '';
      }
    });
  },

  async renderMonthlyStat(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { data, error } = await supabase.from('waste_log').select('quantity, reason').gte('logged_at', monthStart.toISOString());
    if (error) { el.textContent = '\u2014'; return; }
    const total = (data || []).reduce((s, r) => s + Number(r.quantity), 0);
    const events = (data || []).length;
    el.innerHTML = `<div style="background:#FFF6E0;border-radius:12px;padding:16px;"><div style="font-size:13px;color:#8A6D00;">Waste this month</div><div style="font-size:28px;font-weight:700;color:#0D2418;">${total}</div><div style="font-size:12px;color:#3A5C47;">${events} event(s) logged</div></div>`;
  },
};

if (typeof window !== 'undefined') {
  window.TifaExpiry = TifaExpiry;
  window.TifaLowStock = TifaLowStock;
  window.TifaWaste = TifaWaste;
  window.TifaExpiryConfig = CONFIG;
}
