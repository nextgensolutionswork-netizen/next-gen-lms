import { it, expect, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { buildStudentFeeStatement } from '@/lib/services/student-fee-statement';
import { enteredPaymentVerification } from './payment-verification-fixture';

it('commits installment receipts once, rolls back failed approvals, and reconciles the statement and ledgers', async () => {
  const persist = vi.spyOn(store, 'persist').mockImplementation(() => {});
  const persistSync = vi.spyOn(store, 'persistSync').mockReturnValue(true);
  try {
    store.studentFees = []; store.feeAccounts = []; store.studentPayments = []; store.payments = [];
    store.receipts = []; store.studentFinancialLedgers = []; store.installments = []; store.feeApprovalHistories = [];
    const student = store.students.find(s => s.id === 'stu-02')!;
    const accountant = store.users.find(u => u.id === 'usr-accounts')!;
    const fee = feeWorkflowService.createFeeProposal({ student_id: student.id, fee_category: 'Course Fee', reference_type: 'Course',
      standard_fee: 45000, proposed_fee: 45000, discount_amount: 0, payment_plan: 'Full Payment', auto_submit: true }, 'usr-counsellor', 'counsellor');
    feeWorkflowService.approveFee(fee.id, accountant.id);
    const invoice = { number: fee.invoice_number, amount: fee.invoice_approved_amount, date: fee.invoice_date };
    const statement = () => buildStudentFeeStatement({ student, fees: store.studentFees.filter(f => f.student_id === student.id),
      accounts: store.feeAccounts.filter(f => f.student_id === student.id), payments: store.payments.filter(p => p.student_id === student.id),
      studentPayments: store.studentPayments.filter(p => p.student_id === student.id), receipts: store.receipts.filter(r => r.student_id === student.id),
      ledger: store.studentFinancialLedgers.filter(e => e.student_id === student.id), installments: store.installments.filter(i => i.student_id === student.id) });
    for (const [index, amount] of [5000, 10000, 30000].entries()) {
      const payment = feeWorkflowService.recordPayment({ fee_id: fee.id, amount_paid: amount, payment_mode: 'Cash',
        payment_date: `2026-11-${['01', '10', '20'][index]}` }, 'usr-counsellor', 'counsellor');
      const before = statement().outstanding;
      expect(store.receipts.length).toBe(index);
      if (index === 0) {
        persistSync.mockReturnValueOnce(false);
        await expect(paymentTransaction(accountant, () => feeWorkflowService.verifyPayment(payment.id, accountant.id, 'Checked', enteredPaymentVerification(payment.id)))).rejects.toThrow('storage failed');
        expect(store.receipts).toHaveLength(0);
        expect(statement().outstanding).toBe(before);
      }
      await paymentTransaction(accountant, () => feeWorkflowService.verifyPayment(payment.id, accountant.id, 'Checked', enteredPaymentVerification(payment.id)));
      expect(statement().outstanding).toBe([40000, 30000, 0][index]);
      expect(store.receipts.at(-1)?.remaining_balance).toBe([40000, 30000, 0][index]);
      expect(() => feeWorkflowService.verifyPayment(payment.id, accountant.id, 'Retry', enteredPaymentVerification(payment.id))).toThrow();
      expect(store.receipts.length).toBe(index + 1);
    }
    expect(new Set(store.receipts.map(r => r.receipt_number)).size).toBe(3);
    expect(statement().cumulativePaid).toBe(store.feeAccounts[0].paid_amount);
    expect(statement().outstanding).toBe(store.feeAccounts[0].outstanding_amount);
    expect(statement().installments[0].status).toBe('Fully settled');
    const current = store.studentFees.find(f => f.id === fee.id)!;
    expect({ number: current.invoice_number, amount: current.invoice_approved_amount, date: current.invoice_date }).toEqual(invoice);
    await paymentTransaction(accountant, () => feeWorkflowService.voidReceipt(store.receipts[2].id, accountant.id, 'Test reversal', 30000));
    expect(statement().outstanding).toBe(30000);
    expect(store.feeAccounts[0].outstanding_amount).toBe(30000);
  } finally { persist.mockRestore(); persistSync.mockRestore(); }
});
