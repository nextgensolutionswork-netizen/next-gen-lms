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
import { TableSkeleton } from '@/components/ui/skeleton';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { store } from '@/lib/services/data-store';
import { StudentFeeAccount } from '@/types';
import { formatINR, exportToCSV } from '@/lib/utils/formatters';
import { exportFeeLedgerToExcel } from '@/lib/utils/excel-export';
import { useAuth } from '@/components/providers/auth-provider';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import { adjustDiscontinuedStudentFee } from '@/lib/services/finance-service';

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

  const canManageDiscontinuation =
    role === 'accountant' || role === 'admin' || role === 'super_admin';

  const [feeAccounts, setFeeAccounts] = React.useState<StudentFeeAccount[]>(() => {
    store.reconcileDualLedgers();
    return store.feeAccounts || [];
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('search') || '';
    }
    return '';
  });
  const [statusFilter, setStatusFilter] = React.useState('All');

  // Discontinued Student Adjustment Modal State
  const [selectedFeeForDiscontinue, setSelectedFeeForDiscontinue] = React.useState<StudentFeeAccount | null>(null);
  const [isDiscontinueModalOpen, setIsDiscontinueModalOpen] = React.useState(false);
  const [discontinueReason, setDiscontinueReason] = React.useState('');
  const [discontinueAmount, setDiscontinueAmount] = React.useState<number>(0);
  const [discontinueError, setDiscontinueError] = React.useState<string | null>(null);
  const [discontinueSuccess, setDiscontinueSuccess] = React.useState<string | null>(null);

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

  const handleOpenDiscontinue = (fa: StudentFeeAccount) => {
    setSelectedFeeForDiscontinue(fa);
    setDiscontinueAmount(safeAmount(fa.outstanding_amount));
    setDiscontinueReason('');
    setDiscontinueError(null);
    setIsDiscontinueModalOpen(true);
  };

  const handleConfirmDiscontinue = () => {
    if (!selectedFeeForDiscontinue || !user) return;
    setDiscontinueError(null);
    try {
      adjustDiscontinuedStudentFee({
        fee_account_id: selectedFeeForDiscontinue.id,
        reason: discontinueReason,
        adjusted_amount: discontinueAmount,
        approved_by_user_id: user.id,
      });
      setDiscontinueSuccess(
        `Outstanding balance for ${selectedFeeForDiscontinue.student_name} adjusted by ${formatINR(discontinueAmount)}. Account marked as Discontinued / Adjusted.`
      );
      setIsDiscontinueModalOpen(false);
      setSelectedFeeForDiscontinue(null);
      setDiscontinueReason('');
      refreshList();
      setTimeout(() => setDiscontinueSuccess(null), 6000);
    } catch (err: any) {
      setDiscontinueError(err.message || 'Failed to adjust fee account.');
    }
  };

  React.useEffect(() => {
    let active = true;
    paymentWorkflowClient
      .refresh()
      .then(() => {
        if (active) refreshList();
      })
      .catch(() => {
        if (active) refreshList();
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
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
    <div className="space-y-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <Card className="border-l-4 border-l-emerald-500 shadow-xs">
          <CardContent className="p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Collected</p>
            <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(totalCollected)}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Verified bank, UPI, and cash receipts</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-xs">
          <CardContent className="p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Outstanding Balance</p>
            <h3 className="text-2xl font-bold text-amber-700 mt-1">{formatINR(totalOutstanding)}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Remaining student fee balances</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-xs">
          <CardContent className="p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Fee Accounts</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{activeCount} Students</h3>
            <p className="text-xs text-blue-600 font-semibold mt-0.5">100% Dual-ledger reconciliation</p>
          </CardContent>
        </Card>
      </div>

      {discontinueSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{discontinueSuccess}</span>
          </div>
          <button onClick={() => setDiscontinueSuccess(null)} className="text-slate-400 hover:text-slate-600 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card className="p-3 shadow-xs">
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
            {['All', 'Paid', 'Partially Paid', 'Unpaid', 'Overdue', 'Discontinued / Adjusted'].map((st) => (
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
              <thead className="bg-slate-50 text-[11px] text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-3.5 py-2.5">Student Name</th>
                  <th className="px-3.5 py-2.5">Course</th>
                  <th className="px-3.5 py-2.5">Original Fee</th>
                  <th className="px-3.5 py-2.5">Discount</th>
                  <th className="px-3.5 py-2.5">Net Payable</th>
                  <th className="px-3.5 py-2.5">Paid Amount</th>
                  <th className="px-3.5 py-2.5">Outstanding</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <TableSkeleton columns={9} rows={6} />
                ) : feeAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3.5 py-8 text-center text-slate-400">
                      <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="font-semibold text-slate-600">No student fee accounts found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your search query or status filter.</p>
                    </td>
                  </tr>
                ) : (
                  feeAccounts.map((fa) => (
                    <tr key={fa.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <Link
                          href={`/students/${fa.student_id}`}
                          className="font-semibold text-slate-900 hover:text-[#0A6ED1] hover:underline inline-flex items-center space-x-1"
                        >
                          <span>{fa.student_name}</span>
                          <ExternalLink className="h-3 w-3 opacity-40 hover:opacity-100" />
                        </Link>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{fa.course_name}</td>
                      <td className="px-3.5 py-2.5 font-medium text-slate-700 whitespace-nowrap">{formatINR(safeAmount(fa.original_fee))}</td>
                      <td className="px-3.5 py-2.5 text-emerald-600 font-medium whitespace-nowrap">
                        {safeAmount(fa.discount) > 0 ? `-${formatINR(safeAmount(fa.discount))}` : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-slate-900 whitespace-nowrap">{formatINR(safeAmount(fa.net_payable))}</td>
                      <td className="px-3.5 py-2.5 font-bold text-emerald-600 whitespace-nowrap">{formatINR(safeAmount(fa.paid_amount))}</td>
                      <td className="px-3.5 py-2.5 font-bold text-amber-600 whitespace-nowrap">{formatINR(safeAmount(fa.outstanding_amount))}</td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <Badge
                          variant={
                            fa.status === 'Paid'
                              ? 'success'
                              : fa.status === 'Discontinued / Adjusted'
                              ? 'outline'
                              : 'warning'
                          }
                          className={`whitespace-nowrap font-medium text-[11px] ${
                            fa.status === 'Discontinued / Adjusted' ? 'border-amber-400 bg-amber-50 text-amber-800' : ''
                          }`}
                        >
                          {fa.status}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-2">
                          <Link className="text-blue-700 text-xs underline" href={`/accounts/invoices/${encodeURIComponent(fa.id)}`}>Invoice</Link>
                          <Link className="text-blue-700 text-xs underline" href={`/accounts/statements/${encodeURIComponent(fa.student_id)}`}>Statement</Link>
                          {safeAmount(fa.outstanding_amount) > 0 ? (
                            <>
                              <Link
                                href={`/accounts/payments?studentId=${encodeURIComponent(fa.student_id)}&student_id=${encodeURIComponent(fa.student_id)}&student_name=${encodeURIComponent(fa.student_name || '')}&feeAccountId=${encodeURIComponent(fa.id)}&fee_id=${encodeURIComponent(fa.id)}&amount=${encodeURIComponent(safeAmount(fa.outstanding_amount))}&amount_due=${encodeURIComponent(safeAmount(fa.outstanding_amount))}&course_name=${encodeURIComponent(fa.course_name || '')}`}
                              >
                                <Button variant="sap" size="sm" className="h-7 px-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap shadow-xs">
                                  Collect
                                </Button>
                              </Link>
                              {canManageDiscontinuation && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenDiscontinue(fa)}
                                  className="h-7 px-2 text-xs font-semibold text-amber-700 hover:text-amber-900 border-amber-300 hover:bg-amber-50"
                                  title="Clear outstanding fee for discontinued student"
                                >
                                  Discontinue
                                </Button>
                              )}
                            </>
                          ) : fa.status === 'Discontinued / Adjusted' ? (
                            <span className="text-[11px] text-amber-700 font-semibold flex items-center justify-end space-x-1" title={fa.discontinuation_record?.reason}>
                              <span>Adjusted ({formatINR(fa.discontinuation_record?.adjusted_amount || 0)})</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-emerald-600 font-semibold flex items-center justify-end space-x-1">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                              <span>Cleared</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Discontinue Student Fee Adjustment Modal */}
      {selectedFeeForDiscontinue && (
        <Modal
          isOpen={isDiscontinueModalOpen}
          onClose={() => setIsDiscontinueModalOpen(false)}
          title="Discontinued Student — Clear Outstanding Fee"
          description={`Record an authorized write-off/adjustment for ${selectedFeeForDiscontinue.student_name} (${selectedFeeForDiscontinue.course_name}).`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2 rounded border border-amber-100">
                  <span className="text-[10px] text-slate-500 font-medium block">Total Net Fee</span>
                  <span className="font-bold text-slate-800 text-sm">{formatINR(safeAmount(selectedFeeForDiscontinue.net_payable))}</span>
                </div>
                <div className="bg-white p-2 rounded border border-amber-100">
                  <span className="text-[10px] text-slate-500 font-medium block">Amount Collected</span>
                  <span className="font-bold text-emerald-600 text-sm">{formatINR(safeAmount(selectedFeeForDiscontinue.paid_amount))}</span>
                </div>
                <div className="bg-white p-2 rounded border border-amber-100">
                  <span className="text-[10px] text-slate-500 font-medium block">Current Outstanding</span>
                  <span className="font-bold text-amber-700 text-sm">{formatINR(safeAmount(selectedFeeForDiscontinue.outstanding_amount))}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                <strong>Accounting Rule:</strong> Adjusting this balance creates an auditable write-off entry in the student financial ledger. Previously received payments are preserved and will not be altered.
              </p>
            </div>

            <div>
              <Input
                label="Adjustment / Write-Off Amount (₹) *"
                type="number"
                value={discontinueAmount}
                onChange={(e) => setDiscontinueAmount(Number(e.target.value))}
                min={1}
                max={safeAmount(selectedFeeForDiscontinue.outstanding_amount)}
                required
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Maximum adjustable: {formatINR(safeAmount(selectedFeeForDiscontinue.outstanding_amount))}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Discontinuation Reason & Approving Notes (Mandatory) *
              </label>
              <textarea
                rows={3}
                value={discontinueReason}
                onChange={(e) => setDiscontinueReason(e.target.value)}
                placeholder="e.g. Student discontinued after Module 1 due to medical relocation. Balance waived per Dean approval."
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                required
              />
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-[11px] text-slate-600">
              <span>Approving Officer: <strong>{user?.full_name || user?.email}</strong> ({role})</span>
              <span>Timestamp: <strong>{new Date().toLocaleDateString('en-IN')}</strong></span>
            </div>

            {discontinueError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center space-x-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{discontinueError}</span>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsDiscontinueModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="sap"
                size="sm"
                onClick={handleConfirmDiscontinue}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                Approve & Clear Balance
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
