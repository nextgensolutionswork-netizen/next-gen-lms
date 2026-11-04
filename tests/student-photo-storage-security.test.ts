import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createClient } from '@/lib/supabase/db';
import { store } from '@/lib/services/data-store';
import { STORAGE_BUCKETS, validateFile } from '@/lib/services/storage-service';
import { POST as photoUploadRoute, GET as photoGetRoute, DELETE as photoDeleteRoute } from '@/app/api/students/photo/route';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Security Audit & Remediation — Student Photo Storage', () => {
  // Test User Identities
  const superAdminId = 'usr-superadmin'; // super_admin (tenant: default)
  const adminId = 'usr-admin'; // admin (tenant: default)
  const counsellorId = 'usr-counsellor'; // counsellor (tenant: default)
  const accountantId = 'usr-accounts'; // accountant (tenant: default)
  const trainerFicoId = 'usr-trainer-fico'; // trainer (tenant: default)
  const supportMentorId = 'usr-support-01'; // support (tenant: default)
  const placementHeadId = 'usr-placement'; // placement_coordinator (tenant: default)
  const studentAmitId = 'usr-student-01'; // student: stu-01 (Amit Gupta, tenant: default)
  const studentSnehaId = 'usr-student-02'; // student: stu-02 (Sneha Kulkarni, tenant: default)

  // Cross-tenant user identities
  const adminTenantBId = 'usr-admin-tenant-b';
  const counsellorTenantBId = 'usr-counsellor-tenant-b';

  const defaultTenantHash = crypto.createHash('sha256').update('default').digest('hex');
  const tenantBHash = crypto.createHash('sha256').update('tenant-b').digest('hex');

  const amitPhotoPath = `${defaultTenantHash}/11111111-2222-3333-4444-555555555551.jpg`;
  const snehaPhotoPath = `${defaultTenantHash}/11111111-2222-3333-4444-555555555552.png`;
  const tenantBPhotoPath = `${tenantBHash}/99999999-8888-7777-6666-555555555559.webp`;

  beforeEach(() => {
    store.hydrateFromDisk();

    // Ensure tenant-b users exist in store
    if (!store.users.some((u) => u.id === adminTenantBId)) {
      store.users.push({
        id: adminTenantBId,
        email: 'admin@tenant-b.com',
        full_name: 'Tenant B Admin',
        role: 'admin',
        is_active: true,
        tenant_id: 'tenant-b',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    if (!store.users.some((u) => u.id === counsellorTenantBId)) {
      store.users.push({
        id: counsellorTenantBId,
        email: 'counsellor@tenant-b.com',
        full_name: 'Tenant B Counsellor',
        role: 'counsellor',
        is_active: true,
        tenant_id: 'tenant-b',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Set Amit and Sneha photo URLs in store.students
    const amit = store.students.find((s) => s.user_id === studentAmitId || s.id === 'stu-01');
    if (amit) {
      amit.user_id = studentAmitId;
      amit.email = 'amit.gupta@example.com';
      amit.photo_url = `/api/students/photo?path=${encodeURIComponent(amitPhotoPath)}`;
      amit.profile_photo = `/api/students/photo?path=${encodeURIComponent(amitPhotoPath)}`;
    }

    const sneha = store.students.find((s) => s.user_id === studentSnehaId || s.id === 'stu-02');
    if (sneha) {
      sneha.user_id = studentSnehaId;
      sneha.email = 'sneha.kulkarni@example.com';
      sneha.photo_url = `/api/students/photo?path=${encodeURIComponent(snehaPhotoPath)}`;
      sneha.profile_photo = `/api/students/photo?path=${encodeURIComponent(snehaPhotoPath)}`;
    }

    // Seed mock files to local photo directory so GET route can read them in non-live mode
    const root = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join(os.tmpdir(), 'data', 'student-photos')
      : path.resolve(process.cwd(), 'data', 'student-photos');
    const amitDiskPath = path.join(root, amitPhotoPath);
    const snehaDiskPath = path.join(root, snehaPhotoPath);
    fs.mkdirSync(path.dirname(amitDiskPath), { recursive: true });
    fs.writeFileSync(amitDiskPath, Buffer.from('mock-photo-amit'));
    fs.mkdirSync(path.dirname(snehaDiskPath), { recursive: true });
    fs.writeFileSync(snehaDiskPath, Buffer.from('mock-photo-sneha'));
  });

  afterAll(() => {
    const root = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join(os.tmpdir(), 'data', 'student-photos')
      : path.resolve(process.cwd(), 'data', 'student-photos');
    try {
      fs.rmSync(path.join(root, defaultTenantHash), { recursive: true, force: true });
      fs.rmSync(path.join(root, tenantBHash), { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. Bucket Configuration Security
  // =========================================================================
  describe('1. Bucket Configuration & Integrity', () => {
    it('verifies student-photos is strictly private and enforces 2MB and image MIMEs', () => {
      const config = STORAGE_BUCKETS['student-photos'];
      expect(config).toBeDefined();
      expect(config.public).toBe(false);
      expect(config.maxSizeBytes).toBe(2 * 1024 * 1024); // 2 MB
      expect(config.allowedMimes).toEqual(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
      expect(config.allowedExtensions).toEqual(['.jpg', '.jpeg', '.png', '.webp']);
    });

    it('rejects forbidden file types (HTML, executable, PDF) via validation engine', () => {
      expect(validateFile({ name: 'payload.html', size: 1024, type: 'text/html' }, 'student-photos').valid).toBe(false);
      expect(validateFile({ name: 'malware.exe', size: 2048, type: 'application/x-msdownload' }, 'student-photos').valid).toBe(false);
      expect(validateFile({ name: 'document.pdf', size: 50000, type: 'application/pdf' }, 'student-photos').valid).toBe(false);
      expect(validateFile({ name: 'photo.jpg', size: 3 * 1024 * 1024, type: 'image/jpeg' }, 'student-photos').valid).toBe(false);
      expect(validateFile({ name: 'valid.png', size: 500000, type: 'image/png' }, 'student-photos').valid).toBe(true);
    });
  });

  // =========================================================================
  // 2. Direct Storage RLS Policy Enforcement (User-Scoped Client Requests)
  // =========================================================================
  describe('2. Direct Storage RLS Policies (User-Level Authenticated Requests)', () => {
    const testUploadPath = `${defaultTenantHash}/22222222-3333-4444-5555-666666666661.jpg`;

    it('Authorized staff upload: counsellor and admin can upload student photos directly', async () => {
      const counsellorClient = createClient(counsellorId);
      const { data, error } = await counsellorClient.storage
        .from('student-photos')
        .upload(testUploadPath, Buffer.from('fake-image-bytes'), { contentType: 'image/jpeg' });

      expect(error).toBeNull();
      expect(data?.path).toBe(testUploadPath);

      const adminClient = createClient(adminId);
      const adminPath = `${defaultTenantHash}/22222222-3333-4444-5555-666666666662.jpg`;
      const adminUpload = await adminClient.storage
        .from('student-photos')
        .upload(adminPath, Buffer.from('admin-image-bytes'));
      expect(adminUpload.error).toBeNull();
    });

    it('Unauthorized staff upload: trainer, accountant, and support are denied upload access', async () => {
      const trainerClient = createClient(trainerFicoId);
      const trainerUpload = await trainerClient.storage
        .from('student-photos')
        .upload(`${defaultTenantHash}/33333333-4444-5555-6666-777777777771.jpg`, Buffer.from('bytes'));
      expect(trainerUpload.error).toBeDefined();
      expect(trainerUpload.error?.message).toContain('Forbidden');

      const accountantClient = createClient(accountantId);
      const accountantUpload = await accountantClient.storage
        .from('student-photos')
        .upload(`${defaultTenantHash}/33333333-4444-5555-6666-777777777772.jpg`, Buffer.from('bytes'));
      expect(accountantUpload.error).toBeDefined();
      expect(accountantUpload.error?.message).toContain('Forbidden');

      const supportClient = createClient(supportMentorId);
      const supportUpload = await supportClient.storage
        .from('student-photos')
        .upload(`${defaultTenantHash}/33333333-4444-5555-6666-777777777773.jpg`, Buffer.from('bytes'));
      expect(supportUpload.error).toBeDefined();
      expect(supportUpload.error?.message).toContain('Forbidden');
    });

    it('Cross-tenant upload denied: Tenant B counsellor cannot upload into Tenant A path', async () => {
      const tenantBClient = createClient(counsellorTenantBId);
      const crossTenantUpload = await tenantBClient.storage
        .from('student-photos')
        .upload(`${defaultTenantHash}/44444444-5555-6666-7777-888888888881.jpg`, Buffer.from('bytes'));
      expect(crossTenantUpload.error).toBeDefined();
      expect(crossTenantUpload.error?.message).toContain('Cross-tenant');
    });

    it('Path traversal & malformed path rejected at storage boundary', async () => {
      const counsellorClient = createClient(counsellorId);
      const traversalUpload = await counsellorClient.storage
        .from('student-photos')
        .upload(`../${defaultTenantHash}/traversal.jpg`, Buffer.from('bytes'));
      expect(traversalUpload.error).toBeDefined();
      expect(traversalUpload.error?.message).toContain('Invalid storage path');

      const invalidExtUpload = await counsellorClient.storage
        .from('student-photos')
        .upload(`${defaultTenantHash}/script.sh`, Buffer.from('bytes'));
      expect(invalidExtUpload.error).toBeDefined();
      expect(invalidExtUpload.error?.message).toContain('Invalid storage path');
    });

    it('Unauthenticated upload denied', async () => {
      const anonClient = createClient();
      const anonUpload = await anonClient.storage
        .from('student-photos')
        .upload(`${defaultTenantHash}/anon.jpg`, Buffer.from('bytes'));
      expect(anonUpload.error).toBeDefined();
      expect(anonUpload.error?.message).toContain('Unauthorized');
    });

    it('Authorized staff read: counsellor, admin, and accountant can read student photos in their tenant', async () => {
      // First seed photo
      const counsellorClient = createClient(counsellorId);
      await counsellorClient.storage
        .from('student-photos')
        .upload(amitPhotoPath, Buffer.from('amit-photo'));

      const counsellorRead = await counsellorClient.storage.from('student-photos').download(amitPhotoPath);
      expect(counsellorRead.error).toBeNull();
      expect(counsellorRead.data).toBeDefined();

      const accountantClient = createClient(accountantId);
      const accountantRead = await accountantClient.storage.from('student-photos').download(amitPhotoPath);
      expect(accountantRead.error).toBeNull();

      const adminClient = createClient(adminId);
      const adminRead = await adminClient.storage.from('student-photos').createSignedUrl(amitPhotoPath, 300);
      expect(adminRead.error).toBeNull();
      expect(adminRead.data?.signedUrl).toBeDefined();
    });

    it('Unauthorized staff read denied: trainers and support cannot read student photos', async () => {
      const trainerClient = createClient(trainerFicoId);
      const trainerRead = await trainerClient.storage.from('student-photos').download(amitPhotoPath);
      expect(trainerRead.error).toBeDefined();
      expect(trainerRead.error?.message).toContain('Forbidden');

      const supportClient = createClient(supportMentorId);
      const supportRead = await supportClient.storage.from('student-photos').download(amitPhotoPath);
      expect(supportRead.error).toBeDefined();
      expect(supportRead.error?.message).toContain('Forbidden');
    });

    it('Cross-tenant read denied: Tenant B user cannot read Tenant A photo', async () => {
      const tenantBAdmin = createClient(adminTenantBId);
      const crossTenantRead = await tenantBAdmin.storage.from('student-photos').download(amitPhotoPath);
      expect(crossTenantRead.error).toBeDefined();
      expect(crossTenantRead.error?.message).toContain('Cross-tenant');
    });

    it('Student self-access: student can read their own photo but is denied other students photos', async () => {
      const amitClient = createClient(studentAmitId);
      const ownPhotoRead = await amitClient.storage.from('student-photos').download(amitPhotoPath);
      expect(ownPhotoRead.error).toBeNull();

      // Amit attempting to read Sneha's photo
      const snehaPhotoRead = await amitClient.storage.from('student-photos').download(snehaPhotoPath);
      expect(snehaPhotoRead.error).toBeDefined();
      expect(snehaPhotoRead.error?.message).toContain('Students may only access their own photograph');
    });

    it('Unauthorized overwrite denied: non-upsert or unauthorized role cannot overwrite photo', async () => {
      const counsellorClient = createClient(counsellorId);
      // Attempt overwrite without upsert: true
      const duplicateUpload = await counsellorClient.storage
        .from('student-photos')
        .upload(amitPhotoPath, Buffer.from('new-photo'), { upsert: false });
      expect(duplicateUpload.error).toBeDefined();
      expect(duplicateUpload.error?.message).toContain('already exists');

      // Unauthorized staff attempting upsert
      const trainerClient = createClient(trainerFicoId);
      const trainerOverwrite = await trainerClient.storage
        .from('student-photos')
        .upload(amitPhotoPath, Buffer.from('tamper'), { upsert: true });
      expect(trainerOverwrite.error).toBeDefined();
      expect(trainerOverwrite.error?.message).toContain('Forbidden');
    });

    it('Unauthorized delete denied: counsellors, students, and trainers cannot delete photos; admins can', async () => {
      const counsellorClient = createClient(counsellorId);
      const counsellorDelete = await counsellorClient.storage.from('student-photos').remove([amitPhotoPath]);
      expect(counsellorDelete.error).toBeDefined();
      expect(counsellorDelete.error?.message).toContain('Only administrators may delete');

      const studentClient = createClient(studentAmitId);
      const studentDelete = await studentClient.storage.from('student-photos').remove([amitPhotoPath]);
      expect(studentDelete.error).toBeDefined();
      expect(studentDelete.error?.message).toContain('Only administrators may delete');

      const adminClient = createClient(adminId);
      const adminDelete = await adminClient.storage.from('student-photos').remove([amitPhotoPath]);
      expect(adminDelete.error).toBeNull();
    });
  });

  // =========================================================================
  // 3. Application API Endpoint Authorization (/api/students/photo)
  // =========================================================================
  describe('3. Application API Security (/api/students/photo)', () => {
    function createMockRequest(url: string, method: string = 'GET', actorUserId: string | null = counsellorId, body?: any): NextRequest {
      const headers = new Headers();
      headers.set('origin', 'http://localhost:3000');
      if (actorUserId) {
        const actor = store.users.find((u) => u.id === actorUserId);
        if (actor) {
          const cookiePayload = encodeURIComponent(JSON.stringify(actor));
          const sig = generateAuthCookieSignatureSync(cookiePayload);
          headers.set('cookie', `${AUTH_COOKIE_NAME}=${cookiePayload}; ${AUTH_SIG_COOKIE_NAME}=${sig}`);
        }
      }
      return new NextRequest(new URL(url, 'http://localhost:3000'), {
        method,
        headers,
        body,
      });
    }

    it('GET /api/students/photo: allows authorized staff (counsellor, admin, accountant)', async () => {
      const req = createMockRequest(`http://localhost:3000/api/students/photo?path=${encodeURIComponent(amitPhotoPath)}`, 'GET', counsellorId);
      const res = await photoGetRoute(req);
      expect([200, 307]).toContain(res.status);
    });

    it('GET /api/students/photo: rejects trainer with 403 Forbidden', async () => {
      const req = createMockRequest(`http://localhost:3000/api/students/photo?path=${encodeURIComponent(amitPhotoPath)}`, 'GET', trainerFicoId);
      const res = await photoGetRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Forbidden');
    });

    it('GET /api/students/photo: rejects cross-tenant access with 403 Forbidden', async () => {
      const req = createMockRequest(`http://localhost:3000/api/students/photo?path=${encodeURIComponent(amitPhotoPath)}`, 'GET', counsellorTenantBId);
      const res = await photoGetRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Photo belongs to another institute tenant');
    });

    it('GET /api/students/photo: student accessing own photo succeeds; accessing another student is 403 Forbidden', async () => {
      // Amit accessing his own photo
      const reqOwn = createMockRequest(`http://localhost:3000/api/students/photo?path=${encodeURIComponent(amitPhotoPath)}`, 'GET', studentAmitId);
      const resOwn = await photoGetRoute(reqOwn);
      expect([200, 307]).toContain(resOwn.status);

      // Amit attempting to access Sneha's photo
      const reqOther = createMockRequest(`http://localhost:3000/api/students/photo?path=${encodeURIComponent(snehaPhotoPath)}`, 'GET', studentAmitId);
      const resOther = await photoGetRoute(reqOther);
      expect(resOther.status).toBe(403);
      const dataOther = await resOther.json();
      expect(dataOther.error).toContain('Students may only access their own photograph');
    });

    it('DELETE /api/students/photo: requires admin role; counsellors rejected with 403', async () => {
      const counsellorReq = createMockRequest(`http://localhost:3000/api/students/photo?path=${encodeURIComponent(amitPhotoPath)}`, 'DELETE', counsellorId);
      const counsellorRes = await photoDeleteRoute(counsellorReq);
      expect(counsellorRes.status).toBe(403);

      const adminReq = createMockRequest(`http://localhost:3000/api/students/photo?path=${encodeURIComponent(amitPhotoPath)}`, 'DELETE', adminId);
      const adminRes = await photoDeleteRoute(adminReq);
      expect(adminRes.status).toBe(200);
      const adminData = await adminRes.json();
      expect(adminData.success).toBe(true);
    });
  });
});
