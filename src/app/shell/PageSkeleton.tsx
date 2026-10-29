import { Skeleton } from '@/design-system';

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Skeleton width={220} height={34} />
        <Skeleton width={360} height={16} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={84} radius={12} />
        ))}
      </div>
      <Skeleton height={360} radius={12} />
    </div>
  );
}
