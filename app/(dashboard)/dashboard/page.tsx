'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Users,
  GraduationCap,
  IndianRupee,
  TrendingUp,
  CreditCard,
  Briefcase,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle,
  FileText,
  Filter,
  AlertCircle,
  Plus,
  ArrowRight,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatINR, formatDate } from '@/lib/utils/formatters';
import { store } from '@/lib/services/data-store';
import { useAuth } from '@/components/providers/auth-provider';
import { getLeads } from '@/lib/services/crm-service';
import { CRM_ROLES } from '@/lib/auth/lead-access';
import { Payment, Lead, UpcomingPaymentDueItem } from '@/types';
import {
  courseBucket,
  paymentCourseBucket,
  UNASSIGNED_COURSE,
  formatDashboardPercentage,
  calculatePaymentApprovalMetrics,
  calculateEnrollmentMetrics,
  isPaymentApproved,
  getCanonicalPaymentKey,
  unifyDualLedgerPayments,
  getRecentVerifiedCollections,
  DashboardPeriod,
  DateRange,
  isDateInPeriod,
  formatDisplayDateRange,
} from '@/lib/utils/dashboard-metrics';
import { CustomDateRangePicker } from '@/components/ui/custom-date-range-picker';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export default function DashboardPage() {
  const { role, user } = useAuth();
  const [leadSnapshot, setLeadSnapshot] = React.useState<{ owner?: string; rows: Lead[] }>({ rows: [] });
  const authorizedLeads = React.useMemo(() => (leadSnapshot.owner === user?.id ? leadSnapshot.rows : []), [leadSnapshot, user?.id]);
  React.useEffect(() => {
    let active = true;
    if (CRM_ROLES.includes(role)) getLeads().then(rows => { if (active) setLeadSnapshot({ owner: user?.id, rows }); }).catch(() => { if (active) setLeadSnapshot({ owner: user?.id, rows: [] }); });
    return () => { active = false; };
  }, [user?.id, role]);
  const [filterPeriod, setFilterPeriod] = React.useState<DashboardPeriod>('month');
  const [customDateRange, setCustomDateRange] = React.useState<DateRange | null>(null);
  const [isCustomPickerOpen, setIsCustomPickerOpen] = React.useState<boolean>(false);
  const [filterCourse, setFilterCourse] = React.useState<string>('All');
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    paymentWorkflowClient
      .refresh()
      .then(() => {
        store.reconcileDualLedgers();
        setRefreshTick((t) => t + 1);
      })
      .catch(() => {
        store.reconcileDualLedgers();
      });
  }, []);

  const courseIdSignature = JSON.stringify((store.courses || []).map((c) => c.id));
  const courseIds = React.useMemo<Set<string>>(() => new Set(JSON.parse(courseIdSignature)), [courseIdSignature]);
  const matchesCourse = React.useCallback((courseId?: string) => filterCourse === 'All' || courseBucket(courseId, courseIds) === filterCourse, [filterCourse, courseIds]);

  // Unified dual-ledger payments (reconciles store.payments & store.studentPayments)
  const allUnifiedPayments = React.useMemo(() => {
    void refreshTick;
    store.reconcileDualLedgers();
    return unifyDualLedgerPayments(
      store.payments || [],
      store.studentPayments || [],
      {
        students: store.students || [],
        courses: store.courses || [],
        studentFees: store.studentFees || [],
        feeAccounts: store.feeAccounts || [],
        receipts: store.receipts || [],
      }
    );
  }, [refreshTick]);

  // Timezone-safe Period filtering calculation using authoritative Asia/Kolkata boundary logic
  const isDateInSelectedPeriod = React.useCallback(
    (dateStr?: string) => {
      if (!dateStr) return false;
      return isDateInPeriod(dateStr, filterPeriod, customDateRange);
    },
    [filterPeriod, customDateRange]
  );

  // Financial collections dynamically driven by filterPeriod & filterCourse
  const periodPayments = React.useMemo(() => {
    return allUnifiedPayments.filter((p) => {
      const inPeriod = isDateInSelectedPeriod(p.payment_date || p.created_at);
      if (!inPeriod) return false;
      if (filterCourse === 'All') return true;
      return paymentCourseBucket(p, courseIds, store.feeAccounts || [], store.students || []) === filterCourse;
    });
  }, [allUnifiedPayments, isDateInSelectedPeriod, filterCourse, courseIds]);

  // Expenses list dynamically driven by filterPeriod
  const periodExpensesList = React.useMemo(() => {
    return (store.expenses || []).filter((e) =>
      isDateInSelectedPeriod(e.expense_date || e.created_at)
    );
  }, [isDateInSelectedPeriod]);

  // Admissions dynamically driven by filterPeriod & filterCourse
  const periodAdmissions = React.useMemo(() => {
    return (store.admissions || []).filter((a) => {
      const inPeriod = isDateInSelectedPeriod(a.admission_date || a.created_at);
      if (!inPeriod) return false;
      return matchesCourse(a.course_id);
    });
  }, [isDateInSelectedPeriod, matchesCourse]);

  const periodApprovedPayments = React.useMemo(() => {
    return periodPayments.filter((p) => isPaymentApproved(p));
  }, [periodPayments]);

  const recentVerifiedCollections = React.useMemo(() => {
    return getRecentVerifiedCollections(periodPayments, 5);
  }, [periodPayments]);

  const periodCollections = React.useMemo(() => {
    return periodApprovedPayments.reduce((sum, p) => sum + safeAmount(p.amount), 0);
  }, [periodApprovedPayments]);

  const paymentApprovalMetrics = React.useMemo(() => {
    return calculatePaymentApprovalMetrics(periodPayments);
  }, [periodPayments]);

  const enrollmentMetrics = React.useMemo(() => {
    return calculateEnrollmentMetrics(
      (store.admissions || []).filter((a) => isDateInSelectedPeriod(a.admission_date || a.created_at)),
      store.students || [],
      matchesCourse
    );
  }, [isDateInSelectedPeriod, matchesCourse]);

  const courseBreakdown = [...(store.courses || []).map((c) => ({ id: c.id, name: c.course_name })),
    { id: UNASSIGNED_COURSE, name: 'Unassigned / unknown course' }].map((course) => {
    // Only approved/verified payments count as collected revenue in the reconciliation table.
    // This must match the same isPaymentApproved predicate used by periodCollections above
    // so that the course-row totals sum exactly to the KPI card total for the same period.
    const payments = allUnifiedPayments.filter((p) =>
      isDateInSelectedPeriod(p.payment_date || p.created_at) &&
      isPaymentApproved(p) &&
      paymentCourseBucket(p, courseIds, store.feeAccounts || [], store.students || []) === course.id);
    return { ...course, transactions: payments.length,
      amount: payments.reduce((sum, p) => sum + safeAmount(p.amount), 0),
      students: (store.students || []).filter((s) => courseBucket(s.course_id, courseIds) === course.id).length };
  });

  const periodExpenses = React.useMemo(() => {
    return periodExpensesList
      .filter((e) => e.status === 'Paid')
      .reduce((sum, e) => sum + safeAmount(e.amount), 0);
  }, [periodExpensesList]);

  const netOperatingBalance = periodCollections - periodExpenses;

  // Outstanding fee accounts filtered by course
  const totalOutstanding = React.useMemo(() => {
    return (store.feeAccounts || [])
      .filter((f) => matchesCourse(f.course_id))
      .reduce((sum, f) => sum + safeAmount(f.outstanding_amount), 0);
  }, [matchesCourse]);

  // Outstanding balances are tracked per fee account, without schedules.
  const pendingAccounts = (store.feeAccounts || []).filter((f) =>
    f.outstanding_amount > 0 && (matchesCourse(f.course_id)));
  const pendingAmountInPeriod = pendingAccounts.reduce((sum, f) => sum + safeAmount(f.outstanding_amount), 0);

  // Student roster & active counts filtered by course
  const totalStudents = React.useMemo(() => {
    return (store.students || []).filter((s) => matchesCourse(s.course_id)).length;
  }, [matchesCourse]);

  const activeStudents = React.useMemo(() => {
    return (store.students || []).filter(
      (s) => s.status === 'Active' && (matchesCourse(s.course_id))
    ).length;
  }, [matchesCourse]);

  const totalCourses = filterCourse === 'All' ? (store.courses || []).length : filterCourse === UNASSIGNED_COURSE ? 0 : 1;

  const activeBatches = React.useMemo(() => {
    return (store.batches || []).filter(
      (b) => b.status === 'Active' && (matchesCourse(b.course_id))
    ).length;
  }, [matchesCourse]);

  const collectionsPeriodTitle = {
    today: "Today's Collections",
    week: "This Week's Collections",
    month: "This Month's Collections",
    all: "Total Collections",
    custom: customDateRange
      ? `Collections (${formatDisplayDateRange(customDateRange.startDate, customDateRange.endDate)})`
      : "Custom Period Collections",
  }[filterPeriod];

  const expensesPeriodTitle = {
    today: "Expenses Today",
    week: "Expenses This Week",
    month: "Expenses This Month",
    all: "Total Operating Expenses",
    custom: customDateRange
      ? `Operating Expenses (${formatDisplayDateRange(customDateRange.startDate, customDateRange.endDate)})`
      : "Custom Period Expenses",
  }[filterPeriod];

  const periodLabel = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    all: 'All Time',
    custom: customDateRange
      ? formatDisplayDateRange(customDateRange.startDate, customDateRange.endDate)
      : 'Custom Range',
  }[filterPeriod];

  // CRM & Admission aggregates filtered by period
  const periodLeads = React.useMemo(() => {
    return authorizedLeads.filter((l) => isDateInSelectedPeriod(l.created_at) && matchesCourse(l.interested_course_id));
  }, [isDateInSelectedPeriod, matchesCourse, authorizedLeads]);
  const displayLeads = periodLeads;
  const totalLeads = displayLeads.length;
  const convertedLeads = displayLeads.filter((l) => l.stage === 'Converted').length;
  const conversionRate = formatDashboardPercentage(convertedLeads, totalLeads);
  const upcomingDemos = authorizedLeads.filter((l) => l.stage === 'Demo Scheduled').length;
  const activeJobOpenings = (store.jobOpenings || []).filter((j) => j.status === 'Open').length;



  // Upcoming Payment Dues state (Next 3 Days in Asia/Kolkata)
  const [upcomingDues, setUpcomingDues] = React.useState<UpcomingPaymentDueItem[]>([]);
  const [totalUpcomingDueAmount, setTotalUpcomingDueAmount] = React.useState<number>(0);
  const [upcomingDuesLoading, setUpcomingDuesLoading] = React.useState<boolean>(true);

  const fetchUpcomingDues = React.useCallback(async () => {
    try {
      const res = await fetch('/api/fees/upcoming-dues');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.dues)) {
          setUpcomingDues(data.dues);
          setTotalUpcomingDueAmount(data.totalDueAmount || 0);
          setUpcomingDuesLoading(false);
          return;
        }
      }
    } catch {}

    if (user) {
      try {
        const { getUpcomingPaymentDues } = await import('@/lib/services/upcoming-dues-service');
        const fallback = getUpcomingPaymentDues(user);
        setUpcomingDues(fallback.dues);
        setTotalUpcomingDueAmount(fallback.totalDueAmount);
      } catch {}
    }
    setUpcomingDuesLoading(false);
  }, [user]);

  React.useEffect(() => {
    void (async () => {
      await fetchUpcomingDues();
    })();
  }, [fetchUpcomingDues, refreshTick]);

  if (role === 'student') {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500">
          The Executive Operations Dashboard is reserved for institute faculty and administration. Please access your learning materials via the Student Learning Portal.
        </p>
        <Link href="/portal">
          <Button variant="sap" size="sm">
            Go to Student Portal
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="flex max-w-full flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Enterprise Institute Executive Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time operations, academic progress, revenue collections, and SAP placements.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex max-w-full flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-xs text-xs">
          <div className="flex items-center space-x-1 pl-1 text-slate-500 font-medium">
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Period:</span>
          </div>

          <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg">
            {(['today', 'week', 'month', 'all'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setFilterPeriod(period)}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  filterPeriod === period
                    ? 'bg-[#0A6ED1] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {period === 'today' ? 'Today' : period === 'week' ? 'This Week' : period === 'month' ? 'This Month' : 'All Time'}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setFilterPeriod('custom');
                setIsCustomPickerOpen(true);
              }}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center space-x-1.5 ${
                filterPeriod === 'custom'
                  ? 'bg-[#0A6ED1] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="h-3 w-3" />
              <span>Custom</span>
            </button>
          </div>

          {filterPeriod === 'custom' && customDateRange && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-[#0A6ED1]">
              <span>{formatDisplayDateRange(customDateRange.startDate, customDateRange.endDate)}</span>
              <button
                type="button"
                onClick={() => setIsCustomPickerOpen(true)}
                className="ml-0.5 text-[11px] underline hover:text-[#0854A0]"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomDateRange(null);
                  setFilterPeriod('month');
                }}
                className="ml-0.5 text-slate-400 hover:text-slate-700 p-0.5 rounded"
                title="Reset to This Month"
                aria-label="Clear custom date filter"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

          <div className="flex flex-wrap items-center gap-1 max-w-full">
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Course:</span>
            <select
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            >
              <option value="All">All Courses ({(store.courses || []).length})</option>
              <option value={UNASSIGNED_COURSE}>Unassigned / unknown course</option>
              {(store.courses || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards (6 Cards: 3x2 Desktop, 2x3 Tablet, 1x6 Mobile) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: This Month's Collections */}
        <Card className="border-l-4 border-l-[#0A6ED1] h-full shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{collectionsPeriodTitle}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatINR(periodCollections)}</h3>
                <div className="flex items-center space-x-1 mt-1 text-emerald-600 text-xs font-semibold">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  <span>
                    {filterPeriod === 'today'
                      ? `${periodApprovedPayments.length} successful transactions today`
                      : filterPeriod === 'week'
                      ? `${periodApprovedPayments.length} successful transactions this week`
                      : filterPeriod === 'month'
                      ? `${periodApprovedPayments.length} successful transactions this month`
                      : filterPeriod === 'custom'
                      ? `${periodApprovedPayments.length} successful transactions in selected range`
                      : `${periodApprovedPayments.length} total successful transactions`}
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-[#0A6ED1] flex items-center justify-center shrink-0">
                <IndianRupee className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total Outstanding Fees */}
        <Card className="border-l-4 border-l-amber-500 h-full shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Outstanding Fees
                </p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {formatINR(filterPeriod === 'all' ? totalOutstanding : pendingAmountInPeriod)}
                </h3>
                <p className="text-xs text-amber-600 font-medium mt-1">
                  {pendingAccounts.length} {pendingAccounts.length === 1 ? 'account' : 'accounts'} with an outstanding balance
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <CreditCard className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Net Operating Balance */}
        <Card className="border-l-4 border-l-emerald-500 h-full shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {filterCourse !== 'All' ? 'Collections before shared expenses' : filterPeriod === 'all' ? 'Lifetime Net Balance' : `Net Operating Balance (${periodLabel})`}
                </p>
                <h3 className={`text-2xl font-bold mt-1 ${netOperatingBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatINR(filterCourse === 'All' ? netOperatingBalance : periodCollections)}
                </h3>
                <p className="text-xs text-slate-500 mt-1">{expensesPeriodTitle} (institute-wide): {formatINR(periodExpenses)}</p>
                {filterCourse !== 'All' && <p className="text-xs text-slate-500 mt-0.5">Shared expenses are not allocated to courses; course net balance is unavailable.</p>}
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Admissions & Batches */}
        <Card className="border-l-4 border-l-indigo-500 h-full shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {filterPeriod === 'all' ? 'Students & Batches' : `Admissions & Batches (${periodLabel})`}
                </p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {filterPeriod === 'all' ? `${totalStudents} Enrolled Students` : `${enrollmentMetrics.newEnrollmentsCount} New Admissions`}
                </h3>
                <p className="text-xs text-indigo-600 font-semibold mt-1">
                  {activeBatches} Active {activeBatches === 1 ? 'Batch' : 'Batches'} | {conversionRate} Conv. ({convertedLeads}/{totalLeads} leads)
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <GraduationCap className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Payment Approval Status (NEW) */}
        <Card className="border-l-4 border-l-teal-500 h-full shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Payment Approval Status
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Approved</p>
                    <h3 className="text-lg sm:text-xl font-bold text-emerald-700 truncate">
                      {formatINR(paymentApprovalMetrics.approvedAmount)}
                    </h3>
                    <p className="text-[11px] text-emerald-600 font-medium">
                      {paymentApprovalMetrics.approvedCount} verified
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Pending</p>
                    <h3 className="text-lg sm:text-xl font-bold text-amber-600 truncate">
                      {formatINR(paymentApprovalMetrics.pendingAmount)}
                    </h3>
                    <p className="text-[11px] text-amber-600 font-medium">
                      {paymentApprovalMetrics.pendingCount} awaiting
                    </p>
                  </div>
                </div>
              </div>
              <div className="h-12 w-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 ml-2">
                <CheckCircle className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 6: Student Enrollment (NEW) */}
        <Card className="border-l-4 border-l-violet-500 h-full shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Student Enrollment
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">New Enrolled</p>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                      {enrollmentMetrics.newEnrollmentsCount}
                    </h3>
                    <p className="text-[11px] text-violet-600 font-medium truncate">
                      {filterPeriod === 'all' ? 'All time' : periodLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active Students</p>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                      {enrollmentMetrics.activeStudentsCount}
                    </h3>
                    <p className="text-[11px] text-emerald-600 font-medium truncate">
                      Current roster
                    </p>
                  </div>
                </div>
              </div>
              <div className="h-12 w-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0 ml-2">
                <Users className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course reconciliation ({periodLabel})</CardTitle>
          <p className="text-xs text-slate-500">Collections and transactions use the selected period. Students are the current enrolled roster, not unique payers. All course rows, including unassigned records, sum to All Courses.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead><tr><th className="py-2">Course</th><th>Collections</th><th>Transactions</th><th>Enrolled students</th></tr></thead>
            <tbody>{courseBreakdown.map((row) => <tr key={row.id} className="border-t border-slate-100">
              <td className="py-2"><button className="text-blue-700 hover:underline" onClick={() => setFilterCourse(row.id)}>{row.name}</button></td>
              <td>{formatINR(row.amount)}</td><td>{row.transactions}</td><td>{row.students}</td>
            </tr>)}</tbody>
            <tfoot><tr className="border-t font-semibold"><td className="py-2">All Courses</td>
              <td>{formatINR(courseBreakdown.reduce((sum, row) => sum + row.amount, 0))}</td>
              <td>{courseBreakdown.reduce((sum, row) => sum + row.transactions, 0)}</td>
              <td>{courseBreakdown.reduce((sum, row) => sum + row.students, 0)}</td>
            </tr></tfoot>
          </table>
        </CardContent>
      </Card>

      {/* Operational Highlights Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Users className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Active Students</p>
            <p className="text-base font-bold text-slate-800">{activeStudents}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><Layers className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">SAP Courses</p>
            <p className="text-base font-bold text-slate-800">{totalCourses} Modules</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><Calendar className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Upcoming Demos</p>
            <p className="text-base font-bold text-slate-800">{upcomingDemos} Scheduled</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><Briefcase className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Live Job Openings</p>
            <p className="text-base font-bold text-slate-800">{activeJobOpenings} Opportunities</p>
          </div>
        </div>
      </div>

      {/* Main Content: Admissions & Collections Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Admissions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent Admissions</CardTitle>
              <p className="text-xs text-slate-500">Newly registered SAP enterprise students</p>
            </div>
            <Link href="/admissions">
              <Button variant="outline" size="sm" className="text-xs flex items-center space-x-1">
                <span>View All</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Adm #</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Fee / Net</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periodAdmissions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No admissions found for the selected {periodLabel.toLowerCase()}{filterCourse !== 'All' ? ` (${filterCourse})` : ''}.
                      </td>
                    </tr>
                  ) : (
                    periodAdmissions.slice(0, 5).map((adm) => (
                      <tr key={adm.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-blue-600">{adm.admission_number}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{adm.student_name}</td>
                        <td className="px-4 py-3 text-slate-600 truncate max-w-[140px]">{adm.course_name}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{formatINR(adm.net_payable)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="success">{adm.status}</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Payment Collections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent Verified Fee Collections</CardTitle>
              <p className="text-xs text-slate-500">Verified fee collections and transaction receipts</p>
            </div>
            <Link href="/accounts/payments">
              <Button variant="outline" size="sm" className="text-xs flex items-center space-x-1">
                <span>View All</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Receipt #</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentVerifiedCollections.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No verified fee collections found for the selected {periodLabel.toLowerCase()}{filterCourse !== 'All' ? ` (${filterCourse})` : ''}.
                      </td>
                    </tr>
                  ) : (
                    recentVerifiedCollections.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          {pay.receipt_number && !pay.receipt_number.startsWith('PENDING-') ? (
                            <Link
                              href={`/accounts/receipts/${encodeURIComponent(pay.receipt_number)}`}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {pay.receipt_number}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-800">{pay.receipt_number || '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{pay.student_name}</td>
                        <td className="px-4 py-3 font-bold text-emerald-600">{formatINR(pay.amount)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{pay.payment_mode}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="success">Verified</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(pay.payment_date)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expenses & Placement Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Expenses */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent Operating Expenses</CardTitle>
              <p className="text-xs text-slate-500">Classroom infrastructure, software licenses & salaries</p>
            </div>
            <Link href="/accounts/expenses">
              <Button variant="outline" size="sm" className="text-xs">Manage Expenses</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periodExpensesList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No operating expenses recorded for the selected {periodLabel.toLowerCase()}.
                      </td>
                    </tr>
                  ) : (
                    periodExpensesList.slice(0, 5).map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-700">{exp.expense_code}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{exp.category}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{exp.description}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{formatINR(exp.amount)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={exp.status === 'Paid' ? 'success' : 'warning'}>{exp.status}</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Student Payment Due Dates — Next 3 Days Card */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                Student Payment Due Dates
              </CardTitle>
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-slate-500">Business timezone: Asia/Kolkata</p>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                Total: {formatINR(totalUpcomingDueAmount)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 flex-1 flex flex-col justify-between">
            {upcomingDuesLoading ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Loading upcoming dues...
              </div>
            ) : upcomingDues.length === 0 ? (
              <div className="py-10 text-center space-y-2 my-auto">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No payments due in the next 3 days.</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  All active student installments are up to date or scheduled beyond the 3-day window.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {upcomingDues.map((item) => {
                  const isDueToday = item.due_status === 'Due Today';
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border transition-all text-xs space-y-2 ${
                        isDueToday
                          ? 'bg-rose-50/60 border-rose-200 border-l-4 border-l-rose-500 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate text-sm">
                            {item.student_name}
                          </p>
                          <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                            <span>{item.admission_number}</span>
                            <span>•</span>
                            <span className="font-sans font-medium text-slate-600 truncate">{item.course_name}</span>
                          </div>
                        </div>
                        <Badge
                          variant={
                            item.due_status === 'Due Today'
                              ? 'destructive'
                              : item.due_status === 'Due Tomorrow'
                              ? 'warning'
                              : 'outline'
                          }
                          className={
                            item.due_status === 'Due Today'
                              ? 'bg-rose-600 text-white font-bold shrink-0 animate-pulse'
                              : item.due_status === 'Due Tomorrow'
                              ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold shrink-0'
                              : 'bg-blue-50 text-blue-700 border-blue-200 font-semibold shrink-0'
                          }
                        >
                          {item.due_status}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Due: {formatDate(item.due_date)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] text-slate-500 block">Outstanding</span>
                          <span className="font-bold text-slate-900 text-sm">
                            {formatINR(item.outstanding_amount)}
                          </span>
                        </div>
                      </div>

                      <div className="pt-1 flex justify-end">
                        <Link
                          href={`/accounts/fees?search=${encodeURIComponent(item.admission_number || item.student_name)}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-sap-blue hover:underline"
                        >
                          View Student Fee Ledger
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <Link href="/accounts/dues" className="block">
                <Button variant="sap" size="sm" className="w-full text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs">
                  <span>View All Due Dates</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <Link href="/accounts/fees" className="block text-center">
                <span className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline">
                  Open Student Fee Ledger
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom Date Range Picker Modal */}
      <CustomDateRangePicker
        isOpen={isCustomPickerOpen}
        onClose={() => setIsCustomPickerOpen(false)}
        currentRange={customDateRange}
        onApply={(range) => {
          setCustomDateRange(range);
          setFilterPeriod('custom');
        }}
        onClear={() => {
          setCustomDateRange(null);
          setFilterPeriod('month');
        }}
      />
    </div>
  );
}
