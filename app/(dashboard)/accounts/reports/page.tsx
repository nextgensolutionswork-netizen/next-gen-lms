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
  FileSpreadsheet,
  ShieldCheck,
  Receipt,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { getFinanceDashboardMetrics } from '@/lib/services/finance-service';
import { calculateGstBreakdown } from '@/lib/services/gst-service';
import { formatINR, exportToCSV } from '@/lib/utils/formatters';
import {
  exportGstReportToExcel,
  exportCollectionsToExcel,
  exportExpensesToExcel,
} from '@/lib/utils/excel-export';

export default function FinanceReportsPage() {
  const [metrics, setMetrics] = React.useState<any>(null);

  React.useEffect(() => {
    async function load() {
      const data = await getFinanceDashboardMetrics();
      setMetrics(data);
    }
    load();
  }, []);

  const gstBreakdowns = React.useMemo(() => {
    let intraTax = 0;
    let interTax = 0;
    let totalTaxable = 0;
    let totalTax = 0;

    for (const p of store.payments) {
      const student = store.students.find((s) => s.id === p.student_id);
      const admission = store.admissions.find(
        (a) => a.id === student?.admission_id || a.admission_number === student?.admission_number
      );
      const studentLoc =
        student?.state_code ||
        student?.state ||
        admission?.state_code ||
        admission?.state ||
        admission?.city ||
        admission?.address ||
        student?.address ||
        'Telangana';
      const gst = calculateGstBreakdown(p.amount, studentLoc);
      totalTaxable += gst.taxable_amount;
      totalTax += gst.total_tax;
      if (gst.supply_type === 'INTRA_STATE') {
        intraTax += gst.total_tax;
      } else {
        interTax += gst.total_tax;
      }
    }

    return {
      intraTax,
      interTax,
      totalTaxable,
      totalTax,
      totalGross: totalTaxable + totalTax,
    };
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

  const handleExportCollectionsExcel = () => {
    exportCollectionsToExcel(store.payments);
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

  const handleExportExpensesExcel = () => {
    exportExpensesToExcel(store.expenses);
  };

  const handleExportGstExcel = () => {
    exportGstReportToExcel(store.payments);
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
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCollections} className="text-xs flex items-center space-x-1">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportGstExcel}
            className="text-xs flex items-center space-x-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
            <span>GST Report (Excel)</span>
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

      {/* GST Compliance & e-Invoice Reconciliation Card */}
      <Card className="border-blue-200 bg-linear-to-r from-blue-50/50 to-indigo-50/30">
        <CardHeader className="pb-3 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">
                GST Tax Compliance & GSTR-1 Audit Engine
              </CardTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Automated 18% GST calculation (9% CGST + 9% SGST within state, 18% IGST inter-state) with SHA-256 e-Invoice IRN signing.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 text-[10px]">
              SAC: 999293 (Coaching)
            </Badge>
            <Button
              variant="sap"
              size="sm"
              onClick={handleExportGstExcel}
              className="text-xs flex items-center space-x-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Export GSTR-1 Excel (.xlsx)</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Institute GSTIN</span>
              <span className="font-mono font-bold text-slate-800 text-xs">
                {store.settings.gst_number || '36AAACN1234F1Z8'}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">State: Telangana (36)</span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Taxable Base Turnover</span>
              <span className="font-bold text-slate-900 text-sm block mt-0.5">
                {formatINR(gstBreakdowns.totalTaxable)}
              </span>
              <span className="text-[10px] text-slate-500">Excluding 18% tax</span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Intra-State GST (CGST+SGST)</span>
              <span className="font-bold text-emerald-700 text-sm block mt-0.5">
                {formatINR(gstBreakdowns.intraTax)}
              </span>
              <span className="text-[10px] text-emerald-600">9% CGST + 9% SGST</span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Inter-State GST (IGST)</span>
              <span className="font-bold text-blue-700 text-sm block mt-0.5">
                {formatINR(gstBreakdowns.interTax)}
              </span>
              <span className="text-[10px] text-blue-600">18% IGST (Out of state)</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-blue-100">
            <div className="flex items-center space-x-1.5 text-slate-600">
              <Receipt className="h-4 w-4 text-blue-600" />
              <span>
                Total Output Tax Liability: <strong className="text-slate-900 font-bold">{formatINR(gstBreakdowns.totalTax)}</strong> on gross collections of <strong>{formatINR(gstBreakdowns.totalGross)}</strong>
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              Ready for GSTR-1, GSTR-3B & e-Invoice JSON Filing
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
