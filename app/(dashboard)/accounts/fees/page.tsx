'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IndianRupee,
  Search,
  Download,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Plus,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { StudentFeeAccount } from '@/types';
import { formatINR, exportToCSV } from '@/lib/utils/formatters';
import { exportFeeLedgerToExcel } from '@/lib/utils/excel-export';
import { useAuth } from '@/components/providers/auth-provider';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export default function StudentFeesPage() {
  const { role, user, hasPermission } = useAuth();

  const canAccessFees =
    hasPermission('accounts:read') ||
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin';

  const [feeAccounts, setFeeAccounts] = React.useState<StudentFeeAccount[]>(() => {
    store.reconcileDualLedgers();
    return store.feeAccounts || [];
  });
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('All');

  const refreshList = React.useCallback(() => {
    store.reconcileDualLedgers();
    let list = [...(store.feeAccounts || [])];
    if (statusFilter !== 'All') {
      list = list.filter((f) => f.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.student_name?.toLowerCase().includes(q) ||
          f.course_name?.toLowerCase().includes(q) ||
          f.student_id?.toLowerCase().includes(q)
      );
    }
    setFeeAccounts(list);
  }, [search, statusFilter]);

  React.useEffect(() => {
    paymentWorkflowClient
      .refresh()
      .then(() => {
        refreshList();
      })
      .catch(() => {
        refreshList();
      });
  }, [refreshList]);

  if (!canAccessFees) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          You do not have authorization to view the central student fee ledger and financial records. This area is restricted to Accounts and Finance administration.
        </p>
        <div className="pt-2">
          <Link href={role === 'student' ? '/portal' : '/dashboard'}>
            <Button variant="sap" size="sm" className="text-xs">
              Return to {role === 'student' ? 'Student Portal' : 'Dashboard'}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalOutstanding = (store.feeAccounts || []).reduce(
    (sum, f) => sum + safeAmount(f.outstanding_amount),
    0
  );
  const totalCollected = (store.feeAccounts || []).reduce(
    (sum, f) => sum + safeAmount(f.paid_amount),
    0
  );
  const activeCount = (store.feeAccounts || []).length;

  const handleExport = () => {
    exportToCSV('student_fee_ledger', feeAccounts);
  };

  const handleExportExcel = () => {
    exportFeeLedgerToExcel(feeAccounts);
  };

  const firstWithDue = feeAccounts.find((f) => safeAmount(f.outstanding_amount) > 0);
  const recordPaymentUrl = firstWithDue
    ? `/accounts/payments?studentId=${encodeURIComponent(firstWithDue.student_id)}&student_id=${encodeURIComponent(firstWithDue.student_id)}&student_name=${encodeURIComponent(firstWithDue.student_name || '')}&feeAccountId=${encodeURIComponent(firstWithDue.id)}&fee_id=${encodeURIComponent(firstWithDue.id)}&amount=${encodeURIComponent(safeAmount(firstWithDue.outstanding_amount))}&amount_due=${encodeURIComponent(safeAmount(firstWithDue.outstanding_amount))}`
    : '/accounts/payments';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Fee Accounts Ledger</h1>
          <p className="text-xs text-slate-500 mt-1">
            End-to-end fee structures, discounts, net payables, collected receipts, and balance tracking.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="text-xs flex items-center space-x-1">
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="text-xs flex items-center space-x-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Export to Excel</span>
          </Button>
          <Link href="/accounts/approvals">
            <Button variant="outline" size="sm" className="text-xs flex items-center space-x-1 text-blue-700 border-blue-200 hover:bg-blue-50">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              <span>Approvals Desk</span>
            </Button>
          </Link>
          <Link href={recordPaymentUrl}>
            <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1">
              <Plus className="h-4 w-4" />
              <span>Record Payment</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Collected</p>
            <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(totalCollected)}</h3>
            <p className="text-xs text-slate-500 mt-1">Verified bank, UPI, and cash receipts</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Outstanding Balance</p>
            <h3 className="text-2xl font-bold text-amber-700 mt-1">{formatINR(totalOutstanding)}</h3>
            <p className="text-xs text-slate-500 mt-1">Remaining student fee balances</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Fee Accounts</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{activeCount} Students</h3>
            <p className="text-xs text-blue-600 font-semibold mt-1">100% Dual-ledger reconciliation</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by student name or course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            {['All', 'Paid', 'Partially Paid', 'Unpaid', 'Overdue'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-[#0A6ED1] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Fee Ledger Table */}
      <Card className="shadow-xs">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Original Fee</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Net Payable</th>
                  <th className="px-4 py-3">Paid Amount</th>
                  <th className="px-4 py-3">Outstanding</th>
                  
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feeAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="font-semibold text-slate-600">No student fee accounts found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your search query or status filter.</p>
                    </td>
                  </tr>
                ) : (
                  feeAccounts.map((fa) => (
                    <tr key={fa.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/students/${fa.student_id}`}
                          className="font-semibold text-slate-900 hover:text-[#0A6ED1] hover:underline inline-flex items-center space-x-1"
                        >
                          <span>{fa.student_name}</span>
                          <ExternalLink className="h-3 w-3 opacity-40 hover:opacity-100" />
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fa.course_name}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{formatINR(safeAmount(fa.original_fee))}</td>
                      <td className="px-4 py-3 text-emerald-600 font-medium">
                        {safeAmount(fa.discount) > 0 ? `-${formatINR(safeAmount(fa.discount))}` : '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{formatINR(safeAmount(fa.net_payable))}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600">{formatINR(safeAmount(fa.paid_amount))}</td>
                      <td className="px-4 py-3 font-bold text-amber-600">{formatINR(safeAmount(fa.outstanding_amount))}</td>
                      
                      <td className="px-4 py-3">
                        <Badge variant={fa.status === 'Paid' ? 'success' : 'warning'}>{fa.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {safeAmount(fa.outstanding_amount) > 0 ? (
                          <Link
                            href={`/accounts/payments?studentId=${encodeURIComponent(fa.student_id)}&student_id=${encodeURIComponent(fa.student_id)}&student_name=${encodeURIComponent(fa.student_name || '')}&feeAccountId=${encodeURIComponent(fa.id)}&fee_id=${encodeURIComponent(fa.id)}&amount=${encodeURIComponent(safeAmount(fa.outstanding_amount))}&amount_due=${encodeURIComponent(safeAmount(fa.outstanding_amount))}&course_name=${encodeURIComponent(fa.course_name || '')}`}
                          >
                            <Button variant="sap" size="sm" className="text-xs px-2.5 py-1">
                              Collect
                            </Button>
                          </Link>
                        ) : (
                          <span className="text-[11px] text-emerald-600 font-semibold flex items-center justify-end space-x-1">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                            <span>Cleared</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
