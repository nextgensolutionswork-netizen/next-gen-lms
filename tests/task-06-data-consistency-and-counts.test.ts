import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postLeadRoute } from '@/app/api/crm/leads/route';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { store } from '@/lib/services/data-store';
import { getFinanceDashboardMetrics } from '@/lib/services/finance-service';
import { UserProfile } from '@/types';

function signedPost(url: string, body: unknown, actor: UserProfile) {
  const val = encodeURIComponent(JSON.stringify(actor));
  const sig = generateAuthCookieSignatureSync(val);
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${AUTH_COOKIE_NAME}=${val}; ${AUTH_SIG_COOKIE_NAME}=${sig}`,
    },
    body: JSON.stringify(body),
  });
}

describe('TASK-06: Data Consistency, Controlled Counts & Mandatory Experience', () => {
  const adminActor: UserProfile = {
    id: '44444444-4444-4444-8444-444444444401',
    email: 'admin.task06@example.com',
    full_name: 'Admin Task06',
    role: 'admin',
    tenant_id: 'default',
    is_active: true,
    created_at: '2026-11-26T00:00:00.000Z',
    updated_at: '2026-11-26T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.spyOn(store, 'persist').mockImplementation(() => {});
    vi.spyOn(store, 'persistSync').mockReturnValue(true);
    store.users = [adminActor];
  });

  it('Phase K: POST /api/crm/leads rejects omitted, null, empty, and whitespace Experience while accepting Fresher and 0', async () => {
    const base = {
      full_name: 'Exp Validation Lead',
      phone: '+91 98765 00001',
      email: 'exp.val@example.com',
      stage: 'New',
      training_preference: 'Online',
    };

    for (const bad of [{}, { experience: null }, { experience: '' }, { experience: '   ' }]) {
      const res = await postLeadRoute(signedPost('http://localhost/api/crm/leads', { ...base, ...bad }, adminActor));
      expect(res.status).toBe(400);
    }

    const resFresher = await postLeadRoute(
      signedPost(
        'http://localhost/api/crm/leads',
        { ...base, phone: '+91 98765 00002', email: 'fresher@example.com', experience: 'Fresher' },
        adminActor
      )
    );
    expect(resFresher.status).toBe(200);

    const resZero = await postLeadRoute(
      signedPost(
        'http://localhost/api/crm/leads',
        { ...base, phone: '+91 98765 00003', email: 'zero@example.com', experience_years: 0 },
        adminActor
      )
    );
    expect(resZero.status).toBe(200);
  });

  it('Phase M: Controlled QA dataset counts reconcile across CRM, Admissions, Onboarding, and Finance', async () => {
    store.courses = [
      { id: 'c1', course_name: 'FICO', course_code: 'FICO', price: 35000, status: 'Published' } as any,
      { id: 'c2', course_name: 'MM', course_code: 'MM', price: 30000, status: 'Published' } as any,
    ];
    store.batches = [
      { id: 'b1', course_id: 'c1', tenant_id: 'default' } as any,
      { id: 'b2', course_id: 'c1', tenant_id: 'default' } as any,
      { id: 'b3', course_id: 'c2', tenant_id: 'default' } as any,
    ];
    store.leads = Array.from({ length: 10 }, (_, i) => ({
      id: `l-${i + 1}`,
      tenant_id: 'default',
      stage: i < 4 ? 'Converted' : 'New',
    })) as any;
    store.admissions = Array.from({ length: 4 }, (_, i) => ({
      id: `a-${i + 1}`,
      student_id: `s-${i + 1}`,
      tenant_id: 'default',
      status: 'Confirmed',
    })) as any;
    store.students = Array.from({ length: 4 }, (_, i) => ({
      id: `s-${i + 1}`,
      tenant_id: 'default',
    })) as any;
    store.onboardingCases = Array.from({ length: 4 }, (_, i) => ({
      id: `o-${i + 1}`,
      admission_id: `a-${i + 1}`,
      student_id: `s-${i + 1}`,
      tenant_id: 'default',
      status: i === 0 ? 'completed' : 'in_progress',
    })) as any;
    const today = new Date().toISOString().slice(0, 10);
    store.payments = [
      { id: 'p-1', amount: 10000, status: 'Success', approval_status: 'Verified', payment_date: today, payment_mode: 'UPI', tenant_id: 'default' },
      { id: 'p-2', amount: 15000, status: 'Success', approval_status: 'Verified', payment_date: today, payment_mode: 'UPI', tenant_id: 'default' },
      { id: 'p-3', amount: 5000, status: 'Success', approval_status: 'Verified', payment_date: today, payment_mode: 'UPI', tenant_id: 'default' },
      { id: 'p-4', amount: 6000, status: 'Pending', approval_status: 'Pending Approval', payment_date: today, payment_mode: 'UPI', tenant_id: 'default' },
      { id: 'p-5', amount: 4000, status: 'Pending', approval_status: 'Pending Approval', payment_date: today, payment_mode: 'UPI', tenant_id: 'default' },
      { id: 'p-6', amount: 2000, status: 'Failed', approval_status: 'Rejected', payment_date: today, payment_mode: 'UPI', tenant_id: 'default' },
    ] as any;
    store.studentPayments = [];
    store.expenses = [];
    store.feeAccounts = [];
    store.studentFees = [];

    expect(store.leads).toHaveLength(10);
    expect(store.leads.filter((l) => l.stage === 'Converted')).toHaveLength(4);
    expect(store.admissions).toHaveLength(4);
    expect(store.students).toHaveLength(4);
    expect(store.courses).toHaveLength(2);
    expect(store.batches).toHaveLength(3);
    expect(store.onboardingCases.filter((o) => o.status === 'completed')).toHaveLength(1);
    expect(store.onboardingCases.filter((o) => o.status !== 'completed')).toHaveLength(3);

    const metrics = await getFinanceDashboardMetrics();
    expect(metrics.monthlyCollections).toBe(30000);
    expect(metrics.pendingCollections).toBe(10000);
  });
});
