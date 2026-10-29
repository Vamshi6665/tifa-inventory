import { useNavigate } from 'react-router';
import { IconSearch, IconSun, IconMoon, IconDeviceDesktop, IconSparkles, IconLogout, IconSettings, IconCheck } from '@tabler/icons-react';
import { IconButton, Kbd, Menu, Avatar, Badge, MenuPrimitives, menuStyles } from '@/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { useData } from '@/data/DataProvider';
import { usePreferences, type ThemePref } from '@/stores/preferences';
import { ROLE_LABEL } from '@/domain/permissions';
import { modKey } from '@/lib/useHotkeys';
import { NotificationsButton } from './Notifications';
import { Logo } from './Logo';
import styles from './Topbar.module.css';

const THEME_ICON = { system: IconDeviceDesktop, light: IconSun, dark: IconMoon } as const;
const THEME_LABEL = { system: 'Match system', light: 'Light', dark: 'Dark' } as const;

export function Topbar({ onOpenPalette, onOpenAssistant }: { onOpenPalette: () => void; onOpenAssistant: () => void }) {
  const { profile, user, signOut } = useAuth();
  const data = useData();
  const theme = usePreferences((s) => s.theme);
  const setPref = usePreferences((s) => s.set);
  const navigate = useNavigate();
  const ThemeIcon = THEME_ICON[theme];
  const name = profile?.display_name ?? user?.name ?? user?.email ?? 'You';

  return (
    <header className={styles.topbar}>
      <span className={styles.mobileLogo}>
        <Logo />
      </span>
      <button type="button" className={styles.search} onClick={onOpenPalette} aria-keyshortcuts="Meta+K Control+K">
        <IconSearch aria-hidden="true" />
        <span className={styles.searchText}>Search items, pages, actions…</span>
        <span className={styles.searchKeys} aria-hidden="true">
          <Kbd>{modKey}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className={styles.actions}>
        {data.kind === 'demo' && (
          <Badge tone="info" className={styles.demo}>
            Demo data
          </Badge>
        )}
        <IconButton label={`Ask about your inventory (${modKey}J)`} icon={<IconSparkles />} onClick={onOpenAssistant} />
        <NotificationsButton />
        <MenuPrimitives.Root>
          <MenuPrimitives.Trigger asChild>
            <IconButton label="Change theme" icon={<ThemeIcon />} />
          </MenuPrimitives.Trigger>
          <MenuPrimitives.Portal>
            <MenuPrimitives.Content className={menuStyles.menu} align="end" sideOffset={6} aria-label="Theme">
              <MenuPrimitives.RadioGroup value={theme} onValueChange={(v) => setPref('theme', v as ThemePref)}>
                {(['system', 'light', 'dark'] as const).map((t) => {
                  const I = THEME_ICON[t];
                  return (
                    <MenuPrimitives.RadioItem key={t} value={t} className={menuStyles.menuItem}>
                      <span className={menuStyles.menuIcon} aria-hidden="true">
                        <I />
                      </span>
                      <span className={menuStyles.menuLabel}>{THEME_LABEL[t]}</span>
                      <MenuPrimitives.ItemIndicator className={menuStyles.menuShortcut}>
                        <IconCheck size={14} aria-hidden="true" />
                      </MenuPrimitives.ItemIndicator>
                    </MenuPrimitives.RadioItem>
                  );
                })}
              </MenuPrimitives.RadioGroup>
            </MenuPrimitives.Content>
          </MenuPrimitives.Portal>
        </MenuPrimitives.Root>
        <Menu
          label="Account"
          trigger={
            <button type="button" className={styles.user} aria-label={`Account: ${name}`}>
              <Avatar name={name} size={28} />
            </button>
          }
          items={[
            { label: profile ? `${name} (${ROLE_LABEL[profile.role]})` : name, onSelect: () => navigate('/settings'), disabled: true },
            'separator',
            { label: 'Settings', icon: <IconSettings />, onSelect: () => navigate('/settings') },
            { label: 'Sign out', icon: <IconLogout />, onSelect: () => void signOut().then(() => navigate('/login')) },
          ]}
        />
      </div>
    </header>
  );
}
