export const PAYMENT_REFERENCE_REGEX = /^[0-9]{5}$/;
export const PAYMENT_REFERENCE_LABEL = 'Transaction / Cheque / UTR Ref – Last 5 Digits';
export const PAYMENT_REFERENCE_PLACEHOLDER = 'Enter last 5 digits';
export const PAYMENT_REFERENCE_ERROR = 'Please enter exactly 5 digits.';

export function isValidPaymentReference(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  return PAYMENT_REFERENCE_REGEX.test(value.trim());
}

export function doesVerificationReferenceMatch(
  entered: string | null | undefined,
  stored: string | null | undefined
): boolean {
  const cleanEntered = (entered ?? '').trim();
  const cleanStored = (stored ?? '').trim();
  if (!cleanEntered || !cleanStored) return false;

  if (isValidPaymentReference(cleanStored)) {
    return isValidPaymentReference(cleanEntered) && cleanEntered === cleanStored;
  }

  // Historical full reference: compare last 5 digits (or trailing 5 numeric digits) without modifying original record
  if (isValidPaymentReference(cleanEntered)) {
    const trailingDigits = cleanStored.replace(/\D/g, '').slice(-5);
    if (cleanStored.slice(-5) === cleanEntered || trailingDigits === cleanEntered) {
      return true;
    }
  }

  // Legacy alphanumeric fallback (e.g. existing test fixtures)
  return cleanEntered.replace(/\s+/g, '').toUpperCase() === cleanStored.replace(/\s+/g, '').toUpperCase();
}

export function requiresTransactionReference(paymentMode?: string | null): boolean {
  return Boolean(paymentMode && paymentMode !== 'Cash');
}

export function actualPaymentDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}

export function validPaymentDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/**
 * Normalizes a date string from either DD-MM-YYYY or YYYY-MM-DD into YYYY-MM-DD.
 * Returns null if the input is not a valid calendar date.
 */
export function normalizeCalendarDate(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [dd, mm, yyyy] = trimmed.split('-');
    const iso = `${yyyy}-${mm}-${dd}`;
    return validPaymentDate(iso) ? iso : null;
  }
  return validPaymentDate(trimmed) ? trimmed : null;
}

export function formatDateDDMMYYYY(value?: string | null): string {
  const iso = normalizeCalendarDate(value?.split('T')[0]);
  if (!iso) return value || '—';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

export const NEXT_DUE_DATE_REQUIRED_ERROR = 'Next Payment Due Date is required for partial payments.';
export const NEXT_DUE_DATE_ORDER_ERROR = 'Next Payment Due Date must be strictly after the Payment Date.';
export const NEXT_DUE_DATE_INVALID_ERROR = 'Please enter a valid Next Payment Due Date.';

export function validateNextDueDate(options: {
  nextDueDate?: string | null;
  paymentDate?: string | null;
  remainingOutstanding: number;
}): string | null {
  const { nextDueDate, paymentDate, remainingOutstanding } = options;
  const isPartial = Number(remainingOutstanding) > 0;

  if (!isPartial) {
    return null;
  }

  if (!nextDueDate || !nextDueDate.trim()) {
    throw new Error(NEXT_DUE_DATE_REQUIRED_ERROR);
  }

  const normalizedDue = normalizeCalendarDate(nextDueDate);
  if (!normalizedDue) {
    throw new Error(NEXT_DUE_DATE_INVALID_ERROR);
  }

  const normalizedPayDate = normalizeCalendarDate(paymentDate) || actualPaymentDate();
  if (normalizedDue <= normalizedPayDate) {
    throw new Error(NEXT_DUE_DATE_ORDER_ERROR);
  }

  return normalizedDue;
}

export type ComputedFeePaymentStatus = 'Paid' | 'Partially Paid' | 'Due Today' | 'Upcoming' | 'Overdue' | 'Unpaid';

export function computePaymentDueStatus(options: {
  outstandingAmount: number;
  paidAmount: number;
  nextDueDate?: string | null;
  now?: Date;
}): ComputedFeePaymentStatus {
  const outstanding = Number(options.outstandingAmount) || 0;
  const paid = Number(options.paidAmount) || 0;
  if (outstanding <= 0) return 'Paid';

  const normalizedDue = normalizeCalendarDate(options.nextDueDate?.split('T')[0]);
  if (normalizedDue) {
    const todayIST = actualPaymentDate(options.now);
    if (normalizedDue < todayIST) return 'Overdue';
    if (normalizedDue === todayIST) return 'Due Today';
    return 'Upcoming';
  }

  return paid > 0 ? 'Partially Paid' : 'Unpaid';
}

type PaymentFields = { payment_mode?: string; transaction_reference?: string | null; bank_upi_reference?: string; payment_proof_url?: string };
export function normalizePaymentFields<T extends PaymentFields>(input: T): T {
  if (input.payment_mode === 'Cash') {
    return { ...input, transaction_reference: null, bank_upi_reference: undefined, payment_proof_url: undefined };
  }
  return {
    ...input,
    ...(typeof input.transaction_reference === 'string'
      ? { transaction_reference: input.transaction_reference.trim() }
      : {}),
  };
}

export function validatePaymentEntry(input: PaymentFields & { payment_date?: string }): void {
  if (requiresTransactionReference(input.payment_mode ?? 'UPI')) {
    const ref = (input.transaction_reference ?? '').trim();
    if (!isValidPaymentReference(ref)) {
      throw new Error(PAYMENT_REFERENCE_ERROR);
    }
  }
  if (input.payment_date !== undefined && !validPaymentDate(input.payment_date)) throw new Error('Actual payment date must be a valid calendar date.');
}

export interface DuplicatePaymentCandidate {
  reference?: string | null;
  amount?: number | string | null;
  paymentDate?: string | null;
  receivingBankAccount?: string | null;
  excludePaymentId?: string | null;
}

export interface DuplicatePaymentRecordLike {
  id: string;
  student_name?: string;
  receipt_number?: string;
  payment_mode?: string;
  transaction_reference?: string | null;
  bank_upi_reference?: string | null;
  amount_paid?: number;
  amount?: number;
  payment_date?: string;
  our_bank_profile_id?: string;
  verified_bank_profile_id?: string;
  our_bank_account_id?: string;
  our_bank_name?: string;
  verification_status?: string;
  status?: string;
}

export function findPotentialDuplicatePayments<T extends DuplicatePaymentRecordLike>(
  payments: readonly T[],
  candidate: DuplicatePaymentCandidate
): T[] {
  const ref = (candidate.reference ?? '').trim();
  const amount = Number(candidate.amount);
  const date = (candidate.paymentDate ?? '').split('T')[0].trim();
  const candidateBank = (candidate.receivingBankAccount ?? '').trim().toLowerCase();

  if (!isValidPaymentReference(ref) || !Number.isFinite(amount) || amount <= 0 || !date) {
    return [];
  }

  return payments.filter((p) => {
    if (candidate.excludePaymentId && (p.id === candidate.excludePaymentId || `pay-${p.id}` === candidate.excludePaymentId)) {
      return false;
    }
    if (p.verification_status === 'Rejected' || p.status === 'Rejected' || p.status === 'Void' || p.status === 'Voided') {
      return false;
    }
    if (p.payment_mode === 'Cash') {
      return false;
    }
    const existingRef = (p.transaction_reference || p.bank_upi_reference || '').trim();
    if (!existingRef) return false;
    const refMatches = existingRef === ref || (existingRef.length > 5 && existingRef.slice(-5) === ref);
    if (!refMatches) return false;

    const existingAmount = Number(p.amount_paid ?? p.amount ?? 0);
    if (!Number.isFinite(existingAmount) || Math.abs(existingAmount - amount) >= 0.01) {
      return false;
    }

    const existingDate = (p.payment_date ?? '').split('T')[0].trim();
    if (existingDate !== date) {
      return false;
    }

    if (candidateBank && candidateBank !== 'custom') {
      const existingBanks = [
        p.verified_bank_profile_id,
        p.our_bank_profile_id,
        p.our_bank_account_id,
        p.our_bank_name,
      ]
        .filter(Boolean)
        .map((b) => String(b).trim().toLowerCase());
      if (existingBanks.length > 0 && !existingBanks.includes(candidateBank)) {
        return false;
      }
    }

    return true;
  });
}
