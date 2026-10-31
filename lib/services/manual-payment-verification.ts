import type { StudentPaymentRecord } from '@/types';
import { validPaymentDate } from './payment-entry-rules';

export interface ManualPaymentVerification { reference?: string; amount: string; payment_date: string }
export class PaymentVerificationError extends Error {
  constructor(public fieldErrors: Partial<Record<keyof ManualPaymentVerification, string>>) { super(Object.values(fieldErrors).join(' ')); }
}
const reference = (value: string) => value.replace(/\s+/g, '').toUpperCase();
function cents(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}
export function validateManualPaymentVerification(payment: StudentPaymentRecord, input?: ManualPaymentVerification): ManualPaymentVerification {
  const errors: PaymentVerificationError['fieldErrors'] = {};
  if (payment.payment_mode !== 'Cash') {
    const stored = payment.transaction_reference?.trim() || payment.bank_upi_reference?.trim();
    if (!input?.reference?.trim()) errors.reference = 'UTR / Transaction Reference is required.';
    else if (!stored) errors.reference = 'Stored payment reference is missing. Return this payment for correction.';
    else if (reference(input.reference) !== reference(stored)) errors.reference = 'UTR / Transaction Reference does not match this payment.';
  }
  const amount = typeof input?.amount === 'string' ? cents(input.amount) : null;
  if (amount === null || amount <= BigInt(0)) errors.amount = 'Amount Received is required with at most two decimal places.';
  else if (amount !== cents(String(payment.amount_paid))) errors.amount = 'Amount Received does not match this payment.';
  const storedDate = payment.payment_date?.split('T')[0];
  if (!input?.payment_date || !validPaymentDate(input.payment_date)) errors.payment_date = 'Actual Payment Date is required and must be valid.';
  else if (!storedDate || !validPaymentDate(storedDate)) errors.payment_date = 'Stored actual payment date is missing or invalid.';
  else if (input.payment_date !== storedDate) errors.payment_date = 'Actual Payment Date does not match this payment.';
  if (Object.keys(errors).length) throw new PaymentVerificationError(errors);
  return { ...(payment.payment_mode !== 'Cash' ? { reference: input!.reference } : {}), amount: input!.amount, payment_date: input!.payment_date };
}
