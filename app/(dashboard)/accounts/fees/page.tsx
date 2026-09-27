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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { StudentFeeAccount } from '@/types';
import { formatINR, exportToCSV } from '@/lib/utils/formatters';

export default function StudentFeesPage() {
  const [feeAccounts, setFeeAccounts] = React.useState<StudentFeeAccount[]>(store.feeAccounts);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('All');

  const refreshList = () => {
    let list = [...store.feeAccounts];
    if (statusFilter !== 'All') {
      list = list.filter((f) => f.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.student_name?.toLowerCase().includes(q) ||
          f.course_name?.toLowerCase().includes(q)
      );
    }
    setFeeAccounts(list);
  };

  React.useEffect(() => {
    refreshList();
  }, [search, statusFilter]);

  const totalOutstanding = store.feeAccounts.reduce((sum, f) => sum + f.outstanding_amount, 0);
  const totalCollected = store.feeAccounts.reduce((sum, f) => sum + f.paid_amount, 0);

  const handleExport = () => {
    exportToCSV('student_fee_ledger', feeAccounts);
  };

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
            <span>Export Ledger</span>
          </Button>
          <Link href="/accounts/payments">
            <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1">
              <Plus className="h-4 w-4" />
              <span>Record Payment</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Collected</p>
            <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(totalCollected)}</h3>
            <p className="text-xs text-slate-500 mt-1">Verified bank and cash receipts</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Outstanding Balance</p>
            <h3 className="text-2xl font-bold text-amber-700 mt-1">{formatINR(totalOutstanding)}</h3>
            <p className="text-xs text-slate-500 mt-1">Remaining student fee installments</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Fee Accounts</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{store.feeAccounts.length} Students</h3>
            <p className="text-xs text-blue-600 font-semibold mt-1">100% Account reconciliation</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
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
      <Card>
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
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feeAccounts.map((fa) => (
                  <tr key={fa.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{fa.student_name}</td>
                    <td className="px-4 py-3 text-slate-600">{fa.course_name}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{formatINR(fa.original_fee)}</td>
                    <td className="px-4 py-3 text-emerald-600 font-medium">
                      {fa.discount > 0 ? `-${formatINR(fa.discount)}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">{formatINR(fa.net_payable)}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{formatINR(fa.paid_amount)}</td>
                    <td className="px-4 py-3 font-bold text-amber-600">{formatINR(fa.outstanding_amount)}</td>
                    <td className="px-4 py-3 text-slate-600">{fa.payment_plan}</td>
                    <td className="px-4 py-3">
                      <Badge variant={fa.status === 'Paid' ? 'success' : 'warning'}>{fa.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href="/accounts/payments">
                        <Button variant="sap" size="sm" className="text-xs px-2.5 py-1">
                          Collect
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
