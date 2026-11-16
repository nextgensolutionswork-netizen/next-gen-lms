import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { bankAccountService } from '@/lib/services/bank-account-service';
import {
  getAuthorizedBankAccounts,
  formatBankAccountPresetLabel,
  maskSensitiveAccountNumber,
  REFERENCE_20_BANK_ACCOUNTS,
  isObsoleteBankPreset,
} from '@/lib/utils/bank-autofill';
import { GET as getBankAccountsApi, POST as postBankAccountsApi } from '@/app/api/settings/bank-accounts/route';
import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';

function createMockRequest(
  method: string,
  user?: { id: string; full_name: string; email: string; role: string; tenant_id?: string },
  body?: any,
  searchParams?: Record<string, string>
): NextRequest {
  let url = 'http://localhost:3000/api/settings/bank-accounts';
  if (searchParams) {
    const sp = new URLSearchParams(searchParams);
    url += `?${sp.toString()}`;
  }

  const headers = new Headers();
  headers.set('host', 'localhost:3000');
  headers.set('content-type', 'application/json');

  if (user) {
    const rawUser = JSON.stringify(user);
    const signature = generateAuthCookieSignatureSync(rawUser);
    headers.set('cookie', `${AUTH_COOKIE_NAME}=${encodeURIComponent(rawUser)}; ${AUTH_SIG_COOKIE_NAME}=${signature}`);
  }

  const reqInit: RequestInit = {
    method,
    headers,
  };
  if (body && method !== 'GET') {
    reqInit.body = JSON.stringify(body);
  }

  return new NextRequest(new Request(url, reqInit));
}

describe('Bank Account Presets & IFSC Removal Verification', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
    bankAccountService.ensureReferenceBankAccountsSynced();
  });

  // 1. Old Primary HDFC preset is removed from active selection
  it('1. removes the old Primary HDFC preset (50200088991122) from active selection', () => {
    const activeAccounts = getAuthorizedBankAccounts('admin');
    const oldPrimary = activeAccounts.find((a) => a.account_number.includes('50200088991122'));
    expect(oldPrimary).toBeUndefined();

    const oldHolder = activeAccounts.find((a) =>
      a.account_holder_name.includes('NEXT GEN ERP SOLUTIONS PRIVATE LIMITED')
    );
    expect(oldHolder).toBeUndefined();
  });

  // 2. Old default account information no longer appears in new forms
  it('2. ensures old default account information does not appear in store settings', () => {
    expect(store.settings.bank_account_no).not.toBe('50200088991122');
    expect(store.settings.bank_account_number).not.toBe('50200088991122');
    expect(store.settings.upi_id).not.toBe('nextgenerp@hdfcbank');
    expect(store.settings.bank_account_name).not.toBe('NEXT GEN ERP SOLUTIONS PRIVATE LIMITED');
    expect(store.settings.bank_account_name).toBe('Katari Charitha');
    expect(store.settings.bank_account_number).toBe('50100 76776 1140');
  });

  // 3. Exactly 20 replacement accounts are imported
  it('3. imports exactly 20 replacement bank accounts from the reference table', () => {
    const allPresets = getAuthorizedBankAccounts('super_admin', { includePending: true });
    expect(allPresets.length).toBe(20);

    // Verify first and last accounts
    expect(allPresets[0].account_holder_name).toBe('Katari Charitha');
    expect(allPresets[0].bank_name).toBe('HDFC Bank');
    expect(allPresets[0].account_number).toBe('50100 76776 1140');

    expect(allPresets[19].account_holder_name).toBe('Niranjan Axis Bank');
    expect(allPresets[19].bank_name).toBe('Axis Bank');
    expect(allPresets[19].account_number).toBe('916010064080256');
    expect(allPresets[19].upi_id).toBe('niranjanemparala@ybl');
  });

  // 4. All 20 appear in Super Admin account management
  it('4. displays all 20 replacement accounts in Super Admin account management view', () => {
    const superAdminView = getAuthorizedBankAccounts('super_admin', { includePending: true });
    expect(superAdminView.length).toBe(20);

    // Verify all 20 holders are present
    const expectedHolders = [
      'Katari Charitha',
      'Palukuri Bindu',
      'Katari Padmaja',
      'Juhitech Solutions',
      'My Erp Hub',
      'Nextgen Erp Solutions',
      'Shobharani Venu Naidu',
      'C Ekambara Naidu',
      'Hemadri Venu Naidu',
      'C Kiran Kumari',
      'Lalita Venu Naidu',
      'E Anasuya',
      'T Kusuma',
      'T Usha',
      'K Swathi',
      'B Jyothi',
      'K Munemma',
      'G Komalika',
      'Anthagiri Sowmya',
      'Niranjan Axis Bank',
    ];

    expectedHolders.forEach((holder) => {
      const match = superAdminView.find((a) => a.account_holder_name === holder);
      expect(match).toBeDefined();
    });
  });

  // 5. Verified accounts appear in the payment dropdown, pending accounts do not
  it('5. includes only verified accounts in fee collection payment dropdown and excludes pending accounts', () => {
    // Set account 5 (My Erp Hub) to pending
    bankAccountService.setAccountPending('bank-acc-05', 'usr-admin');

    const paymentDropdownAccounts = getAuthorizedBankAccounts('accountant');
    const myErpHub = paymentDropdownAccounts.find((a) => a.id === 'bank-acc-05');
    expect(myErpHub).toBeUndefined(); // Pending account excluded from fee collection
    expect(paymentDropdownAccounts.length).toBe(19);

    // Super admin management view still shows all 20
    const adminManagementView = getAuthorizedBankAccounts('super_admin', { includePending: true });
    expect(adminManagementView.length).toBe(20);

    // Now re-verify account 5
    bankAccountService.verifyBankAccount('bank-acc-05', 'usr-admin');
    const paymentDropdownAfterVerify = getAuthorizedBankAccounts('accountant');
    expect(paymentDropdownAfterVerify.length).toBe(20);
    const restored = paymentDropdownAfterVerify.find((a) => a.id === 'bank-acc-05');
    expect(restored).toBeDefined();
    expect(restored?.account_holder_name).toBe('My Erp Hub');
  });

  // 6. IFSC is completely absent from the Bank Details UI model and label
  it('6. completely omits IFSC Code from Account Preset dropdown labels and models', () => {
    const accounts = getAuthorizedBankAccounts('accountant');
    accounts.forEach((acc) => {
      const label = formatBankAccountPresetLabel(acc);
      expect(label).not.toContain('IFSC');
      expect(label).not.toContain('HDFC0000123');
      expect(label).not.toContain('HDFC0001234');
      // Format must be Account Holder — Bank Name — XXXX1234
      expect(label).toMatch(/^.+ — .+ — XXXX\d{4}$/);
    });
  });

  // 7. Account selection automatically fills the correct details
  it('7. automatically populates bank name, holder, account ID, and UPI details on selection', () => {
    const accounts = getAuthorizedBankAccounts('accountant');
    const target = accounts.find((a) => a.account_holder_name === 'My Erp Hub')!;
    expect(target).toBeDefined();
    expect(target.bank_name).toBe('HDFC Bank');
    expect(target.account_holder_name).toBe('My Erp Hub');
    expect(target.account_number).toBe('50200 11060 5431');
    expect(target.upi_id).toBe('9550499661-2@ybl');
  });

  // 8. UPI values populate correctly
  it('8. populates correct UPI for My Erp Hub and Niranjan Axis Bank', () => {
    const accounts = getAuthorizedBankAccounts('admin');
    const myErpHub = accounts.find((a) => a.account_holder_name === 'My Erp Hub')!;
    expect(myErpHub.upi_id).toBe('9550499661-2@ybl');

    const niranjan = accounts.find((a) => a.account_holder_name === 'Niranjan Axis Bank')!;
    expect(niranjan.upi_id).toBe('niranjanemparala@ybl');
  });

  // 9. Missing UPI values remain blank
  it('9. ensures accounts without specified UPI remain blank without inventing UPI IDs', () => {
    const accounts = getAuthorizedBankAccounts('admin');
    const withoutUpi = accounts.filter(
      (a) => a.account_holder_name !== 'My Erp Hub' && a.account_holder_name !== 'Niranjan Axis Bank'
    );
    expect(withoutUpi.length).toBe(18);
    withoutUpi.forEach((acc) => {
      expect(acc.upi_id || '').toBe('');
    });
  });

  // 10. Dropdown label format strictly matches: Account Holder — Bank Name — XXXX1234
  it('10. formats dropdown label as: Account Holder — Bank Name — XXXX1234', () => {
    const acc1 = {
      account_holder_name: 'Katari Charitha',
      bank_name: 'HDFC Bank',
      account_number: '50100 76776 1140',
    };
    expect(formatBankAccountPresetLabel(acc1)).toBe('Katari Charitha — HDFC Bank — XXXX1140');

    const acc13 = {
      account_holder_name: 'T Kusuma',
      bank_name: 'Canara - Thenebanda',
      account_number: '110270 213 528',
    };
    expect(formatBankAccountPresetLabel(acc13)).toBe('T Kusuma — Canara - Thenebanda — XXXX3528');

    const acc20 = {
      account_holder_name: 'Niranjan Axis Bank',
      bank_name: 'Axis Bank',
      account_number: '916010064080256',
    };
    expect(formatBankAccountPresetLabel(acc20)).toBe('Niranjan Axis Bank — Axis Bank — XXXX0256');
  });

  // 11. Role-based masking of account numbers
  it('11. returns unmasked account numbers to finance roles and masks them for non-finance roles', () => {
    const adminAccounts = getAuthorizedBankAccounts('super_admin');
    expect(adminAccounts[0].account_number).toBe('50100 76776 1140');

    const counsellorAccounts = getAuthorizedBankAccounts('counsellor');
    expect(counsellorAccounts[0].account_number).toBe('•••• •••• 1140');
    expect(counsellorAccounts[0].account_number).not.toContain('50100 76776');
  });

  // 12. Page refresh / disk rehydration retains the 20 accounts and archives obsolete presets
  it('12. retains new preset list across store rehydration and never resurrects old primary preset', () => {
    store.hydrateFromDisk();
    const accounts = getAuthorizedBankAccounts('admin');
    expect(accounts.length).toBe(20);
    expect(accounts.some((a) => a.account_number.includes('50200088991122'))).toBe(false);
  });

  // 13. Historical financial records remain intact
  it('13. preserves all historical payments, receipts, and dual ledgers without breakage', () => {
    expect(store.payments.length).toBeGreaterThan(0);
    expect(store.studentPayments.length).toBeGreaterThan(0);
    expect(store.receipts.length).toBeGreaterThan(0);
    expect(store.studentFees.length).toBeGreaterThan(0);

    // Existing historical payments retain their stored fields
    const paymentWithBank = store.payments.find((p) => p.our_bank_name || p.our_bank_account_id);
    if (paymentWithBank) {
      expect(paymentWithBank.amount || (paymentWithBank as any).amount_paid).toBeGreaterThan(0);
    }
  });

  // 14. Server API authorization and security
  it('14. blocks unauthorized access to bank accounts API (401/403) and restricts management to admins', async () => {
    // Unauthenticated GET -> 401
    const unauthReq = createMockRequest('GET');
    const unauthRes = await getBankAccountsApi(unauthReq);
    expect(unauthRes.status).toBe(401);

    // Student GET -> 403
    const studentUser = { id: 'usr-student-01', full_name: 'Amit Gupta', email: 'amit.gupta@student.next-gen.edu', role: 'student' };
    const studentReq = createMockRequest('GET', studentUser);
    const studentRes = await getBankAccountsApi(studentReq);
    expect(studentRes.status).toBe(403);

    // Accountant GET -> 200 (verified active accounts)
    const accountantUser = { id: 'usr-accounts', full_name: 'Suresh Kumar', email: 'accounts@next-generpsolutions.com', role: 'accountant' };
    const accountantReq = createMockRequest('GET', accountantUser);
    const accountantRes = await getBankAccountsApi(accountantReq);
    expect(accountantRes.status).toBe(200);
    const accountantData = await accountantRes.json();
    expect(accountantData.success).toBe(true);
    expect(accountantData.accounts.length).toBe(20);

    // Non-admin POST -> 403
    const counsellorUser = { id: 'usr-counsellor', full_name: 'Ananya Sharma', email: 'counsellor@next-generpsolutions.com', role: 'counsellor' };
    const counsellorPostReq = createMockRequest('POST', counsellorUser, { action: 'verify_all' });
    const counsellorPostRes = await postBankAccountsApi(counsellorPostReq);
    expect(counsellorPostRes.status).toBe(403);

    // Admin POST -> 200
    const adminUser = { id: 'usr-admin', full_name: 'Admin', email: 'admin@next-generpsolutions.com', role: 'admin' };
    const adminPostReq = createMockRequest('POST', adminUser, { action: 'verify_all' });
    const adminPostRes = await postBankAccountsApi(adminPostReq);
    expect(adminPostRes.status).toBe(200);
    const adminPostData = await adminPostRes.json();
    expect(adminPostData.success).toBe(true);
  });

  // 15. Searchable dropdown query filtering logic (by holder, bank, last 4, upi)
  it('15. filters accounts accurately by holder, bank, last 4 digits, and upi query', () => {
    const all = getAuthorizedBankAccounts('super_admin', { includePending: true });

    // Filter by holder: "Naidu"
    const byHolder = all.filter((a) => a.account_holder_name.toLowerCase().includes('naidu'));
    expect(byHolder.length).toBe(4); // Shobharani, C Ekambara, Hemadri, Lalita Venu Naidu

    // Filter by bank: "Canara"
    const byBank = all.filter((a) => a.bank_name.toLowerCase().includes('canara'));
    expect(byBank.length).toBe(5); // Canara - Thenebanda accounts

    // Filter by last 4 digits: "5431"
    const byLast4 = all.filter((a) => a.account_number.replace(/\s+/g, '').endsWith('5431'));
    expect(byLast4.length).toBe(1);
    expect(byLast4[0].account_holder_name).toBe('My Erp Hub');

    // Filter by UPI: "niranjanemparala@ybl"
    const byUpi = all.filter((a) => (a.upi_id || '').toLowerCase().includes('niranjanemparala'));
    expect(byUpi.length).toBe(1);
    expect(byUpi[0].account_holder_name).toBe('Niranjan Axis Bank');
  });

  // 16. Fee collection forms restrict to verified active accounts, while super admin sees all 20
  it('16. strictly isolates fee-collection eligibility from super-admin view', () => {
    // Initially all 20 verified
    expect(getAuthorizedBankAccounts('accountant').length).toBe(20);
    expect(getAuthorizedBankAccounts('super_admin', { includePending: true }).length).toBe(20);

    // Make account 2 and 3 pending
    bankAccountService.setAccountPending('bank-acc-02', 'usr-admin');
    bankAccountService.setAccountPending('bank-acc-03', 'usr-admin');

    // Fee collection dropdown now shows only 18
    const feeDropdown = getAuthorizedBankAccounts('accountant');
    expect(feeDropdown.length).toBe(18);
    expect(feeDropdown.find((a) => a.id === 'bank-acc-02')).toBeUndefined();
    expect(feeDropdown.find((a) => a.id === 'bank-acc-03')).toBeUndefined();

    // Super admin dropdown still displays all 20
    const superAdminDropdown = getAuthorizedBankAccounts('super_admin', { includePending: true });
    expect(superAdminDropdown.length).toBe(20);
    expect(superAdminDropdown.find((a) => a.id === 'bank-acc-02')?.verification_status).toBe('pending');
    expect(superAdminDropdown.find((a) => a.id === 'bank-acc-03')?.verification_status).toBe('pending');

    // Restore all to verified
    bankAccountService.verifyAllBankAccounts('usr-admin');
    expect(getAuthorizedBankAccounts('accountant').length).toBe(20);
  });
});
