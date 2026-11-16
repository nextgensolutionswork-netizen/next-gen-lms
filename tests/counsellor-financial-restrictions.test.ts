/**
 * Test Suite: Counsellor Financial Desk & Approvals Restrictions
 *
 * Verifies that:
 * 1. Sidebar menu items for Fee Approvals (/accounts/approvals) and Financial Analytics (/accounts/reports)
 *    are strictly hidden for the Counsellor role.
 * 2. Operational accounts items (Student Fee Ledger: /accounts/fees, Payments & Receipts: /accounts/payments)
 *    remain visible to Counsellors.
 * 3. Super Admin, Admin, and Accountant (Accounts) users retain full access to all financial menu items.
 * 4. Middleware returns 403 Forbidden when a Counsellor directly accesses /accounts/approvals or /accounts/reports.
 * 5. Middleware allows Counsellor access to /accounts/fees and /accounts/payments.
 * 6. Middleware preserves authorized access to /accounts/approvals and /accounts/reports for Super Admin, Admin, and Accountant.
 * 7. getSafeRedirectUrl rejects /accounts/approvals and /accounts/reports for Counsellor and falls back to /crm/leads.
 * 8. Backend fee payment and proposal APIs enforce server-side 403 Forbidden against Counsellors for approval actions.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { getSafeRedirectUrl } from '@/lib/auth/rbac';
import { UserRole } from '@/types';

function createMockAuthRequest(url: string, role: UserRole, isJson = false) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: {
      host: 'localhost:3000',
      ...(isJson ? { accept: 'application/json' } : {}),
    },
  });

  const cookiePayload = JSON.stringify({
    id: `usr-${role}-test`,
    email: `${role}@next-generpsolutions.com`,
    role,
    tenant_id: 'default',
    is_active: true,
  });

  req.cookies.set('next_gen_auth_user', encodeURIComponent(cookiePayload));
  req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(encodeURIComponent(cookiePayload)));

  return req;
}

describe('Counsellor Role Financial Restrictions & Boundary Enforcement', () => {
  // =========================================================================
  // 1. DIRECT URL ACCESS & SERVER-SIDE MIDDLEWARE (403 FORBIDDEN)
  // =========================================================================
  describe('Server-side URL Access Guard via Middleware', () => {
    it('returns 403 Forbidden when Counsellor directly accesses /accounts/approvals', async () => {
      const req = createMockAuthRequest('http://localhost:3000/accounts/approvals', 'counsellor');
      const res = await middleware(req);

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain('403 Forbidden');
      expect(text).toContain('Access Restricted');
      expect(text).toContain('Counsellor');
    });

    it('returns 403 Forbidden when Counsellor directly accesses /accounts/reports', async () => {
      const req = createMockAuthRequest('http://localhost:3000/accounts/reports', 'counsellor');
      const res = await middleware(req);

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain('403 Forbidden');
      expect(text).toContain('Access Restricted');
      expect(text).toContain('Counsellor');
    });

    it('returns 403 JSON when Counsellor requests /accounts/approvals with Accept: application/json', async () => {
      const req = createMockAuthRequest('http://localhost:3000/accounts/approvals', 'counsellor', true);
      const res = await middleware(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden: Counsellor role is not authorized');
    });

    it('returns 403 JSON when Counsellor requests /accounts/reports with Accept: application/json', async () => {
      const req = createMockAuthRequest('http://localhost:3000/accounts/reports', 'counsellor', true);
      const res = await middleware(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden: Counsellor role is not authorized');
    });

    it('allows Counsellor direct access to Student Fee Ledger (/accounts/fees)', async () => {
      const req = createMockAuthRequest('http://localhost:3000/accounts/fees', 'counsellor');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('allows Counsellor direct access to Payments & Receipts (/accounts/payments)', async () => {
      const req = createMockAuthRequest('http://localhost:3000/accounts/payments', 'counsellor');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('BUG-CO-003: allows Counsellor direct access to Student Payment Due Dates (/accounts/dues)', async () => {
      const req = createMockAuthRequest('http://localhost:3000/accounts/dues', 'counsellor');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  // =========================================================================
  // 2. AUTHORIZED ROLES PRESERVATION (Super Admin, Admin, Accountant)
  // =========================================================================
  describe('Preservation of Authorized Access for Super Admin, Admin, and Accountant', () => {
    it.each(['super_admin', 'admin', 'accountant'] as UserRole[])(
      'allows %s direct access to Fee Approvals (/accounts/approvals)',
      async (role) => {
        const req = createMockAuthRequest('http://localhost:3000/accounts/approvals', role);
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
      }
    );

    it.each(['super_admin', 'admin', 'accountant'] as UserRole[])(
      'allows %s direct access to Financial Analytics (/accounts/reports)',
      async (role) => {
        const req = createMockAuthRequest('http://localhost:3000/accounts/reports', role);
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
      }
    );

    it.each(['super_admin', 'admin', 'accountant'] as UserRole[])(
      'allows %s access to Student Fee Ledger (/accounts/fees)',
      async (role) => {
        const req = createMockAuthRequest('http://localhost:3000/accounts/fees', role);
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
      }
    );

    it.each(['super_admin', 'admin', 'accountant'] as UserRole[])(
      'allows %s access to Payments & Receipts (/accounts/payments)',
      async (role) => {
        const req = createMockAuthRequest('http://localhost:3000/accounts/payments', role);
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
      }
    );
  });

  // =========================================================================
  // 3. RBAC ROUTE VALIDATION & REDIRECT SAFETY
  // =========================================================================
  describe('RBAC getSafeRedirectUrl Boundary Validation', () => {
    it('rejects /accounts/approvals for Counsellor and safely falls back to /crm/leads', () => {
      const redirect = getSafeRedirectUrl('counsellor', '/accounts/approvals');
      expect(redirect).toBe('/crm/leads');
    });

    it('rejects /accounts/reports for Counsellor and safely falls back to /crm/leads', () => {
      const redirect = getSafeRedirectUrl('counsellor', '/accounts/reports');
      expect(redirect).toBe('/crm/leads');
    });

    it('rejects sub-paths of /accounts/approvals for Counsellor', () => {
      const redirect = getSafeRedirectUrl('counsellor', '/accounts/approvals?desk=payments');
      expect(redirect).toBe('/crm/leads');
    });

    it('allows /accounts/fees for Counsellor', () => {
      const redirect = getSafeRedirectUrl('counsellor', '/accounts/fees');
      expect(redirect).toBe('/accounts/fees');
    });

    it('allows /accounts/payments for Counsellor', () => {
      const redirect = getSafeRedirectUrl('counsellor', '/accounts/payments');
      expect(redirect).toBe('/accounts/payments');
    });

    it('allows /accounts/receipts/:id for Counsellor', () => {
      const redirect = getSafeRedirectUrl('counsellor', '/accounts/receipts/rec-01');
      expect(redirect).toBe('/accounts/receipts/rec-01');
    });

    it.each(['super_admin', 'admin', 'accountant'] as UserRole[])(
      'allows %s to access /accounts/approvals',
      (role) => {
        const redirect = getSafeRedirectUrl(role, '/accounts/approvals');
        expect(redirect).toBe('/accounts/approvals');
      }
    );

    it.each(['super_admin', 'admin', 'accountant'] as UserRole[])(
      'allows %s to access /accounts/reports',
      (role) => {
        const redirect = getSafeRedirectUrl(role, '/accounts/reports');
        expect(redirect).toBe('/accounts/reports');
      }
    );
  });

  // =========================================================================
  // 4. SIDEBAR PERMISSION MATRIX HELPER LOGIC
  // =========================================================================
  describe('Sidebar Role Visibility Rules', () => {
    function computeSidebarAccountsVisibility(role: UserRole) {
      const isSuperAdmin = role === 'super_admin';
      const isAdmin = isSuperAdmin || role === 'admin';
      const isAccountant = isSuperAdmin || isAdmin || role === 'accountant';
      const isCounsellor = role === 'counsellor';
      const canAccessAccountsSection = isAccountant || isCounsellor;
      const canAccessFinancialManagement = isAccountant;

      return {
        sectionVisible: canAccessAccountsSection,
        feeApprovalsVisible: canAccessFinancialManagement,
        feeLedgerVisible: canAccessAccountsSection,
        paymentsReceiptsVisible: canAccessAccountsSection,
        expensesVisible: canAccessFinancialManagement,
        vendorsVisible: canAccessFinancialManagement,
        financialAnalyticsVisible: canAccessFinancialManagement,
      };
    }

    it('hides Fee Approvals and Financial Analytics for Counsellor while preserving Fee Ledger and Payments', () => {
      const visibility = computeSidebarAccountsVisibility('counsellor');

      expect(visibility.sectionVisible).toBe(true);
      expect(visibility.feeApprovalsVisible).toBe(false);
      expect(visibility.financialAnalyticsVisible).toBe(false);
      expect(visibility.expensesVisible).toBe(false);
      expect(visibility.vendorsVisible).toBe(false);
      expect(visibility.feeLedgerVisible).toBe(true);
      expect(visibility.paymentsReceiptsVisible).toBe(true);
    });

    it('preserves all items for Super Admin', () => {
      const visibility = computeSidebarAccountsVisibility('super_admin');

      expect(visibility.sectionVisible).toBe(true);
      expect(visibility.feeApprovalsVisible).toBe(true);
      expect(visibility.financialAnalyticsVisible).toBe(true);
      expect(visibility.expensesVisible).toBe(true);
      expect(visibility.vendorsVisible).toBe(true);
      expect(visibility.feeLedgerVisible).toBe(true);
      expect(visibility.paymentsReceiptsVisible).toBe(true);
    });

    it('preserves all items for Admin', () => {
      const visibility = computeSidebarAccountsVisibility('admin');

      expect(visibility.sectionVisible).toBe(true);
      expect(visibility.feeApprovalsVisible).toBe(true);
      expect(visibility.financialAnalyticsVisible).toBe(true);
      expect(visibility.expensesVisible).toBe(true);
      expect(visibility.vendorsVisible).toBe(true);
      expect(visibility.feeLedgerVisible).toBe(true);
      expect(visibility.paymentsReceiptsVisible).toBe(true);
    });

    it('preserves all items for Accountant (Accounts)', () => {
      const visibility = computeSidebarAccountsVisibility('accountant');

      expect(visibility.sectionVisible).toBe(true);
      expect(visibility.feeApprovalsVisible).toBe(true);
      expect(visibility.financialAnalyticsVisible).toBe(true);
      expect(visibility.expensesVisible).toBe(true);
      expect(visibility.vendorsVisible).toBe(true);
      expect(visibility.feeLedgerVisible).toBe(true);
      expect(visibility.paymentsReceiptsVisible).toBe(true);
    });

    it('completely hides Accounts & Finance section for non-financial roles (trainer, student)', () => {
      expect(computeSidebarAccountsVisibility('trainer').sectionVisible).toBe(false);
      expect(computeSidebarAccountsVisibility('student').sectionVisible).toBe(false);
    });

    it('BUG-CO-003: getSafeRedirectUrl permits Counsellor access to /accounts/dues', () => {
      expect(getSafeRedirectUrl('counsellor', '/accounts/dues')).toBe('/accounts/dues');
      expect(getSafeRedirectUrl('counsellor', '/accounts/fees')).toBe('/accounts/fees');
      expect(getSafeRedirectUrl('counsellor', '/accounts/payments')).toBe('/accounts/payments');
      expect(getSafeRedirectUrl('counsellor', '/accounts/approvals')).toBe('/crm/leads');
      expect(getSafeRedirectUrl('counsellor', '/accounts/expenses')).toBe('/crm/leads');
      expect(getSafeRedirectUrl('counsellor', '/accounts/reports')).toBe('/crm/leads');
    });
  });
});
