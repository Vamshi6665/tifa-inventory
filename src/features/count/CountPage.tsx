import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { IconCheck, IconCircleCheck, IconClipboardCheck } from '@tabler/icons-react';
import { Button, EmptyState, PageHeader, SearchInput, SelectField, StockBadge, Switch } from '@/design-system';
import { useItemRows, useRecordCount, useVerifyItems, type ItemRow } from '@/data/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { ageInDays, relativeTime } from '@/domain/dates';
import { isTracked } from '@/domain/quantity';
import { score } from '@/domain/search';
import { cx } from '@/lib/cx';
import { validateCount } from '@/features/inventory/validation';
import styles from './Count.module.css';

/**
 * Count mode: built for walking the shelves with a phone. Type a number and
 * press Enter (or Next) to save and jump to the next item; "Same" confirms
 * the existing count without changing it.
 */
export default function CountPage() {
  const { can } = useAuth();
  const { rows, isPending } = useItemRows();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [onlyStale, setOnlyStale] = useState(false);
  const [done, setDone] = useState<Map<number, 'counted' | 'confirmed'>>(new Map());
  const inputs = useRef(new Map<number, HTMLInputElement>());

  const countable = useMemo(() => rows.filter((r) => isTracked(r) && can('item:count', r)), [rows, can]);
  const categories = useMemo(() => [...new Set(countable.map((r) => r.category))].sort(), [countable]);
  const category = params.get('category') && categories.includes(params.get('category')!) ? params.get('category')! : categories[0] ?? '';

  const list = useMemo(
    () =>
      countable
        .filter((r) => r.category === category)
        .filter((r) => !onlyStale || (ageInDays(r.last_verified_at) ?? 999) > 7)
        .filter((r) => !query.trim() || score(`${r.name} ${r.subcategory ?? ''}`, query) > 0)
        .sort((a, b) => (a.subcategory ?? '').localeCompare(b.subcategory ?? '') || a.name.localeCompare(b.name)),
    [countable, category, onlyStale, query],
  );

  const groups = useMemo(() => {
    const m = new Map<string, ItemRow[]>();
    for (const r of list) {
      const k = r.subcategory || 'Other';
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [list]);

  const doneInView = list.filter((r) => done.has(r.id)).length;
  const pct = list.length ? Math.round((doneInView / list.length) * 100) : 0;

  const focusNext = (id: number) => {
    const idx = list.findIndex((r) => r.id === id);
    const next = list.slice(idx + 1).find((r) => !done.has(r.id)) ?? list.find((r) => !done.has(r.id) && r.id !== id);
    if (next) requestAnimationFrame(() => inputs.current.get(next.id)?.focus());
  };
  const mark = (id: number, kind: 'counted' | 'confirmed') => setDone((m) => new Map(m).set(id, kind));

  if (!isPending && countable.length === 0) {
    return (
      <>
        <PageHeader title="Stock count" />
        <EmptyState icon={<IconClipboardCheck />} title="No items to count">
          You don’t have counting access to any categories yet. Ask an admin to add you to one.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Stock count" description="Pick a category, then work down the list. Enter saves and moves to the next item." />

      <div className={styles.controls}>
        <SelectField label="Category" value={category} onChange={(e) => { setParams({ category: e.target.value }, { replace: true }); setQuery(''); }} options={categories.map((c) => ({ value: c, label: c }))} />
        <SearchInput value={query} onChange={setQuery} placeholder="Find in this category" label="Find an item in this category" className={styles.search} />
        <div className={styles.toggle}>
          <Switch id="only-stale" label="Only not counted this week" checked={onlyStale} onCheckedChange={setOnlyStale} />
        </div>
      </div>

      <div className={styles.progress} role="group" aria-label="Count progress">
        <div className={styles.progressText}>
          <strong>{doneInView}</strong> of {list.length} done in {category}
        </div>
        <div className={styles.progressBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${pct}% of ${category} done`}>
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </div>

      {groups.map(([group, items]) => (
        <section key={group} className={styles.group} aria-labelledby={`g-${group}`}>
          <h2 id={`g-${group}`} className={styles.groupTitle}>
            {group}
          </h2>
          <ul role="list" className={styles.list}>
            {items.map((r) => (
              <CountRow key={r.id} item={r} status={done.get(r.id)} inputRef={(el) => (el ? inputs.current.set(r.id, el) : inputs.current.delete(r.id))} onSaved={(kind) => { mark(r.id, kind); focusNext(r.id); }} />
            ))}
          </ul>
        </section>
      ))}
      {!isPending && list.length === 0 && (
        <EmptyState icon={<IconCircleCheck />} title={onlyStale ? 'Everything here was counted this week' : 'No items match'}>
          {onlyStale ? 'Turn off the filter to recount anyway.' : 'Try a different search.'}
        </EmptyState>
      )}

      {list.length > 0 && doneInView === list.length && (
        <div className={styles.finished} role="status">
          <IconCircleCheck aria-hidden="true" /> {category} is done. Pick another category to keep going.
        </div>
      )}
    </>
  );
}

function CountRow({ item, status, inputRef, onSaved }: { item: ItemRow; status?: 'counted' | 'confirmed'; inputRef: (el: HTMLInputElement | null) => void; onSaved: (kind: 'counted' | 'confirmed') => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const record = useRecordCount();
  const verify = useVerifyItems();
  const id = `count-${item.id}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      // Enter on an empty field = "still the same"
      if (item.current_value) {
        verify.mutate([item.id]);
        onSaved('confirmed');
      } else setError('Enter a count.');
      return;
    }
    const problem = validateCount(value);
    if (problem) return setError(problem);
    setError(null);
    record.mutate({ itemId: item.id, value: value.trim(), name: item.name });
    setValue('');
    onSaved('counted');
  };

  return (
    <li className={cx(styles.row, status && styles.rowDone)}>
      <form onSubmit={submit} className={styles.form} noValidate>
        <div className={styles.info}>
          <label htmlFor={id} className={styles.name}>
            {item.name}
          </label>
          <div className={styles.meta}>
            <span>
              Last: <strong>{item.current_value || '—'}</strong>
            </span>
            <span>Par {item.par_level ?? '—'}</span>
            <span>{item.last_verified_at ? relativeTime(item.last_verified_at) : 'never confirmed'}</span>
          </div>
        </div>
        <div className={styles.entry}>
          {status ? (
            <span className={styles.doneTag}>
              <IconCheck aria-hidden="true" /> {status === 'counted' ? 'Saved' : 'Confirmed'}
            </span>
          ) : (
            <StockBadge state={item.state} compact />
          )}
          <input
            ref={inputRef}
            id={id}
            className={cx(styles.input, error && styles.inputError)}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="New count"
            inputMode={item.unit_type === 'freeform' ? 'text' : 'decimal'}
            enterKeyHint="next"
            autoComplete="off"
            maxLength={120}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
          />
          <Button type="submit" size="sm" variant={value ? 'primary' : 'secondary'} aria-label={value ? `Save count for ${item.name}` : `Same count for ${item.name} (${item.current_value ?? 'none'})`} disabled={!value && !item.current_value}>
            {value ? 'Save' : 'Same'}
          </Button>
        </div>
        {error && (
          <p id={`${id}-err`} className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </li>
  );
}
