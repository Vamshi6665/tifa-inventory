import { useRef, type ReactNode } from 'react';
import { AlertDialog, Dialog as RDialog, DropdownMenu, Popover as RPopover, Tooltip as RTooltip } from 'radix-ui';
import { IconX } from '@tabler/icons-react';
import styles from './Overlay.module.css';
import { cx } from '@/lib/cx';
import { Button } from './Button';

/* ---------------- Dialog ---------------- */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Side sheet instead of centred dialog. */
  variant?: 'center' | 'sheet';
}

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', variant = 'center' }: DialogProps) {
  // Element that had focus before opening; focus goes back there on close (WCAG 2.4.3).
  const returnTo = useRef<HTMLElement | null>(null);
  if (open && !returnTo.current && typeof document !== 'undefined') returnTo.current = document.activeElement as HTMLElement | null;
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className={styles.overlay} />
        <RDialog.Content
          className={cx(styles.content, variant === 'sheet' ? styles.sheet : styles.center, styles[size])}
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            // Focus the field marked data-autofocus, or the dialog itself so reading starts at the title.
            // (A React autoFocus would make Radix return focus to the field, not the trigger, on close.)
            e.preventDefault();
            const root = e.currentTarget as HTMLElement | null;
            (root?.querySelector<HTMLElement>('[data-autofocus]') ?? root)?.focus();
          }}
          onCloseAutoFocus={(e) => {
            const target = returnTo.current;
            returnTo.current = null;
            if (target && target.isConnected && target !== document.body) {
              e.preventDefault();
              target.focus();
            }
          }}
        >
          <header className={styles.header}>
            <div className={styles.titles}>
              <RDialog.Title className={styles.title}>{title}</RDialog.Title>
              {description ? <RDialog.Description className={styles.description}>{description}</RDialog.Description> : <RDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RDialog.Description>}
            </div>
            <RDialog.Close asChild>
              <button type="button" className={styles.close} aria-label="Close">
                <IconX aria-hidden="true" />
              </button>
            </RDialog.Close>
          </header>
          <div className={styles.body}>{children}</div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/* ---------------- Confirm ---------------- */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, danger, loading }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: ReactNode; confirmLabel: string; onConfirm: () => void; danger?: boolean; loading?: boolean }) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content className={cx(styles.content, styles.center, styles.sm)}>
          <div className={styles.body}>
            <AlertDialog.Title className={styles.title}>{title}</AlertDialog.Title>
            <AlertDialog.Description className={styles.confirmText}>{description}</AlertDialog.Description>
          </div>
          <footer className={styles.footer}>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AlertDialog.Cancel>
            <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </footer>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/* ---------------- Menu ---------------- */
export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

export function Menu({ trigger, items, align = 'end', label }: { trigger: ReactNode; items: Array<MenuItem | 'separator'>; align?: 'start' | 'end'; label?: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align={align} sideOffset={6} aria-label={label}>
          {items.map((item, i) =>
            item === 'separator' ? (
              <DropdownMenu.Separator key={`sep-${i}`} className={styles.separator} />
            ) : (
              <DropdownMenu.Item key={item.label} className={cx(styles.menuItem, item.danger && styles.menuDanger)} onSelect={item.onSelect} disabled={item.disabled}>
                {item.icon && <span className={styles.menuIcon} aria-hidden="true">{item.icon}</span>}
                <span className={styles.menuLabel}>{item.label}</span>
                {item.shortcut && <span className={styles.menuShortcut}>{item.shortcut}</span>}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export const MenuPrimitives = DropdownMenu;
export const menuStyles = styles;

/* ---------------- Tooltip ---------------- */
export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className={styles.tooltip} side={side} sideOffset={6}>
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
export const TooltipProvider = RTooltip.Provider;

/* ---------------- Popover ---------------- */
export function Popover({ trigger, children, align = 'end', open, onOpenChange, label, width = 320 }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; open?: boolean; onOpenChange?: (o: boolean) => void; label: string; width?: number }) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content className={styles.popover} align={align} sideOffset={8} aria-label={label} style={{ width }} collisionPadding={12}>
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}
