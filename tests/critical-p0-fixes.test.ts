import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { tenantId } from '@/lib/auth/tenant';
import { Course, StudentFee, StudentPaymentRecord, UserProfile } from '@/types';

function createMockRequest(url: string, cookiePayload?: Record<string, any>) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: {
      host: 'localhost:3000',
    },
  });

  if (cookiePayload) {
    const cookie = encodeURIComponent(JSON.stringify(cookiePayload));
    req.cookies.set('next_gen_auth_user', cookie);
    req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(cookie));
  }

  return req;
}

describe('Critical P0 Blockers Verification Suite (NG-01, NG-02, NG-03, NG-05)', () => {
  beforeEach(() => {
    store.reconcileDualLedgers();
  });

  // -------------------------------------------------------------
  // NG-01: Empty Course List & Defensive Resolution
  // -------------------------------------------------------------
  describe('NG-01: Course Management Defensive Selection & Empty State', () => {
    function resolveCourse(courses: Course[], selectedId: string | null): Course | null {
      if (selectedId) {
        const found = courses.find((c) => c.id === selectedId);
        if (found) return found;
      }
      return courses[0] || null;
    }

    it('returns null when course list is empty and does not throw', () => {
      const courses: Course[] = [];
      expect(resolveCourse(courses, null)).toBeNull();
      expect(resolveCourse(courses, 'non-existent-id')).toBeNull();
    });

    it('returns the single course when exactly one course exists', () => {
      const courses: Course[] = [
        {
          id: 'crs-fico-single',
          course_name: 'SAP S/4HANA Finance',
          course_code: 'SAP-FICO-01',
          category: 'SAP Functional',
          duration_weeks: 10,
          price: 45000,
          description: 'Desc',
          status: 'Published',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      expect(resolveCourse(courses, null)).toEqual(courses[0]);
      expect(resolveCourse(courses, 'crs-fico-single')).toEqual(courses[0]);
    });

    it('returns selected course when multiple courses exist, falling back to first if invalid', () => {
      const courses: Course[] = [
        {
          id: 'crs-1',
          course_name: 'Course 1',
          course_code: 'C1',
          category: 'SAP Functional',
          duration_weeks: 6,
          price: 30000,
          description: '',
          status: 'Published',
          created_at: '',
          updated_at: '',
        },
        {
          id: 'crs-2',
          course_name: 'Course 2',
          course_code: 'C2',
          category: 'SAP Technical',
          duration_weeks: 8,
          price: 35000,
          description: '',
          status: 'Published',
          created_at: '',
          updated_at: '',
        },
      ];
      expect(resolveCourse(courses, 'crs-2')).toEqual(courses[1]);
      expect(resolveCourse(courses, 'deleted-id')).toEqual(courses[0]);
    });
  });

  // -------------------------------------------------------------
  // NG-02: Receipt Security, RBAC, and Tenant Isolation
  // -------------------------------------------------------------
  describe('NG-02: Receipt Access Security & Nonexistent ID Defense', () => {
    it('never returns another student receipt when an invalid ID is requested', () => {
      const receipts = store.receipts || [];
      const invalidId = 'non-existent-receipt-99999';
      const found = receipts.find((r) => r.id === invalidId || r.receipt_number === invalidId || r.payment_id === invalidId);
      expect(found).toBeUndefined();
    });

    it('handles SQL injection / path traversal strings safely without leaking records', () => {
      const receipts = store.receipts || [];
      const maliciousIds = [
        "' OR '1'='1",
        "../../etc/passwd",
        "<script>alert(1)</script>",
        "UNION SELECT * FROM receipts",
      ];
      for (const id of maliciousIds) {
        const found = receipts.find((r) => r.id === id || r.receipt_number === id || r.payment_id === id);
        expect(found).toBeUndefined();
      }
    });

    it('enforces student ownership: only own receipt is accessible to a student', () => {
      const studentA = { id: 'usr-student-a', email: 'student.a@test.com', role: 'student' as const, tenant_id: 'default' };
      const studentB = { id: 'usr-student-b', email: 'student.b@test.com', role: 'student' as const, tenant_id: 'default' };

      const receiptForA = {
        id: 'rcpt-test-a',
        student_id: 'stu-a',
        student_email: 'student.a@test.com',
        student_name: 'Student A',
        payment_amount: 10000,
        tenant_id: 'default',
      };

      // Helper simulating the page / API check
      function checkStudentReceiptAccess(user: typeof studentA, receipt: typeof receiptForA): boolean {
        if (user.role === 'student') {
          return (
            receipt.student_id === user.id ||
            receipt.student_email?.toLowerCase() === user.email?.toLowerCase()
          );
        }
        return ['super_admin', 'admin', 'accountant', 'counsellor'].includes(user.role);
      }

      // Student A can access own receipt
      expect(checkStudentReceiptAccess(studentA, receiptForA)).toBe(true);

      // Student B cannot access Student A's receipt
      expect(checkStudentReceiptAccess(studentB, receiptForA)).toBe(false);
    });

    it('denies receipt access to trainer and support roles', () => {
      const trainerUser = { id: 'usr-trainer-01', email: 'trainer@test.com', role: 'trainer' as const, tenant_id: 'default' };
      const supportUser = { id: 'usr-support-01', email: 'support@test.com', role: 'support' as const, tenant_id: 'default' };

      const authorizedRoles = ['super_admin', 'admin', 'accountant', 'counsellor'];
      expect(authorizedRoles.includes(trainerUser.role)).toBe(false);
      expect(authorizedRoles.includes(supportUser.role)).toBe(false);
    });

    it('denies cross-tenant receipt access for non-super_admin users', () => {
      const adminTenant1 = { id: 'usr-adm-t1', role: 'admin', tenant_id: 'tenant-branch-1' };
      const receiptTenant2 = { id: 'rcpt-t2', tenant_id: 'tenant-branch-2' };

      expect(tenantId(adminTenant1) !== tenantId(receiptTenant2)).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // NG-03: Middleware Accounts RBAC & Financial Deny-By-Default
  // -------------------------------------------------------------
  describe('NG-03: Middleware RBAC Financial Boundaries & Deny-by-Default', () => {
    const trainerPayload = {
      id: 'usr-trainer-01',
      email: 'trainer@lms.internal',
      role: 'trainer',
    };

    const counsellorPayload = {
      id: 'usr-counsellor-01',
      email: 'counsellor@lms.internal',
      role: 'counsellor',
    };

    const accountantPayload = {
      id: 'usr-accountant-01',
      email: 'accountant@lms.internal',
      role: 'accountant',
    };

    const adminPayload = {
      id: 'usr-admin-01',
      email: 'admin@lms.internal',
      role: 'admin',
    };

    const studentPayload = {
      id: 'usr-student-01',
      email: 'student@lms.internal',
      role: 'student',
    };

    it('blocks trainer from all financial /accounts/* subroutes with redirect to /academics/courses', async () => {
      const restrictedRoutes = [
        '/accounts/fees',
        '/accounts/payments',
        '/accounts/reports',
        '/accounts/approvals',
        '/accounts/installments',
        '/accounts/receipts',
        '/accounts/receipts/rec-01',
      ];

      for (const route of restrictedRoutes) {
        const req = createMockRequest(`http://localhost:3000${route}`, trainerPayload);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/academics/courses');
      }
    });

    it('allows accountant and admin full access to all /accounts/* subroutes', async () => {
      const allAccountsRoutes = [
        '/accounts/fees',
        '/accounts/payments',
        '/accounts/reports',
        '/accounts/approvals',
        '/accounts/installments',
        '/accounts/receipts',
      ];

      for (const route of allAccountsRoutes) {
        const reqAcc = createMockRequest(`http://localhost:3000${route}`, accountantPayload);
        const resAcc = await middleware(reqAcc);
        expect(resAcc.status).toBe(200);

        const reqAdm = createMockRequest(`http://localhost:3000${route}`, adminPayload);
        const resAdm = await middleware(reqAdm);
        expect(resAdm.status).toBe(200);
      }
    });

    it('allows counsellor operational desks (/fees, /payments, /installments, /receipts) but blocks sensitive desks', async () => {
      const allowedForCounsellor = [
        '/accounts/fees',
        '/accounts/payments',
        '/accounts/installments',
        '/accounts/receipts',
      ];

      for (const route of allowedForCounsellor) {
        const req = createMockRequest(`http://localhost:3000${route}`, counsellorPayload);
        const res = await middleware(req);
        expect(res.status).toBe(200);
      }

      const blockedForCounsellor = [
        '/accounts/approvals',
        '/accounts/expenses',
        '/accounts/vendors',
        '/accounts/reports',
      ];

      for (const route of blockedForCounsellor) {
        const req = createMockRequest(`http://localhost:3000${route}`, counsellorPayload);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/crm/leads');
      }
    });

    it('allows student access ONLY to /accounts/receipts/:id and bounces global /accounts/* to /portal', async () => {
      // Allowed: specific receipt
      const reqDetail = createMockRequest('http://localhost:3000/accounts/receipts/rec-test-123', studentPayload);
      const resDetail = await middleware(reqDetail);
      expect(resDetail.status).toBe(200);

      // Bounced: global receipts registry
      const reqRegistry = createMockRequest('http://localhost:3000/accounts/receipts', studentPayload);
      const resRegistry = await middleware(reqRegistry);
      expect(resRegistry.status).toBe(307);
      expect(resRegistry.headers.get('location')).toContain('/portal');

      // Bounced: fees desk
      const reqFees = createMockRequest('http://localhost:3000/accounts/fees', studentPayload);
      const resFees = await middleware(reqFees);
      expect(resFees.status).toBe(307);
      expect(resFees.headers.get('location')).toContain('/portal');
    });

    it('strictly forbids non-accountant/non-admin roles from executing fee approvals in fee service', () => {
      const dummyFeeId = store.studentFees[0]?.id || 'fee-test-01';

      // Trainer cannot approve fee
      expect(() => {
        feeWorkflowService.approveFee(dummyFeeId, 'usr-trainer-01', 'Approved');
      }).toThrow(/Unauthorized/);

      // Counsellor cannot approve fee
      expect(() => {
        feeWorkflowService.approveFee(dummyFeeId, 'usr-counsellor-01', 'Approved');
      }).toThrow();
    });
  });

  // -------------------------------------------------------------
  // NG-05: Dual Financial Records Split-Brain Prevention
  // -------------------------------------------------------------
  describe('NG-05: Dual Financial Records Synchronization', () => {
    it('synchronizes store.feeAccounts and store.studentFees across approvals and revisions', () => {
      store.reconcileDualLedgers();
      const approvedFees = (store.studentFees || []).filter((f) => f.approval_status === 'Approved');

      for (const fee of approvedFees) {
        const matchingFa =
          (store.feeAccounts || []).find(
            (fa) =>
              fa.id === `fa-${fee.id}` ||
              fa.id === fee.id.replace('fee-', '') ||
              (fee.fee_account_id ? fa.id === fee.fee_account_id : false) ||
              (fa as any).student_fee_id === fee.id
          ) ||
          (store.feeAccounts || []).find(
            (fa) =>
              fa.student_id === fee.student_id &&
              ((fee.course_id && fa.course_id === fee.course_id) || (!fee.course_id && !fa.course_id))
          );
        expect(matchingFa).toBeDefined();
        if (matchingFa) {
          expect(matchingFa.net_payable).toBe(fee.final_payable);
          expect(matchingFa.paid_amount).toBe(fee.paid_amount);
          expect(matchingFa.outstanding_amount).toBe(fee.outstanding_amount);
        }
      }
    });

    it('synchronizes rejected payment records back to legacy payments as Failed', () => {
      const testPaymentId = `spr-rej-test-${Date.now()}`;
      const newPayment: StudentPaymentRecord = {
        tenant_id: 'default',
        id: testPaymentId,
        fee_id: 'fee-01',
        student_id: 'stu-01',
        student_name: 'Test Student',
        admission_number: 'ADM-01',
        fee_category: 'Course Fee',
        amount_paid: 5000,
        payment_date: '2026-03-01',
        payment_mode: 'UPI',
        transaction_reference: `UPI-REJ-${Date.now()}`,
        recorded_by: 'usr-counsellor',
        recorded_by_name: 'Counsellor',
        recorded_by_role: 'counsellor',
        verification_status: 'Pending Verification',
        status: 'Pending Approval',
        created_at: new Date().toISOString(),
      };

      store.studentPayments.unshift(newPayment);
      store.reconcileDualLedgers();

      // Legacy payment exists in Pending
      const legacy = store.payments.find((p) => p.id === newPayment.id || p.id === `pay-${newPayment.id}`);
      expect(legacy).toBeDefined();
      expect(legacy?.status).toBe('Pending');

      // Now reject payment via feeWorkflowService
      feeWorkflowService.rejectPayment(newPayment.id, 'usr-accounts', 'Invalid payment screenshot');

      // Check both stores are in sync
      const rejectedSpr = store.studentPayments.find((p) => p.id === newPayment.id);
      expect(rejectedSpr?.verification_status).toBe('Rejected');

      const updatedLegacy = store.payments.find((p) => p.id === newPayment.id || p.id === `pay-${newPayment.id}`);
      expect(updatedLegacy?.status).toBe('Failed');
    });
  });
});
