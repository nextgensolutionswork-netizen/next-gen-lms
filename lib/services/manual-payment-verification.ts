import type { StudentPaymentRecord } from '@/types';
import { validPaymentDate } from './payment-entry-rules';
import { getAuthorizedBankAccounts, findOriginalReceivingAccount } from '@/lib/utils/bank-autofill';

export interface ManualPaymentVerification {
  reference?: string;
  amount: string;
  payment_date: string;
  receiving_bank_profile_id?: string;
  bank_account_discrepancy_reason?: string;
}

export class PaymentVerificationError extends Error {
  constructor(public fieldErrors: Partial<Record<keyof ManualPaymentVerification | 'general', string>>) {
    super(Object.values(fieldErrors).join(' '));
  }
}

const reference = (value: string) => value.replace(/\s+/g, '').toUpperCase();

function cents(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}

export function validateManualPaymentVerification(
  payment: StudentPaymentRecord,
  input?: ManualPaymentVerification
): ManualPaymentVerification {
  const errors: PaymentVerificationError['fieldErrors'] = {};

  // 1. Reference / UTR validation
  if (payment.payment_mode !== 'Cash') {
    const stored = payment.transaction_reference?.trim() || payment.bank_upi_reference?.trim();
    if (!input?.reference?.trim()) {
      errors.reference = 'UTR / Transaction Reference is required.';
    } else if (!stored) {
      errors.reference = 'Stored payment reference is missing. Return this payment for correction.';
    } else if (reference(input.reference) !== reference(stored)) {
      errors.reference = 'UTR / Transaction Reference does not match this payment.';
    }
  }

  // 2. Amount Received validation
  const amount = typeof input?.amount === 'string' ? cents(input.amount) : null;
  if (amount === null || amount <= BigInt(0)) {
    errors.amount = 'Amount Received is required with at most two decimal places.';
  } else if (amount !== cents(String(payment.amount_paid))) {
    errors.amount = 'Amount Received does not match this payment.';
  }

  // 3. Actual Payment Date validation
  const storedDate = payment.payment_date?.split('T')[0];
  if (!input?.payment_date || !validPaymentDate(input.payment_date)) {
    errors.payment_date = 'Actual Payment Date is required and must be valid.';
  } else if (!storedDate || !validPaymentDate(storedDate)) {
    errors.payment_date = 'Stored actual payment date is missing or invalid.';
  } else if (input.payment_date !== storedDate) {
    errors.payment_date = 'Actual Payment Date does not match this payment.';
  }

  // 4. Receiving Bank Account Validation
  const authorizedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
  const originalAccount = findOriginalReceivingAccount(payment, authorizedAccounts);

  if (payment.payment_mode !== 'Cash') {
    // For non-cash payments, if receiving_bank_profile_id is provided, validate strictly
    if (input && 'receiving_bank_profile_id' in input) {
      if (!input.receiving_bank_profile_id || !input.receiving_bank_profile_id.trim()) {
        errors.receiving_bank_profile_id = 'Receiving bank account is required for non-cash payment verification.';
      } else {
        const selectedAccount = authorizedAccounts.find((a) => a.id === input.receiving_bank_profile_id);
        if (!selectedAccount || selectedAccount.is_active === false || selectedAccount.is_archived) {
          errors.receiving_bank_profile_id = 'Selected receiving bank account is invalid, inactive, or archived.';
        } else if (originalAccount && originalAccount.id !== input.receiving_bank_profile_id) {
          // Discrepancy between original and verified receiving bank account
          if (!input.bank_account_discrepancy_reason?.trim()) {
            errors.bank_account_discrepancy_reason =
              'Discrepancy explanation is required when the verified receiving bank account differs from the original payment record.';
          }
        }
      }
    }
  } else {
    // For Cash payments: bank-account selection is optional. If provided, validate profile.
    if (input?.receiving_bank_profile_id?.trim()) {
      const selectedAccount = authorizedAccounts.find((a) => a.id === input.receiving_bank_profile_id);
      if (!selectedAccount || selectedAccount.is_active === false || selectedAccount.is_archived) {
        errors.receiving_bank_profile_id = 'Selected receiving bank account is invalid, inactive, or archived.';
      }
    }
  }

  if (Object.keys(errors).length) {
    throw new PaymentVerificationError(errors);
  }

  return {
    ...(payment.payment_mode !== 'Cash' || input?.reference ? { reference: input?.reference } : {}),
    amount: input!.amount,
    payment_date: input!.payment_date,
    ...(input?.receiving_bank_profile_id ? { receiving_bank_profile_id: input.receiving_bank_profile_id } : {}),
    ...(input?.bank_account_discrepancy_reason ? { bank_account_discrepancy_reason: input.bank_account_discrepancy_reason.trim() } : {}),
  };
}
