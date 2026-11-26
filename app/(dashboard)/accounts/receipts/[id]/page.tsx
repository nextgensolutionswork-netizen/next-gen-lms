'use client';
import Image from 'next/image';

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
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mergeWorkflowSnapshot } from '@/lib/services/payment-workflow-state';
import { store } from '@/lib/services/data-store';
import { formatINR, formatDate, formatDateTime } from '@/lib/utils/formatters';
import { amountToWordsINR } from '@/lib/services/finance-formatters';
import { useAuth } from '@/components/providers/auth-provider';

import { tenantId } from '@/lib/auth/tenant';
import { useRecordLoad } from '@/lib/hooks/use-record-load';
import type { Receipt } from '@/types';
import {
  OFFICIAL_INSTITUTE_NAME,
  OFFICIAL_INSTITUTE_ADDRESS,
  OFFICIAL_INSTITUTE_PHONE,
  resolveInstituteAddress,
  resolveInstitutePhone,
  resolveReceiptTerms,
} from '@/lib/constants/branding';

export default function ReceiptPrintPage() {
  const { user, role, isLoading: authLoading } = useAuth();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const loadReceipt = React.useCallback(async (signal: AbortSignal) => {
    const response = await fetch('/api/fees/receipts', { cache: 'no-store', signal });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Receipt access denied. Sign in with an authorized account.' : 'Unable to load receipts. Please retry.');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.snapshot?.receipts)) throw new Error('Unable to verify this receipt. Please retry.');
    if (signal.aborted) return null;
    mergeWorkflowSnapshot(data.snapshot);
    // Only the authorized response is authoritative; never render a cached fallback.
    return (data.snapshot.receipts as Receipt[]).find((r) => r.id === id || r.receipt_number === id || r.payment_id === id) || null;
  }, [id]);
  const { data: receipt, status, error, reload } = useRecordLoad<Receipt>(
    !authLoading && user?.id && id ? `${user.id}:${id}` : null, loadReceipt
  );

  if (!authLoading && !user) return <p role="alert">Please sign in to view this receipt.</p>;
  if (status === 'loading') return <p role="status" className="p-8 text-center">Loading authorized receipt…</p>;
  if (status === 'error') return <div className="p-8 text-center space-y-3"><p role="alert">{error}</p><Button onClick={() => void reload()}>Retry loading receipt</Button></div>;

  // Nonexistent receipt: return clear 404 empty state, NEVER fall back to another receipt
  if (!receipt) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Receipt Not Found</h2>
        <p className="text-xs text-slate-500">
          No signed official fee receipt matching reference "{id}" could be located in the financial store.
        </p>
        <div className="pt-2">
          <Link href={role === 'student' ? '/portal' : '/accounts/receipts'}>
            <Button variant="sap" size="sm" className="text-xs">
              {role === 'student' ? 'Back to Student Portal' : 'Back to Receipts Registry'}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Role authorization: only authorized staff and students may view receipts
  const isAuthorizedStaff = ['super_admin', 'admin', 'accountant', 'counsellor'].includes(role || '');
  const isStudent = role === 'student';

  if (!isAuthorizedStaff && !isStudent) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          Your role ({role || 'Guest'}) does not have permission to view institutional fee receipts.
        </p>
        <div className="pt-2">
          <Link href="/dashboard">
            <Button variant="sap" size="sm" className="text-xs">
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Cross-tenant boundary check: deny access if receipt belongs to another tenant
  if (role !== 'super_admin' && user && tenantId(receipt) !== tenantId(user)) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Cross-Tenant Access Denied</h2>
        <p className="text-xs text-slate-500">
          This receipt belongs to another institutional tenant and cannot be accessed.
        </p>
        <div className="pt-2">
          <Link href={role === 'student' ? '/portal' : '/dashboard'}>
            <Button variant="sap" size="sm" className="text-xs">
              Return to Portal
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Student ownership security validation: students can only view their own receipts
  if (isStudent && user) {
    const currentStudent = (store.students || []).find(
      (s) => s.user_id === user.id || s.id === user.id || s.email?.toLowerCase() === user.email?.toLowerCase()
    );
    const receiptStudent = (store.students || []).find((s) => s.id === receipt.student_id);
    const isOwnReceipt =
      receipt.student_id === user.id ||
      (currentStudent && receipt.student_id === currentStudent.id) ||
      (receipt.student_email && receipt.student_email.toLowerCase() === user.email?.toLowerCase()) ||
      (receiptStudent && (receiptStudent.user_id === user.id || receiptStudent.email?.toLowerCase() === user.email?.toLowerCase()));

    if (!isOwnReceipt) {
      return (
        <div className="max-w-md mx-auto my-16 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500">
            You are only authorized to view fee receipts issued directly to your student account.
          </p>
          <div className="pt-2">
            <Link href="/portal">
              <Button variant="sap" size="sm" className="text-xs">
                Back to Student Portal
              </Button>
            </Link>
          </div>
        </div>
      );
    }
  }

  const pdfUrl = `/api/receipts/${receipt.id}/pdf`;

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const fullPdfUrl = pdfUrl.startsWith('http')
      ? pdfUrl
      : typeof window !== 'undefined'
      ? `${window.location.origin}${pdfUrl}?download=true`
      : pdfUrl;

    const text = encodeURIComponent(
      `Official Fee Receipt: ${receipt.receipt_number}\nInstitute: ${receipt.institute_name}\nStudent: ${receipt.student_name}\nAmount Paid: ${formatINR(receipt.payment_amount)}\nDate: ${formatDate(receipt.payment_date)}\n\nDownload Official PDF Receipt:\n${fullPdfUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link href={role === 'student' ? '/portal' : '/accounts/receipts'}><Button variant="ghost"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button></Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Print</Button>
          <a href={pdfUrl + '?download=true'}><Button variant="outline"><Download className="h-4 w-4 mr-2" />Download PDF</Button></a>
          <Button variant="outline" onClick={handleShareWhatsApp}><Share2 className="h-4 w-4 mr-2" />Share</Button>
        </div>
      </div>
      <article className="bg-white border border-slate-200 rounded-xl p-8 print:border-0 print:p-0 space-y-6">
        {receipt.status === 'Void' && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            <strong>VOID / CANCELLED — {receipt.credit_note_number}</strong>
            <p>{receipt.void_reason}</p>
            <p>Voided by {receipt.void_by} on {formatDate(receipt.void_at || receipt.payment_date)}</p>
          </div>
        )}
        {receipt.status === 'Partially Reversed' && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <strong>PARTIALLY REVERSED — {receipt.credit_note_number || 'Credit Note Issued'}</strong>
            <p>Reversed Amount: {formatINR(receipt.reversed_amount || 0)} | Net Active Amount: {formatINR((receipt.original_amount ?? receipt.payment_amount) - (receipt.reversed_amount || 0))}</p>
            {receipt.void_reason && <p className="text-xs text-amber-700 mt-1">Reason: {receipt.void_reason}</p>}
          </div>
        )}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-6">
          <div className="flex flex-col sm:flex-row items-start gap-4 max-w-xl">
            {/* Top-Left Company Logo */}
            <div className="shrink-0 pt-0.5">
              <Image
                src="/branding/nextgen-logo.webp"
                alt="Next-Gen ERP Solutions"
                width={160}
                height={48}
                className="h-12 w-auto object-contain"
                priority
                unoptimized
              />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="inline-flex items-center space-x-1.5 bg-blue-900 text-white px-2.5 py-0.5 rounded font-bold text-[11px] tracking-wider uppercase mb-1">
                <span>Next-Gen LMS</span>
                <span className="text-blue-300">•</span>
                <span className="text-[10px] text-blue-200 font-normal">Official Institutional Receipt</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
                {receipt.institute_name || OFFICIAL_INSTITUTE_NAME}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-words">
                {resolveInstituteAddress(receipt.institute_address)}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 pt-0.5">
                {resolveInstitutePhone(receipt.institute_phone) && (
                  <span>Phone: <strong className="text-slate-700 font-medium">{resolveInstitutePhone(receipt.institute_phone)}</strong></span>
                )}
                {receipt.institute_gst && (
                  <span>GSTIN: <strong className="text-slate-700 font-medium">{receipt.institute_gst}</strong></span>
                )}
                <span>
                  Place of Supply: <strong className="text-slate-700 font-medium">{receipt.place_of_supply || 'Telangana (36)'}</strong>
                </span>
              </div>
            </div>
          </div>
          <div className="sm:text-right space-y-1 shrink-0 w-full sm:w-auto">
            <h2 className="font-bold text-blue-700 text-lg">Official Fee Receipt</h2>
            <p className="font-mono font-semibold text-slate-900">{receipt.receipt_number}</p>
            <p className="text-sm text-slate-600">Date: {formatDate(receipt.payment_date)}</p>
            {receipt.remaining_balance > 0 && (
              <p className="text-xs font-semibold text-rose-600">
                Installment Due Date: {receipt.due_date ? formatDate(receipt.due_date) : 'Within 15 days'}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg border border-slate-100">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Student Details</p>
            <p className="font-bold text-slate-900 text-base">{receipt.student_name}</p>
            <p className="font-mono text-slate-600">{receipt.admission_number}</p>
            <p className="text-slate-600">{receipt.student_email}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Payment Details</p>
            <p className="font-bold text-slate-900">{receipt.course_name}</p>
            <p className="text-slate-600">Payment mode: {receipt.payment_mode}</p>
            <p className="text-slate-600 font-mono text-xs">Reference: {receipt.transaction_reference || '—'}</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left p-3 font-semibold text-slate-700">Description</th>
              <th className="text-right p-3 font-semibold text-slate-700">Amount Received</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="p-3">Fee payment — {receipt.course_name}</td>
              <td className="p-3 text-right font-bold text-slate-900">{formatINR(receipt.payment_amount)}</td>
            </tr>
            {receipt.reversed_amount ? (
              <tr className="border-b text-amber-700 bg-amber-50/50">
                <td className="p-3 font-medium">Reversed / Refunded (Credit Note Adjustment)</td>
                <td className="p-3 text-right font-bold">- {formatINR(receipt.reversed_amount)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="text-xs text-slate-600 italic">
          Amount in words: {amountToWordsINR(receipt.reversed_amount ? (receipt.original_amount ?? receipt.payment_amount) - receipt.reversed_amount : receipt.payment_amount)}
        </p>
        <dl className="ml-auto max-w-sm space-y-2 text-sm bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="flex justify-between">
            <dt className="text-slate-600">This Payment</dt>
            <dd className="font-mono font-medium">{formatINR(receipt.payment_amount)}</dd>
          </div>
          {receipt.reversed_amount ? (
            <div className="flex justify-between text-amber-700">
              <dt>Net Retained</dt>
              <dd className="font-mono font-bold">{formatINR((receipt.original_amount ?? receipt.payment_amount) - receipt.reversed_amount)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
            <dt className="text-slate-800">Remaining Balance</dt>
            <dd className="font-mono text-amber-700">{formatINR(receipt.remaining_balance)}</dd>
          </div>
        </dl>

        {/* Terms & Conditions Section */}
        <div className="border-t border-slate-200 pt-4 space-y-1.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Terms & Conditions</h4>
          <p className="text-[11px] text-slate-500 whitespace-pre-line leading-relaxed">
            {resolveReceiptTerms(receipt.terms_and_conditions)}
          </p>
        </div>

        <footer className="border-t pt-4 text-xs text-slate-500 flex justify-between items-center">
          <div>
            <p>Authorized by: <span className="font-semibold text-slate-700">{receipt.authorized_by}</span></p>
            <p>Generated: {formatDateTime(receipt.created_at)}</p>
          </div>
          <p className="italic">Computer-generated official receipt.</p>
        </footer>
      </article>
    </div>
  );
}
