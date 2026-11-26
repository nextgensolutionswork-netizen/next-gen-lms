'use client';
import Image from 'next/image';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Printer,
  Download,
  ExternalLink,
  ArrowLeft,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/providers/auth-provider';
import { useRecordLoad } from '@/lib/hooks/use-record-load';
import type { InvoiceData } from '@/lib/services/invoice-pdf-service';
import { formatINR } from '@/lib/utils/formatters';
import {
  OFFICIAL_INSTITUTE_NAME,
  OFFICIAL_INSTITUTE_ADDRESS,
  OFFICIAL_INSTITUTE_PHONE,
  OFFICIAL_INSTITUTE_WEBSITE,
  resolveInstituteAddress,
  resolveInstitutePhone,
} from '@/lib/constants/branding';

export default function InvoiceViewPage() {
  const { user, role, isLoading: authLoading } = useAuth();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  const loadInvoice = React.useCallback(
    async (signal: AbortSignal) => {
      const response = await fetch(`/api/invoices/${encodeURIComponent(id)}`, {
        cache: 'no-store',
        signal,
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? 'Invoice access denied. Please sign in with an authorized account.'
            : 'Unable to load invoice. Please verify the invoice number or ID.'
        );
      }
      const data = await response.json();
      if (!data.success || !data.invoice) {
        throw new Error('Invoice not found in institutional records.');
      }
      return data.invoice as InvoiceData;
    },
    [id]
  );

  const { data: invoice, status, error, reload } = useRecordLoad<InvoiceData>(
    !authLoading && user?.id && id ? `${user.id}:${id}` : null,
    loadInvoice
  );

  if (!authLoading && !user) {
    return (
      <div className="p-8 text-center text-sm text-slate-600">
        Please sign in to view this invoice.
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="p-12 text-center text-sm text-slate-500">
        Loading official institutional invoice…
      </div>
    );
  }

  if (status === 'error' || !invoice) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Invoice Not Found</h2>
        <p className="text-xs text-slate-500">
          {error || `No official invoice matching "${id}" could be located.`}
        </p>
        <div className="pt-2 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            Retry
          </Button>
          <Link href="/accounts/fees">
            <Button variant="sap" size="sm">
              Back to Fee Management
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const pdfUrl = `/api/invoices/${encodeURIComponent(invoice.invoice_number)}/pdf`;
  const downloadUrl = `${pdfUrl}?download=true`;

  return (
    <div className="min-h-screen bg-slate-100/70 py-6 px-4 sm:px-6">
      {/* Top Action Bar (hidden on print) */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          href="/accounts/fees"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fee Management
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="text-xs inline-flex items-center gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
            <Button
              variant="outline"
              size="sm"
              className="text-xs inline-flex items-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open PDF
            </Button>
          </a>
          <a href={downloadUrl}>
            <Button
              variant="sap"
              size="sm"
              className="text-xs inline-flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          </a>
        </div>
      </div>

      {/* Official Master Invoice Document Container */}
      <div className="max-w-4xl mx-auto bg-white shadow-lg border border-slate-200 rounded-lg overflow-hidden text-slate-900 print:shadow-none print:border-none print:m-0 print:p-0">
        {/* Curved Pale-Blue Header Banner */}
        <div className="relative bg-[#e5f0f6] px-8 pt-8 pb-10 border-b border-[#cde0eb]">
          <div className="flex flex-col md:flex-row items-start justify-between gap-6">
            {/* Top-Left: Original Company Logo */}
            <div className="flex items-center">
              <Image
                src="/branding/nextgen-logo.webp"
                alt="Next-Gen ERP Solutions"
                width={180}
                height={56}
                className="h-14 w-auto object-contain"
                priority
                unoptimized
              />
            </div>

            {/* Top-Right: Full Official Institute Address */}
            <div className="text-right max-w-sm text-[11px] text-slate-700 leading-relaxed font-medium">
              <p className="font-bold text-slate-900 text-xs">
                {invoice.institute_name || OFFICIAL_INSTITUTE_NAME}
              </p>
              <p className="mt-0.5">
                {invoice.institute_address || OFFICIAL_INSTITUTE_ADDRESS}
              </p>
            </div>
          </div>
        </div>

        {/* Invoice Body */}
        <div className="p-8 space-y-6">
          {/* Customer / Student Information & Invoice Title */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="text-xs text-slate-800 space-y-1">
              <p className="font-bold text-sm text-slate-950">{invoice.student_name}</p>
              {invoice.student_phone && <p>Phone: {invoice.student_phone}</p>}
              {invoice.student_email && <p>Email: {invoice.student_email}</p>}
              {invoice.student_address && <p>{invoice.student_address}</p>}
              <p>India</p>
              <p className="text-slate-600 font-medium">
                Place of supply: {invoice.place_of_supply || 'Telangana'}
              </p>
            </div>

            <div className="text-right">
              <h1 className="text-2xl font-bold tracking-tight text-[#0974b2]">
                Invoice {invoice.invoice_number}
              </h1>
            </div>
          </div>

          {/* Soft Warm Beige Metadata Banner */}
          <div className="bg-[#f9f4eb] border border-[#eee4d3] rounded-md px-6 py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="font-bold text-slate-800">Invoice Date:</span>{' '}
              <span className="text-slate-700">{invoice.invoice_date}</span>
            </div>
            <div>
              <span className="font-bold text-slate-800">Due Date:</span>{' '}
              <span className="text-slate-700">{invoice.due_date || invoice.invoice_date}</span>
            </div>
            <div>
              <span className="font-bold text-slate-800">Reference:</span>{' '}
              <span className="text-slate-700">{invoice.reference || 'Standard Course'}</span>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#e5f0f6] text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-3">HSN/SAC</th>
                  <th className="py-2.5 px-3 text-right">Quantity</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-medium text-slate-900">{item.description}</td>
                    <td className="py-3 px-3 text-slate-600">{item.hsn_sac || '999293'}</td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {Number(item.quantity).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {formatINR(item.unit_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900">
                      {formatINR(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Split Section: Notes & HSN Summary (Left) / Ledger & Signature (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            {/* Left Column */}
            <div className="space-y-5 text-xs text-slate-700">
              <div className="space-y-1">
                <p>
                  <span className="font-bold text-slate-900">Payment Communication:</span>{' '}
                  <span className="font-semibold text-[#0974b2]">{invoice.payment_communication}</span>
                </p>
                {invoice.bank_account_info && (
                  <p>
                    <span className="font-bold text-slate-900">Bank Account:</span>{' '}
                    <span>{invoice.bank_account_info}</span>
                  </p>
                )}
              </div>

              {invoice.customer_notes && invoice.customer_notes.length > 0 && (
                <div className="space-y-1 text-slate-600 text-[11px] leading-relaxed">
                  {invoice.customer_notes.map((n, i) => (
                    <p key={i}>• {n}</p>
                  ))}
                </div>
              )}

              {/* HSN Summary Table */}
              {invoice.hsn_summary && invoice.hsn_summary.length > 0 && (
                <div className="pt-2">
                  <p className="font-bold text-slate-800 text-xs mb-1.5">HSN Summary</p>
                  <table className="w-full text-[11px] border border-slate-200">
                    <thead className="bg-slate-100 font-semibold text-slate-700">
                      <tr>
                        <th className="py-1 px-2 text-left">HSN/SAC</th>
                        <th className="py-1 px-2 text-right">Quantity</th>
                        <th className="py-1 px-2 text-right">Rate</th>
                        <th className="py-1 px-2 text-right">Taxable Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.hsn_summary.map((h, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1 px-2">{h.hsn_sac}</td>
                          <td className="py-1 px-2 text-right">{Number(h.quantity).toFixed(2)}</td>
                          <td className="py-1 px-2 text-right">{h.rate_percentage}%</td>
                          <td className="py-1 px-2 text-right font-medium">{formatINR(h.taxable_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Column: Financial Summary & Signatory */}
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-md overflow-hidden text-xs">
                {/* Total / Untaxed Row */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#e5f0f6] font-bold text-slate-900 border-b border-slate-200">
                  <span>Total</span>
                  <span className="text-sm">{formatINR(invoice.total_amount)}</span>
                </div>

                {/* Verified Payments Rows */}
                {(() => {
                  const sortedPayments = [...(invoice.payments || [])].sort(
                    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                  );
                  const totalPaid = sortedPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

                  if (sortedPayments.length === 0) {
                    return (
                      <div className="px-4 py-2 text-slate-500 text-[11px] italic bg-white">
                        No verified payments recorded.
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-slate-100 bg-white">
                      {sortedPayments.map((p, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2 text-slate-600">
                          <span>Paid on {p.date}</span>
                          <span className="font-semibold text-emerald-700">- {formatINR(p.amount)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-4 py-2 bg-emerald-50/60 font-semibold text-emerald-900 border-t border-emerald-100">
                        <span>Total Paid</span>
                        <span>{formatINR(totalPaid)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Amount Due Row */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                  <span>Amount Due</span>
                  <span
                    className={`text-sm ${
                      invoice.amount_due > 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {formatINR(invoice.amount_due)}
                  </span>
                </div>
              </div>

              {/* Total Amount in Words */}
              <div className="text-[11px] text-slate-700 italic">
                <span className="font-bold not-italic text-slate-900">Total amount in words:</span>{' '}
                {invoice.amount_in_words || 'Zero Rupees Only'}
              </div>

              {/* Authorized Signatory */}
              <div className="pt-6 text-right space-y-1">
                <p className="font-bold text-xs text-slate-900">
                  {invoice.authorized_signatory_title || 'Authorized signatory'}
                </p>
                <p className="text-[11px] text-slate-600">
                  {invoice.authorized_signatory_name || 'Accounts Department'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Soft Warm Beige Curved Footer Banner */}
        <div className="bg-[#f6f1e5] px-8 py-4 border-t border-[#eee5d3] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-700 font-medium">
          <div>
            <span>{invoice.institute_website || OFFICIAL_INSTITUTE_WEBSITE}</span>
            <span className="mx-2 text-slate-400">||</span>
            <span>{invoice.institute_phone || OFFICIAL_INSTITUTE_PHONE}</span>
          </div>
          <div className="text-slate-500 text-[11px]">Page 1 / 1</div>
        </div>
      </div>
    </div>
  );
}
