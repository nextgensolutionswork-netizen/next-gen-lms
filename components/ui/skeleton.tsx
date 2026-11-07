import * as React from 'react';

export function Skeleton({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200/80 ${className}`}
      {...props}
    />
  );
}

interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export function TableSkeleton({ columns, rows = 6 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="border-b border-slate-100/80">
          {Array.from({ length: columns }).map((_, cIdx) => (
            <td key={cIdx} className="px-3.5 py-3">
              {cIdx === 0 ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-20 bg-slate-100" />
                </div>
              ) : cIdx === columns - 1 ? (
                <div className="flex justify-end gap-1.5">
                  <Skeleton className="h-7 w-7 rounded-md" />
                </div>
              ) : (
                <Skeleton
                  className={`h-3.5 ${
                    cIdx % 3 === 0 ? 'w-24' : cIdx % 2 === 0 ? 'w-20' : 'w-16'
                  }`}
                />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

