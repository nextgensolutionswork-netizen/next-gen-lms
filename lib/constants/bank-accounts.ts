import { AuthorizedBankAccount } from '@/types';

/**
 * Roles permitted to view unmasked banking details (account numbers).
 */
export const PRIVILEGED_FINANCIAL_ROLES = ['super_admin', 'admin', 'accountant'];

/**
 * Configuration for the 20 replacement reference bank accounts.
 */
export interface ReferenceBankAccountConfig {
  index: number;
  id: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  upi_id?: string;
  is_primary?: boolean;
}

/**
 * Exactly 20 replacement reference bank accounts.
 * Exact account holder names, banks, account numbers (strings), and UPI details.
 */
export const REFERENCE_20_BANK_ACCOUNTS: ReferenceBankAccountConfig[] = [
  { index: 1, id: 'bank-acc-01', account_holder_name: 'Katari Charitha', bank_name: 'HDFC Bank', account_number: '50100 76776 1140', is_primary: true },
  { index: 2, id: 'bank-acc-02', account_holder_name: 'Palukuri Bindu', bank_name: 'HDFC Bank', account_number: '50100 76776 1200' },
  { index: 3, id: 'bank-acc-03', account_holder_name: 'Katari Padmaja', bank_name: 'HDFC Bank', account_number: '50100 76776 1090' },
  { index: 4, id: 'bank-acc-04', account_holder_name: 'Juhitech Solutions', bank_name: 'HDFC Bank', account_number: '50200 09524 9939' },
  { index: 5, id: 'bank-acc-05', account_holder_name: 'My Erp Hub', bank_name: 'HDFC Bank', account_number: '50200 11060 5431', upi_id: '9550499661-2@ybl' },
  { index: 6, id: 'bank-acc-06', account_holder_name: 'Nextgen Erp Solutions', bank_name: 'HDFC Bank', account_number: '50200 11981 7562' },
  { index: 7, id: 'bank-acc-07', account_holder_name: 'Shobharani Venu Naidu', bank_name: 'HDFC Bank', account_number: '50100 8004 02039' },
  { index: 8, id: 'bank-acc-08', account_holder_name: 'C Ekambara Naidu', bank_name: 'HDFC Bank', account_number: '50100 8004 02078' },
  { index: 9, id: 'bank-acc-09', account_holder_name: 'Hemadri Venu Naidu', bank_name: 'HDFC Bank', account_number: '50100 7677 59834' },
  { index: 10, id: 'bank-acc-10', account_holder_name: 'C Kiran Kumari', bank_name: 'HDFC Bank', account_number: '50100 8004 02052' },
  { index: 11, id: 'bank-acc-11', account_holder_name: 'Lalita Venu Naidu', bank_name: 'HDFC Bank', account_number: '50100 8004 01891' },
  { index: 12, id: 'bank-acc-12', account_holder_name: 'E Anasuya', bank_name: 'HDFC Bank', account_number: '50100 8984 89271' },
  { index: 13, id: 'bank-acc-13', account_holder_name: 'T Kusuma', bank_name: 'Canara - Thenebanda', account_number: '110270 213 528' },
  { index: 14, id: 'bank-acc-14', account_holder_name: 'T Usha', bank_name: 'Canara - Thenebanda', account_number: '110270 189 756' },
  { index: 15, id: 'bank-acc-15', account_holder_name: 'K Swathi', bank_name: 'Canara - Thenebanda', account_number: '110270 195 820' },
  { index: 16, id: 'bank-acc-16', account_holder_name: 'B Jyothi', bank_name: 'Canara - Thenebanda', account_number: '110270 183 210' },
  { index: 17, id: 'bank-acc-17', account_holder_name: 'K Munemma', bank_name: 'Canara - Thenebanda', account_number: '110270 203 847' },
  { index: 18, id: 'bank-acc-18', account_holder_name: 'G Komalika', bank_name: 'Kotak Mahindra', account_number: '80530 28484' },
  { index: 19, id: 'bank-acc-19', account_holder_name: 'Anthagiri Sowmya', bank_name: 'Kotak Mahindra', account_number: '80515 02269' },
  { index: 20, id: 'bank-acc-20', account_holder_name: 'Niranjan Axis Bank', bank_name: 'Axis Bank', account_number: '916010064080256', upi_id: 'niranjanemparala@ybl' },
];

/**
 * Checks if a bank account preset matches obsolete/archived presets
 * (e.g. previous HDFC Bank Ltd primary account 50200088991122).
 */
export function isObsoleteBankPreset(account: Partial<AuthorizedBankAccount>): boolean {
  if (!account) return false;
  const num = (account.account_number || '').replace(/\s+/g, '');
  const holder = (account.account_holder_name || '').toUpperCase();
  const upi = (account.upi_id || '').toLowerCase();
  const id = (account.id || '').toLowerCase();

  return (
    num === '50200088991122' ||
    holder.includes('NEXT GEN ERP SOLUTIONS PRIVATE LIMITED') ||
    upi === 'nextgenerp@hdfcbank' ||
    id === 'default-primary'
  );
}

/**
 * Formats bank account preset dropdown label:
 * Format: Account Holder — Bank Name — XXXX1234
 */
export function formatBankAccountPresetLabel(account: {
  account_holder_name: string;
  bank_name: string;
  account_number: string;
}): string {
  const digits = String(account.account_number || '').replace(/\D/g, '');
  const last4 = digits.length >= 4 ? digits.slice(-4) : digits;
  return `${account.account_holder_name} — ${account.bank_name} — XXXX${last4}`;
}

/**
 * Masks sensitive account numbers for non-finance roles to defend against data exfiltration.
 * Example: '50100 76776 1140' -> '•••• •••• 1140'
 */
export function maskSensitiveAccountNumber(accountNumber?: string | null): string {
  if (!accountNumber) return '—';
  const clean = String(accountNumber).replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  return `•••• •••• ${last4}`;
}

/**
 * Builds the canonical initial list of 20 reference accounts.
 */
export function buildDefaultReferenceBankAccounts(options?: { forcePending?: boolean }): AuthorizedBankAccount[] {
  const isVerified = options?.forcePending ? false : true;
  const status = options?.forcePending ? 'pending' : 'verified';

  return REFERENCE_20_BANK_ACCOUNTS.map((ref) => ({
    id: ref.id,
    account_holder_name: ref.account_holder_name,
    bank_name: ref.bank_name,
    account_number: ref.account_number,
    branch: 'Main Branch',
    account_type: 'Current',
    upi_id: ref.upi_id || '',
    is_primary: ref.is_primary ?? false,
    is_active: isVerified,
    is_verified: isVerified,
    verification_status: status,
    is_archived: false,
    authorized_roles: ['super_admin', 'admin', 'accountant', 'counsellor'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}
