import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as createLeadPost, GET as getLeadsRoute } from '@/app/api/crm/leads/route';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, generateAuthCookieSignature, getAuthCookieSecret } from '@/lib/security/auth-cookie';
import { store } from '@/lib/services/data-store';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import * as dbModule from '@/lib/supabase/db';
import * as adminModule from '@/lib/supabase/admin';
import type { UserProfile } from '@/types';

async function buildSignedCookieHeader(user: Partial<UserProfile>) {
  const payload = encodeURIComponent(JSON.stringify(user));
  const sig = await generateAuthCookieSignature(payload, getAuthCookieSecret());
  return `${AUTH_COOKIE_NAME}=${payload}; ${AUTH_SIG_COOKIE_NAME}=${sig}`;
}

function makeLeadBody(overrides: Record<string, unknown> = {}) {
  return {
    full_name: 'QA Lead Candidate',
    country_code: '+91',
    phone: '9876543210',
    email: 'qa.lead.candidate@example.com',
    institute_id: 'inst-myerp-hub',
    institute_name: 'MyERP Hub',
    require_institute: true,
    interested_course_id: 'crs-fico-01',
    current_status: 'Working Professional',
    experience: '2–5 Years',
    experience_years: 3,
    training_preference: 'Online',
    lead_source: 'Website',
    notes: 'QA test record - no real notifications',
    stage: 'New',
    ...overrides,
  };
}

describe('CRM Create Lead — Auth Identity Mapping & Role Regression', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    store.leads = [];
    store.reconcileAuthoritativeStaffProfiles();
  });

  it('prefers authoritative Supabase profile ID over stale store.users fixture ID when live Supabase is enabled', async () => {
    const realRadhikaId = 'f25da21c-73ae-4bab-a432-bdc2e39806bf';
    const realRadhikaProfile: UserProfile = {
      id: realRadhikaId,
      email: 'nextgen.radhika@gmail.com',
      full_name: 'Radhika',
      role: 'counsellor_lead',
      is_active: true,
      tenant_id: 'default',
      created_at: '2026-11-28T08:33:08.290Z',
      updated_at: '2026-11-28T08:33:08.290Z',
    };

    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://tgohtdzwehhjfahtgovq.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: (col: string, val: string) => ({
                maybeSingle: async () => ({
                  data: col === 'id' && val === realRadhikaId ? realRadhikaProfile : null,
                  error: null,
                }),
                single: async () => ({
                  data: col === 'id' && val === realRadhikaId ? realRadhikaProfile : null,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdmin as any);

    const cookie = await buildSignedCookieHeader({
      id: realRadhikaId,
      email: 'nextgen.radhika@gmail.com',
      role: 'counsellor_lead',
      is_active: true,
      tenant_id: 'default',
    });

    const req = new NextRequest('http://localhost:3000/api/crm/leads', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
    });

    try {
      const resolved = await authenticatePaymentRequest(req);
      expect(resolved.id).toBe(realRadhikaId);
      expect(resolved.role).toBe('counsellor_lead');
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
    }
  });

  it('allows super_admin, admin, counsellor_lead, and counsellor to create leads with institute selection and ownership', async () => {
    const roles: Array<{ role: UserProfile['role']; email: string; id: string; institute_id: string; institute_name: string; phone: string }> = [
      { role: 'super_admin', email: 'superadmin@next-generpsolutions.com', id: 'usr-superadmin', institute_id: 'inst-myerp-hub', institute_name: 'MyERP Hub', phone: '9876500001' },
      { role: 'admin', email: 'admin@next-generpsolutions.com', id: 'usr-admin', institute_id: 'inst-nextgen', institute_name: 'NextGen', phone: '9876500002' },
      { role: 'counsellor_lead', email: 'nextgen.radhika@gmail.com', id: '2983a160-0764-40c5-ab50-a41cff9f0c68', institute_id: 'inst-tecopad', institute_name: 'Tecopad', phone: '9876500003' },
      { role: 'counsellor', email: 'sandhya.erphub@gmail.com', id: '3f5ba75a-ba23-4612-be74-e075a7d81f9b', institute_id: 'inst-myerp-hub', institute_name: 'MyERP Hub', phone: '9876500004' },
    ];

    for (const actor of roles) {
      const cookie = await buildSignedCookieHeader({
        id: actor.id,
        email: actor.email,
        role: actor.role,
        is_active: true,
        tenant_id: 'default',
      });
      const req = new NextRequest('http://localhost:3000/api/crm/leads', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify(
          makeLeadBody({
            full_name: `QA ${actor.role} Lead`,
            phone: actor.phone,
            email: `qa.${actor.role}@example.com`,
            institute_id: actor.institute_id,
            institute_name: actor.institute_name,
            counsellor_id: actor.id,
          })
        ),
      });

      const res = await createLeadPost(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.lead.institute_id).toBe(actor.institute_id);
      expect(data.lead.institute_name).toBe(actor.institute_name);
      expect(data.lead.created_by).toBe(actor.id);
      expect(data.lead.counsellor_id).toBe(actor.id);
    }

    // Verify counsellor only sees their own lead, while super_admin sees all 4
    const counsellorCookie = await buildSignedCookieHeader({
      id: '3f5ba75a-ba23-4612-be74-e075a7d81f9b',
      email: 'sandhya.erphub@gmail.com',
      role: 'counsellor',
      is_active: true,
      tenant_id: 'default',
    });
    const counsellorGetRes = await getLeadsRoute(
      new NextRequest('http://localhost:3000/api/crm/leads', { headers: { cookie: counsellorCookie } })
    );
    const counsellorGetJson = await counsellorGetRes.json();
    expect(counsellorGetJson.success).toBe(true);
    expect(counsellorGetJson.leads).toHaveLength(1);
    expect(counsellorGetJson.leads[0].created_by).toBe('3f5ba75a-ba23-4612-be74-e075a7d81f9b');

    const superAdminCookie = await buildSignedCookieHeader({
      id: 'usr-superadmin',
      email: 'superadmin@next-generpsolutions.com',
      role: 'super_admin',
      is_active: true,
      tenant_id: 'default',
    });
    const superAdminGetRes = await getLeadsRoute(
      new NextRequest('http://localhost:3000/api/crm/leads', { headers: { cookie: superAdminCookie } })
    );
    const superAdminGetJson = await superAdminGetRes.json();
    expect(superAdminGetJson.success).toBe(true);
    expect(superAdminGetJson.leads).toHaveLength(4);
  });

  it('rejects unauthenticated requests and unauthorized roles (student, trainer, accountant)', async () => {
    // Unauthenticated
    const unauthReq = new NextRequest('http://localhost:3000/api/crm/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(makeLeadBody()),
    });
    const unauthRes = await createLeadPost(unauthReq);
    expect(unauthRes.status).toBe(401);

    // Unauthorized roles
    const blockedRoles: Array<{ role: UserProfile['role']; email: string; id: string }> = [
      { role: 'student', email: 'student1@lms.internal', id: 'usr-student-1' },
      { role: 'trainer', email: 'vikram.fico@next-generpsolutions.com', id: 'usr-trainer-fico' },
      { role: 'accountant', email: 'accounts@next-generpsolutions.com', id: 'usr-accounts' },
    ];

    for (const actor of blockedRoles) {
      const cookie = await buildSignedCookieHeader({
        id: actor.id,
        email: actor.email,
        role: actor.role,
        is_active: true,
        tenant_id: 'default',
      });
      const req = new NextRequest('http://localhost:3000/api/crm/leads', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(makeLeadBody()),
      });
      const res = await createLeadPost(req);
      expect(res.status).toBe(403);
    }
  });

  it('prevents duplicate lead creation by mobile number', async () => {
    const cookie = await buildSignedCookieHeader({
      id: 'usr-admin',
      email: 'admin@next-generpsolutions.com',
      role: 'admin',
      is_active: true,
      tenant_id: 'default',
    });

    const firstRes = await createLeadPost(
      new NextRequest('http://localhost:3000/api/crm/leads', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(makeLeadBody({ phone: '9876511111', rejectOnDuplicate: true })),
      })
    );
    expect(firstRes.status).toBe(200);

    const dupRes = await createLeadPost(
      new NextRequest('http://localhost:3000/api/crm/leads', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(makeLeadBody({ phone: '9876511111', rejectOnDuplicate: true })),
      })
    );
    const dupJson = await dupRes.json();
    expect(dupRes.status).toBe(400);
    expect(dupJson.success).toBe(false);
    expect(dupJson.error).toMatch(/already exists/i);
  });
});
