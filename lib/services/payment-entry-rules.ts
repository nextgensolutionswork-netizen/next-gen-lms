export function actualPaymentDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}

export function validPaymentDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

type PaymentFields = { payment_mode?: string; transaction_reference?: string | null; bank_upi_reference?: string; payment_proof_url?: string };
export function normalizePaymentFields<T extends PaymentFields>(input: T): T {
  return input.payment_mode === 'Cash'
    ? { ...input, transaction_reference: null, bank_upi_reference: undefined, payment_proof_url: undefined }
    : { ...input };
}

export function validatePaymentEntry(input: PaymentFields & { payment_date?: string }): void {
  if (input.payment_mode !== 'Cash' && !input.transaction_reference?.trim() && !input.bank_upi_reference?.trim()) {
    throw new Error('Transaction reference is required for non-cash payments.');
  }
  if (input.payment_date !== undefined && !validPaymentDate(input.payment_date)) throw new Error('Actual payment date must be a valid calendar date.');
}
