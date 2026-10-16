'use client';

import * as React from 'react';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import { FileUpload } from '@/components/ui/file-upload';
import Link from 'next/link';
import {
  CreditCard,
  Plus,
  Search,
  Download,
  Receipt as ReceiptIcon,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  ShieldCheck,
  Clock,
  XCircle,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  Payment,
  PaymentMethod,
  StudentPaymentRecord,
  StudentFee,
} from '@/types';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';
import { exportCollectionsToExcel } from '@/lib/utils/excel-export';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export default function PaymentsPage() {
  const { user, role, hasPermission } = useAuth();
  const canAccessPaymentsDesk =
    hasPermission('accounts:read') ||
    hasPermission('payments:create') ||
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'counsellor';
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [studentPayments, setStudentPayments] = React.useState<StudentPaymentRecord[]>([]);
  const [search, setSearch] = React.useState('');
  const [isCollectModalOpen, setIsCollectModalOpen] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successReceiptId, setSuccessReceiptId] = React.useState<string | null>(null);

  // Active View Tab: 'centralized' | 'historical'
  const [activeTab, setActiveTab] = React.useState<'centralized' | 'historical'>('centralized');

  const canRecordPayment =
    hasPermission('payments:create') ||
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'counsellor';
  const canVerifyPayments =
    role === 'accountant' || role === 'admin' || role === 'super_admin';
  const canUpdatePayment =
    hasPermission('payments:create') ||
    role === 'counsellor' ||
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin';

  // Verification modal state
  const [selectedPayment, setSelectedPayment] = React.useState<StudentPaymentRecord | null>(null);
  const [verifyModalOpen, setVerifyModalOpen] = React.useState(false);
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [verificationNotes, setVerificationNotes] = React.useState('');
  const [rejectReason, setRejectReason] = React.useState('');

  // Update payment modal state (Counsellor / Staff)
  const [isUpdateModalOpen, setIsUpdateModalOpen] = React.useState(false);
  const [updatingPayment, setUpdatingPayment] = React.useState<StudentPaymentRecord | null>(null);
  const [editAmount, setEditAmount] = React.useState<number>(0);
  const [editPaymentMode, setEditPaymentMode] = React.useState<PaymentMethod>('UPI');
  const [editDate, setEditDate] = React.useState<string>('');
  const [editTxnRef, setEditTxnRef] = React.useState<string>('');
  const [editBankUpiRef, setEditBankUpiRef] = React.useState<string>('');
  const [editProofUrl, setEditProofUrl] = React.useState<string>('');
  const [editNotes, setEditNotes] = React.useState<string>('');

  // Collect Payment Form State (Centralized Fee based)
  const approvedFees = (store.studentFees || []).filter(
    (f) => f.approval_status === 'Approved' && f.outstanding_amount > 0
  );
  const [selectedFeeId, setSelectedFeeId] = React.useState(approvedFees[0]?.id || '');
  const [amount, setAmount] = React.useState(15000);
  const [paymentMode, setPaymentMode] = React.useState<PaymentMethod>('UPI');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [txnRef, setTxnRef] = React.useState('');
  const [bankUpiRef, setBankUpiRef] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [proofUrl, setProofUrl] = React.useState('');
  const [proofUploading, setProofUploading] = React.useState(false);

  const selectedFee = (store.studentFees || []).find((f) => f.id === selectedFeeId);

  const loadData = async () => {
    try { await paymentWorkflowClient.refresh(); } catch (error: any) { setErrorMessage(error.message); return; }
    store.reconcileDualLedgers();
    setPayments([...(store.payments || [])]);
    setStudentPayments([...(store.studentPayments || [])]);
  };

  const isUrlAmountApplied = React.useRef(false);

  React.useEffect(() => {
    loadData();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      let sId = params.get('studentId') || params.get('student_id');
      const fId = params.get('feeAccountId') || params.get('fee_id') || params.get('feeId');
      const amt = params.get('amount') || params.get('amount_due');

      if (sId || fId) {
        const matchingStudent = store.students.find((s) => s.id === sId);
        if (matchingStudent) {
          setSearch(matchingStudent.full_name);
        }

        let targetFee = (store.studentFees || []).find(
          (f) =>
            (fId && (f.id === fId || f.id === `fee-${fId}` || f.id.replace('fee-', '') === fId)) ||
            (sId && f.student_id === sId)
        );

        if (!targetFee && (sId || fId)) {
          const matchingFA = (store.feeAccounts || []).find(
            (fa) => (fId && fa.id === fId) || (sId && fa.student_id === sId)
          );
          if (matchingFA) {
            const student = store.students.find((s) => s.id === matchingFA.student_id);
            const newSF: StudentFee = {
              id: `fee-${matchingFA.id}`,
              student_id: matchingFA.student_id,
              student_name: matchingFA.student_name || student?.full_name || 'Enrolled Student',
              student_code: student?.student_code || 'STU-GEN-001',
              admission_number: student?.admission_number || 'ADM-2026-0001',
              course_id: matchingFA.course_id,
              course_name: matchingFA.course_name || 'SAP Course',
              batch_id: student?.batch_id,
              batch_name: student?.batch_name,
              fee_category: 'Tuition Fee',
              reference_type: 'Course',
              standard_fee: matchingFA.original_fee || 0,
              proposed_fee: matchingFA.original_fee || 0,
              discount_amount: matchingFA.discount || 0,
              discount_percentage: 0,
              discount_reason: matchingFA.discount_reason,
              tax_gst_amount: 0,
              additional_charges: 0,
              final_payable: matchingFA.net_payable,
              paid_amount: matchingFA.paid_amount,
              outstanding_amount: matchingFA.outstanding_amount,
              number_of_installments: 0,
              payment_plan: 'Full Payment',
              first_due_date: new Date().toISOString().split('T')[0],
              counsellor_id: 'counsellor-01',
              counsellor_name: 'Admissions Desk',
              approval_status: 'Approved',
              version: 1,
              is_payable: true,
              created_at: matchingFA.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            store.studentFees.unshift(newSF);
            store.persist();
            targetFee = newSF;
          }
        }

        if (targetFee) {
          setSelectedFeeId(targetFee.id);
          if (amt && !isNaN(Number(amt))) {
            isUrlAmountApplied.current = true;
            setAmount(Number(amt));
          } else {
            setAmount(targetFee.outstanding_amount);
          }
          setIsCollectModalOpen(true);
        } else if (matchingStudent) {
          setIsCollectModalOpen(true);
          if (amt && !isNaN(Number(amt))) {
            isUrlAmountApplied.current = true;
            setAmount(Number(amt));
          }
        }
      }
    }
  }, []);

  React.useEffect(() => {
    if (selectedFee) {
      if (!isUrlAmountApplied.current) {
        setAmount(Math.min(15000, selectedFee.outstanding_amount));
      } else {
        isUrlAmountApplied.current = false;
      }
    }
  }, [selectedFeeId, selectedFee]);

  const filteredPayments = React.useMemo(() => {
    if (!search.trim()) return payments;
    const q = search.toLowerCase();
    return payments.filter(
      (p) =>
        p.receipt_number?.toLowerCase().includes(q) ||
        p.student_name?.toLowerCase().includes(q) ||
        p.transaction_reference?.toLowerCase().includes(q) ||
        p.course_name?.toLowerCase().includes(q) ||
        p.collected_by_name?.toLowerCase().includes(q)
    );
  }, [payments, search]);

  const filteredStudentPayments = React.useMemo(() => {
    if (!search.trim()) return studentPayments;
    const q = search.toLowerCase();
    return studentPayments.filter(
      (p) =>
        p.student_name?.toLowerCase().includes(q) ||
        p.admission_number?.toLowerCase().includes(q) ||
        p.fee_category?.toLowerCase().includes(q) ||
        p.receipt_number?.toLowerCase().includes(q) ||
        p.transaction_reference?.toLowerCase().includes(q) ||
        p.bank_upi_reference?.toLowerCase().includes(q) ||
        p.recorded_by_name?.toLowerCase().includes(q)
    );
  }, [studentPayments, search]);

  // Handle Record Payment via centralized FeeWorkflowService
  const handleRecordFeePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (proofUploading) return;
    setErrorMessage(null);

    if (!canRecordPayment || !user) {
      setErrorMessage('Unauthorized: Only authorized finance personnel may record fee payments.');
      return;
    }

    if (!selectedFee) {
      setErrorMessage('Please select an approved fee account with outstanding balance.');
      return;
    }

    try {
      const paymentRec = await paymentWorkflowClient.recordPayment(
        {
          fee_id: selectedFee.id,
          student_id: selectedFee.student_id,
          enrollment_id: selectedFee.enrollment_id || selectedFee.admission_number,
          amount_paid: amount,
          payment_mode: paymentMode,
          payment_date: date,
          transaction_reference: txnRef,
          bank_upi_reference: bankUpiRef,
          payment_proof_url: proofUrl,
          notes,
        },
        user.id,
        (role as any) || (user.role as any) || 'counsellor'
      );

      store.reconcileDualLedgers();
      store.persist();

      setIsCollectModalOpen(false);
      setTxnRef('');
      setProofUrl('');
      setBankUpiRef('');
      setNotes('');
      loadData();

      if (paymentRec.verification_status === 'Verified') {
        const matchingReceipt = (store.receipts || []).find((r) => r.payment_id === paymentRec.id);
        if (matchingReceipt) {
          setSuccessReceiptId(matchingReceipt.id);
        } else if (paymentRec.receipt_number) {
          setSuccessReceiptId(paymentRec.receipt_number);
        } else {
          setSuccessReceiptId(null);
        }
      } else {
        alert(
          `Payment of ₹${amount.toLocaleString('en-IN')} recorded successfully!\n\nStatus: Pending Approval.\nAs per finance separation of duties policy, this payment will clear balance and generate official receipt once verified by an independent Accountant at /accounts/approvals.`
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record fee payment.');
    }
  };

  // Handle Accountant Payment Verification
  const handleVerifyPayment = async () => {
    if (!selectedPayment || !canVerifyPayments || !user) {
      setErrorMessage('Unauthorized: Only accountants can verify student payments.');
      return;
    }
    setErrorMessage(null);

    try {
      await paymentWorkflowClient.verifyPayment(selectedPayment.id, user.id, verificationNotes);
      store.reconcileDualLedgers();
      store.persist();
      setVerifyModalOpen(false);
      setVerificationNotes('');
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to verify payment.');
    }
  };

  const handleRejectPayment = async () => {
    if (!selectedPayment || !canVerifyPayments || !user) {
      setErrorMessage('Unauthorized: Only accountants can reject student payments.');
      return;
    }
    setErrorMessage(null);

    try {
      await paymentWorkflowClient.rejectPayment(selectedPayment.id, user.id, rejectReason);
      store.reconcileDualLedgers();
      store.persist();
      setRejectModalOpen(false);
      setRejectReason('');
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reject payment.');
    }
  };

  // Open Update Payment Modal (Counsellor / Staff)
  const handleOpenUpdateModal = (p: StudentPaymentRecord) => {
    setUpdatingPayment(p);
    setEditAmount(p.amount_paid);
    setEditPaymentMode(p.payment_mode);
    setEditDate(p.payment_date || new Date().toISOString().slice(0, 10));
    setEditTxnRef(p.transaction_reference || '');
    setEditBankUpiRef(p.bank_upi_reference || '');
    setEditProofUrl(p.payment_proof_url || '');
    setEditNotes(p.notes || '');
    setErrorMessage(null);
    setIsUpdateModalOpen(true);
  };

  // Handle Update Payment Submit
  const handleUpdatePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (proofUploading) return;
    if (!updatingPayment || !user) return;
    setErrorMessage(null);

    try {
      await paymentWorkflowClient.updatePayment(
        updatingPayment.id,
        {
          amount_paid: editAmount,
          payment_mode: editPaymentMode,
          payment_date: editDate,
          transaction_reference: editTxnRef,
          bank_upi_reference: editBankUpiRef,
          payment_proof_url: editProofUrl,
          notes: editNotes,
        },
        user.id,
        (role as any) || 'counsellor'
      );

      store.reconcileDualLedgers();
      store.persist();

      setIsUpdateModalOpen(false);
      setUpdatingPayment(null);
      loadData();
      alert(
        `Payment updated successfully!\n\nStatus: Pending Approval.\nThe updated payment details have been saved and forwarded to Fee Approvals (/accounts/approvals?desk=payments) for accountant approval.`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update payment.');
    }
  };

  const handleExport = () => {
    exportToCSV('payment_collections', payments);
  };

  const handleExportExcel = () => {
    exportCollectionsToExcel(payments);
  };

  const pendingVerificationCount = studentPayments.filter(
    (p) => p.verification_status === 'Pending Verification'
  ).length;

  const totalVerifiedAmount = studentPayments
    .filter((p) => p.verification_status === 'Verified')
    .reduce((sum, p) => sum + safeAmount(p.amount_paid), 0);

  if (!canAccessPaymentsDesk) {
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
                You do not possess the required financial permissions to view the fee payments and verification desk.
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
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <CreditCard className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Fee Payments & Verification Desk
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Centralized fee payment recording, separation-of-duties verification, payment receipts, and ledger reconciliation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Authenticated User Session Badge */}
          <div className="flex items-center space-x-2 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 font-medium">Session:</span>
            <span className="font-semibold text-slate-800">{user?.full_name || 'Staff'}</span>
            <Badge variant="outline" className="text-[10px] capitalize bg-white text-slate-700">
              {role?.replace('_', ' ') || 'Staff'}
            </Badge>
          </div>

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
          {canRecordPayment && (
            <Button
              variant="sap"
              size="sm"
              onClick={() => {
                setErrorMessage(null);
                setIsCollectModalOpen(true);
              }}
              className="text-xs flex items-center space-x-1 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Record Fee Payment</span>
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/accounts/approvals?desk=payments" className="block hover:opacity-95 transition-opacity">
          <Card className="border-l-4 border-l-amber-500 shadow-xs cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Pending Approval
                </p>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <h3 className="text-2xl font-bold text-amber-700 mt-1">{pendingVerificationCount}</h3>
              <p className="text-xs text-amber-700 font-medium mt-0.5 flex items-center space-x-1">
                <span>Review in Fee Approvals Desk</span>
                <ArrowRight className="h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className="border-l-4 border-l-emerald-500 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Verified Payments
              </p>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(totalVerifiedAmount)}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Financially cleared into ledger</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Official Receipts Issued
              </p>
              <ReceiptIcon className="h-4 w-4 text-blue-500" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{(store.receipts || []).length}</h3>
            <p className="text-xs text-blue-600 font-semibold mt-0.5">Verified payment receipts</p>
          </CardContent>
        </Card>
      </div>

      {successReceiptId && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-800 text-xs font-semibold">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <span>Payment successfully committed! Ledger updated and official receipt generated.</span>
          </div>
          <Link href={`/accounts/receipts/${successReceiptId}`}>
            <Button variant="sap" size="sm" className="text-xs">
              View Generated Receipt
            </Button>
          </Link>
        </div>
      )}

      {/* Shared Search Toolbar */}
      <Card className="p-4 shadow-xs">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by student name, code, receipt #, or txn reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
          />
        </div>
      </Card>

      {/* View Switcher Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('centralized')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-2 ${
            activeTab === 'centralized'
              ? 'bg-[#0A6ED1] text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span>Centralized Fee Payments Desk</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700 font-bold">
            {filteredStudentPayments.length}
          </span>
          {pendingVerificationCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-900 font-bold">
              {pendingVerificationCount} Pending
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('historical')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-2 ${
            activeTab === 'historical'
              ? 'bg-[#0A6ED1] text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span>All Historical Transactions</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700 font-bold">
            {filteredPayments.length}
          </span>
        </button>
      </div>

      {/* TAB 1: CENTRALIZED FEE PAYMENTS & VERIFICATION DESK */}
      {activeTab === 'centralized' && (
        <Card className="shadow-xs overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Student & LMS ID</th>
                    <th className="px-4 py-3">Fee Category</th>
                    <th className="px-4 py-3 text-right">Amount Paid</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Txn / UTR Reference</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Recorded By</th>
                    <th className="px-4 py-3">Verification Status</th>
                    <th className="px-4 py-3 text-right">Receipt #</th>
                    <th className="px-4 py-3 text-center">Workflow Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                        No centralized payment records match your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredStudentPayments.map((p) => {
                      const isAccountant =
                        role === 'accountant' || role === 'super_admin' || role === 'admin';
                      const isOwnRecorded =
                        p.recorded_by === user?.id;
                      const canVerify = isAccountant && !isOwnRecorded && p.verification_status === 'Pending Verification';

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div>
                              <span className="font-bold text-slate-800">{p.student_name}</span>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {p.admission_number}
                              </p>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {p.fee_category}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                            {formatINR(p.amount_paid)}
                          </td>

                          <td className="px-4 py-3">
                            <Badge variant="outline">{p.payment_mode}</Badge>
                          </td>

                          <td className="px-4 py-3 font-mono text-slate-600">
                            <span className="block truncate max-w-[130px]" title={p.transaction_reference}>
                              {p.transaction_reference || p.bank_upi_reference || '—'}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-slate-600">{p.payment_date}</td>

                          <td className="px-4 py-3 text-slate-600">
                            <div>
                              <p className="font-medium text-slate-800">{p.recorded_by_name}</p>
                              <p className="text-[10px] text-slate-400 capitalize">
                                ({p.recorded_by_role})
                              </p>
                              {p.updated_by_name && (
                                <p className="text-[9px] text-blue-600 font-semibold" title={`Updated: ${p.updated_at}`}>
                                  ✎ {p.updated_by_name} ({p.updated_by_role})
                                </p>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {p.verification_status === 'Verified' ? (
                              <Badge variant="success">Verified ✓</Badge>
                            ) : p.verification_status === 'Pending Verification' ? (
                              <Badge variant="warning">Pending Approval</Badge>
                            ) : (
                              <div><Badge variant="destructive">Rejected</Badge><p className="mt-1 text-[10px] text-red-700">{p.rejection_reason || p.verification_notes}</p></div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-mono text-blue-600 font-semibold">
                            {p.receipt_number ? (() => {
                              const matchingReceipt = (store.receipts || []).find(
                                (r) => r.receipt_number === p.receipt_number || r.payment_id === p.id
                              );
                              const targetRef = matchingReceipt?.id || p.receipt_number;
                              return (
                                <Link
                                  href={`/accounts/receipts/${encodeURIComponent(targetRef)}`}
                                  className="hover:underline text-blue-600 font-semibold inline-flex items-center space-x-1"
                                  title="View Official Receipt"
                                >
                                  <span>{p.receipt_number}</span>
                                  <ReceiptIcon className="h-3 w-3 opacity-60 hover:opacity-100" />
                                </Link>
                              );
                            })() : (
                              <span className="text-slate-400 font-normal italic">Pending</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center">
                            {p.verification_status !== 'Verified' ? (
                              <div className="flex items-center justify-center space-x-1">
                                {canUpdatePayment && (p.recorded_by === user?.id || isAccountant) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenUpdateModal(p)}
                                    className="text-xs px-2 py-1 h-7 bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 font-medium"
                                    title="Counsellor/Staff: Update payment amount, mode, transaction UTR, or notes"
                                  >
                                    Update
                                  </Button>
                                )}

                                {canVerify ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedPayment(p);
                                        setVerifyModalOpen(true);
                                      }}
                                      className="text-xs px-2 py-1 h-7 bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 font-semibold"
                                      title="Accountant: Approve and finalize payment, issue official receipt"
                                    >
                                      Approve
                                    </Button>

                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedPayment(p);
                                        setRejectModalOpen(true);
                                      }}
                                      className="text-xs px-2 py-1 h-7 bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100"
                                      title="Accountant: Reject payment entry"
                                    >
                                      Reject
                                    </Button>
                                  </>
                                ) : (
                                  !canUpdatePayment && (
                                    <span className="text-slate-400 text-[10px] italic">
                                      Pending Approval
                                    </span>
                                  )
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
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
      )}

      {/* TAB 2: HISTORICAL PAYMENTS TABLE */}
      {activeTab === 'historical' && (
        <div className="space-y-4">
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Receipt Number</th>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Reference / Txn ID</th>
                      <th className="px-4 py-3">Payment Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Collected By</th>
                      <th className="px-4 py-3 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                          No historical payment transactions match your filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((p) => {
                        const receipt = (store.receipts || []).find(
                          (r) => r.payment_id === p.id || (p.receipt_number && r.receipt_number === p.receipt_number)
                        );
                        const isVerified =
                          p.status === 'Success' &&
                          p.receipt_number &&
                          !p.receipt_number.startsWith('PENDING');
                        const targetReceiptRef = receipt?.id || p.receipt_number;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-blue-600">
                              {isVerified && targetReceiptRef ? (
                                <Link
                                  href={`/accounts/receipts/${encodeURIComponent(targetReceiptRef)}`}
                                  className="hover:underline inline-flex items-center space-x-1"
                                  title="View Official Signed Receipt"
                                >
                                  <span>{p.receipt_number}</span>
                                  <ReceiptIcon className="h-3 w-3 opacity-60 hover:opacity-100" />
                                </Link>
                              ) : (
                                <span className="inline-flex items-center text-amber-600 font-medium italic text-[11px]">
                                  <Clock className="h-3 w-3 mr-1" />
                                  <span>Pending Clearance</span>
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">{p.student_name}</td>
                            <td className="px-4 py-3 text-slate-600 truncate max-w-[140px]">{p.course_name}</td>
                            <td className="px-4 py-3 font-bold text-emerald-600">{formatINR(p.amount)}</td>
                            <td className="px-4 py-3">
                              <Badge variant={p.payment_mode === 'Payment Gateway' ? 'default' : 'outline'}>
                                {p.payment_mode}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                              {p.transaction_reference || '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-500">{formatDate(p.payment_date)}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={
                                  p.status === 'Success'
                                    ? 'success'
                                    : p.status === 'Pending'
                                    ? 'warning'
                                    : 'destructive'
                                }
                              >
                                {p.status === 'Success' ? 'Cleared ✓' : p.status || 'Success'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{p.collected_by_name || 'Accounts Staff'}</td>
                            <td className="px-4 py-3 text-right">
                              {isVerified && targetReceiptRef ? (
                                <Link href={`/accounts/receipts/${encodeURIComponent(targetReceiptRef)}`}>
                                  <Button variant="outline" size="sm" className="text-xs px-2.5 py-1 flex items-center space-x-1">
                                    <ReceiptIcon className="h-3 w-3 text-slate-500" />
                                    <span>View</span>
                                  </Button>
                                </Link>
                              ) : (
                                <span className="text-slate-400 text-[10px] italic">No Receipt</span>
                              )}
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: RECORD FEE PAYMENT (Centralized)                                  */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCollectModalOpen}
        onClose={() => setIsCollectModalOpen(false)}
        title="Record Student Fee Payment"
        description="Records student payment against an approved fee plan with strict separation of duties."
        maxWidth="lg"
      >
        <form onSubmit={handleRecordFeePayment} className="space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Approved Fee Account *
            </label>
            <select
              value={selectedFeeId}
              onChange={(e) => setSelectedFeeId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
            >
              {approvedFees.length === 0 ? (
                <option value="" disabled>
                  No approved fees with outstanding balance available
                </option>
              ) : (
                approvedFees.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.student_name} ({f.fee_category} — Outstanding: {formatINR(f.outstanding_amount)})
                  </option>
                ))
              )}
            </select>
          </div>

          {selectedFee && (
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-lg space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Student & LMS ID:</span>
                <span className="font-semibold text-slate-800">{selectedFee.student_name} ({selectedFee.student_code})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fee Category:</span>
                <span className="font-bold text-indigo-700">{selectedFee.fee_category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Net Payable:</span>
                <span className="font-bold text-slate-800">{formatINR(selectedFee.final_payable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Outstanding:</span>
                <span className="font-bold text-amber-700">{formatINR(selectedFee.outstanding_amount)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Payment Amount (₹) *"
              type="number"
              min={1}
              max={selectedFee?.outstanding_amount || 100000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Payment Method *
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMethod)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                <option value="UPI">UPI (PhonePe / GPay / Paytm)</option>
                <option value="Bank Transfer">Bank Transfer (NEFT / IMPS / RTGS)</option>
                <option value="Card">Debit / Credit Card</option>
                <option value="Cash">Cash at Campus Desk</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Payment Date *"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <Input
              label="Transaction Reference / UTR Number"
              placeholder="e.g. UPI/260301/992812 or NEFT-..."
              value={txnRef}
              onChange={(e) => setTxnRef(e.target.value)}
            />
          </div>

          <FileUpload bucket="payment-proofs" label="Payment Proof *" value={proofUrl} onChange={setProofUrl} onUploadingChange={setProofUploading} />
          <Input
            label="Notes / Comments"
            placeholder="e.g. Partial payment confirmed by student"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {role !== 'accountant' && role !== 'super_admin' && role !== 'admin' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px]">
              ⚠️ <strong>Non-Accountant Entry:</strong> This payment will be submitted as &ldquo;Pending Approval&rdquo;. Official receipt and student ledger clearance will be updated once an Accountant verifies the transaction.
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsCollectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sap"
              size="sm"
              disabled={!selectedFee || approvedFees.length === 0 || proofUploading || !proofUrl}
            >
              Commit Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: VERIFY PAYMENT MODAL (Accountant)                                 */}
      {/* ========================================================================= */}
      <Modal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        title="Verify Student Payment"
        description="Verify bank deposit/UPI transaction, credit student ledger, and generate official payment receipt."
        maxWidth="md"
      >
        {selectedPayment && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Student:</span>
                <span className="font-bold text-slate-800">{selectedPayment.student_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fee Category:</span>
                <span className="font-semibold text-indigo-700">{selectedPayment.fee_category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {formatINR(selectedPayment.amount_paid)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Mode:</span>
                <span className="font-semibold text-slate-800">{selectedPayment.payment_mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reference:</span>
                <span className="font-mono text-slate-800">{selectedPayment.transaction_reference || 'N/A'}</span>
              </div>
              {selectedPayment.payment_proof_url && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Proof:</span>
                  <a href={selectedPayment.payment_proof_url} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
                    View attachment
                  </a>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Recorded By:</span>
                <span className="text-slate-800">{selectedPayment.recorded_by_name} ({selectedPayment.recorded_by_role})</span>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Accountant Verification Notes:
              </label>
              <textarea
                rows={2}
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                placeholder="e.g. Bank statement credit verified on HDFC account #4019."
                className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setVerifyModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="sap"
                size="sm"
                onClick={handleVerifyPayment}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Confirm Verification & Issue Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: REJECT PAYMENT MODAL                                             */}
      {/* ========================================================================= */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject Payment Record"
        description="Mark payment entry as invalid. A mandatory rejection reason is required."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Rejection Reason (Mandatory) <span className="text-rose-500">*</span>:
            </label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Transaction reference not found in bank statement, or cheque bounced."
              className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!rejectReason.trim()}
              onClick={handleRejectPayment}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: UPDATE PAYMENT MODAL (Counsellor / Staff)                        */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isUpdateModalOpen}
        onClose={() => {
          setIsUpdateModalOpen(false);
          setUpdatingPayment(null);
        }}
        title="Update Fee Payment Record"
        description="Modify payment amount, mode, transaction reference, or payment proof for pending verification records."
        maxWidth="lg"
      >
        {updatingPayment && (
          <form onSubmit={handleUpdatePaymentSubmit} className="space-y-4">
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Student:</span>
                <span className="font-semibold text-slate-800">{updatingPayment.student_name} ({updatingPayment.admission_number})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fee Category:</span>
                <span className="font-semibold text-indigo-700">{updatingPayment.fee_category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recorded By:</span>
                <span className="text-slate-800">{updatingPayment.recorded_by_name} ({updatingPayment.recorded_by_role})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-amber-800">{updatingPayment.verification_status}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Payment Amount (₹) *"
                type="number"
                min={1}
                value={editAmount}
                onChange={(e) => setEditAmount(Number(e.target.value))}
                required
              />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Payment Method *
                </label>
                <select
                  value={editPaymentMode}
                  onChange={(e) => setEditPaymentMode(e.target.value as PaymentMethod)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
                >
                  <option value="UPI">UPI (PhonePe / GPay / Paytm)</option>
                  <option value="Bank Transfer">Bank Transfer (NEFT / IMPS / RTGS)</option>
                  <option value="Card">Debit / Credit Card</option>
                  <option value="Cash">Cash at Campus Desk</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Payment Date *"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
              />
              <Input
                label="Transaction Reference / UTR Number"
                placeholder="e.g. UPI/260301/992812 or NEFT-..."
                value={editTxnRef}
                onChange={(e) => setEditTxnRef(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Bank / UPI Reference Details"
                placeholder="e.g. HDFC Bank UPI / Google Pay Ref"
                value={editBankUpiRef}
                onChange={(e) => setEditBankUpiRef(e.target.value)}
              />
              <FileUpload bucket="payment-proofs" label="Replace payment proof" value={editProofUrl} onChange={setEditProofUrl} onUploadingChange={setProofUploading} />
              <Input
                label="Payment Proof URL / Doc Link"
                placeholder="e.g. https://... or /uploads/receipt.pdf"
                value={editProofUrl}
                onChange={(e) => setEditProofUrl(e.target.value)}
              />
            </div>

            <Input
              label="Notes / Comments"
              placeholder="e.g. Corrected amount as per student's bank statement copy"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-[11px]">
              ℹ️ <strong>Workflow Notice:</strong> Updating this payment preserves its &ldquo;Pending Approval&rdquo; status. The accountant will review these updated details before granting final approval and generating the payment receipt.
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsUpdateModalOpen(false);
                  setUpdatingPayment(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="sap"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Save Payment Updates
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
