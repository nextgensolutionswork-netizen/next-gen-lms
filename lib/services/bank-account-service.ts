import { store } from '@/lib/services/data-store';
import { AuthorizedBankAccount, AuditLog } from '@/types';
import {
  REFERENCE_20_BANK_ACCOUNTS,
  isObsoleteBankPreset,
  formatBankAccountPresetLabel,
  maskSensitiveAccountNumber,
} from '@/lib/constants/bank-accounts';

export class BankAccountService {
  /**
   * Archives obsolete presets (e.g. old HDFC Primary Account, 50200088991122)
   * while preserving historical financial records.
   */
  public archiveObsoletePresets(actorUserId = 'system', actorUserName = 'System Migration'): number {
    if (!store.settings) return 0;
    const existing = store.settings.authorized_bank_accounts || [];
    let archivedCount = 0;

    const updated = existing.map((acc) => {
      if (isObsoleteBankPreset(acc) && !acc.is_archived) {
        archivedCount++;
        return {
          ...acc,
          is_primary: false,
          is_active: false,
          is_verified: false,
          verification_status: 'archived' as const,
          is_archived: true,
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      return acc;
    });

    if (archivedCount > 0) {
      store.settings.authorized_bank_accounts = updated;

      // Clean institute primary defaults if they match the obsolete presets
      if (
        store.settings.bank_account_name === 'NEXT GEN ERP SOLUTIONS PRIVATE LIMITED' ||
        store.settings.bank_account_no === '50200088991122' ||
        store.settings.bank_account_number === '50200088991122' ||
        store.settings.bank_account_no === '998877665544'
      ) {
        store.settings.bank_account_no = '50100 76776 1140';
        store.settings.bank_account_number = '50100 76776 1140';
        store.settings.bank_name = 'HDFC Bank';
        store.settings.bank_account_name = 'Katari Charitha';
      }
      if (store.settings.upi_id === 'nextgenerp@hdfcbank') {
        store.settings.upi_id = '';
      }
      if (store.settings.bank_ifsc === 'HDFC0000123') {
        store.settings.bank_ifsc = '';
      }

      this.logAudit(
        actorUserId,
        actorUserName,
        'super_admin',
        'BANK_PRESETS_ARCHIVED',
        'SETTINGS',
        store.settings.id || 'sys-01',
        { archivedCount },
        { message: `Archived ${archivedCount} obsolete bank account presets.` }
      );

      store.persistSync();
    }

    return archivedCount;
  }

  /**
   * Idempotently imports the exact 20 reference replacement bank accounts.
   * Ensures no duplicates, archives obsolete presets, and defaults new accounts
   * to either 'verified' or 'pending' as requested.
   */
  public importReferenceBankAccounts(options?: {
    defaultStatus?: 'pending' | 'verified';
    actorUserId?: string;
    actorUserName?: string;
    actorRole?: string;
  }): {
    imported: number;
    updated: number;
    archived: number;
    accounts: AuthorizedBankAccount[];
  } {
    const actorId = options?.actorUserId || 'usr-superadmin';
    const actorName = options?.actorUserName || 'Super Administrator';
    const actorRole = options?.actorRole || 'super_admin';
    const defaultStatus = options?.defaultStatus || 'verified';
    const isVerifiedDefault = defaultStatus === 'verified';

    // 1. First archive obsolete presets
    const archivedCount = this.archiveObsoletePresets(actorId, actorName);

    if (!store.settings) {
      store.settings = {
        id: 'sys-01',
        institute_name: 'Next-Gen ERP Solutions',
        address: 'Hitec City, Hyderabad',
        phone: '+91 98765 43210',
        email: 'info@next-generpsolutions.com',
        gst_number: '36AAACN1234F1Z8',
        default_currency: 'INR',
        academic_year: '2026-2027',
        receipt_prefix: 'REC',
        timezone: 'Asia/Kolkata',
        enable_email_notifications: true,
        enable_sms_notifications: false,
        enable_whatsapp_notifications: true,
      };
    }

    const currentList = [...(store.settings.authorized_bank_accounts || [])];
    let importedCount = 0;
    let updatedCount = 0;

    const referenceAccountsList: AuthorizedBankAccount[] = REFERENCE_20_BANK_ACCOUNTS.map((ref) => {
      // Find if this account is already present by normalized account number or id
      const cleanRefNumber = ref.account_number.replace(/\s+/g, '');
      const existing = currentList.find(
        (acc) =>
          acc.id === ref.id ||
          acc.account_number.replace(/\s+/g, '') === cleanRefNumber
      );

      if (existing) {
        updatedCount++;
        return {
          ...existing,
          id: ref.id,
          account_holder_name: ref.account_holder_name,
          bank_name: ref.bank_name,
          account_number: ref.account_number, // preserve exact string formatting
          upi_id: ref.upi_id || '',
          is_primary: ref.is_primary ?? false,
          is_archived: false,
          is_active: existing.is_active ?? true,
          is_verified: existing.is_verified ?? isVerifiedDefault,
          verification_status: existing.verification_status || defaultStatus,
          updated_at: new Date().toISOString(),
        };
      }

      importedCount++;
      return {
        id: ref.id,
        account_holder_name: ref.account_holder_name,
        bank_name: ref.bank_name,
        account_number: ref.account_number,
        branch: 'Main Branch',
        account_type: 'Current',
        upi_id: ref.upi_id || '',
        is_primary: ref.is_primary ?? false,
        is_active: isVerifiedDefault,
        is_verified: isVerifiedDefault,
        verification_status: defaultStatus,
        is_archived: false,
        verified_at: isVerifiedDefault ? new Date().toISOString() : undefined,
        verified_by: isVerifiedDefault ? actorId : undefined,
        authorized_roles: ['super_admin', 'admin', 'accountant', 'counsellor'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    // Retain non-obsolete archived accounts for historical record integrity
    const archivedPreserved = currentList.filter(
      (acc) =>
        acc.is_archived &&
        !referenceAccountsList.some((r) => r.id === acc.id)
    );

    store.settings.authorized_bank_accounts = [...referenceAccountsList, ...archivedPreserved];

    // Ensure institute settings active fields point to the first replacement account
    store.settings.bank_name = referenceAccountsList[0].bank_name;
    store.settings.bank_account_name = referenceAccountsList[0].account_holder_name;
    store.settings.bank_account_no = referenceAccountsList[0].account_number;
    store.settings.bank_account_number = referenceAccountsList[0].account_number;
    store.settings.upi_id = referenceAccountsList[0].upi_id || '';
    store.settings.bank_ifsc = '';

    this.logAudit(
      actorId,
      actorName,
      actorRole,
      'BANK_PRESETS_IMPORTED',
      'SETTINGS',
      store.settings.id || 'sys-01',
      { previousCount: currentList.length },
      {
        imported: importedCount,
        updated: updatedCount,
        archived: archivedCount,
        totalActive: referenceAccountsList.length,
      }
    );

    store.persistSync();

    return {
      imported: importedCount,
      updated: updatedCount,
      archived: archivedCount,
      accounts: referenceAccountsList,
    };
  }

  /**
   * Verifies and activates a single bank account preset (Super Admin or Admin only).
   */
  public verifyBankAccount(
    accountId: string,
    actorUserId: string,
    actorUserName?: string
  ): AuthorizedBankAccount {
    if (!store.settings?.authorized_bank_accounts) {
      throw new Error('No bank account presets configured.');
    }

    const account = store.settings.authorized_bank_accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new Error(`Bank account preset "${accountId}" not found.`);
    }

    account.is_verified = true;
    account.is_active = true;
    account.verification_status = 'verified';
    account.verified_at = new Date().toISOString();
    account.verified_by = actorUserId;
    account.updated_at = new Date().toISOString();

    this.logAudit(
      actorUserId,
      actorUserName || 'Administrator',
      'admin',
      'BANK_PRESET_VERIFIED',
      'SETTINGS',
      accountId,
      { previousStatus: account.verification_status },
      { newStatus: 'verified', account_holder_name: account.account_holder_name }
    );

    store.persistSync();
    return account;
  }

  /**
   * Verifies and activates all 20 replacement accounts in a single batch (Super Admin).
   */
  public verifyAllBankAccounts(actorUserId: string, actorUserName?: string): number {
    if (!store.settings?.authorized_bank_accounts) {
      return 0;
    }

    let count = 0;
    store.settings.authorized_bank_accounts.forEach((acc) => {
      if (!acc.is_archived && (!acc.is_verified || acc.verification_status !== 'verified')) {
        acc.is_verified = true;
        acc.is_active = true;
        acc.verification_status = 'verified';
        acc.verified_at = new Date().toISOString();
        acc.verified_by = actorUserId;
        acc.updated_at = new Date().toISOString();
        count++;
      }
    });

    if (count > 0) {
      this.logAudit(
        actorUserId,
        actorUserName || 'Super Administrator',
        'super_admin',
        'ALL_BANK_PRESETS_VERIFIED',
        'SETTINGS',
        store.settings.id || 'sys-01',
        {},
        { verifiedCount: count }
      );
      store.persistSync();
    }

    return count;
  }

  /**
   * Toggles an account to pending verification (deactivates from fee collection).
   */
  public setAccountPending(
    accountId: string,
    actorUserId: string,
    actorUserName?: string
  ): AuthorizedBankAccount {
    if (!store.settings?.authorized_bank_accounts) {
      throw new Error('No bank account presets configured.');
    }

    const account = store.settings.authorized_bank_accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new Error(`Bank account preset "${accountId}" not found.`);
    }

    account.is_verified = false;
    account.is_active = false;
    account.verification_status = 'pending';
    account.updated_at = new Date().toISOString();

    this.logAudit(
      actorUserId,
      actorUserName || 'Administrator',
      'admin',
      'BANK_PRESET_PENDING',
      'SETTINGS',
      accountId,
      { previousStatus: 'verified' },
      { newStatus: 'pending', account_holder_name: account.account_holder_name }
    );

    store.persistSync();
    return account;
  }

  /**
   * Archives a specific bank account preset.
   */
  public archiveBankAccount(
    accountId: string,
    actorUserId: string,
    actorUserName?: string
  ): AuthorizedBankAccount {
    if (!store.settings?.authorized_bank_accounts) {
      throw new Error('No bank account presets configured.');
    }

    const account = store.settings.authorized_bank_accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new Error(`Bank account preset "${accountId}" not found.`);
    }

    account.is_archived = true;
    account.is_active = false;
    account.is_verified = false;
    account.verification_status = 'archived';
    account.archived_at = new Date().toISOString();
    account.updated_at = new Date().toISOString();

    this.logAudit(
      actorUserId,
      actorUserName || 'Administrator',
      'admin',
      'BANK_PRESET_ARCHIVED',
      'SETTINGS',
      accountId,
      { previousState: 'active' },
      { newState: 'archived', account_holder_name: account.account_holder_name }
    );

    store.persistSync();
    return account;
  }

  /**
   * Ensures the store has the 20 replacement accounts synchronized and obsolete
   * presets archived. Called automatically on startup and rehydration.
   */
  public ensureReferenceBankAccountsSynced(): void {
    if (!store.settings) return;

    const accounts = store.settings.authorized_bank_accounts || [];
    const hasObsolete = accounts.some((a) => isObsoleteBankPreset(a) && !a.is_archived);
    const hasAll20 = REFERENCE_20_BANK_ACCOUNTS.every((ref) => {
      const cleanRefNumber = ref.account_number.replace(/\s+/g, '');
      return accounts.some(
        (a) => !a.is_archived && a.account_number.replace(/\s+/g, '') === cleanRefNumber
      );
    });

    if (hasObsolete || !hasAll20) {
      this.importReferenceBankAccounts({ defaultStatus: 'verified' });
    }
  }

  private logAudit(
    userId: string,
    userName: string,
    role: string,
    action: string,
    module: string,
    recordId: string,
    oldValue: any,
    newValue: any
  ): void {
    const entry: AuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: userId,
      user_name: userName,
      user_role: role,
      action,
      module,
      record_id: recordId,
      old_value: oldValue,
      new_value: newValue,
      created_at: new Date().toISOString(),
    };
    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift(entry);
  }
}

export const bankAccountService = new BankAccountService();
