import { useState } from 'react';
import { Link } from 'react-router';
import { IconBell, IconBellCheck } from '@tabler/icons-react';
import { IconButton, Button, EmptyState } from '@/design-system';
import { Popover } from '@/design-system';
import { useNotifications } from '@/data/derived';
import { usePreferences } from '@/stores/preferences';
import { relativeTime } from '@/domain/dates';
import { cx } from '@/lib/cx';
import styles from './Notifications.module.css';

export function NotificationsButton() {
  const all = useNotifications();
  const dismissed = usePreferences((s) => s.dismissedNotifications);
  const setPref = usePreferences((s) => s.set);
  const [open, setOpen] = useState(false);
  const unread = all.filter((n) => !dismissed.includes(n.id));

  const markAllRead = () => setPref('dismissedNotifications', [...new Set([...dismissed, ...all.map((n) => n.id)])].slice(-500));

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Notifications"
      width={380}
      trigger={<IconButton label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'} icon={<IconBell />} indicator={unread.length > 0} />}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Notifications</h2>
        {unread.length > 0 && (
          <Button size="sm" variant="ghost" icon={<IconBellCheck />} onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>
      {all.length === 0 ? (
        <EmptyState icon={<IconBell />} title="You’re all caught up">
          Low stock, overdue orders and deliveries due today show up here.
        </EmptyState>
      ) : (
        <ul role="list" className={styles.list}>
          {all.map((n) => {
            const isUnread = !dismissed.includes(n.id);
            return (
              <li key={n.id}>
                <Link to={n.to} className={cx(styles.item, isUnread && styles.unread)} onClick={() => setOpen(false)}>
                  <span className={cx(styles.tone, styles[n.tone])} aria-hidden="true" />
                  <span className={styles.body}>
                    <span className={styles.itemTitle}>
                      {isUnread && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    {n.detail && <span className={styles.detail}>{n.detail}</span>}
                    <span className={styles.time}>{relativeTime(n.at)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}
