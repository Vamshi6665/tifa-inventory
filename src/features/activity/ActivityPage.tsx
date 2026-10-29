import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { IconHistory } from '@tabler/icons-react';
import { Avatar, Button, EmptyState, PageHeader, SearchInput, SelectField, Skeleton } from '@/design-system';
import { useAudit, useItems, useOrders, useProfiles, useSuppliers } from '@/data/hooks';
import { formatDateTime, relativeTime } from '@/domain/dates';
import { score } from '@/domain/search';
import type { AuditEntry } from '@/domain/types';
import styles from './Activity.module.css';

const TABLES: Record<string, string> = {
  inventory_items: 'Items',
  inventory_counts: 'Counts',
  purchase_orders: 'Orders',
  suppliers: 'Suppliers',
  user_profiles: 'Team',
  subcategory_schedules: 'Schedules',
};

const FIELD: Record<string, string> = { current_value: 'count', par_level: 'par', status: 'status', name: 'name', category: 'category', subcategory: 'group', supplier_id: 'supplier', last_verified_at: 'confirmation', role: 'role', categories: 'category access', frequency: 'order schedule', notes: 'notes', lead_time_days: 'lead time', expected_on: 'expected date' };

function show(v: unknown): string {
  if (v == null || v === '') return 'empty';
  if (Array.isArray(v)) return v.join(', ') || 'none';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  return String(v);
}

export default function ActivityPage() {
  const [limit, setLimit] = useState(200);
  const audit = useAudit(limit);
  const items = useItems();
  const orders = useOrders();
  const suppliers = useSuppliers();
  const profiles = useProfiles();
  const [table, setTable] = useState('');
  const [actor, setActor] = useState('');
  const [query, setQuery] = useState('');

  const describe = useMemo(() => {
    const itemName = new Map((items.data ?? []).map((i) => [String(i.id), i.name]));
    const poNum = new Map((orders.data ?? []).map((o) => [String(o.id), o.number]));
    const supName = new Map((suppliers.data ?? []).map((s) => [String(s.id), s.name]));
    const person = new Map((profiles.data ?? []).map((p) => [p.user_id, p.display_name ?? p.email]));
    return (a: AuditEntry): { subject: string; href?: string; verb: string; changes: string[] } => {
      const changes = Object.entries(a.changed ?? {}).filter(([k]) => k !== 'updated_at').map(([k, v]) => (a.action === 'update' ? `${FIELD[k] ?? k}: ${show(v.from)} → ${show(v.to)}` : ''));
      switch (a.table_name) {
        case 'inventory_counts':
          return { subject: itemName.get(a.record_id) ?? `item ${a.record_id}`, href: `/inventory/${a.record_id}`, verb: `counted ${show(a.changed?.value?.to)}${a.changed?.value?.from != null ? ` (was ${show(a.changed.value.from)})` : ''}`, changes: [] };
        case 'inventory_items':
          if (a.action === 'insert') return { subject: show(a.changed?.name?.to), href: `/inventory/${a.record_id}`, verb: 'added', changes: [] };
          if (a.action === 'delete') return { subject: show(a.changed?.name?.from), verb: 'deleted', changes: [] };
          if (a.changed && Object.keys(a.changed).length === 1 && 'last_verified_at' in a.changed) return { subject: itemName.get(a.record_id) ?? `item ${a.record_id}`, href: `/inventory/${a.record_id}`, verb: 'confirmed the count of', changes: [] };
          return { subject: itemName.get(a.record_id) ?? `item ${a.record_id}`, href: `/inventory/${a.record_id}`, verb: 'edited', changes };
        case 'purchase_orders':
          return { subject: poNum.get(a.record_id) ?? show(a.changed?.number?.to) ?? `order ${a.record_id}`, href: `/orders/${a.record_id}`, verb: a.action === 'insert' ? 'created' : 'updated', changes };
        case 'suppliers':
          return { subject: supName.get(a.record_id) ?? show(a.changed?.name?.to ?? a.changed?.name?.from), href: a.action !== 'delete' ? `/suppliers/${a.record_id}` : undefined, verb: a.action === 'insert' ? 'added supplier' : a.action === 'delete' ? 'removed supplier' : 'edited supplier', changes };
        case 'user_profiles':
          return { subject: person.get(a.record_id) ?? 'a team member', verb: 'changed access for', changes };
        case 'subcategory_schedules':
          return { subject: a.record_id.replace('/', ' / '), verb: 'set the order schedule for', changes: [`now ${show(a.changed?.frequency?.to)}`] };
        default:
          return { subject: `${a.table_name} ${a.record_id}`, verb: a.action, changes };
      }
    };
  }, [items.data, orders.data, suppliers.data, profiles.data]);

  const actors = useMemo(() => [...new Set((audit.data ?? []).map((a) => a.actor_email).filter(Boolean) as string[])].sort(), [audit.data]);
  const nameFor = (email: string | null) => profiles.data?.find((p) => p.email === email)?.display_name ?? email ?? 'System';

  const filtered = useMemo(
    () =>
      (audit.data ?? []).filter((a) => {
        if (table && a.table_name !== table) return false;
        if (actor && a.actor_email !== actor) return false;
        if (query.trim()) {
          const d = describe(a);
          return score(`${d.subject} ${d.verb} ${d.changes.join(' ')} ${nameFor(a.actor_email)}`, query) > 0;
        }
        return true;
      }),
    [audit.data, table, actor, query, describe], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const byDay = useMemo(() => {
    const m = new Map<string, AuditEntry[]>();
    const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    for (const a of filtered) {
      const k = fmt.format(new Date(a.created_at));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [filtered]);

  return (
    <>
      <PageHeader title="Activity" description="Every change to items, counts, orders, suppliers and access, with who made it. Entries can’t be edited or deleted." />
      <div className={styles.filters}>
        <SearchInput value={query} onChange={setQuery} placeholder="Search activity" label="Search activity" className={styles.search} />
        <SelectField label="Type" hideLabel value={table} onChange={(e) => setTable(e.target.value)} placeholder="All types" options={Object.entries(TABLES).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Person" hideLabel value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Everyone" options={actors.map((a) => ({ value: a, label: nameFor(a) }))} />
      </div>
      {audit.isPending ? (
        <Skeleton height={400} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<IconHistory />} title={audit.data?.length ? 'No matching activity' : 'No activity yet'}>
          {audit.data?.length ? 'Try a different search or filter.' : 'Changes appear here as people use the system.'}
        </EmptyState>
      ) : (
        <>
          {byDay.map(([day, entries]) => (
            <section key={day} className={styles.day} aria-labelledby={`d-${day}`}>
              <h2 id={`d-${day}`} className={styles.dayTitle}>{day}</h2>
              <ol className={styles.list}>
                {entries.map((a) => {
                  const d = describe(a);
                  const who = nameFor(a.actor_email);
                  return (
                    <li key={a.id} className={styles.entry}>
                      <Avatar name={who} size={28} />
                      <div className={styles.text}>
                        <p>
                          <strong>{who}</strong> {d.verb} {d.href ? <Link to={d.href}>{d.subject}</Link> : <strong>{d.subject}</strong>}
                        </p>
                        {d.changes.filter(Boolean).length > 0 && (
                          <ul className={styles.changes}>
                            {d.changes.filter(Boolean).map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <time dateTime={a.created_at} title={formatDateTime(a.created_at)} className={styles.time}>
                        {relativeTime(a.created_at)}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {(audit.data?.length ?? 0) >= limit && (
            <Button variant="secondary" onClick={() => setLimit((l) => l + 200)} loading={audit.isFetching}>
              Load older activity
            </Button>
          )}
        </>
      )}
    </>
  );
}
