'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Printer,
  Download,
  Share2,
  ArrowLeft,
  CheckCircle2,
  Building,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { formatINR, formatDate, formatDateTime } from '@/lib/utils/formatters';

export default function ReceiptPrintPage() {
  const params = useParams();
  const id = params?.id as string;

  const receipt = store.receipts.find((r) => r.id === id || r.receipt_number === id) || store.receipts[0];

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Official Fee Receipt: ${receipt.receipt_number}\nInstitute: ${receipt.institute_name}\nStudent: ${receipt.student_name}\nAmount Paid: ${formatINR(receipt.payment_amount)}\nRemaining Balance: ${formatINR(receipt.remaining_balance)}\nDate: ${formatDate(receipt.payment_date)}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top action bar (hidden during print) */}
      <div className="no-print flex items-center justify-between pb-4 border-b border-slate-200">
        <Link href="/accounts/payments">
          <Button variant="ghost" size="sm" className="text-xs flex items-center space-x-1">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Payments</span>
          </Button>
        </Link>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareWhatsApp}
            className="text-xs text-emerald-700 hover:bg-emerald-50 border-emerald-200 flex items-center space-x-1"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Share on WhatsApp</span>
          </Button>
          <a
            href={`/api/receipts/${receipt.id}/pdf?download=true`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1 shadow-xs">
              <Download className="h-4 w-4" />
              <span>Download Official PDF</span>
            </Button>
          </a>
          <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs flex items-center space-x-1">
            <Printer className="h-4 w-4" />
            <span>Print View</span>
          </Button>
        </div>
      </div>

      {/* Printable Receipt Paper */}
      <div className="bg-white p-8 md:p-12 rounded-2xl shadow-md border border-slate-200 text-slate-900 print:shadow-none print:border-none print:p-0">
        {/* Header Branding */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b-2 border-slate-900 pb-6 gap-4">
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 rounded-xl bg-[#0A6ED1] text-white flex items-center justify-center font-black text-2xl shadow">
              SAP
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                {receipt.institute_name}
              </h1>
              <p className="text-xs text-slate-600 font-medium">Premier SAP Authorized Training & Certification Institute</p>
              <p className="text-xs text-slate-500 mt-1">{receipt.institute_address}</p>
              <p className="text-xs text-slate-500">Phone: {receipt.institute_phone} | GSTIN: <strong className="text-slate-800">{receipt.institute_gst}</strong></p>
            </div>
          </div>

          <div className="text-right">
            <span className="bg-blue-100 text-[#0A6ED1] text-xs uppercase px-3 py-1 rounded-full font-bold">
              Official Tax Receipt
            </span>
            <p className="text-lg font-black text-slate-900 mt-2 font-mono">{receipt.receipt_number}</p>
            <p className="text-xs text-slate-500 mt-0.5">Date: <strong className="text-slate-800">{formatDate(receipt.payment_date)}</strong></p>
          </div>
        </div>

        {/* Student & Course Details Grid */}
        <div className="grid grid-cols-2 gap-6 py-6 border-b border-slate-200 text-xs">
          <div className="space-y-1.5">
            <p className="text-slate-400 uppercase font-semibold text-[10px]">Received From</p>
            <p className="text-base font-bold text-slate-900">{receipt.student_name}</p>
            <p className="text-slate-600">Admission Number: <strong className="text-slate-800">{receipt.admission_number}</strong></p>
            <p className="text-slate-600">Enrolled Program: <strong className="text-slate-800">{receipt.course_name}</strong></p>
          </div>

          <div className="space-y-1.5 text-right">
            <p className="text-slate-400 uppercase font-semibold text-[10px]">Transaction Metadata</p>
            <p className="text-slate-600">Payment Mode: <strong className="text-slate-800">{receipt.payment_mode}</strong></p>
            <p className="text-slate-600 font-mono">Reference: {receipt.transaction_reference || 'CASH-COUNTER'}</p>
            <p className="text-slate-600">Recorded At: {formatDateTime(receipt.created_at)}</p>
          </div>
        </div>

        {/* Line Item Table */}
        <div className="py-6 border-b border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-slate-500 uppercase font-semibold text-[10px]">
                <th className="text-left pb-2">Description</th>
                <th className="text-center pb-2">Training Mode</th>
                <th className="text-right pb-2">Amount Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 font-semibold text-slate-900">
                  {receipt.course_name} — Academic Tuition & Lab Access Fee
                </td>
                <td className="py-3 text-center text-slate-600">Hybrid Classroom + Cloud LMS</td>
                <td className="py-3 text-right font-extrabold text-slate-900 text-sm">
                  {formatINR(receipt.payment_amount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Total & Remaining Balance Summary */}
        <div className="py-6 flex justify-end">
          <div className="w-72 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
              <span>Amount Paid This Receipt:</span>
              <span className="font-bold text-slate-900 text-sm">{formatINR(receipt.payment_amount)}</span>
            </div>
            <div className="flex justify-between py-1 font-bold text-amber-700">
              <span>Remaining Course Fee Balance:</span>
              <span>{formatINR(receipt.remaining_balance)}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-900">
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-bold text-[11px]">Payment Status</span>
              </div>
              <span className="font-bold text-xs">VERIFIED & CREDITED</span>
            </div>
          </div>
        </div>

        {/* Authorized Signature & Terms */}
        <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-end gap-6 text-xs text-slate-500">
          <div className="space-y-1">
            <p className="font-semibold text-slate-700">Terms & Conditions:</p>
            <p>1. Fees once paid are non-refundable after commencement of batch classes.</p>
            <p>2. This receipt is computer generated and valid with digital audit timestamp.</p>
            <p>3. SAP certification examination voucher fees are subject to SAP AG global guidelines.</p>
          </div>

          <div className="text-center w-56">
            <div className="h-16 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
              <span className="font-serif italic font-bold text-slate-800 text-sm">Suresh Kumar</span>
            </div>
            <p className="font-bold text-slate-800 mt-1">{receipt.authorized_by}</p>
            <p className="text-[10px] text-slate-400">Authorized Financial Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
