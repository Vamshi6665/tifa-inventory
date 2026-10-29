import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconFileSpreadsheet, IconPrinter, IconFileTypeCsv } from '@tabler/icons-react';
import { toast } from 'sonner';
import { Button, PageHeader, SelectField, TextField } from '@/design-system';
import { useAudit, useCounts, useItemRows, useOrders, useSuppliers } from '@/data/hooks';
import { useRestock } from '@/data/derived';
import { useAuth } from '@/features/auth/AuthProvider';
import { downloadCSV, downloadXLSX, fileStamp, type Cell } from '@/lib/csv';
import { STATE_LABEL } from '@/domain/quantity';
import { REASON_LABEL } from '@/domain/reorder';
import { STATUS_LABEL } from '@/domain/types';
import { addDays, formatDate, isoDate } from '@/domain/dates';
import { PO_STATUS } from '@/features/orders/OrdersPage';
import type { ItemRow } from '@/data/hooks';
import styles from './Reports.module.css';

const ITEM_HEADERS = ['Item', 'Category', 'Group', 'On hand', 'Par', 'Stock', 'Status', 'Supplier', 'Last confirmed', 'Last changed'];
const itemCells = (r: ItemRow): Cell[] => [r.name, r.category, r.subcategory, r.current_value, r.par_level, STATE_LABEL[r.state], STATUS_LABEL[r.status], r.supplier, r.last_verified_at ? new Date(r.last_verified_at) : null, new Date(r.updated_at)];

export default function ReportsPage() {
  const { can } = useAuth();
  const { rows } = useItemRows();
  const counts = useCounts();
  const orders = useOrders();
  const suppliers = useSuppliers();
  const audit = useAudit(2000, can('audit:read'));
  const { suggestions } = useRestock();
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  const [category, setCategory] = useState('');
  const [printCat, setPrintCat] = useState('');
  const [from, setFrom] = useState(isoDate(addDays(new Date(), -30)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [printing, setPrinting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => void | Promise<void>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
    } catch {
      toast.error('Export failed. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const fullWorkbook = () =>
    downloadXLSX(`tifa-inventory-${fileStamp()}.xlsx`, [
      { name: 'All items', headers: ITEM_HEADERS, rows: rows.map(itemCells) },
      ...categories.map((c) => ({ name: c, headers: ITEM_HEADERS, rows: rows.filter((r) => r.category === c).map(itemCells) })),
    ]);

  const categoryWorkbook = () => downloadXLSX(`${category.toLowerCase().replace(/\W+/g, '-')}-${fileStamp()}.xlsx`, [{ name: category, headers: ITEM_HEADERS, rows: rows.filter((r) => r.category === category).map(itemCells) }]);

  const historyCsv = () => {
    const names = new Map(rows.map((r) => [r.id, r]));
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    const list = (counts.data ?? []).filter((c) => new Date(c.counted_at) >= start && new Date(c.counted_at) <= end);
    if (!list.length) throw new Error('empty');
    downloadCSV(`count-history-${from}-to-${to}.csv`, ['Date', 'Item', 'Category', 'Count', 'Recorded by', 'Source', 'Note'], list.map((c) => [new Date(c.counted_at), names.get(c.item_id)?.name ?? `Item ${c.item_id}`, names.get(c.item_id)?.category, c.value, c.recorded_by, c.source, c.note]));
  };

  const reorderXlsx = () =>
    downloadXLSX(`reorder-${fileStamp()}.xlsx`, [{ name: 'Reorder', headers: ['Item', 'Category', 'Supplier', 'Reason', 'On hand', 'Par', 'Used per day', 'Suggested order', 'Runs out'], rows: suggestions.map((s) => [s.item.name, s.item.category, s.item.supplier, REASON_LABEL[s.reason], s.item.current_value, s.item.par_level, s.forecast.dailyRate, s.forecast.suggestedQty, s.forecast.runsOutOn]) }]);

  const ordersXlsx = () => {
    const name = (id: number) => suppliers.data?.find((s) => s.id === id)?.name ?? '';
    const item = (id: number) => rows.find((r) => r.id === id)?.name ?? `Item ${id}`;
    return downloadXLSX(`purchase-orders-${fileStamp()}.xlsx`, [
      { name: 'Orders', headers: ['Order', 'Supplier', 'Status', 'Created', 'Sent', 'Expected', 'Received', 'Lines'], rows: (orders.data ?? []).map((o) => [o.number, name(o.supplier_id), PO_STATUS[o.status].label, new Date(o.created_at), o.sent_at ? new Date(o.sent_at) : null, o.expected_on, o.received_at ? new Date(o.received_at) : null, o.lines.length]) },
      { name: 'Lines', headers: ['Order', 'Item', 'Ordered', 'Received'], rows: (orders.data ?? []).flatMap((o) => o.lines.map((l) => [o.number, item(l.item_id), l.quantity, l.received_quantity])) },
    ]);
  };

  const auditCsv = () => downloadCSV(`activity-log-${fileStamp()}.csv`, ['When', 'Who', 'Table', 'Record', 'Action', 'Changes'], (audit.data ?? []).map((a) => [new Date(a.created_at), a.actor_email, a.table_name, a.record_id, a.action, a.changed ? JSON.stringify(a.changed) : '']));

  return (
    <>
      <PageHeader title="Reports" description="Exports for spreadsheets and accountants, and printable sheets for counting on paper." />

      <Group title="Stock">
        <ReportRow title="Full inventory workbook" body="Every item, one sheet per category plus an all-items sheet." action={<Button icon={<IconFileSpreadsheet />} loading={busy === 'full'} onClick={() => void run('full', fullWorkbook, 'Inventory workbook downloaded')}>Download Excel</Button>} />
        <ReportRow
          title="One category"
          body="Just the items in a single category."
          action={
            <div className={styles.inline}>
              <SelectField label="Category to export" hideLabel size="sm" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Choose a category" options={categories.map((c) => ({ value: c, label: c }))} />
              <Button icon={<IconFileSpreadsheet />} disabled={!category} loading={busy === 'cat'} onClick={() => void run('cat', categoryWorkbook, `${category} downloaded`)}>Download</Button>
            </div>
          }
        />
        <ReportRow
          title="Printable count sheet"
          body="A checklist with last count and par, for counting without a phone."
          action={
            <div className={styles.inline}>
              <SelectField label="Category to print" hideLabel size="sm" value={printCat} onChange={(e) => setPrintCat(e.target.value)} placeholder="All categories" options={categories.map((c) => ({ value: c, label: c }))} />
              <Button icon={<IconPrinter />} onClick={() => setPrinting(printCat || 'all')}>Print</Button>
            </div>
          }
        />
        <ReportRow title="Reorder list" body={`${suggestions.length} items with suggested quantities and run-out dates.`} action={<Button icon={<IconFileSpreadsheet />} disabled={!suggestions.length} loading={busy === 'reorder'} onClick={() => void run('reorder', reorderXlsx, 'Reorder list downloaded')}>Download Excel</Button>} />
      </Group>

      <Group title="History">
        <ReportRow
          title="Count history"
          body="Every count in a date range, including deliveries. Up to the last six months."
          action={
            <div className={styles.inline}>
              <TextField label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <TextField label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              <Button icon={<IconFileTypeCsv />} loading={busy === 'hist'} onClick={() => { setBusy('hist'); try { historyCsv(); toast.success('Count history downloaded'); } catch { toast.error('No counts in that date range.'); } finally { setBusy(null); } }}>Download CSV</Button>
            </div>
          }
        />
        {can('purchasing:view') && <ReportRow title="Purchase orders" body="All orders with a second sheet of line items." action={<Button icon={<IconFileSpreadsheet />} loading={busy === 'po'} onClick={() => void run('po', ordersXlsx, 'Orders downloaded')}>Download Excel</Button>} />}
        {can('audit:read') && <ReportRow title="Activity log" body="Who changed what and when, for the last 2,000 changes." action={<Button icon={<IconFileTypeCsv />} loading={busy === 'audit'} onClick={() => void run('audit', auditCsv, 'Activity log downloaded')}>Download CSV</Button>} />}
      </Group>

      {printing && <PrintSheet category={printing} rows={rows} onDone={() => setPrinting(null)} />}
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = `rg-${title}`;
  return (
    <section className={styles.group} aria-labelledby={id}>
      <h2 id={id} className={styles.groupTitle}>{title}</h2>
      <ul role="list" className={styles.list}>{children}</ul>
    </section>
  );
}

function ReportRow({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.body}>{body}</p>
      </div>
      <div className={styles.action}>{action}</div>
    </li>
  );
}

function PrintSheet({ category, rows, onDone }: { category: string; rows: ItemRow[]; onDone: () => void }) {
  const list = rows.filter((r) => r.status !== 'discontinued' && (category === 'all' || r.category === category)).sort((a, b) => a.category.localeCompare(b.category) || (a.subcategory ?? '').localeCompare(b.subcategory ?? '') || a.name.localeCompare(b.name));
  useEffect(() => {
    document.body.classList.add('printing');
    const after = () => {
      document.body.classList.remove('printing');
      onDone();
    };
    window.addEventListener('afterprint', after, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
      document.body.classList.remove('printing');
    };
  }, [onDone]);
  return createPortal(
    <div className={styles.print}>
      <h1>Count sheet: {category === 'all' ? 'all categories' : category}</h1>
      <p>Printed {formatDate(new Date())}. Counted by: ____________________</p>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Group</th>
            <th>Last count</th>
            <th>Par</th>
            <th>New count</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.subcategory}</td>
              <td>{r.current_value}</td>
              <td>{r.par_level}</td>
              <td className={styles.blank} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
    document.body,
  );
}
