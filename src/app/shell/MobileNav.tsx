import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { IconDots } from '@tabler/icons-react';
import { Dialog } from '@/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { cx } from '@/lib/cx';
import { ALL_NAV } from '../nav';
import { useNavBadges } from './useNavBadges';
import styles from './MobileNav.module.css';

const PRIMARY = ['/', '/inventory', '/count', '/reorder'];

/** Phones: four destinations in thumb reach, the rest one tap away. */
export function MobileNav() {
  const { can } = useAuth();
  const badges = useNavBadges();
  const [more, setMore] = useState(false);
  const location = useLocation();
  const allowed = ALL_NAV.filter((i) => !i.requires || can(i.requires));
  const primary = PRIMARY.map((p) => allowed.find((i) => i.to === p)).filter((x): x is NonNullable<typeof x> => !!x);
  const rest = allowed.filter((i) => !PRIMARY.includes(i.to));
  const moreActive = rest.some((i) => location.pathname.startsWith(i.to));

  return (
    <>
      <nav className={styles.bar} aria-label="Primary">
        <ul role="list" className={styles.list}>
          {primary.map((item) => {
            const Icon = item.icon;
            const badge = item.badge ? badges[item.badge] : 0;
            return (
              <li key={item.to}>
                <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => cx(styles.tab, isActive && styles.active, item.to === '/count' && styles.primary)}>
                  <span className={styles.iconWrap}>
                    <Icon aria-hidden="true" stroke={1.75} />
                    {badge > 0 && <span className={styles.badge} aria-hidden="true" />}
                  </span>
                  <span className={styles.label}>{item.to === '/count' ? 'Count' : item.label}</span>
                  {badge > 0 && <span className="sr-only">, {badge} pending</span>}
                </NavLink>
              </li>
            );
          })}
          <li>
            <button type="button" className={cx(styles.tab, moreActive && styles.active)} onClick={() => setMore(true)} aria-haspopup="dialog">
              <span className={styles.iconWrap}>
                <IconDots aria-hidden="true" />
              </span>
              <span className={styles.label}>More</span>
            </button>
          </li>
        </ul>
      </nav>
      <Dialog open={more} onOpenChange={setMore} title="More">
        <ul role="list" className={styles.moreList}>
          {rest.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink to={item.to} className={({ isActive }) => cx(styles.moreLink, isActive && styles.moreActive)} onClick={() => setMore(false)}>
                  <Icon aria-hidden="true" stroke={1.75} />
                  <span>
                    <span className={styles.moreLabel}>{item.label}</span>
                    <span className={styles.moreDesc}>{item.description}</span>
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
