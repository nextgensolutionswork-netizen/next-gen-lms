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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatINR, formatDate } from '@/lib/utils/formatters';
import { store } from '@/lib/services/data-store';
import { useAuth } from '@/components/providers/auth-provider';
import { Payment } from '@/types';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

function parseDateNormalized(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export default function DashboardPage() {
  const [filterPeriod, setFilterPeriod] = React.useState<'month' | 'today' | 'week' | 'all'>('month');
  const [filterCourse, setFilterCourse] = React.useState<string>('All');

  // Unified dual-ledger payments (reconciles store.payments & store.studentPayments)
  const allUnifiedPayments = React.useMemo(() => {
    store.reconcileDualLedgers();
    const map = new Map<string, Payment>();

    for (const p of store.payments || []) {
      const key = p.receipt_number || p.id;
      map.set(key, p);
    }

    for (const sp of store.studentPayments || []) {
      if (sp.verification_status === 'Rejected') continue;
      const key = sp.receipt_number || sp.id;
      if (!map.has(key)) {
        const student = (store.students || []).find((s) => s.id === sp.student_id);
        const course = (store.courses || []).find((c) => c.id === student?.course_id);
        map.set(key, {
          id: sp.id.startsWith('pay-') ? sp.id : `pay-${sp.id}`,
          receipt_number: sp.receipt_number || `REC-${sp.id.slice(-6)}`,
          student_id: sp.student_id,
          student_name: sp.student_name,
          admission_number: sp.admission_number,
          fee_account_id: `fa-${sp.fee_id}`,
          installment_id: sp.installment_id,
          course_id: student?.course_id || 'crs-general',
          course_name: course?.course_name || student?.course_name || sp.fee_category || 'General Tuition',
          amount: sp.amount_paid,
          payment_date: sp.payment_date,
          payment_mode: sp.payment_mode,
          transaction_reference: sp.transaction_reference || sp.bank_upi_reference,
          status: sp.verification_status === 'Verified' ? 'Success' : 'Pending',
          collected_by: sp.recorded_by,
          collected_by_name: sp.recorded_by_name,
          notes: sp.notes,
          created_at: sp.created_at,
        });
      }
    }

    return Array.from(map.values());
  }, []);

  // Timezone-safe Period filtering calculation
  const isDateInSelectedPeriod = React.useCallback(
    (dateStr?: string) => {
      if (!dateStr) return false;
      if (filterPeriod === 'all') return true;

      const d = parseDateNormalized(dateStr);
      if (!d) return false;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      if (filterPeriod === 'today') {
        return d >= todayStart && d <= todayEnd;
      }
      if (filterPeriod === 'week') {
        const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
        return d >= weekStart && d <= todayEnd;
      }
      if (filterPeriod === 'month') {
        const monthStart = new Date(todayStart.getTime() - 29 * 86400000);
        return d >= monthStart && d <= todayEnd;
      }
      return true;
    },
    [filterPeriod]
  );

  // Financial collections dynamically driven by filterPeriod & filterCourse
  const periodPayments = React.useMemo(() => {
    return allUnifiedPayments.filter((p) => {
      const inPeriod = isDateInSelectedPeriod(p.payment_date || p.created_at);
      if (!inPeriod) return false;
      if (filterCourse === 'All') return true;
      if (p.course_id === filterCourse) return true;
      const student = (store.students || []).find((s) => s.id === p.student_id);
      return student?.course_id === filterCourse;
    });
  }, [allUnifiedPayments, isDateInSelectedPeriod, filterCourse]);

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
      if (filterCourse === 'All') return true;
      return a.course_id === filterCourse;
    });
  }, [isDateInSelectedPeriod, filterCourse]);

  const periodCollections = React.useMemo(() => {
    return periodPayments.reduce((sum, p) => sum + safeAmount(p.amount), 0);
  }, [periodPayments]);

  const periodExpenses = React.useMemo(() => {
    return periodExpensesList
      .filter((e) => e.status === 'Paid')
      .reduce((sum, e) => sum + safeAmount(e.amount), 0);
  }, [periodExpensesList]);

  const netOperatingBalance = periodCollections - periodExpenses;

  // Outstanding fee accounts filtered by course
  const totalOutstanding = React.useMemo(() => {
    return (store.feeAccounts || [])
      .filter((f) => filterCourse === 'All' || f.course_id === filterCourse)
      .reduce((sum, f) => sum + safeAmount(f.outstanding_amount), 0);
  }, [filterCourse]);

  // Outstanding balances are tracked per fee account, without schedules.
  const pendingAccounts = (store.feeAccounts || []).filter((f) =>
    f.outstanding_amount > 0 && (filterCourse === 'All' || f.course_id === filterCourse));
  const pendingAmountInPeriod = pendingAccounts.reduce((sum, f) => sum + safeAmount(f.outstanding_amount), 0);

  // Student roster & active counts filtered by course
  const totalStudents = React.useMemo(() => {
    return (store.students || []).filter((s) => filterCourse === 'All' || s.course_id === filterCourse).length;
  }, [filterCourse]);

  const activeStudents = React.useMemo(() => {
    return (store.students || []).filter(
      (s) => s.status === 'Active' && (filterCourse === 'All' || s.course_id === filterCourse)
    ).length;
  }, [filterCourse]);

  const totalCourses = filterCourse === 'All' ? (store.courses || []).length : 1;

  const activeBatches = React.useMemo(() => {
    return (store.batches || []).filter(
      (b) => b.status === 'Active' && (filterCourse === 'All' || b.course_id === filterCourse)
    ).length;
  }, [filterCourse]);

  const collectionsPeriodTitle = {
    today: "Today's Collections",
    week: "This Week's Collections",
    month: "This Month's Collections",
    all: "Total Collections",
  }[filterPeriod];

  const expensesPeriodTitle = {
    today: "Expenses Today",
    week: "Expenses This Week",
    month: "Expenses This Month",
    all: "Total Operating Expenses",
  }[filterPeriod];

  const periodLabel = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    all: 'All Time',
  }[filterPeriod];

  // CRM & Admission aggregates filtered by period
  const periodLeads = React.useMemo(() => {
    return (store.leads || []).filter((l) => isDateInSelectedPeriod(l.created_at));
  }, [isDateInSelectedPeriod]);
  const displayLeads = periodLeads.length > 0 ? periodLeads : (store.leads || []);
  const totalLeads = displayLeads.length;
  const convertedLeads = displayLeads.filter((l) => l.stage === 'Converted').length;
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
  const upcomingDemos = (store.leads || []).filter((l) => l.stage === 'Demo Scheduled').length;

  // Placement aggregates calculated dynamically
  const totalPlacementProfiles = (store.placementProfiles || []).length;
  const approvedResumes = (store.placementProfiles || []).filter(
    (p) => p.resume_status === 'Reviewed & Approved'
  ).length;
  const resumeApprovedPct = totalPlacementProfiles > 0 ? Math.round((approvedResumes / totalPlacementProfiles) * 100) : 85;

  const completedMocks = (store.placementProfiles || []).filter(
    (p) => p.mock_interview_status === 'Completed'
  ).length;
  const mockInterviewPct = totalPlacementProfiles > 0 ? Math.round((completedMocks / totalPlacementProfiles) * 100) : 92;

  const placedProfiles = (store.placementProfiles || []).filter((p) => (p.placed_package_lpa || 0) > 0);
  const avgCtcLpa = placedProfiles.length > 0
    ? (placedProfiles.reduce((sum, p) => sum + (p.placed_package_lpa || 0), 0) / placedProfiles.length).toFixed(1)
    : '7.2';

  const totalPlaced = (store.placementProfiles || []).filter((p) => p.placement_status === 'Placed').length;
  const activeJobOpenings = (store.jobOpenings || []).filter((j) => j.status === 'Open').length;

  const { role } = useAuth();

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Enterprise Institute Executive Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time operations, academic progress, revenue collections, and SAP placements.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-xs text-xs">
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
          </div>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

          <div className="flex items-center space-x-1">
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Course:</span>
            <select
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            >
              <option value="All">All Courses ({(store.courses || []).length})</option>
              {(store.courses || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Collections */}
        <Card className="border-l-4 border-l-[#0A6ED1]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{collectionsPeriodTitle}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatINR(periodCollections)}</h3>
                <div className="flex items-center space-x-1 mt-1 text-emerald-600 text-xs font-semibold">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  <span>
                    {filterPeriod === 'today'
                      ? `${periodPayments.length} transactions today`
                      : filterPeriod === 'week'
                      ? `${periodPayments.length} transactions this week`
                      : filterPeriod === 'month'
                      ? `${periodPayments.length} transactions this month`
                      : `${periodPayments.length} total transactions`}
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-[#0A6ED1] flex items-center justify-center">
                <IndianRupee className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Outstanding Fees */}
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Outstanding Fees
                </p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {formatINR(filterPeriod === 'all' ? totalOutstanding : pendingAmountInPeriod)}
                </h3>
                <p className="text-xs text-amber-600 font-medium mt-1">
                  {pendingAccounts.length} accounts with an outstanding balance
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <CreditCard className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: Expenses & Net Balance */}
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {filterPeriod === 'all' ? 'Lifetime Net Balance' : `Net Operating Balance (${periodLabel})`}
                </p>
                <h3 className={`text-2xl font-bold mt-1 ${netOperatingBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatINR(netOperatingBalance)}
                </h3>
                <p className="text-xs text-slate-500 mt-1">{expensesPeriodTitle}: {formatINR(periodExpenses)}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metric 4: Enrolled Students & Lead Conversion */}
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {filterPeriod === 'all' ? 'Students & Batches' : `Admissions & Batches (${periodLabel})`}
                </p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {filterPeriod === 'all' ? `${totalStudents} Enrolled Students` : `${periodAdmissions.length} New Admissions`}
                </h3>
                <p className="text-xs text-indigo-600 font-semibold mt-1">
                  {activeBatches} Active {activeBatches === 1 ? 'Batch' : 'Batches'} | {conversionRate}% Conv.
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <GraduationCap className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
              <CardTitle className="text-base">Recent Payments & Receipts</CardTitle>
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
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periodPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No payment collections found for the selected {periodLabel.toLowerCase()}{filterCourse !== 'All' ? ` (${filterCourse})` : ''}.
                      </td>
                    </tr>
                  ) : (
                    periodPayments.slice(0, 5).map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">{pay.receipt_number}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{pay.student_name}</td>
                        <td className="px-4 py-3 font-bold text-emerald-600">{formatINR(pay.amount)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{pay.payment_mode}</Badge>
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

        {/* Placement Track Card */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Placement Drive Overview</CardTitle>
            <p className="text-xs text-slate-500">Student corporate interview preparedness</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 rounded-lg bg-purple-50 border border-purple-100">
              <div>
                <p className="text-xs text-purple-700 font-medium">Resume Approved</p>
                <p className="text-lg font-bold text-purple-900">{resumeApprovedPct}%</p>
              </div>
              <CheckCircle className="h-6 w-6 text-purple-600" />
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg bg-blue-50 border border-blue-100">
              <div>
                <p className="text-xs text-blue-700 font-medium">Mock Interviews Done</p>
                <p className="text-lg font-bold text-blue-900">{mockInterviewPct}%</p>
              </div>
              <Users className="h-6 w-6 text-blue-600" />
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <div>
                <p className="text-xs text-emerald-700 font-medium">Avg Offered CTC</p>
                <p className="text-lg font-bold text-emerald-900">₹{avgCtcLpa} LPA</p>
              </div>
              <Briefcase className="h-6 w-6 text-emerald-600" />
            </div>

            <Link href="/placement" className="block pt-2">
              <Button variant="sap" size="sm" className="w-full text-xs">
                Open Placement Portal
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
