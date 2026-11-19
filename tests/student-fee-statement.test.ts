import { describe, it, expect } from 'vitest';
import { buildStudentFeeStatement, type StatementSource } from '@/lib/services/student-fee-statement';
import { generateStudentFeeStatementPdf, statementPdfLines } from '@/lib/services/student-fee-statement-pdf';
import { calculateAuthoritativeStudentFinancials } from '@/lib/utils/student-financials';
import { isPaymentApproved, unifyDualLedgerPayments } from '@/lib/utils/dashboard-metrics';

function fixture(): StatementSource {
  return {
    student: { id: 'statement-test', full_name: 'Statement Test', admission_number: 'TEST-001' },
    fees: [{ id: 'fee-test', student_id: 'statement-test', approval_status: 'Approved', final_payable: 45000,
      invoice_number: 'INV-TEST-1', invoice_date: '2026-11-01', invoice_approved_amount: 45000, course_name: 'Test Course' }],
    accounts: [], payments: [], studentPayments: [], receipts: [], installments: [], ledger: [],
  } as unknown as StatementSource;
}
function payment(source: StatementSource, amount: number, day: string, status = 'Approved') {
  const n = source.studentPayments.length + 1;
  const p = { id: `spr-${n}`, student_id: source.student.id, fee_id: 'fee-test', amount_paid: amount, payment_date: `2026-11-${day}`,
    status, verification_status: status === 'Approved' ? 'Verified' : 'Pending Verification', payment_mode: 'Cash', installment_id: `inst-${n}`,
    receipt_number: status === 'Approved' ? `REC-TEST-${n}` : undefined };
  source.studentPayments.push(p as never);
  source.payments.push({ ...p, id: `pay-${p.id}`, amount, status: status === 'Approved' ? 'Success' : 'Pending' } as never);
  if (status === 'Approved') source.receipts.push({ id: `r-${n}`, payment_id: p.id, student_id: source.student.id, receipt_number: p.receipt_number,
    payment_amount: amount, payment_date: p.payment_date, remaining_balance: 45000 - source.receipts.reduce((s, r) => s + r.payment_amount, 0) - amount } as never);
}
describe('Committed student fee statement', () => {
  it('keeps processed refunds in history and reconciles their net value with reports', () => {
    const source = fixture(); payment(source, 5000, '01');
    source.refunds = [{ id: 'refund-1', payment_id: 'spr-1', status: 'Processed', refund_amount: 2000 }] as never;
    source.ledger.push({ id: 'refund-ledger', reference_id: 'refund-1', entry_type: 'Refund Processed', entry_date: '2026-11-05', debit: 2000, credit: 0, description: 'Processed refund' } as never);
    const statement = buildStudentFeeStatement(source);
    expect(statement.rows.map(r => r.balance)).toEqual([40000, 42000]);
    const reports = unifyDualLedgerPayments(source.payments, source.studentPayments, { receipts: source.receipts, refunds: source.refunds });
    expect(reports.filter(isPaymentApproved).reduce((sum, p) => sum + p.amount, 0)).toBe(statement.cumulativePaid);
  });
  it('does not double count duplicate imported receipts or mirrored payments', () => {
    const source = fixture(); payment(source, 5000, '01');
    source.receipts.push({ ...source.receipts[0], id: 'duplicate-import' });
    expect(buildStudentFeeStatement(source).cumulativePaid).toBe(5000);
    expect(buildStudentFeeStatement(source).rows).toHaveLength(1);
  });
  it('applies standalone approved write-offs without rewriting the invoice', () => {
    const source = fixture(); payment(source, 5000, '01');
    source.ledger.push({ id: 'writeoff', reference_id: 'ADJ-1', entry_type: 'Fee Adjustment', entry_date: '2026-11-05', debit: 0, credit: 10000, description: 'Approved write-off' } as never);
    const statement = buildStudentFeeStatement(source);
    expect(statement.totalApprovedFee).toBe(35000);
    expect(statement.rows.map(r => r.balance)).toEqual([40000, 30000]);
    expect(statement.invoices[0].originalAmount).toBe(45000);
    expect(calculateAuthoritativeStudentFinancials({ studentFees: source.fees, payments: source.payments, studentPayments: source.studentPayments, studentLedger: source.ledger }).outstandingDue).toBe(statement.outstanding);
  });
  it('allocates unassigned verified payments by due date within the matching account', () => {
    const source = fixture(); payment(source, 5000, '01'); payment(source, 10000, '10');
    for (const p of [...source.payments, ...source.studentPayments]) p.installment_id = undefined;
    source.fees[0].fee_account_id = 'account-test';
    source.installments = [
      { id: 'second', fee_account_id: 'account-test', amount: 10000, due_date: '2026-11-10' },
      { id: 'first', fee_account_id: 'account-test', amount: 5000, due_date: '2026-11-01' },
      { id: 'other-course', fee_account_id: 'different-account', amount: 3000, due_date: '2026-10-01' },
    ] as never;
    const schedule = buildStudentFeeStatement(source).installments;
    expect(schedule.find(i => i.id === 'first')?.received).toBe(5000);
    expect(schedule.find(i => i.id === 'second')?.received).toBe(10000);
    expect(schedule.find(i => i.id === 'other-course')?.received).toBe(0);
  });
  it('shows 40000 → 30000 → 0 with distinct receipts and reconciles reports', () => {
    const source = fixture();
    payment(source, 5000, '01'); payment(source, 10000, '10'); payment(source, 30000, '20');
    const before = structuredClone(source);
    const statement = buildStudentFeeStatement(source);
    expect(statement.rows.map(r => r.balance)).toEqual([40000, 30000, 0]);
    expect(statement.rows.map(r => r.cumulativePaid)).toEqual([5000, 15000, 45000]);
    expect(new Set(statement.rows.map(r => r.receiptNumber)).size).toBe(3);
    expect(statement.status).toBe('Paid in Full');
    const reports = unifyDualLedgerPayments(source.payments, source.studentPayments, { receipts: source.receipts });
    expect(reports.filter(isPaymentApproved).reduce((s, p) => s + p.amount, 0)).toBe(statement.cumulativePaid);
    expect(source).toEqual(before);
  });
  it('pending/rejected payments and stale cached totals never clear balances', () => {
    const source = fixture(); payment(source, 5000, '01', 'Pending Approval');
    expect(buildStudentFeeStatement(source).outstanding).toBe(45000);
    expect(buildStudentFeeStatement(source).rows[0].receiptId).toBeUndefined();
    expect(calculateAuthoritativeStudentFinancials({ student: { total_fee: 45000, paid_amount: 45000 }, payments: [] }).outstandingDue).toBe(45000);
    source.studentPayments[0].status = 'Rejected'; source.studentPayments[0].verification_status = 'Rejected';
    expect(buildStudentFeeStatement(source).outstanding).toBe(45000);
  });
  it('restores full and partial reversals exactly once, preserving history and matching reports', () => {
    const source = fixture(); payment(source, 5000, '01'); payment(source, 10000, '10');
    Object.assign(source.receipts[1], { status: 'Partially Reversed', reversed_amount: 2000, original_amount: 10000,
      reversals: [{ id: 'rev-1', credit_note_number: 'CN-1', amount: 2000, reversed_at: '2026-11-12', reason: 'Correction' }] });
    let statement = buildStudentFeeStatement(source);
    expect(statement.rows.map(r => r.balance)).toEqual([40000, 30000, 32000]);
    const reports = unifyDualLedgerPayments(source.payments, source.studentPayments, { receipts: source.receipts });
    expect(reports.filter(isPaymentApproved).reduce((s, p) => s + p.amount, 0)).toBe(statement.cumulativePaid);
    Object.assign(source.receipts[0], { status: 'Void', reversed_amount: 5000, void_at: '2026-11-13' });
    source.studentPayments[0].status = 'Voided'; source.studentPayments[0].verification_status = 'Rejected';
    statement = buildStudentFeeStatement(source);
    expect(statement.outstanding).toBe(37000);
    expect(statement.rows[0].amountReceived).toBe(5000);
  });
  it('preserves original invoice through approved fee adjustments and excludes pending revisions', () => {
    const source = fixture(); payment(source, 5000, '01');
    source.fees[0].final_payable = 40000;
    source.ledger.push({ id: 'adjustment', reference_id: 'fee-test', entry_type: 'Fee Adjustment', entry_date: '2026-11-05', debit: 0, credit: 5000, description: 'Approved discount' } as never);
    source.fees.push({ id: 'pending', approval_status: 'Pending Approval', final_payable: 80000 } as never);
    const statement = buildStudentFeeStatement(source);
    expect(statement.invoices[0].originalAmount).toBe(45000);
    expect(statement.rows.map(r => r.balance)).toEqual([40000, 35000]);
  });
  it('separates due dates, received amounts, actual dates and verification', () => {
    const source = fixture(); payment(source, 5000, '01'); payment(source, 1000, '10', 'Pending Approval');
    source.installments = [
      { id: 'inst-1', amount: 10000, due_date: '2026-11-01' },
      { id: 'inst-2', amount: 10000, due_date: '2026-11-20' },
    ] as never;
    const statement = buildStudentFeeStatement(source, '2026-11-18');
    expect(statement.installments[0]).toMatchObject({ received: 5000, unpaid: 5000, status: 'Overdue', paymentDates: ['2026-11-01'] });
    expect(statement.installments[1]).toMatchObject({ received: 0, unpaid: 10000, status: 'Upcoming', verificationStatus: ['Pending Verification'] });
  });
  it('generates a real cumulative PDF with the exact statement values', async () => {
    const source = fixture(); payment(source, 5000, '01'); payment(source, 10000, '10'); payment(source, 30000, '20');
    const statement = buildStudentFeeStatement(source);
    const lines = statementPdfLines(statement).join('\n');
    expect(lines).toContain('Balance: INR 40,000.00');
    expect(lines).toContain('Balance: INR 30,000.00');
    expect(lines).toContain('Balance: INR 0.00');
    for (const receipt of source.receipts) expect(lines).toContain(receipt.receipt_number);
    const pdf = await generateStudentFeeStatementPdf(statement);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
