import { store } from '@/lib/services/data-store';
import { AuthorizedBankAccount } from '@/types';
import {
  PRIVILEGED_FINANCIAL_ROLES,
  REFERENCE_20_BANK_ACCOUNTS,
  isObsoleteBankPreset,
  formatBankAccountPresetLabel,
  maskSensitiveAccountNumber,
  buildDefaultReferenceBankAccounts,
  ReferenceBankAccountConfig,
} from '@/lib/constants/bank-accounts';

export {
  PRIVILEGED_FINANCIAL_ROLES,
  REFERENCE_20_BANK_ACCOUNTS,
  isObsoleteBankPreset,
  formatBankAccountPresetLabel,
  maskSensitiveAccountNumber,
  buildDefaultReferenceBankAccounts,
};
export type { ReferenceBankAccountConfig };

export interface BankAccountQueryOptions {
  includePending?: boolean;
  includeArchived?: boolean;
}

/**
 * Returns authorized bank accounts.
 *
 * For fee collection / payment dropdowns (default includePending=false):
 *   Only returns verified, active, non-archived accounts.
 *
 * For Super Admin management views (includePending=true):
 *   Returns all active/pending accounts.
 *
 * Account numbers are masked for non-finance roles to prevent exfiltration.
 */
export function getAuthorizedBankAccounts(
  role?: string,
  options?: BankAccountQueryOptions
): AuthorizedBankAccount[] {
  const source = store.settings?.authorized_bank_accounts;
  const accounts: AuthorizedBankAccount[] =
    source && source.length > 0 ? source : buildDefaultReferenceBankAccounts();

  const isPrivileged = role ? PRIVILEGED_FINANCIAL_ROLES.includes(role) : false;
  const isAdmin = role === 'super_admin' || role === 'admin';
  const includePending = options?.includePending ?? false;
  const includeArchived = options?.includeArchived ?? false;

  // Filter accounts
  const filtered = accounts.filter((acc) => {
    // 1. Exclude obsolete presets from active lists
    if (isObsoleteBankPreset(acc) && !includeArchived) {
      return false;
    }

    // 2. Archived accounts filter
    if (acc.is_archived && !includeArchived) {
      return false;
    }

    // 3. For Super Admin / Admin with includePending=true, return all non-archived accounts
    if (isAdmin && includePending) {
      return true;
    }

    // 4. For regular fee collection dropdown: only verified and active accounts (exclude pending/rejected)
    const isPending = acc.is_verified === false || acc.verification_status === 'pending' || acc.verification_status === 'rejected';
    const isActive = acc.is_active ?? true;
    return !isPending && isActive;
  });

  return filtered.map((acc) => {
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
  role?: string,
  options?: BankAccountQueryOptions
): AuthorizedBankAccount | undefined {
  if (!query || !query.trim()) return undefined;
  const q = query.trim().toLowerCase();
  const accounts = getAuthorizedBankAccounts(role, options);

  return accounts.find(
    (acc) =>
      acc.id.toLowerCase() === q ||
      acc.account_holder_name.toLowerCase() === q ||
      acc.account_holder_name.toLowerCase().includes(q) ||
      acc.bank_name.toLowerCase().includes(q) ||
      (acc.authorized_signatory && acc.authorized_signatory.toLowerCase().includes(q))
  );
}

/**
 * Resolves the authoritative institutional receiving bank account for a payment record.
 * Checks our_bank_profile_id first, then falls back to account number or holder & bank name match.
 */
export function findOriginalReceivingAccount(
  payment?: {
    our_bank_profile_id?: string;
    our_bank_account_id?: string;
    our_bank_name?: string;
    our_bank_account_name?: string;
  } | null,
  accountsList?: AuthorizedBankAccount[]
): AuthorizedBankAccount | undefined {
  if (!payment) return undefined;
  const accounts = accountsList || getAuthorizedBankAccounts(undefined, { includePending: true, includeArchived: true });

  if (payment.our_bank_profile_id) {
    const found = accounts.find((a) => a.id === payment.our_bank_profile_id);
    if (found) return found;
  }

  if (payment.our_bank_account_id) {
    const cleanNum = payment.our_bank_account_id.replace(/\s+/g, '');
    const found = accounts.find((a) => a.account_number.replace(/\s+/g, '') === cleanNum);
    if (found) return found;
  }

  if (payment.our_bank_name && payment.our_bank_account_name) {
    const bName = payment.our_bank_name.trim().toLowerCase();
    const hName = payment.our_bank_account_name.trim().toLowerCase();
    const found = accounts.find(
      (a) => a.bank_name.trim().toLowerCase() === bName && a.account_holder_name.trim().toLowerCase() === hName
    );
    if (found) return found;
  }

  return undefined;
}
