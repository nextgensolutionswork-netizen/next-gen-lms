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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Expense, ExpenseCategory, ExpenseStatus, PaymentMethod } from '@/types';
import { createExpense, approveExpense } from '@/lib/services/finance-service';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';

export default function ExpensesPage() {
  const [expenses, setExpenses] = React.useState<Expense[]>(store.expenses);
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('All');
  const [isAddModal, setIsAddModal] = React.useState(false);

  // New Expense form state
  const [category, setCategory] = React.useState<ExpenseCategory>('Rent');
  const [vendorId, setVendorId] = React.useState(store.vendors[0]?.id || '');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState(25000);
  const [paymentMode, setPaymentMode] = React.useState<PaymentMethod>('Bank Transfer');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = React.useState('');
  const [status, setStatus] = React.useState<ExpenseStatus>('Paid');

  const refreshList = () => {
    let list = [...store.expenses];
    if (categoryFilter !== 'All') {
      list = list.filter((e) => e.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.expense_code.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.vendor_name?.toLowerCase().includes(q)
      );
    }
    setExpenses(list);
  };

  React.useEffect(() => {
    refreshList();
  }, [search, categoryFilter]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;

    await createExpense(
      {
        expense_date: date,
        category,
        vendor_id: vendorId,
        description,
        amount,
        payment_mode: paymentMode,
        reference,
        status,
      },
      'usr-accounts'
    );

    setIsAddModal(false);
    setDescription('');
    setReference('');
    refreshList();
  };

  const handleApprove = async (id: string) => {
    await approveExpense(id, 'usr-superadmin');
    refreshList();
  };

  const handleExport = () => {
    exportToCSV('expenses_register', expenses);
  };

  const totalPaidExpenses = expenses
    .filter((e) => e.status === 'Paid')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Institute Expense & Vendor Outflows</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track infrastructure, classroom rents, trainer honorariums, software licenses, and cloud servers.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="text-xs flex items-center space-x-1">
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button variant="sap" size="sm" onClick={() => setIsAddModal(true)} className="text-xs flex items-center space-x-1">
            <Plus className="h-4 w-4" />
            <span>Record Expense</span>
          </Button>
        </div>
      </div>

      {/* Expense KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-rose-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Settled Expenses</p>
            <h3 className="text-2xl font-bold text-rose-700 mt-1">{formatINR(totalPaidExpenses)}</h3>
            <p className="text-xs text-slate-500 mt-1">Fully approved & paid outflows</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Category Filter */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code, description, or vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
            >
              <option value="All">All Categories</option>
              <option value="Rent">Rent</option>
              <option value="Internet">Internet</option>
              <option value="Marketing">Marketing / Ads</option>
              <option value="Salary">Salary</option>
              <option value="Software">Software</option>
              <option value="Trainer payment">Trainer Payment</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Expense Code</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Vendor / Payee</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Approval</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-blue-600">{exp.expense_code}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{exp.category}</td>
                    <td className="px-4 py-3 text-slate-600">{exp.vendor_name || 'Direct / Internal'}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{exp.description}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{formatINR(exp.amount)}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{exp.payment_mode}</Badge></td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(exp.expense_date)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={exp.status === 'Paid' ? 'success' : exp.status === 'Approved' ? 'info' : 'warning'}>
                        {exp.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {exp.status === 'Pending Approval' ? (
                        <Button
                          variant="sap"
                          size="sm"
                          onClick={() => handleApprove(exp.id)}
                          className="text-xs px-2 py-1"
                        >
                          Approve
                        </Button>
                      ) : (
                        <span className="text-[10px] text-slate-400">Approved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Record Expense Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Record New Expense"
        description="Book operating expenditure with vendor tagging and approval workflow."
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
                Vendor
              </label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                {store.vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.vendor_name}</option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Description / Purpose *"
            placeholder="e.g. Dedicated 1 Gbps Fiber Lease Line for SAP Server Lab"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Expense Amount (₹) *"
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Payment Mode *
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
              label="Invoice / UTR Reference"
              placeholder="e.g. INV-2026-9921"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Status *
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
            >
              <option value="Paid">Paid (Already Settled)</option>
              <option value="Approved">Approved</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Draft">Draft</option>
            </select>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Record Expense
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
