import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router';
import { IconPlus, IconClipboardCheck, IconFileInvoice, IconSparkles, IconMoon, IconSun, IconLogout, IconDownload, IconPackage } from '@tabler/icons-react';
import { useItemRows } from '@/data/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePreferences } from '@/stores/preferences';
import { highlight, rank, score } from '@/domain/search';
import { StockBadge } from '@/design-system';
import { ALL_NAV } from '../nav';
import styles from './CommandPalette.module.css';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenAssistant: () => void;
}

export function CommandPalette({ open, onOpenChange, onOpenAssistant }: Props) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { can, signOut } = useAuth();
  const { rows } = useItemRows();
  const setPref = usePreferences((s) => s.set);
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

  const items = useMemo(() => (query.trim() ? rank(rows, query, (i) => [i.name, i.category, i.subcategory ?? '', i.supplier ?? ''], 8) : []), [rows, query]);
  const pages = ALL_NAV.filter((p) => (!p.requires || can(p.requires)) && (!query.trim() || score(`${p.label} ${p.description}`, query) > 0));

  const actions = [
    { id: 'add-item', label: 'Add an item', icon: IconPlus, run: () => navigate('/inventory?new=1'), show: can('item:create') },
    { id: 'count', label: 'Start a stock count', icon: IconClipboardCheck, run: () => navigate('/count'), show: can('item:count') },
    { id: 'po', label: 'Create a purchase order', icon: IconFileInvoice, run: () => navigate('/orders?new=1'), show: can('po:manage') },
    { id: 'export', label: 'Export inventory', icon: IconDownload, run: () => navigate('/reports'), show: can('export') },
    { id: 'ask', label: 'Ask about your inventory', icon: IconSparkles, run: onOpenAssistant, show: true },
    { id: 'theme', label: isDark ? 'Switch to light theme' : 'Switch to dark theme', icon: isDark ? IconSun : IconMoon, run: () => setPref('theme', isDark ? 'light' : 'dark'), show: true },
    { id: 'signout', label: 'Sign out', icon: IconLogout, run: () => void signOut().then(() => navigate('/login')), show: true },
  ].filter((a) => a.show && (!query.trim() || score(a.label, query) > 0));

  const go = (fn: () => void) => {
    onOpenChange(false);
    setQuery('');
    fn();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery('');
      }}
      label="Search items, pages and actions"
      shouldFilter={false}
      loop
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
      className={styles.command}
    >
      <Command.Input value={query} onValueChange={setQuery} placeholder="Search items, pages, actions…" className={styles.input} />
      <Command.List className={styles.list}>
        <Command.Empty className={styles.empty}>Nothing matches “{query}”. Try an item name, a category or a supplier.</Command.Empty>
        {items.length > 0 && (
          <Command.Group heading="Items" className={styles.group}>
            {items.map((i) => (
              <Command.Item key={`item-${i.id}`} value={`item-${i.id}`} onSelect={() => go(() => navigate(`/inventory/${i.id}`))} className={styles.item}>
                <IconPackage className={styles.icon} aria-hidden="true" />
                <span className={styles.main}>
                  <span className={styles.label}>
                    {highlight(i.name, query).map((s, k) => (s.match ? <mark key={k}>{s.text}</mark> : <span key={k}>{s.text}</span>))}
                  </span>
                  <span className={styles.sub}>
                    {i.category}
                    {i.current_value ? ` — ${i.current_value} on hand` : ''}
                  </span>
                </span>
                <StockBadge state={i.state} compact />
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {pages.length > 0 && (
          <Command.Group heading="Go to" className={styles.group}>
            {pages.map((p) => {
              const Icon = p.icon;
              return (
                <Command.Item key={p.to} value={`page-${p.to}`} onSelect={() => go(() => navigate(p.to))} className={styles.item}>
                  <Icon className={styles.icon} aria-hidden="true" stroke={1.75} />
                  <span className={styles.main}>
                    <span className={styles.label}>{p.label}</span>
                    <span className={styles.sub}>{p.description}</span>
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}
        {actions.length > 0 && (
          <Command.Group heading="Actions" className={styles.group}>
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <Command.Item key={a.id} value={`action-${a.id}`} onSelect={() => go(a.run)} className={styles.item}>
                  <Icon className={styles.icon} aria-hidden="true" stroke={1.75} />
                  <span className={styles.label}>{a.label}</span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}
      </Command.List>
      <div className={styles.footer} aria-hidden="true">
        <span>↑↓ to move</span>
        <span>↵ to open</span>
        <span>esc to close</span>
      </div>
    </Command.Dialog>
  );
}
