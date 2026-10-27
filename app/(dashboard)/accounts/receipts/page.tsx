'use client';

import * as React from 'react';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import Link from 'next/link';
import {
  Receipt as ReceiptIcon,
  Search,
  Download,
  Printer,
  FileSpreadsheet,
  ExternalLink,
  ShieldCheck,
  CreditCard,
  IndianRupee,
  Plus,
  ShieldAlert,
  Ban,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';
import { exportReceiptsToExcel } from '@/lib/utils/excel-export';
import { Receipt } from '@/types';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export default function ReceiptsListPage() {
  const { user, role, hasPermission } = useAuth();
  const canAccessReceipts =
    hasPermission('accounts:read') ||
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin';
  const canVoidReceipt =
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin';

  const [receipts, setReceipts] = React.useState<Receipt[]>(() => {
    store.reconcileDualLedgers();
    return store.receipts || [];
  });
  const [search, setSearch] = React.useState('');

  // Receipt Cancellation / Void & Credit Note Modal State
  const [selectedReceiptForVoid, setSelectedReceiptForVoid] = React.useState<Receipt | null>(null);
  const [voidModalOpen, setVoidModalOpen] = React.useState(false);
  const [voidReasonCategory, setVoidReasonCategory] = React.useState('Cheque Bounced / Dishonoured');
  const [voidReasonDetails, setVoidReasonDetails] = React.useState('');
  const [voidError, setVoidError] = React.useState<string | null>(null);
  const [voidSuccessMsg, setVoidSuccessMsg] = React.useState<string | null>(null);

  const refreshList = React.useCallback(async () => {
    try { await paymentWorkflowClient.refreshReceipts(); } catch (error: any) { setVoidError(error.message); return; }
    store.reconcileDualLedgers();
    setReceipts([...(store.receipts || [])]);
  }, []);

  React.useEffect(() => {
    refreshList();
  }, [refreshList]);

  const filteredReceipts = React.useMemo(() => {
    if (!search.trim()) return receipts;
    const q = search.toLowerCase();
    return receipts.filter(
      (r) =>
        String(r?.receipt_number || '').toLowerCase().includes(q) ||
        String(r?.student_name || '').toLowerCase().includes(q) ||
        String(r?.admission_number || '').toLowerCase().includes(q) ||
        String(r?.course_name || '').toLowerCase().includes(q) ||
        String(r?.payment_mode || '').toLowerCase().includes(q) ||
        String(r?.transaction_reference || '').toLowerCase().includes(q) ||
        String(r?.status || '').toLowerCase().includes(q) ||
        String(r?.credit_note_number || '').toLowerCase().includes(q) ||
        String(r?.void_reason || '').toLowerCase().includes(q)
    );
  }, [receipts, search]);

  const allReceipts = receipts || [];
  const activeReceipts = allReceipts.filter((r) => r.status !== 'Void');
  const voidedReceipts = allReceipts.filter((r) => r.status === 'Void');
  const totalCollected = activeReceipts.reduce((sum, r) => sum + safeAmount(r.payment_amount ?? r.amount), 0);

  const handleConfirmVoid = async () => {
    if (!selectedReceiptForVoid || !user || !canVoidReceipt) return;
    setVoidError(null);
    const finalReason = voidReasonDetails.trim()
      ? `${voidReasonCategory}: ${voidReasonDetails.trim()}`
      : voidReasonCategory;

    try {
      let creditNoteNumber = '';
      if (typeof window !== 'undefined') {
        const { paymentWorkflowClient } = await import('@/lib/services/payment-workflow-client');
        const res = await paymentWorkflowClient.voidReceipt(selectedReceiptForVoid.id, finalReason);
        creditNoteNumber = res?.creditNoteNumber || '';
      } else {
        const res = feeWorkflowService.voidReceipt(selectedReceiptForVoid.id, user.id, finalReason);
        creditNoteNumber = res.creditNoteNumber;
      }
      setVoidSuccessMsg(
        `Receipt ${selectedReceiptForVoid.receipt_number} has been voided. Official Credit Note ${creditNoteNumber} issued and student ledger restored.`
      );
      setVoidModalOpen(false);
      setSelectedReceiptForVoid(null);
      setVoidReasonDetails('');
      refreshList();
      setTimeout(() => setVoidSuccessMsg(null), 6000);
    } catch (err: any) {
      setVoidError(err.message || 'Failed to void receipt.');
    }
  };

  if (!canAccessReceipts) {
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
                You do not possess the required financial permissions (`accounts:read`) to view the signed official receipts registry.
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

  const handleExportCSV = () => {
    const exportData = filteredReceipts.map((r) => ({
      ReceiptNumber: r.receipt_number,
      Status: r.status || 'Valid',
      CreditNoteNumber: r.credit_note_number || 'N/A',
      VoidReason: r.void_reason || 'N/A',
      StudentName: r.student_name,
      AdmissionNumber: r.admission_number || r.student_code || 'N/A',
      Course: r.course_name,
      AmountPaid: r.payment_amount ?? r.amount ?? 0,
      PaymentMode: r.payment_mode,
      TransactionReference: r.transaction_reference || 'N/A',
      RemainingBalance: r.remaining_balance ?? 0,
      PaymentDate: r.payment_date || r.receipt_date || 'N/A',
      AuthorizedBy: r.authorized_by || r.issued_by || 'Accounts Staff',
    }));
    exportToCSV('signed_official_receipts_registry', exportData);
  };

  const handleExportExcel = () => {
    exportReceiptsToExcel(filteredReceipts);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <ReceiptIcon className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Signed Official Receipts Registry
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Numbered fee receipts ready for viewing, printing, PDF export, audit reconciliation, and WhatsApp distribution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={filteredReceipts.length === 0}
            onClick={handleExportCSV}
            className="text-xs flex items-center space-x-1"
          >
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
            <span>Export Excel</span>
          </Button>

          <Link href="/accounts/payments">
            <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1 shadow-sm">
              <Plus className="h-4 w-4" />
              <span>Collect Fee Payment</span>
            </Button>
          </Link>
        </div>
      </div>

      {voidSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span>{voidSuccessMsg}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-600 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Receipts Issued</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{activeReceipts.length}</h3>
            <p className="text-xs text-slate-500 mt-1">{allReceipts.length} total generated in registry</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net Billed & Collected</p>
            <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(totalCollected)}</h3>
            <p className="text-xs text-slate-500 mt-1">Cleared tuition fees (net of void)</p>
          </CardContent>
        </Card>

        

        <Card className="border-l-4 border-l-rose-500 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Voided / Credit Notes</p>
            <h3 className="text-2xl font-bold text-rose-600 mt-1">{voidedReceipts.length}</h3>
            <p className="text-xs text-slate-500 mt-1">Reversed & cancelled invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <Card className="p-4 shadow-xs">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by receipt #, student name, admission #, or course..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
          />
        </div>
      </Card>

      {/* Receipts Table */}
      <Card className="shadow-xs">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Receipt Number</th>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Admission #</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Amount Paid</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Remaining Balance</th>
                  <th className="px-4 py-3">Payment Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-14 text-center">
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                          <ReceiptIcon className="h-6 w-6" />
                        </div>
                        {search.trim() ? (
                          <>
                            <h3 className="font-semibold text-slate-800 text-sm">
                              No receipts match &ldquo;{search}&rdquo;
                            </h3>
                            <p className="text-xs text-slate-500">
                              Try searching with different keywords such as admission number or student name.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSearch('')}
                              className="text-xs mt-1"
                            >
                              Clear Search Filter
                            </Button>
                          </>
                        ) : (
                          <>
                            <h3 className="font-semibold text-slate-800 text-sm">
                              No official fee receipts found
                            </h3>
                            <p className="text-xs text-slate-500">
                              Fee collections verified by an Accountant will automatically generate official payment receipts here.
                            </p>
                            <Link href="/accounts/payments">
                              <Button variant="sap" size="sm" className="text-xs mt-1">
                                Go to Payments Desk
                              </Button>
                            </Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map((r) => {
                    const isVoid = r.status === 'Void';
                    return (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-blue-600 font-mono">
                          <Link
                            href={`/accounts/receipts/${encodeURIComponent(r.id || r.receipt_number)}`}
                            className="hover:underline"
                            title="View Official Receipt"
                          >
                            {r.receipt_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/students/${encodeURIComponent(r.student_id)}`}
                            className="font-medium text-slate-800 hover:text-blue-600 hover:underline inline-flex items-center space-x-1"
                            title="View Student 360° Profile"
                          >
                            <span>{r.student_name}</span>
                            <ExternalLink className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">{r.admission_number || r.student_code || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]" title={r.course_name}>
                          {r.course_name}
                        </td>
                        <td className="px-4 py-3 font-bold font-mono text-xs">
                          <span className={isVoid ? 'line-through text-slate-400' : 'text-emerald-600'}>
                            {formatINR(r.payment_amount ?? r.amount ?? 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-[10px]">
                            {r.payment_mode}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-bold text-amber-700 font-mono text-xs">
                          {formatINR(r.remaining_balance ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(r.payment_date || r.receipt_date)}</td>
                        <td className="px-4 py-3">
                          {isVoid ? (
                            <div className="space-y-0.5">
                              <Badge variant="destructive" className="text-[10px]">
                                Void (Cancelled)
                              </Badge>
                              {r.credit_note_number && (
                                <p
                                  className="text-[10px] font-mono text-rose-600 font-semibold truncate max-w-[110px]"
                                  title={`Credit Note: ${r.credit_note_number}`}
                                >
                                  {r.credit_note_number}
                                </p>
                              )}
                            </div>
                          ) : (
                            <Badge variant="success" className="text-[10px]">
                              Valid ✓
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <a
                              href={`/api/receipts/${encodeURIComponent(r.id || r.receipt_number)}/pdf?download=true`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Download Official A4 Fee Receipt PDF"
                            >
                              <Button variant="outline" size="sm" className="text-xs px-2 py-1 flex items-center space-x-1">
                                <Download className="h-3 w-3 text-blue-600" />
                                <span>PDF</span>
                              </Button>
                            </a>
                            <Link href={`/accounts/receipts/${encodeURIComponent(r.id || r.receipt_number)}`}>
                              <Button variant="sap" size="sm" className="text-xs px-2.5 py-1 flex items-center space-x-1 shadow-2xs">
                                <Printer className="h-3 w-3" />
                                <span>View</span>
                              </Button>
                            </Link>
                            {canVoidReceipt && !isVoid && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setVoidError(null);
                                  setVoidReasonDetails('');
                                  setVoidReasonCategory('Cheque Bounced / Dishonoured');
                                  setSelectedReceiptForVoid(r);
                                  setVoidModalOpen(true);
                                }}
                                className="text-xs px-2 py-1 text-rose-700 hover:bg-rose-50 border-rose-200 flex items-center space-x-1"
                                title="Void Receipt & Issue Credit Note"
                              >
                                <Ban className="h-3 w-3 text-rose-600" />
                                <span>Void</span>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Void Receipt & Credit Note Modal */}
      <Modal
        isOpen={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        title="Void Receipt & Issue Credit Note"
        description="Cancels an official fee receipt, reverses payments in dual ledgers, restores student balance, and issues an official Credit Note."
        maxWidth="md"
      >
        {selectedReceiptForVoid && (
          <div className="space-y-4 text-xs">
            {voidError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                <span>{voidError}</span>
              </div>
            )}

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Receipt Number:</span>
                <span className="font-mono font-bold text-slate-900">{selectedReceiptForVoid.receipt_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Student:</span>
                <span className="font-semibold text-slate-800">
                  {selectedReceiptForVoid.student_name} ({selectedReceiptForVoid.admission_number})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount to Reverse:</span>
                <span className="font-mono font-bold text-rose-600 text-sm">
                  {formatINR(selectedReceiptForVoid.payment_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Mode:</span>
                <span className="font-medium text-slate-800">{selectedReceiptForVoid.payment_mode}</span>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Cancellation Reason Category <span className="text-rose-500">*</span>:
              </label>
              <select
                value={voidReasonCategory}
                onChange={(e) => setVoidReasonCategory(e.target.value)}
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              >
                <option value="Cheque Bounced / Dishonoured">Cheque Bounced / Dishonoured</option>
                <option value="Chargeback / Bank Transaction Disputed">Chargeback / Bank Transaction Disputed</option>
                <option value="Duplicate Billing Entry / System Error">Duplicate Billing Entry / System Error</option>
                <option value="Admission Cancelled / Tuition Fee Refunded">Admission Cancelled / Tuition Fee Refunded</option>
                <option value="Wrong Student Account Credited">Wrong Student Account Credited</option>
                <option value="Other Financial Reversal">Other Financial Reversal</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Detailed Reversal Justification (Mandatory for audit) <span className="text-rose-500">*</span>:
              </label>
              <textarea
                rows={3}
                value={voidReasonDetails}
                onChange={(e) => setVoidReasonDetails(e.target.value)}
                placeholder="e.g. Bank CTS return code 03 (Insufficient funds), or duplicate entry confirmed by accountant."
                className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                required
              />
            </div>

            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 space-y-1">
              <p className="font-semibold">⚠️ Accounting Audit Note:</p>
              <p>
                Voiding this receipt will generate a sequential Credit Note (CN-2026-XXXX), mark the payment record as Refunded/Rejected, restore the outstanding balance on the student's fee ledger, and post a credit note reversal entry.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setVoidModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!voidReasonDetails.trim()}
                onClick={handleConfirmVoid}
                className="flex items-center space-x-1"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Confirm Void & Issue Credit Note</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
