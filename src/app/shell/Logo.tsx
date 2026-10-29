export function Logo({ size = 28, withName = false }: { size?: number; withName?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="8" fill="var(--color-text)" />
        <path d="M9 11.5h14M16 11.5V24" stroke="var(--color-brand)" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="22.5" cy="22.5" r="2.2" fill="var(--color-brand)" />
      </svg>
      {withName && (
        <span style={{ fontWeight: 650, fontSize: 15, letterSpacing: '-0.01em', fontStretch: '90%' }}>
          Tifa <span style={{ color: 'var(--color-text-3)', fontWeight: 500 }}>Inventory</span>
        </span>
      )}
    </span>
  );
}
