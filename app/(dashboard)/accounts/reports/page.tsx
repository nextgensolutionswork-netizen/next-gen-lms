'use client';

import * as React from 'react';
import {
  IndianRupee,
  TrendingUp,
  Download,
  Calendar,
  CreditCard,
  PieChart,
  BarChart,
  Layers,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { getFinanceDashboardMetrics } from '@/lib/services/finance-service';
import { formatINR, exportToCSV } from '@/lib/utils/formatters';

export default function FinanceReportsPage() {
  const [metrics, setMetrics] = React.useState<any>(null);

  React.useEffect(() => {
    async function load() {
      const data = await getFinanceDashboardMetrics();
      setMetrics(data);
    }
    load();
  }, []);

  if (!metrics) return <div className="p-8 text-center text-xs text-slate-500">Loading financial reports...</div>;

  const handleExportCollections = () => {
    const rows = store.payments.map((p) => ({
      ReceiptNumber: p.receipt_number,
      StudentName: p.student_name,
      Course: p.course_name,
      Amount: p.amount,
      PaymentMode: p.payment_mode,
      Date: p.payment_date,
      Reference: p.transaction_reference,
    }));
    exportToCSV('finance_collections_report', rows);
  };

  const handleExportExpenses = () => {
    const rows = store.expenses.map((e) => ({
      Code: e.expense_code,
      Category: e.category,
      Vendor: e.vendor_name,
      Description: e.description,
      Amount: e.amount,
      PaymentMode: e.payment_mode,
      Date: e.expense_date,
      Status: e.status,
    }));
    exportToCSV('finance_expenses_report', rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Financial Intelligence & Analytics</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time cash flow, course revenue contributions, payment method distributions, and exportable reconciliation reports.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleExportCollections} className="text-xs flex items-center space-x-1">
            <Download className="h-3.5 w-3.5" />
            <span>Export Collections</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExpenses} className="text-xs flex items-center space-x-1">
            <Download className="h-3.5 w-3.5" />
            <span>Export Expenses</span>
          </Button>
        </div>
      </div>

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#0A6ED1]">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly Collections</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatINR(metrics.monthlyCollections)}</h3>
            <p className="text-xs text-emerald-600 font-semibold mt-1">Verified Net Inflows</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly Expenses</p>
            <h3 className="text-2xl font-bold text-rose-700 mt-1">{formatINR(metrics.monthlyExpenses)}</h3>
            <p className="text-xs text-slate-500 mt-1">Approved Operating Costs</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net Cash Flow</p>
            <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(metrics.netCashFlow)}</h3>
            <p className="text-xs text-emerald-600 font-semibold mt-1">Surplus Margin</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Outstanding Balance</p>
            <h3 className="text-2xl font-bold text-amber-700 mt-1">{formatINR(metrics.totalOutstanding)}</h3>
            <p className="text-xs text-amber-600 font-semibold mt-1">Due Installments</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Course-wise Revenue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Course-wise Revenue Contribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(metrics.courseRevenueMap as Record<string, number>).map(([course, rev]) => {
              const pct = metrics.monthlyCollections > 0 ? Math.round((rev / metrics.monthlyCollections) * 100) : 0;
              return (
                <div key={course} className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-800">{course}</span>
                    <span className="text-slate-900">{formatINR(rev)} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#0A6ED1] h-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Payment Method Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Payment Mode Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(metrics.paymentModeMap as Record<string, number>).map(([mode, amt]) => {
              const pct = metrics.monthlyCollections > 0 ? Math.round((amt / metrics.monthlyCollections) * 100) : 0;
              return (
                <div key={mode} className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-800">{mode}</span>
                    <span className="text-slate-900">{formatINR(amt)} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
