import { store } from '@/lib/services/data-store';
export function enteredPaymentVerification(id: string) {
  const p = store.studentPayments.find((row) => row.id === id)!;
  return { reference: p?.transaction_reference || p?.bank_upi_reference || undefined, amount: String(p?.amount_paid), payment_date: p?.payment_date?.slice(0,10) || '' };
}
