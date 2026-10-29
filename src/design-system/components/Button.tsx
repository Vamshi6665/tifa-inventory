import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import styles from './Button.module.css';
import { cx } from '@/lib/cx';
import { Spinner } from './Display';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  loading?: boolean;
  block?: boolean;
  /** Render the child element (e.g. a router Link) with button styling. */
  asChild?: boolean;
  /** Small dot in the corner, e.g. unread notifications (describe it in the label too). */
  indicator?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconEnd, loading, block, asChild, indicator, className, children, disabled, type, ...rest },
  ref,
) {
  const classes = cx(styles.button, styles[variant], styles[size], block && styles.block, loading && styles.loading, className);
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...rest}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button ref={ref} type={type ?? 'button'} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={14} label="" /> : icon}
      {children != null && <span className={styles.label}>{children}</span>}
      {iconEnd}
      {indicator && <span className={styles.indicator} aria-hidden="true" />}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconEnd'> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, icon, variant = 'ghost', size = 'md', className, ...rest }, ref) {
  return (
    <Button ref={ref} variant={variant} size={size} aria-label={label} title={label} className={cx(styles.iconOnly, className)} icon={icon} {...rest} />
  );
});
