'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IndianRupee,
  Search,
  Calendar,
  Filter,
  RotateCcw,
  AlertTriangle,
  Clock,
  ArrowRight,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { formatINR, formatDate } from '@/lib/utils/formatters';
import type {
  UpcomingPaymentDueItem,
  AllPaymentDuesSummary,
  AllPaymentDuesPagination,
  AllPaymentDuesResponse,
} from '@/types';

export default function StudentPaymentDueDatesPage() {
  const { role, user } = useAuth();

  const isAuthorized =
    role === 'super_admin' ||
    role === 'admin' ||
    role === 'accountant' ||
    role === 'counsellor';

  const [dues, setDues] = React.useState<UpcomingPaymentDueItem[]>([]);
  const [summary, setSummary] = React.useState<AllPaymentDuesSummary>({
    totalOutstanding: 0,
    totalCount: 0,
    overdueAmount: 0,
    overdueCount: 0,
    todayAmount: 0,
    todayCount: 0,
    next3DaysAmount: 0,
    next3DaysCount: 0,
    upcomingAmount: 0,
    upcomingCount: 0,
  });
  const [pagination, setPagination] = React.useState<AllPaymentDuesPagination>({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  });
  const [totalDueAmount, setTotalDueAmount] = React.useState<number>(0);
  const [asOfDate, setAsOfDate] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = React.useState<string>('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'overdue' | 'today' | 'next3days' | 'upcoming'>('all');
  const [courseFilter, setCourseFilter] = React.useState<string>('All');
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');
  const [page, setPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(10);
  const [refreshTick, setRefreshTick] = React.useState<number>(0);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filter changes
  const handleStatusFilterChange = (status: 'all' | 'overdue' | 'today' | 'next3days' | 'upcoming') => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleCourseFilterChange = (courseId: string) => {
    setCourseFilter(courseId);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilter('all');
    setCourseFilter('All');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const fetchDues = React.useCallback(async () => {
    if (!isAuthorized) return;
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('scope', 'all');
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (courseFilter !== 'All') params.set('course_id', courseFilter);
      if (startDate.trim()) params.set('start_date', startDate.trim());
      if (endDate.trim()) params.set('end_date', endDate.trim());
      params.set('page', String(page));
      params.set('page_size', String(pageSize));

      const res = await fetch(`/api/fees/dues?${params.toString()}`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error ${res.status}`);
      }

      const data: AllPaymentDuesResponse = await res.json();
      if (data.success) {
        setDues(data.dues || []);
        setTotalDueAmount(data.totalDueAmount || 0);
        if (data.summary) setSummary(data.summary);
        if (data.pagination) setPagination(data.pagination);
        if (data.asOfDate) setAsOfDate(data.asOfDate);
      } else {
        throw new Error(data.error || 'Failed to retrieve due dates.');
      }
    } catch (err: any) {
      console.error('[StudentPaymentDueDatesPage] Fetch error:', err);
      setError(err?.message || 'Failed to load student payment due dates.');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthorized, debouncedSearch, statusFilter, courseFilter, startDate, endDate, page, pageSize]);

  React.useEffect(() => {
    void (async () => {
      await fetchDues();
    })();
  }, [fetchDues, refreshTick]);

  if (!isAuthorized) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500">
          Payment Due Dates are reserved for authorized accounts and academic staff.
        </p>
        <Link href="/dashboard">
          <Button variant="sap" size="sm">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const coursesList = store.courses || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Student Payment Due Dates
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              Asia/Kolkata
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete schedule of outstanding student installment obligations, overdue dues, and upcoming fee collections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={isLoading}
            className="text-xs flex items-center gap-1.5"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Link href="/accounts/fees">
            <Button variant="sap" size="sm" className="text-xs flex items-center gap-1.5">
              <span>Student Fee Ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Card 1: Total Outstanding */}
        <Card className="border-l-4 border-l-blue-600 shadow-xs">
          <CardContent className="p-3.5 flex flex-col justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Outstanding
            </p>
            <h3 className="text-xl font-bold text-slate-900 mt-1">
              {formatINR(summary.totalOutstanding)}
            </h3>
            <p className="text-[11px] text-blue-600 font-medium mt-1">
              {summary.totalCount} {summary.totalCount === 1 ? 'obligation' : 'obligations'}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Overdue */}
        <Card className="border-l-4 border-l-rose-500 shadow-xs">
          <CardContent className="p-3.5 flex flex-col justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Overdue Dues
            </p>
            <h3 className="text-xl font-bold text-rose-600 mt-1">
              {formatINR(summary.overdueAmount)}
            </h3>
            <p className="text-[11px] text-rose-500 font-medium mt-1">
              {summary.overdueCount} {summary.overdueCount === 1 ? 'overdue' : 'overdue'}
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Due Today */}
        <Card className="border-l-4 border-l-amber-500 shadow-xs">
          <CardContent className="p-3.5 flex flex-col justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Due Today
            </p>
            <h3 className="text-xl font-bold text-amber-700 mt-1">
              {formatINR(summary.todayAmount)}
            </h3>
            <p className="text-[11px] text-amber-600 font-medium mt-1">
              {summary.todayCount} {summary.todayCount === 1 ? 'due today' : 'due today'}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Next 3 Days */}
        <Card className="border-l-4 border-l-purple-500 shadow-xs">
          <CardContent className="p-3.5 flex flex-col justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Next 3 Days Window
            </p>
            <h3 className="text-xl font-bold text-purple-700 mt-1">
              {formatINR(summary.next3DaysAmount)}
            </h3>
            <p className="text-[11px] text-purple-600 font-medium mt-1">
              {summary.next3DaysCount} {summary.next3DaysCount === 1 ? 'due in 3 days' : 'due in 3 days'}
            </p>
          </CardContent>
        </Card>

        {/* Card 5: Future Upcoming */}
        <Card className="border-l-4 border-l-emerald-500 shadow-xs col-span-2 sm:col-span-1">
          <CardContent className="p-3.5 flex flex-col justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Future Upcoming
            </p>
            <h3 className="text-xl font-bold text-emerald-700 mt-1">
              {formatINR(summary.upcomingAmount)}
            </h3>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">
              {summary.upcomingCount} {summary.upcomingCount === 1 ? 'upcoming' : 'upcoming'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search by student name, admission #, or course..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            {/* Course Filter Dropdown */}
            <div className="w-full md:w-56 shrink-0">
              <select
                value={courseFilter}
                onChange={(e) => handleCourseFilterChange(e.target.value)}
                aria-label="Filter by course program"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              >
                <option value="All">All Courses ({coursesList.length})</option>
                {coursesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.course_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {/* Status Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
              {(
                [
                  { id: 'all', label: 'All Dues' },
                  { id: 'overdue', label: 'Overdue' },
                  { id: 'today', label: 'Due Today' },
                  { id: 'next3days', label: 'Next 3 Days' },
                  { id: 'upcoming', label: 'Upcoming' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleStatusFilterChange(tab.id)}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Date Range Inputs */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1 text-slate-500 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                <span>Date Range:</span>
              </div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700"
                placeholder="From"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700"
                placeholder="To"
              />

              {(search || statusFilter !== 'all' || courseFilter !== 'All' || startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error alert */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Obligations Table Card */}
      <Card className="shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Outstanding Payment Obligations</CardTitle>
            <p className="text-xs text-slate-500">
              Showing {pagination.totalItems} matching obligations • Filtered Total: {formatINR(totalDueAmount)}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <tbody className="divide-y divide-slate-100">
                  <TableSkeleton columns={8} rows={6} />
                </tbody>
              </table>
            </div>
          ) : dues.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Clock className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No payment dues found</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No outstanding student obligations matched your selected filters. Adjust your criteria or clear filters to view all dues.
              </p>
              {(search || statusFilter !== 'all' || courseFilter !== 'All' || startDate || endDate) && (
                <Button variant="outline" size="sm" onClick={handleClearFilters} className="text-xs mt-2">
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Admission #</th>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Payment Due Date</th>
                    <th className="px-4 py-3">Scheduled / Paid</th>
                    <th className="px-4 py-3">Outstanding Amount</th>
                    <th className="px-4 py-3">Payment Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dues.map((item) => {
                    const isDueToday = item.due_status === 'Due Today';
                    const isOverdue = item.due_status === 'Overdue';
                    const isDueTomorrow = item.due_status === 'Due Tomorrow';
                    const isDueIn2Days = item.due_status === 'Due in 2 Days';

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          isDueToday
                            ? 'bg-rose-50/40'
                            : isOverdue
                            ? 'bg-amber-50/20'
                            : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-slate-900">
                          <Link
                            href={`/students/${item.student_id}`}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {item.student_name}
                          </Link>
                        </td>

                        <td className="px-4 py-3 font-mono font-semibold text-blue-600">
                          {item.admission_number}
                        </td>

                        <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate">
                          {item.course_name}
                        </td>

                        <td className="px-4 py-3 font-medium text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatDate(item.due_date)}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          <span className="font-medium text-slate-800">{formatINR(item.installment_amount)}</span>
                          {item.paid_amount > 0 && (
                            <span className="text-[11px] text-emerald-600 block">
                              Paid: {formatINR(item.paid_amount)}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 font-bold text-slate-900 text-sm">
                          {formatINR(item.outstanding_amount)}
                        </td>

                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              isDueToday
                                ? 'destructive'
                                : isOverdue
                                ? 'destructive'
                                : isDueTomorrow
                                ? 'warning'
                                : 'outline'
                            }
                            className={
                              isDueToday
                                ? 'bg-rose-600 text-white font-bold animate-pulse'
                                : isOverdue
                                ? 'bg-rose-100 text-rose-800 border-rose-300 font-semibold'
                                : isDueTomorrow
                                ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
                                : isDueIn2Days
                                ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                                : 'bg-slate-100 text-slate-700 border-slate-200 font-semibold'
                            }
                          >
                            {item.due_status}
                            {item.is_partial && ' (Partial)'}
                          </Badge>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/accounts/fees?search=${encodeURIComponent(item.admission_number || item.student_name)}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A6ED1] hover:underline"
                          >
                            <span>View Fee Ledger</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-100 gap-3 text-xs">
              <div className="text-slate-500">
                Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
                {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of{' '}
                {pagination.totalItems} obligations
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-slate-500 mr-2">
                  <span>Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    aria-label="Items per page"
                    className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white text-slate-700"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="h-7 px-2 text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </Button>

                <span className="px-2 font-medium text-slate-700">
                  Page {pagination.page} of {pagination.totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="h-7 px-2 text-xs"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
