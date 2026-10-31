import { store } from '@/lib/services/data-store';
// Test-only simulation of an accountant typing values. Never used by application code.
export function enteredPaymentVerification(paymentId: string) {
  const payment = store.studentPayments.find((p) => p.id === paymentId)!;
  return {
    reference: payment?.transaction_reference?.trim() || payment?.bank_upi_reference?.trim() || (payment?.payment_mode === 'Cash' ? 'CASH:' + paymentId : ''),
    amount: String(payment?.amount_paid),
    payment_date: payment?.payment_date?.slice(0, 10) || '',
  };
}
