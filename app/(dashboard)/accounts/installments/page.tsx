'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Calendar,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Clock,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { Installment } from '@/types';
import { formatINR, formatDate } from '@/lib/utils/formatters';

export default function InstallmentsPage() {
  const [installments, setInstallments] = React.useState<Installment[]>(store.installments);
  const [filter, setFilter] = React.useState<'All' | 'Due' | 'Upcoming' | 'Paid' | 'Overdue'>('All');

  const todayStr = new Date().toISOString().slice(0, 10);

  const filtered = installments.filter((i) => {
    if (filter === 'All') return true;
    return i.status === filter;
  });

  const overdueList = installments.filter(
    (i) => i.status === 'Overdue' || (i.status === 'Due' && i.due_date < todayStr)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Installment Schedules & Overdue Radar</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track student payment milestones, due dates, partial payments, and overdue alerts.
          </p>
        </div>
        <Link href="/accounts/payments">
          <Button variant="sap" size="sm" className="text-xs">
            Collect Due Installment
          </Button>
        </Link>
      </div>

      {/* Overdue Warning Alert */}
      {overdueList.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-xs font-bold text-amber-900">{overdueList.length} Installment(s) Currently Due / Overdue</p>
              <p className="text-[11px] text-amber-700">Immediate follow-up required by accounts and counseling desk.</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilter('Due')}
            className="text-xs bg-white text-amber-900 border-amber-300"
          >
            Filter Due Installments
          </Button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2">
        {(['All', 'Due', 'Upcoming', 'Paid', 'Overdue'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === st
                ? 'bg-[#0A6ED1] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Installments Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Installment #</th>
                  <th className="px-4 py-3">Total Amount</th>
                  <th className="px-4 py-3">Paid Amount</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((inst) => {
                  const student = store.students.find((s) => s.id === inst.student_id);
                  return (
                    <tr key={inst.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {student?.full_name || 'Enrolled Student'}
                        <p className="text-[10px] text-slate-400 font-normal">{student?.student_code}</p>
                      </td>
                      <td className="px-4 py-3 font-bold text-blue-600">Installment {inst.installment_number}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{formatINR(inst.amount)}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600">{formatINR(inst.paid_amount)}</td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{formatDate(inst.due_date)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            inst.status === 'Paid'
                              ? 'success'
                              : inst.status === 'Due'
                              ? 'warning'
                              : inst.status === 'Overdue'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {inst.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inst.status !== 'Paid' && (
                          <Link href="/accounts/payments">
                            <Button variant="sap" size="sm" className="text-xs px-2.5 py-1">
                              Pay
                            </Button>
                          </Link>
                        )}
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
  );
}
