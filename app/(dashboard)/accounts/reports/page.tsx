'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Download,
  FileSpreadsheet,
  ShieldCheck,
  Receipt,
  Calendar,
  Filter,
  RefreshCw,
  TrendingUp,
  DollarSign,
  PieChart,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { formatINR, exportToCSV } from '@/lib/utils/formatters';
import {
  exportCollectionsToExcel,
  exportExpensesToExcel,
} from '@/lib/utils/excel-export';
import { Payment, Expense } from '@/types';
import { TemporalPeriod, getDateRangeForPeriod } from '@/lib/services/finance-service';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export default function FinanceReportsPage() {
  const { user, role, hasPermission } = useAuth();
  const canAccessReports =
    hasPermission('accounts:read') ||
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin';

  const [period, setPeriod] = React.useState<TemporalPeriod>('FY_2025_26');
  const [customStart, setCustomStart] = React.useState('2026-01-01');
  const [customEnd, setCustomEnd] = React.useState(new Date().toISOString().slice(0, 10));
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    store.reconcileDualLedgers();
  }, [refreshTick]);

  const handleRefresh = () => {
    store.reconcileDualLedgers();
    setRefreshTick((t) => t + 1);
  };

  const isDateInRange = (dateStr?: string, start?: string, end?: string): boolean => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };

  const dateRange = getDateRangeForPeriod(period, customStart, customEnd);

  const allUnifiedPayments = React.useMemo(() => {
    store.reconcileDualLedgers();
    const map = new Map<string, Payment>();

    // 1. Add all from store.payments
    for (const p of store.payments || []) {
      const key = p.receipt_number || p.id;
      map.set(key, p);
    }

    // 2. Add or enrich from store.studentPayments (excluding rejected entries)
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
  }, [refreshTick]);

  // Filtered Payments & Expenses for Selected Temporal Range
  const filteredPayments = React.useMemo(() => {
    return allUnifiedPayments.filter((p) =>
      isDateInRange(p.payment_date, dateRange.start, dateRange.end)
    );
  }, [allUnifiedPayments, dateRange.start, dateRange.end]);

  const filteredExpenses = React.useMemo(() => {
    return (store.expenses || []).filter((e) =>
      isDateInRange(e.expense_date, dateRange.start, dateRange.end)
    );
  }, [dateRange.start, dateRange.end, refreshTick]);

  // Aggregated Period Metrics
  const periodCollections = React.useMemo(() => {
    return filteredPayments.reduce((sum, p) => sum + safeAmount(p.amount), 0);
  }, [filteredPayments]);

  const periodExpenses = React.useMemo(() => {
    return filteredExpenses
      .filter((e) => e.status === 'Paid')
      .reduce((sum, e) => sum + safeAmount(e.amount), 0);
  }, [filteredExpenses]);

  const netCashFlow = periodCollections - periodExpenses;

  const totalOutstanding = React.useMemo(() => {
    return (store.feeAccounts || []).reduce((sum, f) => sum + safeAmount(f.outstanding_amount), 0);
  }, [refreshTick]);

  // Course-wise Revenue Contribution Map for Period
  const courseRevenueMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of filteredPayments) {
      const name = p.course_name || 'General Tuition';
      map[name] = (map[name] || 0) + (p.amount || 0);
    }
    return map;
  }, [filteredPayments]);

  // Payment Mode Distribution Map for Period
  const paymentModeMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of filteredPayments) {
      const mode = p.payment_mode || 'Bank Transfer';
      map[mode] = (map[mode] || 0) + (p.amount || 0);
    }
    return map;
  }, [filteredPayments]);


  const handleExportCollections = () => {
    const rows = filteredPayments.map((p) => ({
      ReceiptNumber: p.receipt_number,
      StudentName: p.student_name,
      Course: p.course_name,
      Amount: p.amount,
      PaymentMode: p.payment_mode,
      Date: p.payment_date,
      Reference: p.transaction_reference,
    }));
    exportToCSV(`collections_${period.toLowerCase()}`, rows);
  };

  const handleExportCollectionsExcel = () => {
    exportCollectionsToExcel(filteredPayments);
  };

  const handleExportExpenses = () => {
    const rows = filteredExpenses.map((e) => ({
      Code: e.expense_code,
      Category: e.category,
      Vendor: e.vendor_name,
      Description: e.description,
      Amount: e.amount,
      PaymentMode: e.payment_mode,
      Date: e.expense_date,
      Status: e.status,
    }));
    exportToCSV(`expenses_${period.toLowerCase()}`, rows);
  };

  const handleExportExpensesExcel = () => {
    exportExpensesToExcel(filteredExpenses);
  };


  if (!canAccessReports) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card className="border-red-200 bg-red-50/50 shadow-sm">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-950">Access Restricted</h2>
              <p className="text-xs text-red-700 mt-1 max-w-md mx-auto">
                You do not possess the required financial permissions to view institutional financial analytics and reports.
              </p>
            </div>
            <div className="pt-2">
              <Link href={role === 'student' ? '/portal' : '/dashboard'}>
                <Button variant="outline" size="sm" className="text-xs">
                  {role === 'student' ? 'Go to Student Portal' : 'Return to Dashboard'}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Financial Intelligence & Analytics</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time cash flow, course revenue contributions, payment method distributions, and exportable reconciliation reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="text-xs flex items-center space-x-1"
            title="Refresh Data & Reconcile Dual Ledgers"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sync</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCollections}
            className="text-xs flex items-center space-x-1"
          >
            <Download className="h-3.5 w-3.5" />
            <span>CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCollectionsExcel}
            className="text-xs flex items-center space-x-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Collections (Excel)</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExpensesExcel}
            className="text-xs flex items-center space-x-1.5 border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
            <span>Expenses (Excel)</span>
          </Button>
          
        </div>
      </div>

      {/* Temporal Filter Control Bar */}
      <Card className="p-4 shadow-xs bg-slate-50/70 border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-700 flex items-center space-x-1">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <span>Reporting Horizon:</span>
            </span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as TemporalPeriod)}
              className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs text-slate-800 font-medium focus:ring-1 focus:ring-[#0A6ED1] focus:outline-none"
            >
              <optgroup label="Fiscal Years (April - March)">
                <option value="FY_2025_26">FY 2025-26 (Apr 2025 - Mar 2026)</option>
                <option value="FY_2026_27">FY 2026-27 (Apr 2026 - Mar 2027)</option>
              </optgroup>
              <optgroup label="Fiscal Quarters">
                <option value="Q1">Q1 (Apr - Jun)</option>
                <option value="Q2">Q2 (Jul - Sep)</option>
                <option value="Q3">Q3 (Oct - Dec)</option>
                <option value="Q4">Q4 (Jan - Mar)</option>
              </optgroup>
              <optgroup label="Monthly Horizons">
                <option value="CURRENT_MONTH">Current Month</option>
                <option value="LAST_MONTH">Last Month</option>
              </optgroup>
              <optgroup label="Custom & Cumulative">
                <option value="ALL_TIME">All-Time Cumulative</option>
                <option value="CUSTOM">Custom Date Window...</option>
              </optgroup>
            </select>

            {period === 'CUSTOM' && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-white border border-slate-300 rounded-md px-2 py-0.5 text-xs text-slate-800"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-white border border-slate-300 rounded-md px-2 py-0.5 text-xs text-slate-800"
                />
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-slate-500">
            <Badge variant="outline" className="bg-white text-slate-700 border-slate-300">
              Active: {dateRange.label}
            </Badge>
            <span>
              ({filteredPayments.length} payments · {filteredExpenses.length} expenses)
            </span>
          </div>
        </div>
      </Card>

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#0A6ED1]">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Period Collections</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatINR(periodCollections)}</h3>
            <p className="text-xs text-emerald-600 font-semibold mt-1">
              {filteredPayments.length} transactions in {dateRange.label.split(' ')[0]}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Period Expenses</p>
            <h3 className="text-2xl font-bold text-rose-700 mt-1">{formatINR(periodExpenses)}</h3>
            <p className="text-xs text-slate-500 mt-1">Disbursed Operating Outflows</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net Cash Flow</p>
            <h3 className={`text-2xl font-bold mt-1 ${netCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatINR(netCashFlow)}
            </h3>
            <p className={`text-xs font-semibold mt-1 ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {netCashFlow >= 0 ? 'Operating Surplus' : 'Net Deficit Margin'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Outstanding Balance</p>
            <h3 className="text-2xl font-bold text-amber-700 mt-1">{formatINR(totalOutstanding)}</h3>
            <p className="text-xs text-amber-600 font-semibold mt-1">Across all active fee accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Course-wise Revenue */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Course Revenue Contribution</CardTitle>
            <span className="text-[11px] text-slate-400">Total: {formatINR(periodCollections)}</span>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {Object.keys(courseRevenueMap).length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No fee collections recorded within the selected period.
              </div>
            ) : (
              Object.entries(courseRevenueMap).map(([course, rev]) => {
                const pct = periodCollections > 0 ? Math.round((rev / periodCollections) * 100) : 0;
                return (
                  <div key={course} className="space-y-1 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-800">{course}</span>
                      <span className="text-slate-900">
                        {formatINR(rev)} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#0A6ED1] h-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Payment Method Distribution */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Payment Mode Distribution</CardTitle>
            <span className="text-[11px] text-slate-400">Total: {formatINR(periodCollections)}</span>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {Object.keys(paymentModeMap).length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No fee collections recorded within the selected period.
              </div>
            ) : (
              Object.entries(paymentModeMap).map(([mode, amt]) => {
                const pct = periodCollections > 0 ? Math.round((amt / periodCollections) * 100) : 0;
                return (
                  <div key={mode} className="space-y-1 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-800">{mode}</span>
                      <span className="text-slate-900">
                        {formatINR(amt)} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      
    </div>
  );
}
