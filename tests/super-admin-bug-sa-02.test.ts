import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { GET as getEnrollmentsRoute, POST as postEnrollmentRoute } from '@/app/api/placement/enrollments/route';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { UserProfile } from '@/types';
import { store } from '@/lib/services/data-store';

async function createSignedRequest(actor?: UserProfile, url: string = 'http://localhost/api/placement/enrollments', method: string = 'GET', body?: any) {
  let cookieHeader = '';
  if (actor) {
    const value = encodeURIComponent(JSON.stringify(actor));
    const signature = await generateAuthCookieSignature(value);
    cookieHeader = `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${signature}`;
  }

  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('BUG-SA-02: Placement Enrollments API 404 & Schema Verification', () => {
  const superAdmin: UserProfile = {
    id: 'usr-super-admin-bug02',
    email: 'superadmin.bug02@next-gen.com',
    full_name: 'Super Administrator',
    role: 'super_admin',
    is_active: true,
    tenant_id: 'default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    if (!store.users.some((u) => u.id === superAdmin.id)) {
      store.users.push(superAdmin);
    }
  });
  it('verifies that the schema migration file exists with correct foreign keys, indexes, and RLS', () => {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261116_placement_enrollments.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    // Required tables
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS public.placement_enrollments');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS public.placement_eligibility_settings');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS public.placement_enrollment_status_histories');

    // Required foreign keys & constraints
    expect(sqlContent).toContain('REFERENCES public.students(id)');
    expect(sqlContent).toContain('REFERENCES public.courses(id)');
    expect(sqlContent).toContain('REFERENCES public.batches(id)');
    expect(sqlContent).toContain('REFERENCES public.profiles(id)');

    // Required indexes
    expect(sqlContent).toContain('CREATE INDEX IF NOT EXISTS idx_placement_enrollments_student_id');
    expect(sqlContent).toContain('CREATE INDEX IF NOT EXISTS idx_placement_enrollments_status');

    // Required RLS policies
    expect(sqlContent).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sqlContent).toContain('CREATE POLICY "Placement staff manage all enrollments"');
    expect(sqlContent).toContain('CREATE POLICY "Students view own placement enrollment"');
  });

  it('verifies that GET /api/placement/enrollments exists and does NOT return 404', async () => {
    const req = await createSignedRequest(superAdmin);
    const res = await getEnrollmentsRoute(req);

    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.enrollments)).toBe(true);
    expect(typeof json.isLiveDatabase).toBe('boolean');
  });

  it('rejects unauthenticated requests to /api/placement/enrollments with 401', async () => {
    const unauthReq = await createSignedRequest();
    const res = await getEnrollmentsRoute(unauthReq);

    expect(res.status).toBe(401);
  });

  it('validates mandatory declarations on POST /api/placement/enrollments', async () => {
    // Incomplete declaration
    const reqIncomplete = await createSignedRequest(
      superAdmin,
      'http://localhost/api/placement/enrollments',
      'POST',
      {
        student_id: 'stu-01',
        declaration: {
          confirmed_information_correct: true,
          understands_no_guarantee: false, // Incomplete!
        },
      }
    );

    const resIncomplete = await postEnrollmentRoute(reqIncomplete);
    expect(resIncomplete.status).toBe(400);

    const json = await resIncomplete.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/terms and declarations/i);
  });
});
