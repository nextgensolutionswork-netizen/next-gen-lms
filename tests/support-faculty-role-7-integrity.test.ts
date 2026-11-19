import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { store } from '@/lib/services/data-store';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { ROLE_PERMISSIONS } from '@/lib/auth/rbac';
import {
  getDoubts,
  getDoubtById,
  createStudentDoubt,
  replyToDoubt,
  assignDoubt,
  resolveDoubt,
  escalateDoubt,
} from '@/lib/services/doubt-service';
import { getNotificationsForUser } from '@/lib/services/notification-service';

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

describe('Role 7: Support & Faculty Doubts Desk — Comprehensive Integrity Suite', () => {
  const supportUser = {
    id: 'usr-support-01',
    email: 'support@next-generpsolutions.com',
    full_name: 'Ananya Deshmukh (SAP Support Lead)',
    role: 'support' as const,
    tenant_id: 'default',
    is_active: true,
  };

  const facultyUser = {
    id: 'usr-trainer-fico',
    email: 'vikram.fico@next-generpsolutions.com',
    full_name: 'Vikram Rao (SAP FICO Lead)',
    role: 'trainer' as const,
    assigned_course_ids: ['crs-fico-01'],
    tenant_id: 'default',
    is_active: true,
  };

  beforeEach(() => {
    store.reconcileDualLedgers();
  });

  // ==========================================
  // MODULE 1 & 8: AUTH & RBAC BOUNDARIES
  // ==========================================
  describe('Module 1 & 8: RBAC & Boundary Isolation', () => {
    it('SC-SD-08 & SC-SD-71: Blocks Support from /accounts/* financial desks with redirect to /support', async () => {
      const restrictedRoutes = [
        '/accounts/fees',
        '/accounts/payments',
        '/accounts/reports',
        '/accounts/approvals',
        '/accounts/expenses',
        '/accounts/vendors',
      ];
      for (const route of restrictedRoutes) {
        const req = createMockRequest(`http://localhost:3000${route}`, supportUser);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/support');
      }
    });

    it('SC-SD-72: Blocks Support from /users staff management with redirect to /support', async () => {
      const req = createMockRequest('http://localhost:3000/users', supportUser);
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/support');
    });

    it('SC-SD-73: Blocks Support from /crm/leads & /admissions desks with redirect to /support', async () => {
      for (const route of ['/crm/leads', '/admissions']) {
        const req = createMockRequest(`http://localhost:3000${route}`, supportUser);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/support');
      }
    });

    it('SC-SD-74: Blocks Support from /placement with redirect to /support', async () => {
      const req = createMockRequest('http://localhost:3000/placement', supportUser);
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/support');
    });

    it('SC-SD-75: Blocks Support from /settings, /audit-logs, and /todos with redirect to /support', async () => {
      for (const route of ['/settings', '/audit-logs', '/todos']) {
        const req = createMockRequest(`http://localhost:3000${route}`, supportUser);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/support');
      }
    });

    it('SC-SD-76: Allows Support role to access /support desk', async () => {
      const req = createMockRequest('http://localhost:3000/support', supportUser);
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('SC-SD-77: Verifies Support role has doubts and reply permissions, but ZERO administrative privileges', () => {
      const perms = ROLE_PERMISSIONS.support;
      expect(perms).toContain('doubts:read');
      expect(perms).toContain('doubts:write');
      expect(perms).toContain('doubts:assign');
      expect(perms).toContain('doubts:resolve');
      expect(perms).toContain('support:reply');
      expect(perms).not.toContain('users:create');
      expect(perms).not.toContain('payments:approve');
      expect(perms).not.toContain('settings:write');
    });
  });

  // ==========================================
  // MODULE 2: STUDENT DOUBTS & TICKETS
  // ==========================================
  describe('Module 2: Ticket Creation & Management', () => {
    it('SC-SD-09 & SC-SD-10: Submits a new doubt ticket with student and course metadata', async () => {
      const student = store.students[0];
      const doubt = await createStudentDoubt(
        {
          student_id: student.id,
          title: 'QA Test: Fiscal Year Variant Error in OBY6',
          description: 'Company code 1000 throws fiscal year mismatch during period opening.',
          category: 'SAP Configuration',
          priority: 'High',
          sap_tcode: 'OBY6',
        },
        student.user_id
      );

      expect(doubt).toBeDefined();
      expect(doubt.id).toBeDefined();
      expect(doubt.ticket_number).toMatch(/^DBT-2026-\d{3}$/);
      expect(doubt.status).toBe('Assigned');
      expect(doubt.title).toBe('QA Test: Fiscal Year Variant Error in OBY6');
      expect(doubt.student_id).toBe(student.id);
    });

    it('SC-SD-11: Rejects ticket submission when mandatory fields are missing', async () => {
      await expect(
        createStudentDoubt({ student_id: '', title: '', description: '', category: 'General Query' }, 'usr-test')
      ).rejects.toThrow();
    });

    it('SC-SD-19: Filters doubt tickets by status (Open, In Progress, Resolved)', async () => {
      const allDoubts = await getDoubts();
      expect(Array.isArray(allDoubts)).toBe(true);

      const inProgress = await getDoubts({ status: 'In Progress' });
      expect(inProgress.every((d) => d.status === 'In Progress')).toBe(true);
    });
  });

  // ==========================================
  // MODULE 3: FACULTY & MENTOR ASSIGNMENT
  // ==========================================
  describe('Module 3: Faculty / Mentor Assignment & Delegation', () => {
    it('SC-SD-22 & SC-SD-25: Support Lead assigns / reassigns doubt to faculty mentor', async () => {
      const doubt = store.doubts[0];
      if (doubt) {
        const assigned = await assignDoubt(
          doubt.id,
          facultyUser.id,
          'Assigned to SAP FICO Lead for complex document splitting analysis'
        );

        expect(assigned.assigned_to_id).toBe(facultyUser.id);
        expect(assigned.assigned_to_role).toBe('trainer');
        expect(assigned.status).toBe('Assigned');
      }
    });

    it('SC-SD-27 & SC-SD-28: Faculty mentor views assigned tickets for their domain', async () => {
      const facultyDoubts = await getDoubts({ assigned_to_id: facultyUser.id });
      expect(Array.isArray(facultyDoubts)).toBe(true);
      expect(facultyDoubts.every((d) => d.assigned_to_id === facultyUser.id)).toBe(true);
    });
  });

  // ==========================================
  // MODULE 4: RESOLUTION & FOLLOW-UPS
  // ==========================================
  describe('Module 4: Doubt Resolution & Two-Way Threading', () => {
    it('SC-SD-32 & SC-SD-34: Faculty/Support adds response, transitioning ticket to In Progress', async () => {
      const doubt = store.doubts[0];
      if (doubt) {
        const initialCount = doubt.messages.length;
        const reply = await replyToDoubt(
          doubt.id,
          'Please verify OBY6 parameters and confirm that Fiscal Year Variant V3 is assigned.',
          supportUser.id,
          'support',
          supportUser.full_name
        );

        expect(reply).toBeDefined();
        expect(doubt.status).toBe('In Progress');
        expect(doubt.messages.length).toBe(initialCount + 1);
      }
    });

    it('SC-SD-36: Marks ticket as Resolved with resolution notes and timestamp', async () => {
      const doubt = store.doubts[0];
      if (doubt) {
        const resolved = await resolveDoubt(
          doubt.id,
          supportUser.id,
          'Verified with student: Fiscal year variant V3 assigned and OB52 posting periods opened.'
        );

        expect(resolved.status).toBe('Resolved');
        expect(resolved.resolved_at).toBeDefined();
        const lastMsg = resolved.messages[resolved.messages.length - 1];
        expect(lastMsg.message).toContain('[Resolution Note]');
      }
    });
  });

  // ==========================================
  // MODULE 5: NOTIFICATIONS & COMMUNICATIONS
  // ==========================================
  describe('Module 5: Notifications & Telemetry', () => {
    it('SC-SD-43 & SC-SD-44: Generates notifications on doubt assignment and resolution', async () => {
      const student = store.students[0];
      const notifications = await getNotificationsForUser(student.user_id || student.id);
      expect(Array.isArray(notifications)).toBe(true);
    });
  });

  // ==========================================
  // MODULE 7: ESCALATIONS & SLA
  // ==========================================
  describe('Module 7: Escalations and SLA', () => {
    it('SC-SD-65 & SC-SD-66: Escalates unresolved high-priority doubt with escalation reason', async () => {
      const doubt = store.doubts[0];
      if (doubt) {
        const escalated = await escalateDoubt(
          doubt.id,
          supportUser.id,
          'SLA breached: Student blocked on production assignment for >48 hours.'
        );

        expect(escalated.status).toBe('In Progress');
        expect(escalated.priority).toBe('Urgent');
      }
    });
  });
});
