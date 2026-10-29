import { NavLink } from 'react-router';
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePreferences } from '@/stores/preferences';
import { Tooltip } from '@/design-system';
import { cx } from '@/lib/cx';
import { NAV, NAV_FOOTER, type NavItem } from '../nav';
import { useNavBadges } from './useNavBadges';
import { Logo } from './Logo';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const { can } = useAuth();
  const collapsed = usePreferences((s) => s.sidebarCollapsed);
  const setPref = usePreferences((s) => s.set);
  const badges = useNavBadges();
  const visible = (i: NavItem) => !i.requires || can(i.requires);

  return (
    <aside className={cx(styles.sidebar, collapsed && styles.collapsed)} aria-label="Main">
      <div className={styles.brand}>
        <NavLink to="/" className={styles.brandLink} aria-label="Tifa Inventory home">
          <span className={styles.brandFull}>
            <Logo withName />
          </span>
          <span className={styles.brandMark}>
            <Logo />
          </span>
        </NavLink>
      </div>
      <nav className={styles.nav} aria-label="Primary">
        {NAV.map((group) => {
          const items = group.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={group.label} className={styles.group}>
              <p className={styles.groupLabel} id={`nav-${group.label}`}>
                {group.label}
              </p>
              <ul role="list" aria-labelledby={`nav-${group.label}`}>
                {items.map((item) => (
                  <li key={item.to}>
                    <SideLink item={item} badge={item.badge ? badges[item.badge] : 0} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className={styles.footer}>
        <ul role="list">
          {NAV_FOOTER.filter(visible).map((item) => (
            <li key={item.to}>
              <SideLink item={item} badge={0} collapsed={collapsed} />
            </li>
          ))}
        </ul>
        <button type="button" className={styles.collapse} onClick={() => setPref('sidebarCollapsed', !collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
          {collapsed ? <IconLayoutSidebarLeftExpand aria-hidden="true" /> : <IconLayoutSidebarLeftCollapse aria-hidden="true" />}
          <span className={styles.collapseLabel}>Collapse</span>
        </button>
      </div>
    </aside>
  );
}

function SideLink({ item, badge, collapsed }: { item: NavItem; badge: number; collapsed: boolean }) {
  const Icon = item.icon;
  const link = (
    <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => cx(styles.link, isActive && styles.active)} aria-label={collapsed ? `${item.label}${badge ? `, ${badge}` : ''}` : undefined}>
      <Icon className={styles.icon} aria-hidden="true" stroke={1.75} />
      <span className={styles.label}>{item.label}</span>
      {badge > 0 && (
        <span className={styles.badge} aria-label={`${badge} pending`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}
