import type { StudentPaymentRecord } from '@/types';

export interface ManualPaymentVerification {
  reference: string;
  amount: string;
  payment_date: string;
}

export class PaymentVerificationError extends Error {
  constructor(public fieldErrors: Partial<Record<keyof ManualPaymentVerification, string>>) {
    super(Object.values(fieldErrors).join(' '));
  }
}

export const normalizePaymentReference = (value: string) => value.replace(/\s+/g, '').toUpperCase();

// Existing cash records need no migration: the immutable payment ID is their
// explicit cash acknowledgement reference, never an official receipt number.
export function paymentVerificationReference(payment: StudentPaymentRecord): string {
  return payment.transaction_reference?.trim() || payment.bank_upi_reference?.trim()
    || (payment.payment_mode === 'Cash' ? `CASH:${payment.id}` : '');
}

function minorUnits(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}

function calendarDate(value: string): string | null {
  const date = value.match(/^\d{4}-\d{2}-\d{2}(?=$|T)/)?.[0];
  return date && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : null;
}

export function validateManualPaymentVerification(payment: StudentPaymentRecord, entered?: ManualPaymentVerification): ManualPaymentVerification {
  const errors: PaymentVerificationError['fieldErrors'] = {};
  const reference = paymentVerificationReference(payment);
  if (typeof entered?.reference !== 'string' || !entered.reference.trim()) errors.reference = 'UTR / Transaction Reference is required.';
  else if (!reference) errors.reference = 'Stored payment reference is missing. Return this payment for correction.';
  else if (normalizePaymentReference(entered.reference) !== normalizePaymentReference(reference)) errors.reference = 'UTR / Transaction Reference does not match this payment record.';
  const amount = typeof entered?.amount === 'string' ? minorUnits(entered.amount) : null;
  if (amount === null || amount <= BigInt(0)) errors.amount = 'Amount Received must be a positive amount with at most two decimal places.';
  else if (amount !== minorUnits(String(payment.amount_paid))) errors.amount = 'Amount Received does not match this payment record.';
  const date = typeof entered?.payment_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entered.payment_date) ? calendarDate(entered.payment_date) : null;
  if (!date) errors.payment_date = 'Actual Payment Date is required and must be a valid calendar date.';
  else if (!calendarDate(payment.payment_date || '')) errors.payment_date = 'Stored actual payment date is missing or invalid. Return this payment for correction.';
  else if (date !== calendarDate(payment.payment_date)) errors.payment_date = 'Actual Payment Date does not match this payment record.';
  if (Object.keys(errors).length) throw new PaymentVerificationError(errors);
  return { reference: entered!.reference, amount: entered!.amount, payment_date: entered!.payment_date };
}
