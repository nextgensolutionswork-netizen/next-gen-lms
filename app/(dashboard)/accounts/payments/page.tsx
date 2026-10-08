'use client';

import * as React from 'react';
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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  Payment,
  PaymentMethod,
  StudentPaymentRecord,
  StudentFee,
  UserProfile,
} from '@/types';
import { recordPaymentAtomic } from '@/lib/services/finance-service';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';
import { exportCollectionsToExcel } from '@/lib/utils/excel-export';

export default function PaymentsPage() {
  const [payments, setPayments] = React.useState<Payment[]>(store.payments);
  const [studentPayments, setStudentPayments] = React.useState<StudentPaymentRecord[]>([]);
  const [search, setSearch] = React.useState('');
  const [isCollectModalOpen, setIsCollectModalOpen] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successReceiptId, setSuccessReceiptId] = React.useState<string | null>(null);

  // Active View Tab: 'centralized' | 'historical'
  const [activeTab, setActiveTab] = React.useState<'centralized' | 'historical'>('centralized');

  // Role preview switcher for testing separation of duties
  const [currentUser, setCurrentUser] = React.useState<UserProfile>(
    store.users.find((u) => u.id === 'usr-accounts') || store.users[2]
  );

  // Verification modal state
  const [selectedPayment, setSelectedPayment] = React.useState<StudentPaymentRecord | null>(null);
  const [verifyModalOpen, setVerifyModalOpen] = React.useState(false);
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [verificationNotes, setVerificationNotes] = React.useState('');
  const [rejectReason, setRejectReason] = React.useState('');

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

  const selectedFee = (store.studentFees || []).find((f) => f.id === selectedFeeId);

  const loadData = () => {
    setPayments([...store.payments]);
    setStudentPayments([...(store.studentPayments || [])]);
  };

  React.useEffect(() => {
    loadData();
  }, []);

  React.useEffect(() => {
    if (selectedFee) {
      setAmount(Math.min(15000, selectedFee.outstanding_amount));
    }
  }, [selectedFeeId, selectedFee]);

  const refreshList = () => {
    let list = [...store.payments];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.receipt_number.toLowerCase().includes(q) ||
          p.student_name?.toLowerCase().includes(q) ||
          p.transaction_reference?.toLowerCase().includes(q)
      );
    }
    setPayments(list);
  };

  React.useEffect(() => {
    refreshList();
  }, [search]);

  // Handle Record Payment via centralized FeeWorkflowService
  const handleRecordFeePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedFee) {
      setErrorMessage('Please select an approved fee account with outstanding balance.');
      return;
    }

    try {
      const paymentRec = feeWorkflowService.recordPayment(
        {
          fee_id: selectedFee.id,
          amount_paid: amount,
          payment_mode: paymentMode,
          payment_date: date,
          transaction_reference: txnRef,
          bank_upi_reference: bankUpiRef,
          notes,
        },
        currentUser.id,
        currentUser.role
      );

      setIsCollectModalOpen(false);
      setTxnRef('');
      setBankUpiRef('');
      setNotes('');
      loadData();

      if (paymentRec.verification_status === 'Verified') {
        const matchingReceipt = (store.receipts || []).find((r) => r.payment_id === paymentRec.id);
        if (matchingReceipt) {
          setSuccessReceiptId(matchingReceipt.id);
        } else {
          setSuccessReceiptId(paymentRec.receipt_number || 'verified');
        }
      } else {
        alert(
          `Payment of ₹${amount.toLocaleString('en-IN')} recorded successfully!\n\nStatus: Pending Verification.\nAs per finance separation of duties policy, this payment will clear balance and generate official receipt once verified by an Accountant.`
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record fee payment.');
    }
  };

  // Handle Accountant Payment Verification
  const handleVerifyPayment = () => {
    if (!selectedPayment) return;
    setErrorMessage(null);

    try {
      feeWorkflowService.verifyPayment(selectedPayment.id, currentUser.id, verificationNotes);
      setVerifyModalOpen(false);
      setVerificationNotes('');
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to verify payment.');
    }
  };

  const handleRejectPayment = () => {
    if (!selectedPayment) return;
    setErrorMessage(null);

    try {
      feeWorkflowService.rejectPayment(selectedPayment.id, currentUser.id, rejectReason);
      setRejectModalOpen(false);
      setRejectReason('');
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reject payment.');
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
    .reduce((sum, p) => sum + p.amount_paid, 0);

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
            Centralized fee payment recording, separation-of-duties verification, GST e-invoice receipts, and ledger reconciliation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Active User Switcher */}
          <div className="flex items-center space-x-2 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 font-medium">Acting As:</span>
            <select
              value={currentUser.id}
              onChange={(e) => {
                const u = store.users.find((user) => user.id === e.target.value);
                if (u) setCurrentUser(u);
              }}
              className="bg-white border border-slate-300 rounded px-2 py-0.5 font-semibold text-slate-800 text-xs"
            >
              <option value="usr-accounts">Suresh Kumar (Accountant)</option>
              <option value="usr-counsellor">Ananya Desai (Senior Counsellor)</option>
              <option value="usr-superadmin">Rajesh Sharma (Super Admin)</option>
            </select>
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
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-500 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pending Verification
              </p>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <h3 className="text-2xl font-bold text-amber-700 mt-1">{pendingVerificationCount}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Awaiting accountant clearance</p>
          </CardContent>
        </Card>

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
            <p className="text-xs text-blue-600 font-semibold mt-0.5">GST E-Invoice IRN compliant</p>
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
          {pendingVerificationCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-900 font-bold">
              {pendingVerificationCount} Pending
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('historical')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'historical'
              ? 'bg-[#0A6ED1] text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All Historical Transactions ({payments.length})
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
                    <th className="px-4 py-3 text-center">Accountant Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                        No centralized payment records found.
                      </td>
                    </tr>
                  ) : (
                    studentPayments.map((p) => {
                      const isAccountant =
                        currentUser.role === 'accountant' || currentUser.role === 'super_admin';
                      const isOwnRecorded =
                        p.recorded_by === currentUser.id && p.recorded_by_role !== 'accountant';
                      const canVerify = isAccountant && !isOwnRecorded;

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
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {p.verification_status === 'Verified' ? (
                              <Badge variant="success">Verified ✓</Badge>
                            ) : p.verification_status === 'Pending Verification' ? (
                              <Badge variant="warning">Pending Verification</Badge>
                            ) : (
                              <Badge variant="destructive">Rejected</Badge>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-mono text-blue-600 font-semibold">
                            {p.receipt_number ? (
                              <span className="hover:underline cursor-pointer">{p.receipt_number}</span>
                            ) : (
                              <span className="text-slate-400 font-normal italic">Pending</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center">
                            {p.verification_status === 'Pending Verification' ? (
                              <div className="flex items-center justify-center space-x-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!canVerify}
                                  onClick={() => {
                                    setSelectedPayment(p);
                                    setVerifyModalOpen(true);
                                  }}
                                  className={`text-xs px-2 py-1 h-7 ${
                                    canVerify
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                      : 'opacity-50 cursor-not-allowed text-slate-400'
                                  }`}
                                  title={
                                    isOwnRecorded
                                      ? 'Separation of duties: You recorded this payment and cannot verify it.'
                                      : 'Verify Payment'
                                  }
                                >
                                  Verify
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!canVerify}
                                  onClick={() => {
                                    setSelectedPayment(p);
                                    setRejectModalOpen(true);
                                  }}
                                  className="text-xs px-2 py-1 h-7 bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100"
                                  title="Reject Payment"
                                >
                                  Reject
                                </Button>
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
          <Card className="p-4 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by receipt #, student name, or txn reference..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              />
            </div>
          </Card>

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
                      <th className="px-4 py-3">Collected By</th>
                      <th className="px-4 py-3 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((p) => {
                      const receipt = store.receipts.find((r) => r.payment_id === p.id);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-blue-600">{p.receipt_number}</td>
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
                          <td className="px-4 py-3 text-slate-500">{p.collected_by_name || 'Accounts Staff'}</td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/accounts/receipts/${receipt?.id || p.id}`}>
                              <Button variant="outline" size="sm" className="text-xs px-2.5 py-1 flex items-center space-x-1">
                                <ReceiptIcon className="h-3 w-3 text-slate-500" />
                                <span>View</span>
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
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
              {approvedFees.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.student_name} ({f.fee_category} — Outstanding: {formatINR(f.outstanding_amount)})
                </option>
              ))}
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

          <Input
            label="Notes / Comments"
            placeholder="e.g. 2nd Installment payment confirmed by student"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {currentUser.role !== 'accountant' && currentUser.role !== 'super_admin' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px]">
              ⚠️ <strong>Non-Accountant Entry:</strong> This payment will be submitted as &ldquo;Pending Verification&rdquo;. Official receipt and student ledger clearance will be updated once an Accountant verifies the transaction.
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsCollectModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
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
        description="Verify bank deposit/UPI transaction, credit student ledger, and generate official GST receipt."
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
    </div>
  );
}
