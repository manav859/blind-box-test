import React from 'react';

export function Skeleton({ width = '100%', height = 14, style }: { width?: number | string; height?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}

/** Table-shaped loading placeholder — use instead of a bare "Loading…" overlay. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card skeleton-table" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          <Skeleton width={36} height={36} style={{ borderRadius: 8 }} />
          <Skeleton width="30%" />
          <Skeleton width="15%" />
          <Skeleton width="12%" />
          <Skeleton width="18%" />
        </div>
      ))}
    </div>
  );
}
