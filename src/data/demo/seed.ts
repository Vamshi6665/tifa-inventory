/**
 * Anonymized sample data for demo mode. Generated deterministically from a
 * seed and anchored to "now" so it always looks current. Suppliers and people
 * are fictional; quantities are simulated, not the shop's real stock.
 */
import type { AuditEntry, InventoryItem, ItemStatus, PurchaseOrder, StockCount, SubcategorySchedule, Supplier, UnitType, UserProfile } from '@/domain/types';

export interface DemoDB {
  version: number;
  items: InventoryItem[];
  counts: StockCount[];
  schedules: SubcategorySchedule[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  profiles: UserProfile[];
  audit: AuditEntry[];
  seq: { item: number; count: number; supplier: number; po: number; line: number; audit: number };
}

export const DEMO_VERSION = 6;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Spec = [name: string, par: number | null, opts?: { unit?: UnitType; status?: ItemStatus; free?: string; pct?: boolean; supplier?: number }];

const CATALOG: Record<string, Record<string, Spec[]>> = {
  Gelato: {
    Classics: [['Pistachio', 2], ['Stracciatella', 2], ['Hazelnut', 2], ['Dark Chocolate', 2], ['Fior di Latte', 1], ['Salted Caramel', 2], ['Espresso', 1], ['Vanilla Bean', 2], ['Tiramisu', 1], ['Amarena Cherry', 1], ['Cookies & Cream', 1], ['Mint Chip', 1], ['Toasted Almond', 1]],
    'Fruit Sorbetti': [['Mango', 2], ['Lemon', 1], ['Raspberry', 1], ['Strawberry', 1], ['Coconut', 1], ['Blood Orange', 1, { status: 'trial' }]],
    Specials: [['Pumpkin Spice', 1, { status: 'seasonal' }], ['Rum Raisin', 1, { status: 'seasonal' }], ['Olive Oil & Sea Salt', 1, { status: 'trial' }], ['Bubblegum', null, { status: 'discontinued' }]],
  },
  'Gelato Supplies': {
    Bases: [['Neutral base 50', 6, { supplier: 2 }], ['Milk base mix', 4, { supplier: 2 }], ['Dextrose (25 lb)', 2, { supplier: 2 }], ['Sucrose (50 lb)', 2, { supplier: 2 }]],
    Pastes: [['Pistachio paste', 3, { supplier: 2, free: '6 x 5kg buckets' }], ['Hazelnut paste', 3, { supplier: 2 }], ['Gianduja paste', 2, { supplier: 2 }], ['Vanilla paste', 2, { supplier: 2 }], ['Coffee paste', 1, { supplier: 2 }]],
    Variegates: [['Amarena variegate', 2, { supplier: 2 }], ['Salted caramel variegate', 2, { supplier: 2 }], ['Cocoa crunch variegate', 1, { supplier: 2 }]],
    Dairy: [['Whole milk (gal)', 12, { supplier: 1 }], ['Heavy cream (qt)', 10, { supplier: 1 }], ['Skim milk powder', 2, { supplier: 1 }]],
  },
  'Drink & Pastry Supplies': {
    'Cups & Cones': [['Waffle cones (case)', 3, { supplier: 4 }], ['Cake cones (case)', 2, { supplier: 4 }], ['4 oz cups (sleeve)', 8, { supplier: 4 }], ['8 oz cups (sleeve)', 6, { supplier: 4 }], ['Tasting spoons (box)', 4, { supplier: 4 }]],
    Toppings: [['Whipped cream (can)', 6, { supplier: 1 }], ['Chocolate sauce', 3, { supplier: 3, pct: true }], ['Caramel sauce', 3, { supplier: 3, pct: true }], ['Rainbow sprinkles', 2]],
    Syrups: [['Vanilla syrup', 2, { pct: true }], ['Hazelnut syrup', 2, { pct: true }], ['Simple syrup', 2, { free: 'half bottle' }]],
  },
  'Coffee & Beverages': {
    Coffee: [['Espresso beans (1 kg)', 4, { supplier: 5 }], ['Decaf beans (1 kg)', 1, { supplier: 5 }], ['Oat milk (carton)', 8, { supplier: 1 }], ['Almond milk (carton)', 4, { supplier: 1 }]],
    'Water & Soda': [['Sparkling water', 24], ['Still water', 24], ['Italian soda', 12]],
    'Waffle Mix': [['Waffle mix (bag)', 3, { supplier: 6 }], ['Pearl sugar', 2, { supplier: 6, free: '1 new + open bag' }]],
  },
  'Truffles & Chocolates': {
    Couverture: [['Dark couverture 70%', 4, { supplier: 3 }], ['Milk couverture 38%', 3, { supplier: 3 }], ['White couverture', 2, { supplier: 3 }], ['Cocoa powder', 2, { supplier: 3 }]],
    Truffles: [['Sea salt truffle', 20], ['Raspberry truffle', 20], ['Champagne truffle', 12, { status: 'seasonal' }], ['Espresso truffle', 16]],
    Bars: [['Hazelnut crunch bar', 10], ['Orange dark bar', 8], ['Pistachio white bar', 8]],
  },
  'Cookies & Pastries': {
    Cookies: [['Biscotti', 24, { supplier: 6 }], ['Amaretti', 24, { supplier: 6 }], ['Chocolate chip cookie', 18, { supplier: 6 }], ['Pizzelle', 12, { supplier: 6, status: 'trial' }]],
    Pastries: [['Cannoli shells', 30, { supplier: 6 }], ['Croissants (frozen)', 24, { supplier: 6 }], ['Brownies', 12, { supplier: 6 }], ['Affogato cups', null]],
  },
  'House Supplies': {
    Cleaning: [['Sanitizer (gal)', 2, { supplier: 4 }], ['Nitrile gloves (box)', 4, { supplier: 4 }], ['Trash bags (roll)', 3, { supplier: 4 }], ['Dish soap', 2, { supplier: 4, free: 'ask kitchen' }]],
    'Paper Goods': [['Napkins (case)', 2, { supplier: 4 }], ['Paper towels (case)', 2, { supplier: 4 }], ['Receipt rolls', 6, { supplier: 4 }]],
    Packaging: [['Pint containers', 50, { supplier: 4 }], ['Quart containers', 30, { supplier: 4 }], ['Gift boxes (small)', 20, { supplier: 4 }], ['Insulated bags', 15, { supplier: 4 }]],
  },
};

const SUPPLIERS: Array<Omit<Supplier, 'created_at'>> = [
  { id: 1, name: 'Northbay Dairy Co.', contact_name: 'Dana Ortiz', email: 'orders@northbay-dairy.example', phone: '(555) 010-2231', website: null, lead_time_days: 2, notes: 'Delivers Tue/Fri before 9am.' },
  { id: 2, name: 'Valle Paste & Base Imports', contact_name: 'Marco Bellini', email: 'sales@valle-imports.example', phone: '(555) 010-4410', website: 'https://valle-imports.example', lead_time_days: 7, notes: 'Minimum order 4 cases.' },
  { id: 3, name: 'Cacao Collective', contact_name: 'Lena Brandt', email: 'wholesale@cacaocollective.example', phone: '(555) 010-8872', website: null, lead_time_days: 5, notes: null },
  { id: 4, name: 'Harbor Paper Supply', contact_name: null, email: 'help@harborpaper.example', phone: '(555) 010-1199', website: 'https://harborpaper.example', lead_time_days: 3, notes: 'Online ordering portal.' },
  { id: 5, name: 'Roastworks Coffee', contact_name: 'Theo Park', email: 'theo@roastworks.example', phone: null, website: null, lead_time_days: 3, notes: null },
  { id: 6, name: 'Bakehouse Wholesale', contact_name: 'Ruth Adams', email: 'orders@bakehouse.example', phone: '(555) 010-3348', website: null, lead_time_days: 2, notes: 'Croissants ship frozen.' },
];

const PEOPLE: UserProfile[] = [
  { user_id: 'demo-admin', email: 'alex.rivera@demo.tifa', display_name: 'Alex Rivera', role: 'admin', categories: null, pending: false, created_at: '', last_seen_at: null },
  { user_id: 'demo-staff', email: 'sam.chen@demo.tifa', display_name: 'Sam Chen', role: 'staff', categories: ['Drink & Pastry Supplies', 'Gelato', 'Gelato Supplies'], pending: false, created_at: '', last_seen_at: null },
  { user_id: 'demo-staff-2', email: 'priya.nair@demo.tifa', display_name: 'Priya Nair', role: 'staff', categories: ['Coffee & Beverages', 'Cookies & Pastries'], pending: false, created_at: '', last_seen_at: null },
  { user_id: 'demo-viewer', email: 'jordan.lee@demo.tifa', display_name: 'Jordan Lee', role: 'viewer', categories: ['Cookies & Pastries', 'Gelato', 'Truffles & Chocolates'], pending: false, created_at: '', last_seen_at: null },
  // Signed in once and is waiting for an admin to approve them.
  { user_id: 'demo-pending', email: 'maya.ortiz@demo.tifa', display_name: 'Maya Ortiz', role: 'staff', categories: [], pending: true, created_at: '', last_seen_at: null },
];

/** Where things live in the shop, by group (shown in the Location column). */
const LOCATIONS: Record<string, string> = {
  'Gelato': 'Display case',
  'Gelato Supplies': 'Back storage',
  'Drink & Pastry Supplies': 'Front counter',
  'Coffee & Beverages': 'Bar shelf',
  'Truffles & Chocolates': 'Chocolate case',
  'Cookies & Pastries': 'Pastry case',
  'House Supplies': 'Closet',
};
const ORDER_DAYS = ['Monday', 'Wednesday', 'Thursday'];

const INITIALS = ['AR', 'SC', 'PN', 'SC', 'AR'];
const DAY = 86_400_000;

export function buildSeed(now: number = Date.now(), seed = 20261029): DemoDB {
  const rand = mulberry32(seed);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const iso = (t: number) => new Date(t).toISOString();

  const items: InventoryItem[] = [];
  const counts: StockCount[] = [];
  const schedules: SubcategorySchedule[] = [];
  let itemId = 1;
  let countId = 1;
  const horizon = 84;

  for (const [category, subs] of Object.entries(CATALOG)) {
    for (const [subcategory, specs] of Object.entries(subs)) {
      schedules.push({
        category,
        subcategory,
        frequency: category === 'Gelato' || subcategory === 'Dairy' ? 'weekly' : category === 'House Supplies' ? 'monthly' : 'biweekly',
        reorder_day: schedules.length % 3 === 0 ? ORDER_DAYS[schedules.length % ORDER_DAYS.length]! : null,
        vendor_url: schedules.length % 4 === 1 ? `https://orders.example/${slug(subcategory)}` : null,
      });
      for (const [name, par, opts = {}] of specs) {
        const id = itemId++;
        const status = opts.status ?? 'active';
        const unit: UnitType = opts.free ? 'freeform' : opts.pct ? 'percentage' : 'count';
        let value: number;
        let lastAt = now - horizon * DAY;
        if (opts.pct) {
          value = Math.round(between(40, 100));
        } else {
          const p = par ?? 4;
          value = Math.round(p * between(2, 3.5));
          const rate = (p * between(0.25, 0.9)) / 7; // per day
          // A few items are deliberately stocked low or out.
          const endBias = rand();
          let t = now - horizon * DAY;
          while (t < now) {
            t += between(2.5, 5) * DAY;
            if (t > now) break;
            value = Math.max(0, value - rate * ((t - lastAt) / DAY) * between(0.7, 1.3));
            if (value <= p * 1.4 && t < now - 2 * DAY) value += p * between(2, 3);
            lastAt = t;
            if (status !== 'discontinued') {
              counts.push({ id: countId++, item_id: id, value: String(Math.round(value)), counted_at: iso(t), recorded_by: INITIALS[Math.floor(rand() * INITIALS.length)]!, source: t < now - 40 * DAY ? 'migrated' : 'manual', note: null });
            }
          }
          if (endBias < 0.06 || name === 'Mango' || name === 'Oat milk (carton)') value = 0;
          else if (endBias < 0.16) value = Math.max(1, Math.round(p * between(0.4, 1)));
          else value = Math.max(value, p * between(2.6, 5));
          value = Math.round(value);
          if (status !== 'discontinued') {
            counts.push({ id: countId++, item_id: id, value: String(value), counted_at: iso(lastAt + (now - lastAt) * between(0.3, 0.9)), recorded_by: 'SC', source: 'manual', note: null });
          }
        }
        const lastCount = [...counts].reverse().find((c) => c.item_id === id);
        const current = status === 'discontinued' ? '0' : opts.free ?? (opts.pct ? `${value}%` : lastCount?.value ?? String(value));
        const updated = lastCount ? Date.parse(lastCount.counted_at) : now - between(5, 30) * DAY;
        items.push({
          id,
          name,
          category,
          subcategory,
          unit_type: unit,
          current_value: current,
          par_level: par,
          par_source_note: par != null && rand() < 0.15 ? 'From the old paper log' : null,
          unit_label: null,
          supplier: opts.supplier ? SUPPLIERS[opts.supplier - 1]!.name : null,
          supplier_id: opts.supplier ?? null,
          status,
          notes: null,
          location: LOCATIONS[category] ?? null,
          reorder_url: opts.supplier && SUPPLIERS[opts.supplier - 1]!.website ? `${SUPPLIERS[opts.supplier - 1]!.website}/item/${slug(name)}` : null,
          updated_at: iso(updated),
          // Counting confirms; some items were also re-confirmed later without a change.
          last_verified_at: lastCount ? iso(Math.min(now - 3_600_000, updated + (rand() < 0.3 ? between(0, 2) * DAY : 0))) : null,
        });
      }
    }
  }

  const suppliers: Supplier[] = SUPPLIERS.map((s) => ({ ...s, created_at: iso(now - 60 * DAY) }));
  const byName = (n: string) => items.find((i) => i.name === n)!.id;
  const purchaseOrders: PurchaseOrder[] = [
    {
      id: 1, number: 'PO-1041', supplier_id: 2, status: 'received', notes: null, expected_on: iso(now - 9 * DAY).slice(0, 10), sent_at: iso(now - 16 * DAY), received_at: iso(now - 9 * DAY), created_at: iso(now - 16 * DAY), created_by: 'demo-admin',
      lines: [
        { id: 1, po_id: 1, item_id: byName('Neutral base 50'), quantity: 8, unit_label: 'bags', received_quantity: 8 },
        { id: 2, po_id: 1, item_id: byName('Hazelnut paste'), quantity: 4, unit_label: 'buckets', received_quantity: 4 },
      ],
    },
    {
      id: 2, number: 'PO-1042', supplier_id: 1, status: 'sent', notes: 'Friday delivery please', expected_on: iso(now + 1 * DAY).slice(0, 10), sent_at: iso(now - 1 * DAY), received_at: null, created_at: iso(now - 1 * DAY), created_by: 'demo-admin',
      lines: [
        { id: 3, po_id: 2, item_id: byName('Whole milk (gal)'), quantity: 18, unit_label: 'gal', received_quantity: 0 },
        { id: 4, po_id: 2, item_id: byName('Heavy cream (qt)'), quantity: 12, unit_label: 'qt', received_quantity: 0 },
      ],
    },
    {
      id: 3, number: 'PO-1043', supplier_id: 4, status: 'draft', notes: null, expected_on: null, sent_at: null, received_at: null, created_at: iso(now - 0.2 * DAY), created_by: 'demo-admin',
      lines: [{ id: 5, po_id: 3, item_id: byName('Pint containers'), quantity: 100, unit_label: null, received_quantity: 0 }],
    },
  ];

  const profiles = PEOPLE.map((p, i) => ({ ...p, created_at: iso(now - (90 - i * 10) * DAY), last_seen_at: iso(now - i * 1.3 * DAY) }));

  const audit: AuditEntry[] = [];
  let auditId = 1;
  const recent = counts.filter((c) => Date.parse(c.counted_at) > now - 3 * DAY).slice(-14);
  for (const c of recent) {
    const actor = c.recorded_by === 'AR' ? profiles[0]! : c.recorded_by === 'PN' ? profiles[2]! : profiles[1]!;
    audit.push({ id: auditId++, table_name: 'inventory_counts', record_id: String(c.item_id), action: 'insert', actor_id: actor.user_id, actor_email: actor.email, changed: { value: { from: null, to: c.value } }, created_at: c.counted_at });
  }
  audit.push({ id: auditId++, table_name: 'purchase_orders', record_id: '2', action: 'update', actor_id: 'demo-admin', actor_email: profiles[0]!.email, changed: { status: { from: 'draft', to: 'sent' } }, created_at: iso(now - 1 * DAY) });
  audit.push({ id: auditId++, table_name: 'inventory_items', record_id: String(byName('Blood Orange')), action: 'update', actor_id: 'demo-admin', actor_email: profiles[0]!.email, changed: { status: { from: 'active', to: 'trial' } }, created_at: iso(now - 2.4 * DAY) });
  audit.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    version: DEMO_VERSION,
    items,
    counts,
    schedules,
    suppliers,
    purchaseOrders,
    profiles,
    audit,
    seq: { item: itemId, count: countId, supplier: suppliers.length + 1, po: 4, line: 6, audit: auditId },
  };
}

export const DEMO_PEOPLE = PEOPLE;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
