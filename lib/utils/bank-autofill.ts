import { store } from '@/lib/services/data-store';
import { AuthorizedBankAccount } from '@/types';

/**
 * Roles permitted to view unmasked banking details (account numbers, IFSC).
 */
const PRIVILEGED_FINANCIAL_ROLES = ['super_admin', 'admin', 'accountant'];

/**
 * Masks sensitive account numbers for non-finance roles to defend against data exfiltration.
 * Example: '50200088991122' -> '•••• •••• 1122'
 */
export function maskSensitiveAccountNumber(accountNumber?: string | null): string {
  if (!accountNumber) return '—';
  const clean = accountNumber.replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  return `•••• •••• ${last4}`;
}

/**
 * Returns the list of authorized bank accounts configured in the institute settings.
 * If the requesting user does not hold a financial role, the account number is safely masked.
 */
export function getAuthorizedBankAccounts(role?: string): AuthorizedBankAccount[] {
  const accounts: AuthorizedBankAccount[] = store.settings?.authorized_bank_accounts || [
    {
      id: 'default-primary',
      account_holder_name: store.settings?.bank_account_name || 'NEXT GEN ERP SOLUTIONS PRIVATE LIMITED',
      bank_name: store.settings?.bank_name || 'HDFC Bank Ltd',
      account_number: store.settings?.bank_account_number || store.settings?.bank_account_no || '50200088991122',
      ifsc_code: store.settings?.bank_ifsc || 'HDFC0000123',
      branch: store.settings?.bank_branch || 'Hitec City, Hyderabad',
      account_type: 'Current',
      upi_id: store.settings?.upi_id || 'nextgenerp@hdfcbank',
      is_primary: true,
      authorized_signatory: store.settings?.authorized_signatory_name || 'Dr. Rajesh Kumar',
      authorized_roles: ['super_admin', 'admin', 'accountant'],
    },
  ];

  const isPrivileged = role ? PRIVILEGED_FINANCIAL_ROLES.includes(role) : false;

  return accounts.map((acc) => {
    if (isPrivileged) {
      return { ...acc };
    }
    return {
      ...acc,
      account_number: maskSensitiveAccountNumber(acc.account_number),
    };
  });
}

/**
 * Finds an authorized bank account matching a holder name, ID, or search query.
 */
export function findBankAccountByHolder(
  query: string,
  role?: string
): AuthorizedBankAccount | undefined {
  if (!query || !query.trim()) return undefined;
  const q = query.trim().toLowerCase();
  const accounts = getAuthorizedBankAccounts(role);

  return accounts.find(
    (acc) =>
      acc.id.toLowerCase() === q ||
      acc.account_holder_name.toLowerCase() === q ||
      acc.account_holder_name.toLowerCase().includes(q) ||
      acc.bank_name.toLowerCase().includes(q) ||
      (acc.authorized_signatory && acc.authorized_signatory.toLowerCase().includes(q))
  );
}
