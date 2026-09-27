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
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Payment, PaymentMethod } from '@/types';
import { recordPaymentAtomic } from '@/lib/services/finance-service';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';

export default function PaymentsPage() {
  const [payments, setPayments] = React.useState<Payment[]>(store.payments);
  const [search, setSearch] = React.useState('');
  const [isCollectModalOpen, setIsCollectModalOpen] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successReceiptId, setSuccessReceiptId] = React.useState<string | null>(null);

  // Form State
  const [studentId, setStudentId] = React.useState(store.students[0]?.id || '');
  const [amount, setAmount] = React.useState(15000);
  const [paymentMode, setPaymentMode] = React.useState<PaymentMethod>('UPI');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [txnRef, setTxnRef] = React.useState('');
  const [notes, setNotes] = React.useState('');

  const selectedStudent = store.students.find((s) => s.id === studentId);
  const feeAccount = store.feeAccounts.find((f) => f.student_id === studentId);

  React.useEffect(() => {
    if (feeAccount) {
      setAmount(Math.min(15000, feeAccount.outstanding_amount || 15000));
    }
  }, [studentId, feeAccount]);

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

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedStudent || !feeAccount) return;

    try {
      const result = await recordPaymentAtomic(
        {
          student_id: selectedStudent.id,
          course_id: selectedStudent.course_id,
          fee_account_id: feeAccount.id,
          amount,
          payment_date: date,
          payment_mode: paymentMode,
          transaction_reference: txnRef,
          notes,
        },
        'usr-accounts'
      );

      setIsCollectModalOpen(false);
      setSuccessReceiptId(result.receipt.id);
      setTxnRef('');
      setNotes('');
      refreshList();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record payment');
    }
  };

  const handleExport = () => {
    exportToCSV('payments_collections_log', payments);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payments & Collections Desk</h1>
          <p className="text-xs text-slate-500 mt-1">
            Atomic transaction fee processing with duplicate detection, real-time ledger updates, and official signed receipt generation.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="text-xs flex items-center space-x-1">
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button
            variant="sap"
            size="sm"
            onClick={() => {
              setErrorMessage(null);
              setIsCollectModalOpen(true);
            }}
            className="text-xs flex items-center space-x-1"
          >
            <Plus className="h-4 w-4" />
            <span>Collect Fee Payment</span>
          </Button>
        </div>
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

      {/* Search Bar */}
      <Card className="p-4">
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

      {/* Payments Table */}
      <Card>
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
                        <Badge variant="outline">{p.payment_mode}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{p.transaction_reference || '—'}</td>
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

      {/* Collect Payment Modal (Atomic Transaction Execution) */}
      <Modal
        isOpen={isCollectModalOpen}
        onClose={() => setIsCollectModalOpen(false)}
        title="Record Fee Payment (Atomic Transaction)"
        description="Updates fee ledger, installment schedule, audit trail, and generates an official numbered receipt."
      >
        <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Student *
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
            >
              {store.students.map((s) => {
                const fa = store.feeAccounts.find((f) => f.student_id === s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.student_code} — Outstanding: {formatINR(fa?.outstanding_amount)})
                  </option>
                );
              })}
            </select>
          </div>

          {feeAccount && (
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-lg space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Course:</span>
                <span className="font-semibold text-slate-800">{feeAccount.course_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Net Payable:</span>
                <span className="font-bold text-slate-800">{formatINR(feeAccount.net_payable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Outstanding:</span>
                <span className="font-bold text-amber-700">{formatINR(feeAccount.outstanding_amount)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Payment Amount (₹) *"
              type="number"
              min={1}
              max={feeAccount?.outstanding_amount || 50000}
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
                <option value="Payment Gateway">Payment Gateway</option>
                <option value="Other">Other</option>
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
            label="Collector Notes"
            placeholder="e.g. Second installment paid via company bank transfer"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsCollectModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Commit Payment & Issue Receipt
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
