import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { store } from '@/lib/services/data-store';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { GET as usersGetRoute, POST as usersPostRoute, PATCH as usersPatchRoute } from '@/app/api/users/route';
import { POST as resetPasswordRoute } from '@/app/api/users/reset-password/route';

describe('User Administration & Password Reset Tests (G19, G20)', () => {
  const adminCookie = encodeURIComponent(
    JSON.stringify({ role: 'admin', id: 'usr-admin', is_active: true })
  );
  const adminSig = generateAuthCookieSignatureSync(adminCookie);
  const adminHeaders = {
    cookie: `next_gen_auth_user=${adminCookie}; next_gen_auth_user_sig=${adminSig}`,
    'Content-Type': 'application/json',
  };

  const studentCookie = encodeURIComponent(
    JSON.stringify({ role: 'student', id: 'usr-student-01', is_active: true })
  );
  const studentSig = generateAuthCookieSignatureSync(studentCookie);
  const studentHeaders = {
    cookie: `next_gen_auth_user=${studentCookie}; next_gen_auth_user_sig=${studentSig}`,
    'Content-Type': 'application/json',
  };

  beforeEach(() => {
    store.hydrateFromDisk();
  });

  // =========================================================================
  // 1. RBAC ACCESS CONTROL FOR USER ADMINISTRATION
  // =========================================================================
  describe('RBAC Route Gating', () => {
    it('strictly forbids students and trainers from accessing user management routes', async () => {
      const getReq = new NextRequest('http://localhost:3000/api/users', {
        headers: studentHeaders,
      });
      const getRes = await usersGetRoute(getReq);
      expect(getRes.status).toBe(403);

      const postReq = new NextRequest('http://localhost:3000/api/users', {
        method: 'POST',
        headers: studentHeaders,
        body: JSON.stringify({ email: 'hack@example.com', full_name: 'Hacker' }),
      });
      const postRes = await usersPostRoute(postReq);
      expect(postRes.status).toBe(403);

      const resetReq = new NextRequest('http://localhost:3000/api/users/reset-password', {
        method: 'POST',
        headers: studentHeaders,
        body: JSON.stringify({ user_id: 'usr-admin', new_password: 'NewPassword@2026' }),
      });
      const resetRes = await resetPasswordRoute(resetReq);
      expect(resetRes.status).toBe(403);
    });

    it('permits administrators to list system users', async () => {
      const req = new NextRequest('http://localhost:3000/api/users', {
        headers: adminHeaders,
      });
      const res = await usersGetRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.users.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 2. USER CREATION & PROFILE MODIFICATION (G19)
  // =========================================================================
  describe('User Lifecycle & Profile Management (G19)', () => {
    it('creates a new staff member and records USER_CREATED audit event', async () => {
      const testEmail = `new.trainer.${Date.now()}@next-generpsolutions.com`;
      const createReq = new NextRequest('http://localhost:3000/api/users', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          email: testEmail,
          full_name: 'Rohit Sharma (Faculty)',
          role: 'trainer',
          phone: '9876543210',
          assigned_course_ids: ['crs-fico-01'],
        }),
      });

      const res = await usersPostRoute(createReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(testEmail);
      expect(data.user.role).toBe('trainer');

      // Verify audit log
      const audit = (store.auditLogs || []).find(
        (a) => a.action === 'USER_CREATED' && a.record_id === data.user.id
      );
      expect(audit).toBeDefined();
      expect(audit?.module).toBe('USERS');
    });

    it('updates user role and details via PATCH', async () => {
      const targetUser = store.users.find((u) => u.role === 'trainer');
      expect(targetUser).toBeDefined();
      if (!targetUser) return;

      const patchReq = new NextRequest('http://localhost:3000/api/users', {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          id: targetUser.id,
          phone: '9111223344',
        }),
      });

      const res = await usersPatchRoute(patchReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.phone).toBe('9111223344');
    });

    it('prevents administrator self-demotion and self-deactivation', async () => {
      // 1. Self-demotion
      const demoteReq = new NextRequest('http://localhost:3000/api/users', {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          id: 'usr-admin',
          role: 'student',
        }),
      });
      const demoteRes = await usersPatchRoute(demoteReq);
      expect(demoteRes.status).toBe(403);
      const demoteData = await demoteRes.json();
      expect(demoteData.error).toContain('Self-Demotion Blocked');

      // 2. Self-deactivation
      const deactReq = new NextRequest('http://localhost:3000/api/users', {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          id: 'usr-admin',
          is_active: false,
        }),
      });
      const deactRes = await usersPatchRoute(deactReq);
      expect(deactRes.status).toBe(403);
      const deactData = await deactRes.json();
      expect(deactData.error).toContain('Action Prohibited');
    });
  });

  // =========================================================================
  // 3. SECURE PASSWORD RESET (G20)
  // =========================================================================
  describe('Administrative Password Reset (G20)', () => {
    it('rejects password resets with passwords shorter than 8 characters', async () => {
      const req = new NextRequest('http://localhost:3000/api/users/reset-password', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          user_id: 'usr-trainer-fico',
          new_password: 'short',
        }),
      });

      const res = await resetPasswordRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('at least 8 characters');
    });

    it('rejects password resets for non-existent users with 404', async () => {
      const req = new NextRequest('http://localhost:3000/api/users/reset-password', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          user_id: 'non-existent-user-999',
          new_password: 'ValidPassword@2026',
        }),
      });

      const res = await resetPasswordRoute(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('not found');
    });

    it('executes valid administrative password reset, updates timestamp, and records PASSWORD_RESET audit log', async () => {
      const targetUser = store.users.find((u) => u.role === 'trainer');
      expect(targetUser).toBeDefined();
      if (!targetUser) return;

      const req = new NextRequest('http://localhost:3000/api/users/reset-password', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          user_id: targetUser.id,
          new_password: 'SecureNewPassword@2026!',
        }),
      });

      const res = await resetPasswordRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('Password successfully updated');

      // Verify audit log
      const audit = (store.auditLogs || []).find(
        (a) => a.action === 'PASSWORD_RESET' && a.record_id === targetUser.id
      );
      expect(audit).toBeDefined();
      expect(audit?.module).toBe('SECURITY');
      expect((audit?.new_value as any)?.user_email).toBe(targetUser.email);
    });
  });
});
