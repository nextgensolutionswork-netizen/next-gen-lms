import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as backupGetHandler, POST as backupPostHandler } from '@/app/api/database/backup/route';
import { POST as syncPostHandler } from '@/app/api/database/sync/route';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { store } from '@/lib/services/data-store';

describe('Database API Endpoints RBAC & Security (G28 & G29)', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
  });

  describe('1. Database Backup Snapshot Security (/api/database/backup)', () => {
    it('rejects unauthenticated GET /api/database/backup with 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost:3000/api/database/backup');
      const res = await backupGetHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('rejects regular admin and student attempting GET /api/database/backup with 403 Forbidden', async () => {
      // Regular admin (not super_admin)
      const adminCookie = encodeURIComponent(
        JSON.stringify({ role: 'admin', id: 'usr-admin', is_active: true })
      );
      const adminSig = generateAuthCookieSignatureSync(adminCookie);
      const adminReq = new NextRequest('http://localhost:3000/api/database/backup', {
        headers: {
          cookie: `next_gen_auth_user=${adminCookie}; next_gen_auth_user_sig=${adminSig}`,
        },
      });

      const adminRes = await backupGetHandler(adminReq);
      expect(adminRes.status).toBe(403);
      const adminData = await adminRes.json();
      expect(adminData.success).toBe(false);
      expect(adminData.error).toContain('Forbidden');

      // Student
      const studentCookie = encodeURIComponent(
        JSON.stringify({ role: 'student', id: 'usr-student-01', is_active: true })
      );
      const studentSig = generateAuthCookieSignatureSync(studentCookie);
      const studentReq = new NextRequest('http://localhost:3000/api/database/backup', {
        headers: {
          cookie: `next_gen_auth_user=${studentCookie}; next_gen_auth_user_sig=${studentSig}`,
        },
      });

      const studentRes = await backupGetHandler(studentReq);
      expect(studentRes.status).toBe(403);
    });

    it('permits super_admin to export database backup snapshot with 200', async () => {
      const superAdminCookie = encodeURIComponent(
        JSON.stringify({ role: 'super_admin', id: 'usr-superadmin', is_active: true })
      );
      const superAdminSig = generateAuthCookieSignatureSync(superAdminCookie);
      const req = new NextRequest('http://localhost:3000/api/database/backup', {
        headers: {
          cookie: `next_gen_auth_user=${superAdminCookie}; next_gen_auth_user_sig=${superAdminSig}`,
        },
      });

      const res = await backupGetHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.version).toBe('1.0.0');
      expect(data.timestamp).toBeDefined();
      expect(data.store).toBeDefined();
    });

    it('rejects unauthenticated POST /api/database/backup with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/database/backup', {
        method: 'POST',
      });
      const res = await backupPostHandler(req);
      expect(res.status).toBe(401);
    });

    it('permits super_admin to trigger database snapshot creation with 200', async () => {
      const superAdminCookie = encodeURIComponent(
        JSON.stringify({ role: 'super_admin', id: 'usr-superadmin', is_active: true })
      );
      const superAdminSig = generateAuthCookieSignatureSync(superAdminCookie);
      const req = new NextRequest('http://localhost:3000/api/database/backup', {
        method: 'POST',
        headers: {
          cookie: `next_gen_auth_user=${superAdminCookie}; next_gen_auth_user_sig=${superAdminSig}`,
        },
      });

      const res = await backupPostHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.filename).toBeDefined();
    });
  });

  describe('2. Database Sync Security & Error Handling (/api/database/sync)', () => {
    it('rejects unauthenticated POST /api/database/sync with 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost:3000/api/database/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'pull' }),
      });

      const res = await syncPostHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('rejects trainer or counsellor attempting POST /api/database/sync with 403', async () => {
      const trainerCookie = encodeURIComponent(
        JSON.stringify({ role: 'trainer', id: 'usr-trainer-fico', is_active: true })
      );
      const trainerSig = generateAuthCookieSignatureSync(trainerCookie);
      const req = new NextRequest('http://localhost:3000/api/database/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `next_gen_auth_user=${trainerCookie}; next_gen_auth_user_sig=${trainerSig}`,
        },
        body: JSON.stringify({ direction: 'push' }),
      });

      const res = await syncPostHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Forbidden');
    });

    it('permits super_admin to execute database sync and returns structured result', async () => {
      const superAdminCookie = encodeURIComponent(
        JSON.stringify({ role: 'super_admin', id: 'usr-superadmin', is_active: true })
      );
      const superAdminSig = generateAuthCookieSignatureSync(superAdminCookie);
      const req = new NextRequest('http://localhost:3000/api/database/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `next_gen_auth_user=${superAdminCookie}; next_gen_auth_user_sig=${superAdminSig}`,
        },
        body: JSON.stringify({ direction: 'pull' }),
      });

      const res = await syncPostHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.direction).toBe('pull');
      expect(Array.isArray(data.data.errors)).toBe(true);
    });
  });
});
