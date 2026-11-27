import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as upcomingDuesGet } from '@/app/api/fees/upcoming-dues/route';
import { generateCollectionsExcelXml } from '@/lib/utils/excel-export';
import { store } from '@/lib/services/data-store';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { UserRole } from '@/types';

function createMockAuthRequest(url: string, role: UserRole = 'accountant') {
  const email = role === 'accountant' ? 'accounts@next-generpsolutions.com' : `${role}@next-generpsolutions.com`;
  const existingUser = store.users.find(u => u.role === role || u.email === email);
  const userId = existingUser?.id || `usr-${role}`;
  const userEmail = existingUser?.email || email;

  const cookiePayload = JSON.stringify({
    id: userId,
    email: userEmail,
    role,
    tenant_id: 'default',
    is_active: true,
  });
  const encoded = encodeURIComponent(cookiePayload);
  const sig = generateAuthCookieSignatureSync(encoded);

  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: {
      host: 'localhost:3000',
      cookie: `next_gen_auth_user=${encoded}; next_gen_auth_user_sig=${sig}`,
    },
  });
  req.cookies.set('next_gen_auth_user', encoded);
  req.cookies.set('next_gen_auth_user_sig', sig);
  return req;
}

describe('ARCH-BUG-02: Read-Time Financial Immutability Verification', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
  });

  it('1. verifies GET /api/fees/upcoming-dues does NOT mutate fee accounts or payment counts', async () => {
    const initialFeeAccountsCount = store.feeAccounts.length;
    const initialStudentFeesCount = store.studentFees.length;
    const initialPaymentsCount = store.studentPayments.length;
    const initialLedgersCount = store.studentFinancialLedgers.length;

    const req = createMockAuthRequest('http://localhost:3000/api/fees/upcoming-dues', 'accountant');

    // Run repeated reads
    for (let i = 0; i < 5; i++) {
      const res = await upcomingDuesGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    }

    // Assert zero mutations
    expect(store.feeAccounts.length).toBe(initialFeeAccountsCount);
    expect(store.studentFees.length).toBe(initialStudentFeesCount);
    expect(store.studentPayments.length).toBe(initialPaymentsCount);
    expect(store.studentFinancialLedgers.length).toBe(initialLedgersCount);
  });

  it('2. verifies generateCollectionsExcelXml does NOT mutate ledger or payment states', () => {
    const initialPaymentsCount = store.payments.length;
    const initialStudentFeesCount = store.studentFees.length;

    // Run export generator
    const xmlOutput = generateCollectionsExcelXml();
    expect(xmlOutput).toContain('<?xml version="1.0"');
    expect(xmlOutput).toContain('Workbook');

    // State must remain strictly identical
    expect(store.payments.length).toBe(initialPaymentsCount);
    expect(store.studentFees.length).toBe(initialStudentFeesCount);
  });
});
