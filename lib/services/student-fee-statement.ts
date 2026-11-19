import type { Student, StudentFee, StudentFeeAccount, StudentPaymentRecord, Payment, Receipt, Installment, StudentFinancialLedgerEntry } from '@/types';
import { isPaymentApproved, unifyDualLedgerPayments } from '@/lib/utils/dashboard-metrics';
import { getTodayInInstituteTimezone } from '@/lib/utils/schedule-date';

export interface StatementSource {
  student: Student;
  fees: StudentFee[];
  accounts: StudentFeeAccount[];
  payments: Payment[];
  studentPayments: StudentPaymentRecord[];
  receipts: Receipt[];
  installments: Installment[];
  ledger: StudentFinancialLedgerEntry[];
  refunds?: import('@/types').StudentRefundRequest[];
}
const money = (n: number) => Math.round(n * 100) / 100;
export interface StatementRow {
  id: string; date: string; description: string; amountReceived: number;
  paidDelta: number; feeDelta: number; cumulativePaid: number; balance: number;
  status: string; receiptNumber?: string; receiptId?: string;
}

/** Pure projection of a committed, tenant-scoped snapshot. Never writes financial records. */
export function buildStudentFeeStatement(source: StatementSource, today = getTodayInInstituteTimezone()) {
  const { student, fees, accounts } = source;
  const receiptIdentities = new Set<string>();
  const receipts = source.receipts.filter(receipt => {
    const identities = [`id:${receipt.id}`, `number:${receipt.receipt_number}`,
      ...(receipt.payment_id ? [`payment:${receipt.payment_id.replace(/^(pay-spr-|spr-pay-|pay-|spr-)/, '')}`] : [])];
    if (identities.some(key => receiptIdentities.has(key))) return false;
    identities.forEach(key => receiptIdentities.add(key));
    return true;
  });
  const activeFees = fees.filter(f => f.approval_status === 'Approved');
  const covered = new Set(fees.flatMap(f => [f.fee_account_id, `fa-${f.id}`, f.id.replace(/^fee-/, '')]).filter(Boolean));
  const legacy = accounts.filter(a => !covered.has(a.id));
  const adjustments = [...new Map(source.ledger.filter(e => ['Fee Adjustment', 'Fee Waiver', 'Discount Approved', 'Debit Note'].includes(e.entry_type)).map(e => [e.id, e])).values()];
  // Fee revisions replace final_payable; standalone posted adjustments do not.
  const standaloneAdjustments = adjustments.filter(e => !fees.some(f => f.id === e.reference_id));
  const totalApprovedFee = money(activeFees.reduce((sum, f) => sum + f.final_payable, 0) + legacy.reduce((sum, a) => sum + a.net_payable, 0)
    + standaloneAdjustments.reduce((sum, e) => sum + e.debit - e.credit, 0));
  const invoices = fees.filter(f => !f.parent_fee_id && ['Approved', 'Superseded'].includes(f.approval_status)).map(f => ({
    number: f.invoice_number || null, date: f.invoice_date || null,
    originalAmount: f.invoice_approved_amount ?? f.approved_total ?? f.final_payable,
    course: f.course_name || f.fee_category,
  }));
  const canonical = unifyDualLedgerPayments(source.payments, source.studentPayments, { studentFees: fees, feeAccounts: accounts, receipts });
  const events: StatementRow[] = [];
  const add = (row: Omit<StatementRow, 'balance' | 'cumulativePaid'>) => events.push({ ...row, balance: 0, cumulativePaid: 0 });
  const usedReceipts = new Set<string>();
  for (const payment of canonical) {
    const receipt = receipts.find(r => r.receipt_number === payment.receipt_number || r.payment_id === payment.raw_id || r.payment_id === payment.id);
    if (receipt && usedReceipts.has(receipt.id)) continue;
    if (receipt) usedReceipts.add(receipt.id);
    const reversed = receipt && (receipt.status === 'Void' || (receipt.reversed_amount || 0) > 0);
    const approved = isPaymentApproved(payment);
    const original = receipt ? receipt.original_amount ?? receipt.payment_amount : payment.amount;
    add({ id: payment.id, date: payment.payment_date, description: `${payment.fee_category || 'Course fee'} - ${payment.payment_mode}`,
      amountReceived: original, paidDelta: approved || reversed ? original : 0, feeDelta: 0,
      status: reversed ? 'Verified (subsequently reversed)' : approved ? 'Verified' : payment.status || payment.verification_status || 'Pending',
      receiptNumber: approved || reversed ? receipt?.receipt_number : undefined, receiptId: approved || reversed ? receipt?.id : undefined });
    if (receipt) appendReversals(receipt);
  }
  // Official legacy receipts can exist without a surviving payment mirror.
  for (const receipt of receipts) {
    if (usedReceipts.has(receipt.id)) continue;
    add({ id: receipt.id, date: receipt.payment_date, description: 'Historical verified payment', amountReceived: receipt.original_amount ?? receipt.payment_amount,
      paidDelta: receipt.original_amount ?? receipt.payment_amount, feeDelta: 0, status: 'Verified', receiptNumber: receipt.receipt_number, receiptId: receipt.id });
    appendReversals(receipt);
  }
  function appendReversals(receipt: Receipt) {
    const seen = new Set<string>();
    let reversed = 0;
    for (const reversal of receipt.reversals || []) {
      if (seen.has(reversal.id)) continue;
      seen.add(reversal.id);
      reversed = money(reversed + reversal.amount);
      add({ id: reversal.id, date: reversal.reversed_at, description: `Credit note ${reversal.credit_note_number}: ${reversal.reason}`, amountReceived: -reversal.amount,
        paidDelta: -reversal.amount, feeDelta: 0, status: 'Reversed', receiptNumber: receipt.receipt_number, receiptId: receipt.id });
    }
    const remainder = money((receipt.reversed_amount ?? (receipt.status === 'Void' ? receipt.original_amount ?? receipt.payment_amount : 0)) - reversed);
    if (remainder > 0) add({ id: `reversal-${receipt.id}`, date: receipt.void_at || receipt.created_at, description: `Credit note ${receipt.credit_note_number || 'historical reversal'}`, amountReceived: -remainder,
      paidDelta: -remainder, feeDelta: 0, status: 'Reversed', receiptNumber: receipt.receipt_number, receiptId: receipt.id });
  }
  // Processed refunds are posted separately from receipt credit-note reversals.
  for (const entry of [...new Map(source.ledger.filter(e => e.entry_type === 'Refund Processed').map(e => [e.reference_id, e])).values()]) {
    add({ id: entry.id, date: entry.entry_date, description: entry.description, amountReceived: -money(entry.debit - entry.credit),
      paidDelta: -money(entry.debit - entry.credit), feeDelta: 0, status: 'Refund processed' });
  }
  // The current approved obligation already incorporates these posted adjustments.
  for (const entry of adjustments) add({ id: entry.id, date: entry.entry_date, description: entry.description, amountReceived: 0, paidDelta: 0,
    feeDelta: money(entry.debit - entry.credit), status: 'Posted adjustment' });
  let obligation = money(totalApprovedFee - adjustments.reduce((s, e) => s + e.debit - e.credit, 0));
  let cumulativePaid = 0;
  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const row of events) {
    obligation = money(obligation + row.feeDelta);
    cumulativePaid = money(cumulativePaid + row.paidDelta);
    row.cumulativePaid = cumulativePaid;
    row.balance = money(Math.max(0, obligation - cumulativePaid));
  }
  const scheduled = [...source.installments].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id));
  const allocations = new Map<string, { amount: number; payments: typeof canonical }>();
  for (const installment of scheduled) allocations.set(installment.id, { amount: 0, payments: [] });
  // Honor explicit installment references first. Unallocated verified payments
  // settle the oldest due installments within their own fee account.
  for (const payment of [...canonical].sort((a, b) => Number(Boolean(b.installment_id)) - Number(Boolean(a.installment_id)) || a.payment_date.localeCompare(b.payment_date))) {
    const fee = fees.find(f => f.id === payment.fee_id);
    const candidates = scheduled.filter(i => payment.installment_id ? i.id === payment.installment_id
      : i.fee_account_id === payment.fee_account_id || i.fee_account_id === payment.fee_id || (fee?.fee_account_id && i.fee_account_id === fee.fee_account_id));
    const refunded = (source.refunds || []).filter(r => r.status === 'Processed' &&
      (r.payment_id === payment.raw_id || r.payment_id === payment.id || (r.receipt_number && r.receipt_number === payment.receipt_number)))
      .reduce((sum, r) => sum + r.refund_amount, 0);
    let remaining = isPaymentApproved(payment) ? Math.max(0, payment.amount - refunded) : 0;
    for (const installment of candidates) {
      const allocation = allocations.get(installment.id)!;
      const amount = Math.min(remaining, Math.max(0, installment.amount - allocation.amount));
      if (amount > 0 || payment.installment_id === installment.id) allocation.payments.push(payment);
      allocation.amount = money(allocation.amount + amount);
      remaining = money(remaining - amount);
      if (remaining <= 0) break;
    }
  }
  const installments = scheduled.map(installment => {
    const { amount: received, payments: linked } = allocations.get(installment.id)!;
    return { id: installment.id, dueDate: installment.due_date, amount: installment.amount, received,
      unpaid: money(Math.max(0, installment.amount - received)),
      paymentDates: linked.map(p => p.payment_date), verificationStatus: linked.map(p => p.verification_status || p.status || 'Pending'),
      status: received >= installment.amount ? 'Fully settled' : installment.due_date < today ? 'Overdue' : installment.due_date === today ? 'Due today' : 'Upcoming' };
  });
  return { studentId: student.id, studentName: student.full_name, admissionNumber: student.admission_number,
    courses: [...new Set([...activeFees.map(f => f.course_name || f.fee_category), ...legacy.map(a => a.course_name)])],
    totalApprovedFee, cumulativePaid, outstanding: money(Math.max(0, totalApprovedFee - cumulativePaid)),
    status: totalApprovedFee > 0 && cumulativePaid >= totalApprovedFee ? 'Paid in Full' : cumulativePaid > 0 ? 'Partially Paid' : 'Unpaid',
    invoices, rows: events, installments, generatedOn: today };
}
export type StudentFeeStatement = ReturnType<typeof buildStudentFeeStatement>;
