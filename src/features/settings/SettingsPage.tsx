import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconDeviceDesktop, IconSun, IconMoon, IconTrash, IconRefresh, IconLogout, IconKey } from '@tabler/icons-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, IconButton, Kbd, PageHeader, Segmented, Switch } from '@/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { useData } from '@/data/DataProvider';
import { usePreferences, type ThemePref } from '@/stores/preferences';
import { useViews } from '@/stores/views';
import { ROLE_LABEL } from '@/domain/permissions';
import { modKey } from '@/lib/useHotkeys';
import { formatDate } from '@/domain/dates';
import styles from './Settings.module.css';

export default function SettingsPage() {
  const prefs = usePreferences();
  const views = useViews((s) => s.views);
  const removeView = useViews((s) => s.remove);
  const { profile, user, signOut } = useAuth();
  const data = useData();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <PageHeader title="Settings" description="Preferences are saved on this device." />
      <div className={styles.layout}>
        <Section title="Appearance" description="Match your system, or pick light or dark.">
          <Row label="Theme">
            <Segmented<ThemePref>
              label="Theme"
              value={prefs.theme}
              onChange={(v) => prefs.set('theme', v)}
              options={[
                { value: 'system', label: 'System', icon: <IconDeviceDesktop /> },
                { value: 'light', label: 'Light', icon: <IconSun /> },
                { value: 'dark', label: 'Dark', icon: <IconMoon /> },
              ]}
            />
          </Row>
          <Row label="Table row height">
            <Segmented label="Table row height" value={prefs.density} onChange={(v) => prefs.set('density', v)} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
          </Row>
          <Switch id="reduce-motion" label="Reduce motion" description="Turns off animations even if your system allows them." checked={prefs.reduceMotion} onCheckedChange={(v) => prefs.set('reduceMotion', v)} />
        </Section>

        <Section title="Overview and notifications">
          <Row label="Overview widgets" hint={`${prefs.widgets.length - prefs.hiddenWidgets.length} of ${prefs.widgets.length} showing`}>
            <Button onClick={() => navigate('/')}>Customize on the overview</Button>
          </Row>
          <Row label="Dismissed notifications" hint={`${prefs.dismissedNotifications.length} hidden`}>
            <Button onClick={() => { prefs.set('dismissedNotifications', []); toast.success('Notifications restored'); }} disabled={!prefs.dismissedNotifications.length}>
              Show them again
            </Button>
          </Row>
        </Section>

        <Section title="Saved table views" description="Search, filters, sorting and columns you saved on tables.">
          {views.length ? (
            <ul role="list" className={styles.views}>
              {views.map((v) => (
                <li key={v.id} className={styles.view}>
                  <span>
                    <span className={styles.viewName}>{v.name}</span>
                    <span className={styles.hint}>
                      {v.gridId} table, saved {formatDate(v.createdAt)}
                    </span>
                  </span>
                  <IconButton label={`Delete view ${v.name}`} icon={<IconTrash />} onClick={() => removeView(v.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.hint}>No saved views yet. Use the Views button above any table to save one.</p>
          )}
        </Section>

        <Section title="Keyboard shortcuts">
          <table className={styles.keys}>
            <caption className="sr-only">Keyboard shortcuts</caption>
            <tbody>
              {[
                [[modKey, 'K'], 'Search items, pages and actions'],
                [['/'], 'Open search'],
                [[modKey, 'J'], 'Ask about your inventory'],
                [['↑', '↓'], 'Move between table rows (also J and K)'],
                [['Enter'], 'Open the focused row'],
                [['Space'], 'Select the focused row (Shift for a range)'],
                [['Esc'], 'Close dialogs, clear selection'],
              ].map(([keys, what]) => (
                <tr key={what as string}>
                  <td className={styles.keyCell}>
                    {(keys as string[]).map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </td>
                  <td>{what as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Account">
          <dl className={styles.account}>
            <dt>Signed in as</dt>
            <dd>{user?.email}</dd>
            <dt>Role</dt>
            <dd>{profile ? ROLE_LABEL[profile.role] : '—'}</dd>
            <dt>Categories</dt>
            <dd>{profile?.role === 'admin' || profile?.categories == null ? 'All' : profile.categories.join(', ') || 'None yet'}</dd>
          </dl>
          <div className={styles.buttons}>
            {data.kind === 'supabase' && user?.email && (
              <Button icon={<IconKey />} onClick={() => void data.sendPasswordReset(user.email).then(() => toast.success('Check your email for a reset link.'))}>
                Change password
              </Button>
            )}
            <Button icon={<IconLogout />} onClick={() => void signOut().then(() => navigate('/login'))}>
              Sign out
            </Button>
          </div>
        </Section>

        {data.kind === 'demo' && (
          <Section title="Demo data" description="This demo stores changes in your browser. Reset to start over with fresh sample data.">
            <Button variant="danger" icon={<IconRefresh />} onClick={() => setConfirmReset(true)}>
              Reset demo data
            </Button>
          </Section>
        )}
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        danger
        title="Reset demo data?"
        description="Everything you changed in the demo goes back to the sample data."
        confirmLabel="Reset"
        onConfirm={() => {
          (data as unknown as { reset?: () => void }).reset?.();
          void qc.invalidateQueries();
          setConfirmReset(false);
          toast.success('Demo data reset');
        }}
      />
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = `s-${title.replace(/\W+/g, '-')}`;
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        <h2 id={id} className={styles.title}>{title}</h2>
        {description && <p className={styles.hint}>{description}</p>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <div>
        <div className={styles.rowLabel}>{label}</div>
        {hint && <div className={styles.hint}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}
