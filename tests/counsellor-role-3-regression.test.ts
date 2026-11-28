/**
 * Test Suite: Role 3 Counsellor Defect Remediation & Full Regression
 *
 * Verifies all 3 Counsellor defects:
 * - BUG-CO-001: Audit Telemetry Ingestion (POST /api/audit-logs)
 * - BUG-CO-002: Student Profile Hook Order Invariance & Resolution
 * - BUG-CO-003: Payment Due Dates Navigation & Scoped Read-Only Access
 *
 * Plus critical business invariants:
 * - Counsellor separation of duties (cannot self-approve fees/payments)
 * - Pending payments do not increase verified collections
 * - No official receipt issued before approval
 * - Lead stage updates and interaction notes persist durably
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { GET as auditGet, POST as auditPost } from '@/app/api/audit-logs/route';
import { GET as studentGet } from '@/app/api/students/[id]/route';
import { GET as duesGet } from '@/app/api/fees/dues/route';
import { POST as paymentsPost } from '@/app/api/fees/payments/route';
import { store } from '@/lib/services/data-store';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { getSafeRedirectUrl } from '@/lib/auth/rbac';
import { calculateAuthoritativeStudentFinancials } from '@/lib/utils/student-financials';
import { UserRole } from '@/types';

function createMockAuthRequest(
  url: string,
  method: 'GET' | 'POST' = 'GET',
  role: UserRole = 'counsellor',
  body?: any,
  options: { userId?: string; email?: string; tenantId?: string; isJson?: boolean } = {}
) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: {
      host: 'localhost:3000',
      'Content-Type': 'application/json',
      ...(options.isJson ? { accept: 'application/json' } : {}),
    },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  const cookiePayload = JSON.stringify({
    id: options.userId || `usr-${role}-test`,
    email: options.email || `${role}@next-generpsolutions.com`,
    role,
    tenant_id: options.tenantId || 'default',
    is_active: true,
    full_name: `Test ${role}`,
  });

  req.cookies.set('next_gen_auth_user', encodeURIComponent(cookiePayload));
  req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(encodeURIComponent(cookiePayload)));

  return req;
}

describe('ROLE 3 COUNSELLOR — DEFECT REMEDIATION & REGRESSION SUITE', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
    store.users = store.users.map(u => ({ ...u, tenant_id: u.tenant_id || 'default' }));
    for (const id of ['lead-stage-001', 'lead-interaction-001']) store.leads.push({ id, created_by: '44444444-4444-4444-4444-444444444444', tenant_id: 'default', lead_code: 'TEST', full_name: 'Test', phone: '9876543210', email: 'test@example.com', stage: 'New', created_at: '', updated_at: '' });
    store.persistSync();
  });

  // =========================================================================
  // TASK 1 — BUG-CO-002: STUDENT PROFILE HOOK ORDER INVARIANCE & RESOLUTION
  // =========================================================================
  describe('BUG-CO-002: Student Profile Hook Order Invariance & Profile Loading', () => {
    it('calculates authoritative financials safely even when data is empty or missing (no crash)', () => {
      const emptyResult = calculateAuthoritativeStudentFinancials({
        student: null as any,
        admission: null as any,
        feeAccount: null as any,
      });

      expect(emptyResult.totalPayable).toBe(0);
      expect(emptyResult.paidAmount).toBe(0);
      expect(emptyResult.outstandingDue).toBe(0);
    });

    it('resolves student profile successfully by legacy slug (stu-01) for Counsellor', async () => {
      const req = createMockAuthRequest(
        'http://localhost:3000/api/students/stu-01',
        'GET',
        'counsellor',
        undefined,
        { isJson: true }
      );

      const res = await studentGet(req, { params: Promise.resolve({ id: 'stu-01' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.student).toBeDefined();
      expect(json.student.student_code).toBeDefined();
    });

    it('resolves student profile successfully by UUID (51000000-0000-0000-0000-000000000001) for Counsellor', async () => {
      const req = createMockAuthRequest(
        'http://localhost:3000/api/students/51000000-0000-0000-0000-000000000001',
        'GET',
        'counsellor',
        undefined,
        { isJson: true }
      );

      const res = await studentGet(req, { params: Promise.resolve({ id: '51000000-0000-0000-0000-000000000001' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.student).toBeDefined();
    });

    it('preserves student ownership security boundary: student accessing another student profile is denied (403)', async () => {
      // Student amit.gupta trying to access stu-02
      const req = createMockAuthRequest(
        'http://localhost:3000/api/students/stu-02',
        'GET',
        'student',
        undefined,
        { userId: '77777777-7777-7777-7777-777777777771', email: 'amit.gupta@student.next-gen.com', isJson: true }
      );

      const res = await studentGet(req, { params: Promise.resolve({ id: 'stu-02' }) });
      expect(res.status).toBe(403);
    });

    it('preserves tenant isolation: access to student belonging to another tenant is denied (403)', async () => {
      // Add a foreign counsellor belonging to an isolated competitor tenant
      const foreignId = 'usr-foreign-counsellor-tenant-99';
      store.users = store.users || [];
      if (!store.users.some((u) => u.id === foreignId)) {
        store.users.push({
          id: foreignId,
          email: 'foreign.counsellor@competitor.com',
          role: 'counsellor',
          tenant_id: 'tenant-competitor-99',
          is_active: true,
          full_name: 'Foreign Counsellor',
        } as any);
      }

      const req = createMockAuthRequest(
        'http://localhost:3000/api/students/stu-01',
        'GET',
        'counsellor',
        undefined,
        { userId: foreignId, email: 'foreign.counsellor@competitor.com', tenantId: 'tenant-competitor-99', isJson: true }
      );

      const res = await studentGet(req, { params: Promise.resolve({ id: 'stu-01' }) });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // TASK 2 — BUG-CO-003: PAYMENT DUE DATES NAVIGATION & RBAC
  // =========================================================================
  describe('BUG-CO-003: Payment Due Dates Navigation & Scoped Access', () => {
    it('middleware allows Counsellor direct access to /accounts/dues without redirect', async () => {
      const req = createMockAuthRequest('http://localhost:3000/accounts/dues', 'GET', 'counsellor');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('getSafeRedirectUrl authorizes /accounts/dues for Counsellor', () => {
      expect(getSafeRedirectUrl('counsellor', '/accounts/dues')).toBe('/accounts/dues');
    });

    it('middleware strictly denies Counsellor access to sensitive accounts desks (403 Forbidden)', async () => {
      const sensitiveDesks = [
        '/accounts/approvals',
        '/accounts/expenses',
        '/accounts/vendors',
        '/accounts/reports',
      ];

      for (const desk of sensitiveDesks) {
        const req = createMockAuthRequest(`http://localhost:3000${desk}`, 'GET', 'counsellor', undefined, { isJson: true });
        const res = await middleware(req);
        expect(res.status).toBe(403);
      }
    });

    it('Counsellor cannot approve fee payments via API (HTTP 403 Forbidden)', async () => {
      const testPaymentId = 'pay-pending-approval-test-01';
      store.studentPayments = store.studentPayments || [];
      if (!store.studentPayments.some((p) => p.id === testPaymentId)) {
        store.studentPayments.push({
          id: testPaymentId,
          student_id: 'stu-01',
          fee_id: 'fee-fa-01',
          amount_paid: 5000,
          payment_mode: 'UPI',
          status: 'Pending Approval',
          verification_status: 'Pending Verification',
          recorded_by: 'usr-other-counsellor',
          tenant_id: 'default',
          created_at: new Date().toISOString(),
        } as any);
      }

      const req = createMockAuthRequest(
        'http://localhost:3000/api/fees/payments',
        'POST',
        'counsellor',
        {
          action: 'approve',
          paymentId: testPaymentId,
          notes: 'Attempted self-approval',
        }
      );

      const res = await paymentsPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden: Only Accounts or Administrators');
    });

    it('Counsellor cannot void official receipts via API (HTTP 403 Forbidden)', async () => {
      const req = createMockAuthRequest(
        'http://localhost:3000/api/fees/payments',
        'POST',
        'counsellor',
        {
          action: 'void_receipt',
          receiptId: 'REC-2026-0001',
          reason: 'Counsellor void attempt',
        }
      );

      const res = await paymentsPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden: Only Accounts or Administrators');
    });

    it('GET /api/fees/dues delivers read-only payment dues for Counsellor', async () => {
      const req = createMockAuthRequest('http://localhost:3000/api/fees/dues?scope=all', 'GET', 'counsellor');
      const res = await duesGet(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.dues)).toBe(true);
      expect(json.summary).toBeDefined();
    });
  });

  // =========================================================================
  // TASK 3 — BUG-CO-001: AUDIT TELEMETRY INGESTION (POST /api/audit-logs)
  // =========================================================================
  describe('BUG-CO-001: Audit Telemetry Ingestion (POST /api/audit-logs)', () => {
    it('accepts valid lead stage update audit telemetry from Counsellor (201 Created)', async () => {
      const counsellorId = '44444444-4444-4444-4444-444444444444';
      const req = createMockAuthRequest(
        'http://localhost:3000/api/audit-logs',
        'POST',
        'counsellor',
        {
          action: 'LEAD_STAGE_UPDATED',
          module: 'CRM',
          record_id: 'lead-stage-001',
          old_value: { stage: 'New' },
          new_value: { stage: 'Contacted', notes: 'Spoke with candidate regarding SAP MM course' },
        },
        { userId: counsellorId }
      );

      const res = await auditPost(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.log.action).toBe('LEAD_STAGE_UPDATED');
      expect(json.log.user_id).toBe(counsellorId);

      // Verify durable persistence in local store
      const stored = store.auditLogs.find((l) => l.record_id === 'lead-stage-001');
      expect(stored).toBeDefined();
      expect(stored?.new_value?.notes).toContain('SAP MM');
    });

    it('accepts interaction notes telemetry with telemetry alias field names (201 Created)', async () => {
      const req = createMockAuthRequest(
        'http://localhost:3000/api/audit-logs',
        'POST',
        'counsellor',
        {
          event_type: 'INTERACTION_RECORDED',
          entity_type: 'CRM',
          entity_id: 'lead-interaction-001',
          details: { outcome: 'Demo Scheduled', date: '2026-11-20' },
          notes: 'Candidate confirmed interest in SAP SD demo session',
        }
      );

      const res = await auditPost(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.log.action).toBe('INTERACTION_RECORDED');
      expect(json.log.module).toBe('CRM');
    });

    it('rejects malformed non-JSON payload with HTTP 400 Bad Request', async () => {
      const req = new NextRequest(new URL('http://localhost:3000/api/audit-logs'), {
        method: 'POST',
        headers: { host: 'localhost:3000', 'Content-Type': 'application/json' },
        body: 'NOT_VALID_JSON{',
      });
      const cookiePayload = JSON.stringify({ id: 'usr-counsellor', role: 'counsellor', tenant_id: 'default', is_active: true });
      req.cookies.set('next_gen_auth_user', encodeURIComponent(cookiePayload));
      req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(encodeURIComponent(cookiePayload)));

      const res = await auditPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Malformed JSON');
    });

    it('rejects payload missing required fields with HTTP 400 Bad Request', async () => {
      const req = createMockAuthRequest(
        'http://localhost:3000/api/audit-logs',
        'POST',
        'counsellor',
        { notes: 'Only notes without action, module, or record_id' }
      );

      const res = await auditPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Missing required audit fields');
    });

    it('rejects actor forgery attempt where counsellor passes someone else user_id (HTTP 403 Forbidden)', async () => {
      const req = createMockAuthRequest(
        'http://localhost:3000/api/audit-logs',
        'POST',
        'counsellor',
        {
          action: 'LEAD_STAGE_UPDATED',
          module: 'CRM',
          record_id: 'lead-test-forgery',
          user_id: 'usr-admin-director',
        },
        { userId: 'usr-counsellor-actual' }
      );

      const res = await auditPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Cannot forge audit telemetry');
    });

    it('rejects cross-tenant audit attempts (HTTP 403 Forbidden)', async () => {
      const req = createMockAuthRequest(
        'http://localhost:3000/api/audit-logs',
        'POST',
        'counsellor',
        {
          action: 'LEAD_STAGE_UPDATED',
          module: 'CRM',
          record_id: 'lead-test-tenant',
          tenant_id: 'tenant-rogue-institute',
        },
        { tenantId: 'default' }
      );

      const res = await auditPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Tenant isolation mismatch');
    });

    it('rejects unauthenticated audit requests (HTTP 401 Unauthorized)', async () => {
      const req = new NextRequest(new URL('http://localhost:3000/api/audit-logs'), {
        method: 'POST',
        headers: { host: 'localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LEAD_STAGE_UPDATED', module: 'CRM', record_id: 'lead-123' }),
      });

      const res = await auditPost(req);
      expect(res.status).toBe(401);
    });

    it('GET /api/audit-logs remains restricted to Super Admin and Admin (Counsellor gets 403 Forbidden)', async () => {
      const req = createMockAuthRequest('http://localhost:3000/api/audit-logs', 'GET', 'counsellor');
      const res = await auditGet(req);
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // TASK 4 — FINANCIAL INTEGRITY & BUSINESS INVARIANTS
  // =========================================================================
  describe('Counsellor Financial Invariants & Separation of Duties', () => {
    it('recording a payment as Counsellor enters Pending verification and does not issue an official receipt', async () => {
      const studentFee = store.studentFees[0];
      expect(studentFee).toBeDefined();

      const initialReceiptsCount = (store.receipts || []).length;
      const initialVerifiedCollections = (store.payments || [])
        .filter((p: any) => p.status === 'Success' || p.status === 'Approved')
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      const req = createMockAuthRequest(
        'http://localhost:3000/api/fees/payments',
        'POST',
        'counsellor',
        {
          action: 'record',
          input: {
            fee_id: studentFee.id,
            amount_paid: 5000,
            payment_mode: 'UPI',
            payment_date: new Date().toISOString().slice(0, 10),
            transaction_reference: `UPI-TEST-${Date.now()}`,
            idempotency_key: `idem-${Date.now()}`,
          },
        }
      );

      const res = await paymentsPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify the payment is in Pending status
      const payment = json.payment;
      expect(payment).toBeDefined();
      expect(['Pending', 'Pending Approval']).toContain(payment.status);
      expect(payment.verification_status).toBe('Pending Verification');

      // Verify no official receipt has been issued
      expect(payment.receipt_number).toBeFalsy();
      const finalReceiptsCount = (store.receipts || []).length;
      expect(finalReceiptsCount).toBe(initialReceiptsCount);

      // Verify verified collections did NOT increase
      const finalVerifiedCollections = (store.payments || [])
        .filter((p: any) => p.status === 'Success' || p.status === 'Approved')
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      expect(finalVerifiedCollections).toBe(initialVerifiedCollections);
    });

    it('Counsellor cannot verify their own recorded payment (separation of duties violation 403)', async () => {
      const counsellorId = 'usr-counsellor-01';
      // Find a payment recorded by this counsellor
      const pendingPayment = store.studentPayments.find((p: any) => p.status === 'Pending' || p.status === 'Pending Approval') || {
        id: 'pay-pending-counsellor',
        fee_id: store.studentFees[0].id,
        amount_paid: 5000,
        status: 'Pending',
        recorded_by: counsellorId,
        tenant_id: 'default',
      };
      if (!store.studentPayments.includes(pendingPayment as any)) {
        store.studentPayments.push(pendingPayment as any);
      }

      const req = createMockAuthRequest(
        'http://localhost:3000/api/fees/payments',
        'POST',
        'counsellor',
        {
          action: 'approve',
          paymentId: pendingPayment.id,
          notes: 'Self-approval attempt',
        },
        { userId: counsellorId }
      );

      const res = await paymentsPost(req);
      expect(res.status).toBe(403);
    });

    it('rejects UPI payment when transaction reference is missing (HTTP 400 Bad Request)', async () => {
      const studentFee = store.studentFees[0];
      const req = createMockAuthRequest(
        'http://localhost:3000/api/fees/payments',
        'POST',
        'counsellor',
        {
          action: 'record',
          input: {
            fee_id: studentFee.id,
            amount_paid: 1000,
            payment_mode: 'UPI',
            payment_date: new Date().toISOString().slice(0, 10),
            idempotency_key: `idem-missing-ref-${Date.now()}`,
            // transaction_reference intentionally omitted
          },
        }
      );

      const res = await paymentsPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Transaction reference is required');
    });

    it('rejects payment with invalid timestamp format instead of YYYY-MM-DD (HTTP 400 Bad Request)', async () => {
      const studentFee = store.studentFees[0];
      const req = createMockAuthRequest(
        'http://localhost:3000/api/fees/payments',
        'POST',
        'counsellor',
        {
          action: 'record',
          input: {
            fee_id: studentFee.id,
            amount_paid: 1000,
            payment_mode: 'UPI',
            payment_date: '2026-11-27T10:00:00.000Z', // Invalid datetime string
            transaction_reference: `UPI-INVALID-DATE-${Date.now()}`,
            idempotency_key: `idem-invalid-date-${Date.now()}`,
          },
        }
      );

      const res = await paymentsPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Invalid string: must match pattern|Invalid payment date|valid calendar date/i);
    });

    it('rejects payment exceeding the outstanding balance (HTTP 400 Bad Request)', async () => {
      const studentFee = store.studentFees[0];
      const outstandingDue = Number((studentFee.final_payable - studentFee.paid_amount).toFixed(2));
      const excessiveAmount = outstandingDue + 10000;

      const req = createMockAuthRequest(
        'http://localhost:3000/api/fees/payments',
        'POST',
        'counsellor',
        {
          action: 'record',
          input: {
            fee_id: studentFee.id,
            amount_paid: excessiveAmount,
            payment_mode: 'UPI',
            payment_date: new Date().toISOString().slice(0, 10),
            transaction_reference: `UPI-OVERPAY-${Date.now()}`,
            idempotency_key: `idem-overpay-${Date.now()}`,
          },
        }
      );

      const res = await paymentsPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Payment exceeds the outstanding fee balance');
    });

    it('rejects duplicate transaction reference in same tenant (HTTP 400 Bad Request)', async () => {
      const studentFee = store.studentFees[0];
      const duplicateRef = `UPI-DUP-REF-${Date.now()}`;

      // First payment
      const req1 = createMockAuthRequest(
        'http://localhost:3000/api/fees/payments',
        'POST',
        'counsellor',
        {
          action: 'record',
          input: {
            fee_id: studentFee.id,
            amount_paid: 500,
            payment_mode: 'UPI',
            payment_date: new Date().toISOString().slice(0, 10),
            transaction_reference: duplicateRef,
            idempotency_key: `idem-dup-1-${Date.now()}`,
          },
        }
      );
      const res1 = await paymentsPost(req1);
      expect(res1.status).toBe(200);

      // Replay with exact same transaction reference but different idempotency key
      const req2 = createMockAuthRequest(
        'http://localhost:3000/api/fees/payments',
        'POST',
        'counsellor',
        {
          action: 'record',
          input: {
            fee_id: studentFee.id,
            amount_paid: 500,
            payment_mode: 'UPI',
            payment_date: new Date().toISOString().slice(0, 10),
            transaction_reference: duplicateRef,
            idempotency_key: `idem-dup-2-${Date.now()}`,
          },
        }
      );
      const res2 = await paymentsPost(req2);
      expect(res2.status).toBe(400);
      const json2 = await res2.json();
      expect(json2.success).toBe(false);
      expect(json2.error).toContain('Duplicate transaction reference');
    });
  });
});
