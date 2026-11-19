'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StudentFeeStatement as Statement } from '@/lib/services/student-fee-statement';
import { formatINR } from '@/lib/utils/formatters';

export function StudentFeeStatement({ studentId }: { studentId: string }) {
  const [result, setResult] = useState<{ key: string; statement: Statement | null; error: string } | null>(null);
  const [version, setVersion] = useState(0);
  const key = `${studentId}:${version}`;
  const statement = result?.key === key ? result.statement : null;
  const error = result?.key === key ? result.error : '';
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/fees/statements/${encodeURIComponent(studentId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data.statement as Statement; })
      .then(statement => setResult({ key, statement, error: '' })).catch(e => { if (!controller.signal.aborted) setResult({ key, statement: null, error: e.message || 'Unable to load statement.' }); });
    return () => controller.abort();
  }, [studentId, key]);
  return <section className="space-y-4 rounded-lg border bg-white p-4" aria-label="Student fee statement">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Student Fee Statement</h2>
      <button className="text-sm text-blue-700" onClick={() => setVersion(v => v + 1)}>Refresh statement</button>
      {statement && <a className="rounded bg-blue-700 px-3 py-2 text-sm text-white" href={`/api/fees/statements/${encodeURIComponent(studentId)}?format=pdf`}>Download latest PDF</a>}
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!statement && !error && <p role="status">Loading committed financial records…</p>}
    {statement && <>
      <p>{statement.studentName} · {statement.admissionNumber} · {statement.courses.join(', ')}</p>
      <p className="font-semibold">Approved fee: {formatINR(statement.totalApprovedFee)} · Net paid: {formatINR(statement.cumulativePaid)} · Outstanding: {formatINR(statement.outstanding)} · {statement.status}</p>
      <h3 className="font-semibold">Original invoices</h3>
      {statement.invoices.length === 0 && <p className="text-sm">No original invoice reference recorded.</p>}
      {statement.invoices.map((invoice, i) => <p key={i} className="text-sm">{invoice.number || 'Not recorded'} · {invoice.date || 'Date not recorded'} · {invoice.course} · Original approved fee: {formatINR(invoice.originalAmount)}</p>)}
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
        <thead><tr>{['Payment date', 'Description', 'Amount received', 'Cumulative net paid', 'Remaining balance', 'Status', 'Receipt'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{statement.rows.map(row => <tr key={row.id} className="border-t">
          <td className="p-2">{row.date.slice(0, 10)}</td><td className="p-2">{row.description}</td><td className="p-2">{formatINR(row.amountReceived)}</td>
          <td className="p-2">{formatINR(row.cumulativePaid)}</td><td className="p-2">{formatINR(row.balance)}</td><td className="p-2">{row.status}</td>
          <td className="p-2">{row.receiptId ? <><Link className="text-blue-700 underline" href={`/accounts/receipts/${encodeURIComponent(row.receiptId)}`}>{row.receiptNumber}</Link><a className="block text-blue-700" href={`/api/receipts/${encodeURIComponent(row.receiptId)}/pdf?download=true`}>Download receipt</a></> : 'Not issued'}</td>
        </tr>)}</tbody>
      </table></div>
      <h3 className="font-semibold">Installment schedule</h3>
      {statement.installments.length === 0 && <p className="text-sm">No scheduled installments recorded. Actual payments appear in the history above.</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm">
        <thead><tr>{['Scheduled due date', 'Installment amount', 'Verified received', 'Unpaid', 'Actual payment dates', 'Verification', 'Due status'].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
        <tbody>{statement.installments.map(i => <tr key={i.id} className="border-t"><td className="p-2">{i.dueDate}</td><td className="p-2">{formatINR(i.amount)}</td><td className="p-2">{formatINR(i.received)}</td><td className="p-2">{formatINR(i.unpaid)}</td><td className="p-2">{i.paymentDates.map(d => d.slice(0, 10)).join(', ') || 'None'}</td><td className="p-2">{i.verificationStatus.join(', ') || 'No payment'}</td><td className="p-2">{i.status}</td></tr>)}</tbody>
      </table></div>
      <p className="text-xs text-slate-600">Pending and rejected payments do not reduce the balance. Reversals restore outstanding amounts. Original invoices and receipts remain unchanged.</p>
    </>}
  </section>;
}
