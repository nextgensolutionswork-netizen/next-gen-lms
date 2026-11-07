import * as React from 'react';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function DashboardLoading() {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3.5 w-80" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      </div>

      {/* Filter Bar Skeleton */}
      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <Skeleton className="h-8 w-full sm:w-80 rounded-lg" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </div>
      </Card>

      {/* Table Skeleton */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <th key={idx} className="px-3.5 py-2.5">
                    <Skeleton className="h-3 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <TableSkeleton columns={6} rows={7} />
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
