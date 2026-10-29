import { type HTMLAttributes, type ReactNode } from 'react';
import { Switch as RSwitch, Tabs as RTabs, ToggleGroup } from 'radix-ui';
import styles from './Display.module.css';
import { cx } from '@/lib/cx';
import { PAR_MARK, STATE_LABEL } from '@/domain/quantity';
import type { StockState } from '@/domain/types';

/* ---------------- Badge ---------------- */
export type Tone = 'neutral' | 'ok' | 'warning' | 'danger' | 'review' | 'info';

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx(styles.badge, styles[`tone_${tone}`], className)}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}

const STATE_TONE: Record<StockState, Tone> = { out: 'danger', low: 'warning', ok: 'ok', review: 'review', untracked: 'neutral' };
export function StockBadge({ state, compact }: { state: StockState; compact?: boolean }) {
  return (
    <Badge tone={STATE_TONE[state]} dot>
      {compact && state === 'untracked' ? 'No par' : STATE_LABEL[state]}
    </Badge>
  );
}

/* ---------------- Stock meter ("pan fill") ---------------- */
export function StockMeter({ level, state, label }: { level: number | null; state: StockState; label: string }) {
  if (level == null) {
    return <span className={cx(styles.meter, styles.meterEmpty)} role="img" aria-label={`${label}: level unknown`} />;
  }
  const tone = state === 'out' ? styles.meterOut : state === 'low' ? styles.meterLow : styles.meterOk;
  return (
    <span className={styles.meter} role="img" aria-label={`${label}: ${STATE_LABEL[state]}, ${Math.round((level / PAR_MARK) * 100)}% of par`}>
      <span className={cx(styles.meterFill, tone)} style={{ transform: `scaleX(${Math.max(level, 0.02)})` }} />
      <span className={styles.meterPar} style={{ left: `${PAR_MARK * 100}%` }} />
    </span>
  );
}

/* ---------------- Panel ---------------- */
export function Panel({ title, description, actions, children, className, padded = true, as: As = 'section', ...rest }: HTMLAttributes<HTMLElement> & { title?: ReactNode; description?: ReactNode; actions?: ReactNode; padded?: boolean; as?: 'section' | 'div' | 'article' }) {
  const headingId = rest.id ? `${rest.id}-title` : undefined;
  return (
    <As className={cx(styles.panel, className)} aria-labelledby={title ? headingId : undefined} {...rest}>
      {(title || actions) && (
        <header className={styles.panelHeader}>
          <div className={styles.panelTitles}>
            {title && <h2 id={headingId} className={styles.panelTitle}>{title}</h2>}
            {description && <p className={styles.panelDesc}>{description}</p>}
          </div>
          {actions && <div className={styles.panelActions}>{actions}</div>}
        </header>
      )}
      <div className={cx(padded && styles.panelBody)}>{children}</div>
    </As>
  );
}

/* ---------------- Stat ---------------- */
export function Stat({ label, value, hint, tone = 'neutral', onClick, active }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; onClick?: () => void; active?: boolean }) {
  const content = (
    <>
      <span className={styles.statLabel}>{label}</span>
      <span className={cx(styles.statValue, styles[`text_${tone}`])}>{value}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cx(styles.stat, styles.statButton, active && styles.statActive)} onClick={onClick} aria-pressed={active}>
        {content}
      </button>
    );
  }
  return <div className={styles.stat}>{content}</div>;
}

/* ---------------- Misc ---------------- */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

export function Spinner({ size = 16, label = 'Loading' }: { size?: number; label?: string }) {
  return (
    <span className={styles.spinner} style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} />
  );
}

export function Skeleton({ width, height = 14, radius, className }: { width?: number | string; height?: number | string; radius?: number; className?: string }) {
  return <span className={cx(styles.skeleton, className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.4 }} data-initials={initials || '?'} aria-hidden="true" />
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      {icon && <div className={styles.emptyIcon} aria-hidden="true">{icon}</div>}
      <h3 className={styles.emptyTitle}>{title}</h3>
      {children && <p className={styles.emptyText}>{children}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

/* ---------------- Switch ---------------- */
export function Switch({ checked, onCheckedChange, label, description, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean; id: string }) {
  return (
    <div className={styles.switchRow}>
      <div className={styles.switchText}>
        <label htmlFor={id} className={styles.switchLabel}>{label}</label>
        {description && <p id={`${id}-desc`} className={styles.switchDesc}>{description}</p>}
      </div>
      <RSwitch.Root id={id} className={styles.switch} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-describedby={description ? `${id}-desc` : undefined}>
        <RSwitch.Thumb className={styles.switchThumb} />
      </RSwitch.Root>
    </div>
  );
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; icon?: ReactNode; title?: string }>; label: string; size?: 'sm' | 'md' }) {
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v && onChange(v as T)} aria-label={label} className={cx(styles.segmented, size === 'sm' && styles.segmentedSm)}>
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className={styles.segment} aria-label={typeof o.label === 'string' ? undefined : o.title} title={o.title}>
          {o.icon}
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/* ---------------- Tabs ---------------- */
export const Tabs = {
  Root: (p: RTabs.TabsProps) => <RTabs.Root {...p} className={cx(styles.tabsRoot, p.className)} />,
  List: (p: RTabs.TabsListProps) => <RTabs.List {...p} className={cx(styles.tabsList, p.className)} />,
  Trigger: (p: RTabs.TabsTriggerProps) => <RTabs.Trigger {...p} className={cx(styles.tabsTrigger, p.className)} />,
  Content: (p: RTabs.TabsContentProps) => <RTabs.Content {...p} className={cx(styles.tabsContent, p.className)} />,
};
