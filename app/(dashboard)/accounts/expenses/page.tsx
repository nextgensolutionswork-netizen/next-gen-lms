'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Wallet,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Download,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  CreditCard,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { Expense, ExpenseCategory, ExpenseStatus, PaymentMethod } from '@/types';
import {
  createExpense,
  approveExpense,
  markExpenseAsPaid,
  rejectExpense,
  submitExpenseForApproval,
} from '@/lib/services/finance-service';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';
import { exportExpensesToExcel } from '@/lib/utils/excel-export';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export default function ExpensesPage() {
  const { user, role, hasPermission } = useAuth();
  const canAccessExpenses =
    hasPermission('expenses:read') ||
    hasPermission('accounts:read') ||
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin';

  const canApprove = role === 'super_admin' || role === 'admin' || hasPermission('expenses:approve');
  const canRecordExpense = role === 'super_admin' || role === 'admin' || role === 'accountant' || hasPermission('expenses:write');
  const canDisburse = role === 'super_admin' || role === 'admin' || role === 'accountant' || hasPermission('accounts:write');
  const [expenses, setExpenses] = React.useState<Expense[]>(() => store.expenses || []);
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [isAddModal, setIsAddModal] = React.useState(false);

  // New Expense form state - defaults strictly to Pending Approval (zero bypass)
  const [category, setCategory] = React.useState<ExpenseCategory>('Rent');
  const [vendorId, setVendorId] = React.useState((store.vendors || [])[0]?.id || '');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState(25000);
  const [paymentMode, setPaymentMode] = React.useState<PaymentMethod>('Bank Transfer');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = React.useState('');
  const [status, setStatus] = React.useState<ExpenseStatus>('Pending Approval');

  // Disburse / Pay Modal State
  const [disburseExpense, setDisburseExpense] = React.useState<Expense | null>(null);
  const [disburseRef, setDisburseRef] = React.useState('');
  const [disburseMode, setDisburseMode] = React.useState<PaymentMethod>('Bank Transfer');
  const [disburseDate, setDisburseDate] = React.useState(new Date().toISOString().slice(0, 10));

  const refreshList = React.useCallback(() => {
    let list = [...(store.expenses || [])];
    if (categoryFilter !== 'All') {
      list = list.filter((e) => e.category === categoryFilter);
    }
    if (statusFilter !== 'All') {
      list = list.filter((e) => e.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.expense_code?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.vendor_name?.toLowerCase().includes(q) ||
          e.reference?.toLowerCase().includes(q)
      );
    }
    setExpenses(list);
  }, [categoryFilter, statusFilter, search]);

  React.useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;
    if (!user) {
      alert('Please log in to record an expense.');
      return;
    }
    if (!canRecordExpense) {
      alert('Access Denied: You do not have permission to record expenditures.');
      return;
    }

    // Workflow governance: new expense requisitions strictly enter 'Draft' or 'Pending Approval'
    const initialStatus: ExpenseStatus = status === 'Draft' ? 'Draft' : 'Pending Approval';

    await createExpense(
      {
        expense_date: date,
        category,
        vendor_id: vendorId,
        description,
        amount,
        payment_mode: paymentMode,
        reference,
        status: initialStatus,
      },
      user.id
    );

    setIsAddModal(false);
    setDescription('');
    setReference('');
    setStatus('Pending Approval');
    refreshList();
  };

  const handleApprove = async (id: string) => {
    const exp = (store.expenses || []).find((e) => e.id === id);
    if (!exp) return;

    if (!user) {
      alert('Please log in to approve expenses.');
      return;
    }

    if (exp.amount > 50000 && role !== 'super_admin') {
      alert(
        `Approval Policy Requirement: Expenses exceeding ₹50,000 (₹${exp.amount.toLocaleString(
          'en-IN'
        )}) require Super Admin (Director) authorization.`
      );
      return;
    }

    if (!canApprove) {
      alert('Access Denied: Only administrators or authorized managers can approve expenses.');
      return;
    }

    try {
      await approveExpense(id, user.id);
      refreshList();
    } catch (err: any) {
      alert(err.message || 'Failed to approve expense');
    }
  };

  const handleReject = async (id: string) => {
    const exp = (store.expenses || []).find((e) => e.id === id);
    if (!exp) return;

    if (!user) {
      alert('Please log in.');
      return;
    }
    if (!canApprove) {
      alert('Access Denied: Only administrators or authorized managers can reject expenses.');
      return;
    }

    const reason = prompt('Please enter the reason for rejecting this expenditure request:');
    if (!reason || !reason.trim()) return;

    try {
      await rejectExpense(id, user.id, reason.trim());
      refreshList();
    } catch (err: any) {
      alert(err.message || 'Failed to reject expense');
    }
  };

  const handleSubmitDraft = async (id: string) => {
    if (!user) {
      alert('Please log in.');
      return;
    }
    try {
      await submitExpenseForApproval(id, user.id);
      refreshList();
    } catch (err: any) {
      alert(err.message || 'Failed to submit draft expense');
    }
  };

  const handleConfirmDisbursement = async () => {
    if (!disburseExpense) return;
    if (!user) {
      alert('Please log in to disburse funds.');
      return;
    }
    if (!canDisburse) {
      alert('Access Denied: Only finance personnel or administrators can disburse funds.');
      return;
    }
    if (!disburseRef.trim()) {
      alert('Mandatory Requirement: Please provide a bank UTR or payment reference number.');
      return;
    }

    try {
      await markExpenseAsPaid(disburseExpense.id, user.id, {
        payment_mode: disburseMode,
        reference: disburseRef.trim(),
        expense_date: disburseDate,
      });
      setDisburseExpense(null);
      setDisburseRef('');
      refreshList();
    } catch (err: any) {
      alert(err.message || 'Failed to settle expense');
    }
  };

  const handleExportCSV = () => {
    exportToCSV('expenses_register', expenses);
  };

  const handleExportExcel = () => {
    exportExpensesToExcel(expenses, 'FY 2025-26');
  };

  const totalPaidExpenses = expenses
    .filter((e) => e.status === 'Paid')
    .reduce((sum, e) => sum + safeAmount(e.amount), 0);

  const approvedPendingPayment = expenses
    .filter((e) => e.status === 'Approved')
    .reduce((sum, e) => sum + safeAmount(e.amount), 0);

  const pendingApprovalAmount = expenses
    .filter((e) => e.status === 'Pending Approval')
    .reduce((sum, e) => sum + safeAmount(e.amount), 0);

  const totalCommittedOutflows = totalPaidExpenses + approvedPendingPayment;

  if (!canAccessExpenses) {
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
                You do not possess the required financial permissions to view or manage institutional expenditures.
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Institute Expense & Vendor Outflows</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track operational burn, trainer payouts, lease rentals, marketing spend, and multi-tier approval audits.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-xs flex items-center space-x-1">
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="text-xs flex items-center space-x-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
            <Download className="h-3.5 w-3.5" />
            <span>Excel Ledger</span>
          </Button>
          {canRecordExpense && (
            <Button
              variant="sap"
              size="sm"
              onClick={() => setIsAddModal(true)}
              className="text-xs flex items-center space-x-1"
            >
              <Plus className="h-4 w-4" />
              <span>Record Expense</span>
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards: Full Institutional Outflow Radar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-emerald-600 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Settled Outflows</p>
            <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(totalPaidExpenses)}</h3>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>Settled & Reconciled</span>
              <span className="font-semibold text-emerald-600">
                {expenses.filter((e) => e.status === 'Paid').length} paid
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-600 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approved (Awaiting Payment)</p>
            <h3 className="text-2xl font-bold text-blue-700 mt-1">{formatINR(approvedPendingPayment)}</h3>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>Ready for Disbursement</span>
              <span className="font-semibold text-blue-600">
                {expenses.filter((e) => e.status === 'Approved').length} approved
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending Approval</p>
            <h3 className="text-2xl font-bold text-amber-700 mt-1">{formatINR(pendingApprovalAmount)}</h3>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>Under Review</span>
              <span className="font-semibold text-amber-600">
                {expenses.filter((e) => e.status === 'Pending Approval').length} pending
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-slate-800 shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Committed Outflow</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatINR(totalCommittedOutflows)}</h3>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>Settled + Approved Liabilities</span>
              <span className="font-semibold text-slate-600">{(store.vendors || []).length} vendors</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search Bar */}
      <Card className="p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code, description, vendor, or UTR..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            {['All', 'Pending Approval', 'Approved', 'Paid', 'Draft', 'Rejected'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === st
                    ? 'bg-[#0A6ED1] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === 'All' ? 'All Statuses' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500 font-medium">Category:</span>
          {['All', 'Rent', 'Trainer payment', 'Salary', 'Marketing', 'Software', 'Electricity'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                categoryFilter === cat
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </Card>

      {/* Expense Register Table */}
      <Card className="shadow-xs">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Expense Code</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Vendor / Beneficiary</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      <Wallet className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="font-semibold text-slate-600">No expenses found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Use "Record Expense" to log operational expenditures.</p>
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-blue-600">{exp.expense_code}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(exp.expense_date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{exp.category}</td>
                      <td className="px-4 py-3 text-slate-700">{exp.vendor_name || 'Direct / Internal'}</td>
                      <td className="px-4 py-3 text-slate-600 truncate max-w-[200px]" title={exp.description}>
                        {exp.description}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{formatINR(exp.amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{exp.payment_mode}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            exp.status === 'Paid'
                              ? 'success'
                              : exp.status === 'Approved'
                              ? 'default'
                              : exp.status === 'Pending Approval'
                              ? 'warning'
                              : exp.status === 'Rejected'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {exp.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {exp.status === 'Draft' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSubmitDraft(exp.id)}
                              className="text-xs px-2.5 py-1 h-7 text-blue-700 border-blue-300 hover:bg-blue-50"
                            >
                              Submit
                            </Button>
                          )}
                          {exp.status === 'Pending Approval' && (
                            canApprove ? (
                              <div className="flex items-center space-x-1">
                                <Button
                                  variant="sap"
                                  size="sm"
                                  onClick={() => handleApprove(exp.id)}
                                  className="text-xs px-2.5 py-1 h-7"
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReject(exp.id)}
                                  className="text-xs px-2 py-1 h-7 text-rose-600 border-rose-200 hover:bg-rose-50"
                                >
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Awaiting Approval
                              </span>
                            )
                          )}
                          {exp.status === 'Approved' && (
                            canDisburse ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setDisburseExpense(exp);
                                  setDisburseMode(exp.payment_mode || 'Bank Transfer');
                                  setDisburseRef(exp.reference || '');
                                  setDisburseDate(new Date().toISOString().slice(0, 10));
                                }}
                                className="text-xs px-2.5 py-1 h-7 text-emerald-700 border-emerald-400 bg-emerald-50/50 hover:bg-emerald-100 font-bold flex items-center space-x-1"
                              >
                                <CreditCard className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                                <span>Mark as Paid</span>
                              </Button>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                Approved
                              </span>
                            )
                          )}
                          {exp.status === 'Paid' && (
                            <div className="text-right">
                              <span className="text-[10px] text-emerald-700 font-bold flex items-center justify-end space-x-1">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Settled</span>
                              </span>
                              {exp.reference && (
                                <span className="text-[9px] text-slate-400 font-mono block truncate max-w-[120px]">
                                  Ref: {exp.reference}
                                </span>
                              )}
                            </div>
                          )}
                          {exp.status === 'Rejected' && (
                            <span className="text-[10px] text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              Rejected
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

      {/* Record Expense Modal - Zero Approval Bypass */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Record New Expense"
        description="Book operating expenditure with vendor tagging and mandatory multi-tier approval workflow."
      >
        <form onSubmit={handleCreateExpense} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                <option value="Rent">Rent</option>
                <option value="Trainer payment">Trainer Payment</option>
                <option value="Salary">Salary</option>
                <option value="Marketing">Marketing</option>
                <option value="Google Ads">Google Ads</option>
                <option value="Meta Ads">Meta Ads</option>
                <option value="Software">Software Licenses</option>
                <option value="Internet">Internet Leased Line</option>
                <option value="Electricity">Electricity & Lab Utilities</option>
                <option value="Office supplies">Office Supplies</option>
                <option value="Miscellaneous">Miscellaneous</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Vendor / Beneficiary
              </label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="">Direct / No Vendor Tag</option>
                {(store.vendors || []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vendor_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Description *"
            placeholder="e.g. Dedicated 1 Gbps Leased Line for SAP Sandboxes - Feb 2026"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount (₹) *"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Requested Payment Mode *
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                <option value="UPI">UPI</option>
                <option value="Card">Corporate Credit Card</option>
                <option value="Cheque">Cheque</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Expense Date *"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <Input
              label="Invoice / Proforma Reference"
              placeholder="e.g. INV-2026-9921"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Workflow Status *
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium"
            >
              <option value="Pending Approval">Pending Approval (Standard Requisition)</option>
              <option value="Draft">Draft (Save Work-in-Progress)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Strict SOP Governance: Expenditures require authorization before disbursement. Direct settlement as "Paid" is not permitted at creation.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Submit Expense Requisition
            </Button>
          </div>
        </form>
      </Modal>

      {/* Disburse / Mark as Paid Modal */}
      {disburseExpense && (
        <Modal
          isOpen={!!disburseExpense}
          onClose={() => setDisburseExpense(null)}
          title="Mark Expense as Paid & Record Disbursement"
          description={`Record final bank settlement and UTR reference for ${disburseExpense.expense_code} (${formatINR(
            disburseExpense.amount
          )}).`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-slate-800">{disburseExpense.description}</p>
                  <p className="text-slate-500 mt-0.5">
                    Beneficiary: <strong>{disburseExpense.vendor_name || 'Direct / Internal'}</strong> · Category:{' '}
                    <strong>{disburseExpense.category}</strong>
                  </p>
                </div>
                <Badge variant="default">Approved</Badge>
              </div>
              <p className="text-emerald-700 font-bold text-base pt-1">{formatINR(disburseExpense.amount)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Disbursement Mode *
                </label>
                <select
                  value={disburseMode}
                  onChange={(e) => setDisburseMode(e.target.value as any)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                >
                  <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="UPI">Corporate UPI</option>
                  <option value="Card">Corporate Credit Card</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Petty Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Disbursement Date *
                </label>
                <Input
                  type="date"
                  value={disburseDate}
                  onChange={(e) => setDisburseDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <Input
              label="Bank UTR / Transaction Reference (Mandatory) *"
              placeholder="e.g. UTR-HDFC-99281928 or Cheque #102918"
              value={disburseRef}
              onChange={(e) => setDisburseRef(e.target.value)}
              required
            />

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setDisburseExpense(null)}>
                Cancel
              </Button>
              <Button
                variant="sap"
                size="sm"
                disabled={!disburseRef.trim()}
                onClick={handleConfirmDisbursement}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center space-x-1"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                <span>Confirm & Mark as Paid</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
