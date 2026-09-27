'use client';

import * as React from 'react';
import Link from 'next/link';
import { Receipt, Search, Download, Printer, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';

export default function ReceiptsListPage() {
  const [receipts, setReceipts] = React.useState(store.receipts);
  const [search, setSearch] = React.useState('');

  const refreshList = () => {
    let list = [...store.receipts];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.receipt_number.toLowerCase().includes(q) ||
          r.student_name.toLowerCase().includes(q) ||
          r.admission_number.toLowerCase().includes(q)
      );
    }
    setReceipts(list);
  };

  React.useEffect(() => {
    refreshList();
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Signed Official Receipts</h1>
          <p className="text-xs text-slate-500 mt-1">
            Numbered fee receipts ready for instant viewing, printing, PDF export, and WhatsApp sharing.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportToCSV('receipts_registry', receipts)}
          className="text-xs flex items-center space-x-1"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export Registry</span>
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by receipt # or student..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
          />
        </div>
      </Card>

      <Card>
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
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Print / View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-blue-600">{r.receipt_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.student_name}</td>
                    <td className="px-4 py-3 text-slate-600">{r.admission_number}</td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[140px]">{r.course_name}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{formatINR(r.payment_amount)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{r.payment_mode}</Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-amber-700">{formatINR(r.remaining_balance)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(r.payment_date)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/accounts/receipts/${r.id}`}>
                        <Button variant="sap" size="sm" className="text-xs px-2.5 py-1 flex items-center space-x-1">
                          <Printer className="h-3 w-3" />
                          <span>View PDF</span>
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
