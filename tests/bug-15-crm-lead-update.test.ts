import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserProfile, Lead, Admission, Course } from '@/types';
import { store } from '@/lib/services/data-store';
import {
  getLeads,
  updateLeadDetails,
  getLeadAdmission,
  getLeadHistoricalAdmissionNumber,
  classifyLeadConversion,
} from '@/lib/services/crm-service';
import { PATCH as patchLeadRoute } from '@/app/api/crm/leads/route';
import { resetLeadCache } from '@/lib/services/lead-cache';
import { canAccessLead } from '@/lib/auth/lead-access';
import { scopeLeadQuery, resolveLeadScope } from '@/lib/services/lead-security';

const auth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: auth }));

const VINEETHAA_ID = '8fac380f-cc47-4209-9a13-e85153529dd1';
const MOHAN_ID = 'fc148d96-cf7c-4189-a0ba-b99eb5826d15';
const RADHIKA_ID = '2983a160-0764-40c5-ab50-a41cff9f0c68';
const SANDHYA_ID = '3f5ba75a-ba23-4612-be74-e075a7d81f9b';

const vineethaa: UserProfile = {
  id: VINEETHAA_ID,
  role: 'counsellor',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Vineethaa',
  email: 'vineethaa.myerp@gmail.com',
  created_at: '2026-11-23T12:01:15.000Z',
  updated_at: '2026-11-23T12:01:15.000Z',
};

const mohan: UserProfile = {
  id: MOHAN_ID,
  role: 'counsellor',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Mohan Reddy',
  email: 'mohan@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const radhika: UserProfile = {
  id: RADHIKA_ID,
  role: 'counsellor_lead',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Radhika',
  email: 'radhika@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const superAdmin: UserProfile = {
  id: '00000000-0000-4000-8000-000000000004',
  role: 'super_admin',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Super Admin',
  email: 'superadmin@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const otherTenantUser: UserProfile = {
  id: '99999999-9999-4999-8999-999999999999',
  role: 'counsellor',
  tenant_id: 'tenant-beta',
  is_active: true,
  full_name: 'Tenant Beta User',
  email: 'beta@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const mockCourse: Course = {
  id: '33333333-3333-4333-8333-333333333333',
  course_code: 'SAP-FICO-101',
  course_name: 'SAP FICO PERSONAL TRAINING',
  category: 'SAP Functional',
  description: 'SAP FICO Training',
  price: 35000,
  duration_weeks: 12,
  status: 'Published',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('BUG-15 — CRM Lead Update & Historical Lead Editing Test Suite', () => {
  beforeEach(() => {
    resetLeadCache();
    store.users = [vineethaa, mohan, radhika, superAdmin, otherTenantUser];
    store.courses = [mockCourse];
    store.admissions = [];
    store.leads = [];
  });

  afterEach(() => {
    resetLeadCache();
    vi.restoreAllMocks();
  });

  // Scenario 1: Normal assigned lead update by counsellor
  it('1. allows assigned counsellor to update contact and training details while preserving stage and code', async () => {
    const leadId = '11111111-1111-4111-8111-111111111111';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-11111111-1111',
        full_name: 'Ramesh Kumar',
        phone: '9876543210',
        country_code: '+91',
        email: 'ramesh@example.com',
        stage: 'Follow-up',
        current_status: 'Working Professional',
        training_preference: 'Online',
        lead_source: 'Website',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    const updated = await updateLeadDetails(
      leadId,
      {
        full_name: 'Ramesh Kumar Senior',
        training_preference: 'Offline',
        current_status: 'Career Break',
        notes: 'Requested weekend offline batches',
      },
      VINEETHAA_ID,
      vineethaa
    );

    expect(updated.full_name).toBe('Ramesh Kumar Senior');
    expect(updated.training_preference).toBe('Offline');
    expect(updated.current_status).toBe('Career Break');
    expect(updated.notes).toBe('Requested weekend offline batches');
    expect(updated.stage).toBe('Follow-up'); // Stage strictly preserved!
    expect(updated.lead_code).toBe('LD-2026-11111111-1111');
  });

  // Scenario 2: Historical lead update with NULL created_by by assigned counsellor
  it('2. allows assigned counsellor to update historical lead with created_by = NULL (Vinoth Venkataraman)', async () => {
    const vinothId = 'b350177a-4915-4a33-8c5e-d6f3b07e452a';
    store.leads = [
      {
        id: vinothId,
        lead_code: 'LD-2026-b350177a-4915-4a33-8c5e-d6f3b07e452a',
        full_name: 'Vinoth Venkataraman',
        phone: '9444455555',
        country_code: '+91',
        email: 'vinoth@example.com',
        stage: 'Converted',
        current_status: 'Working Professional',
        training_preference: 'Online',
        lead_source: 'Website',
        counsellor_id: VINEETHAA_ID,
        created_by: undefined, // Historical lead where created_by was NULL!
        tenant_id: 'default',
        notes: 'Converted to Admission: ADM-2026-0001',
        created_at: '2026-11-15T08:00:00.000Z',
        updated_at: '2026-11-15T08:00:00.000Z',
      },
    ];

    // Counsellor Vineethaa updates candidate details
    const updated = await updateLeadDetails(
      vinothId,
      {
        full_name: 'Vinoth Venkataraman (Updated)',
        training_preference: 'Classroom',
        experience: '2–5 Years',
        notes: 'Candidate confirmed preferred timing is 7 PM.',
      },
      VINEETHAA_ID,
      vineethaa
    );

    expect(updated.full_name).toBe('Vinoth Venkataraman (Updated)');
    expect(updated.training_preference).toBe('Classroom');
    expect(updated.experience).toBe('2–5 Years');
    expect(updated.experience_years).toBe(3); // Mapped from '2–5 Years'
    expect(updated.stage).toBe('Converted'); // Stage strictly preserved!
    // Historical admission reference in notes must be preserved!
    expect(updated.notes).toContain('Converted to Admission: ADM-2026-0001');
    expect(updated.notes).toContain('Candidate confirmed preferred timing is 7 PM.');
  });

  // Scenario 3: Converted lead with active live admission
  it('3. updates candidate details for converted lead with live admission without mutating admission', async () => {
    const leadId = '22222222-2222-4222-8222-222222222222';
    const admId = 'adm-live-001';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-22222222-2222',
        full_name: 'Narayana Reddy',
        phone: '9888877777',
        country_code: '+91',
        email: 'narayana@example.com',
        stage: 'Converted',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];
    store.admissions = [
      {
        id: admId,
        admission_number: 'ADM-2026-0003',
        lead_id: leadId,
        full_name: 'Narayana Reddy',
        email: 'narayana@example.com',
        phone: '9888877777',
        course_id: mockCourse.id,
        course_name: mockCourse.course_name,
        counsellor_id: VINEETHAA_ID,
        status: 'Confirmed',
        tenant_id: 'default',
        payment_plan: 'Full Payment',
        created_at: '2026-11-20T11:00:00.000Z',
        updated_at: '2026-11-20T11:00:00.000Z',
      } as unknown as Admission,
    ];

    const updated = await updateLeadDetails(
      leadId,
      {
        full_name: 'Narayana Reddy Satti',
        address: 'Hyderabad, Telangana',
      },
      VINEETHAA_ID,
      vineethaa
    );

    expect(updated.full_name).toBe('Narayana Reddy Satti');
    expect(updated.address).toBe('Hyderabad, Telangana');
    expect(updated.stage).toBe('Converted');

    // Admission record must remain completely intact
    const admission = store.admissions.find((a) => a.lead_id === leadId);
    expect(admission).toBeDefined();
    expect(admission?.admission_number).toBe('ADM-2026-0003');
    expect(admission?.status).toBe('Confirmed');
  });

  // Scenario 4: Historical converted lead without live admission
  it('4. preserves historical conversion classification when updating lead details', async () => {
    const leadId = '33333333-3333-4333-8333-333333333333';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-33333333-3333',
        full_name: 'Bhanu Prakash',
        phone: '9123456789',
        country_code: '+91',
        email: 'bhanu@example.com',
        stage: 'Converted',
        counsellor_id: VINEETHAA_ID,
        created_by: undefined,
        tenant_id: 'default',
        notes: 'Converted to Admission: ADM-2026-0002',
        created_at: '2026-11-15T10:00:00.000Z',
        updated_at: '2026-11-15T10:00:00.000Z',
      },
    ];

    const updated = await updateLeadDetails(
      leadId,
      {
        email: 'bhanu.prakash@newdomain.com',
        current_status: 'Working Professional',
      },
      VINEETHAA_ID,
      vineethaa
    );

    expect(updated.email).toBe('bhanu.prakash@newdomain.com');
    expect(updated.stage).toBe('Converted');
    expect(getLeadHistoricalAdmissionNumber(updated)).toBe('ADM-2026-0002');

    const classification = classifyLeadConversion(updated, store.admissions);
    expect(classification.status).toBe('historical');
    expect(classification.isIntegrityError).toBe(false);
  });

  // Scenario 5: Empty optional fields handled gracefully
  it('5. handles empty optional fields (email, whatsapp, course, dates) without validation error', async () => {
    const leadId = '44444444-4444-4444-8444-444444444444';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-44444444-4444',
        full_name: 'Anil Kumar',
        phone: '9988776655',
        country_code: '+91',
        email: 'anil@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    const updated = await updateLeadDetails(
      leadId,
      {
        email: '',
        whatsapp_number: '',
        interested_course_id: '',
        follow_up_date: '',
        experience: '',
      },
      VINEETHAA_ID,
      vineethaa
    );

    expect(updated.email).toBe('');
    expect(updated.whatsapp_number).toBe('');
    expect(updated.interested_course_id).toBe('');
  });

  // Scenario 6: Safe handling of dates
  it('6. safely normalizes dates without crashing or invalid timestamps', async () => {
    const leadId = '55555555-5555-4555-8555-555555555555';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-55555555-5555',
        full_name: 'Suresh Rao',
        phone: '9871234560',
        country_code: '+91',
        email: 'suresh@example.com',
        stage: 'Follow-up',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    const updated = await updateLeadDetails(
      leadId,
      {
        follow_up_date: '2026-12-01T14:30:00.000Z',
        demo_date: '2026-12-05T10:00:00.000Z',
      },
      VINEETHAA_ID,
      vineethaa
    );

    expect(updated.follow_up_date).toBe('2026-12-01T14:30:00.000Z');
    expect(updated.demo_date).toBe('2026-12-05T10:00:00.000Z');
  });

  // Scenario 7: Invalid email validation
  it('7. rejects invalid email address and leaves lead untouched', async () => {
    const leadId = '66666666-6666-4666-8666-666666666666';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-66666666-6666',
        full_name: 'Kavitha Devi',
        phone: '9848012345',
        country_code: '+91',
        email: 'kavitha@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    await expect(
      updateLeadDetails(
        leadId,
        { email: 'invalid-email-address' },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/email address/i);

    // Lead remains unchanged
    expect(store.leads[0].email).toBe('kavitha@example.com');
  });

  // Scenario 8: Invalid phone number validation
  it('8. rejects invalid phone numbers with descriptive error', async () => {
    const leadId = '77777777-7777-4777-8777-777777777777';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-77777777-7777',
        full_name: 'Praveen',
        phone: '9848022222',
        country_code: '+91',
        email: 'praveen@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    await expect(
      updateLeadDetails(
        leadId,
        { phone: '123' }, // Invalid short number
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/mobile number/i);
  });

  // Scenario 9: Cross-counsellor unauthorized edit attempt
  it('9. strictly forbids cross-counsellor tampering (Counsellor B editing Counsellor A lead)', async () => {
    const leadId = '88888888-8888-4888-8888-888888888888';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-88888888-8888',
        full_name: 'Private Lead',
        phone: '9848033333',
        country_code: '+91',
        email: 'private@example.com',
        stage: 'Interested',
        counsellor_id: MOHAN_ID, // Assigned to Mohan
        created_by: MOHAN_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    // Vineethaa attempts to edit Mohan's lead
    await expect(
      updateLeadDetails(
        leadId,
        { full_name: 'Tampered Name' },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow('Forbidden: Lead access denied.');

    // Lead remains untouched
    expect(store.leads[0].full_name).toBe('Private Lead');
  });

  // Scenario 10: Cross-tenant unauthorized edit attempt
  it('10. strictly forbids cross-tenant access and mutation', async () => {
    const leadId = '99999999-9999-4999-8999-999999999991';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-99999999-9991',
        full_name: 'Default Tenant Lead',
        phone: '9848044444',
        country_code: '+91',
        email: 'defaulttenant@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    await expect(
      updateLeadDetails(
        leadId,
        { full_name: 'Cross Tenant Tampering' },
        otherTenantUser.id,
        otherTenantUser
      )
    ).rejects.toThrow('Forbidden: Lead access denied.');
  });

  // Scenario 11: Counsellor attempting to reassign lead to another counsellor
  it('11. forbids counsellors from reassigning leads to another salesperson', async () => {
    const leadId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-aaaaaaaa-aaaa',
        full_name: 'Assigned To Vineethaa',
        phone: '9848055555',
        country_code: '+91',
        email: 'assigned@example.com',
        stage: 'Contacted',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    // Vineethaa attempts to reassign the lead to Mohan
    await expect(
      updateLeadDetails(
        leadId,
        { counsellor_id: MOHAN_ID },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow('Forbidden: Counsellors cannot reassign leads.');
  });

  // Scenario 12: Counsellor lead updating a team member's assigned lead
  it('12. allows counsellor lead to update a managed team member lead', async () => {
    const leadId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-bbbbbbbb-bbbb',
        full_name: 'Team Member Lead',
        phone: '9848066666',
        country_code: '+91',
        email: 'teammember@example.com',
        stage: 'Demo Scheduled',
        counsellor_id: SANDHYA_ID, // Managed by Radhika
        created_by: SANDHYA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    // Radhika is counsellor_lead for Sandhya
    const updated = await updateLeadDetails(
      leadId,
      { notes: 'Reviewed by Team Lead Radhika.' },
      RADHIKA_ID,
      radhika
    );

    expect(updated.notes).toBe('Reviewed by Team Lead Radhika.');
  });

  // Scenario 13: Super Admin updating any lead
  it('13. allows Super Admin to update candidate details for any lead in tenant', async () => {
    const leadId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-cccccccc-cccc',
        full_name: 'Any Lead',
        phone: '9848077777',
        country_code: '+91',
        email: 'anylead@example.com',
        stage: 'Interested',
        counsellor_id: MOHAN_ID,
        created_by: MOHAN_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    const updated = await updateLeadDetails(
      leadId,
      {
        full_name: 'Any Lead (Admin Override)',
        counsellor_id: VINEETHAA_ID, // Admin can reassign!
      },
      superAdmin.id,
      superAdmin
    );

    expect(updated.full_name).toBe('Any Lead (Admin Override)');
    expect(updated.counsellor_id).toBe(VINEETHAA_ID);
  });

  // Scenario 14: Concurrent update version conflict detection
  it('14. rejects updates with stale expected_updated_at concurrency token', async () => {
    const leadId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-dddddddd-dddd',
        full_name: 'Concurrent Lead',
        phone: '9848088888',
        country_code: '+91',
        email: 'concurrent@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T12:00:00.000Z',
      },
    ];

    await expect(
      updateLeadDetails(
        leadId,
        {
          full_name: 'Updated Name',
          // Stale version timestamp:
          expected_updated_at: '2026-11-20T10:00:00.000Z',
        } as any,
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/updated by another user/i);
  });

  // Scenario 15: Duplicate lead detection on mobile update
  it('15. rejects duplicate phone numbers when rejectOnDuplicate is true', async () => {
    const lead1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const lead2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    store.leads = [
      {
        id: lead1,
        lead_code: 'LD-2026-0001',
        full_name: 'Existing Candidate',
        phone: '9848099999',
        country_code: '+91',
        email: 'existing@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
      {
        id: lead2,
        lead_code: 'LD-2026-0002',
        full_name: 'Second Candidate',
        phone: '9848011111',
        country_code: '+91',
        email: 'second@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    await expect(
      updateLeadDetails(
        lead2,
        {
          phone: '9848099999', // Collides with lead1
          rejectOnDuplicate: true,
        },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/already exists/i);
  });

  // Scenario 16: Financial integrity protection
  it('16. strictly rejects any attempt to mutate financial or admission fields via lead update', async () => {
    const leadId = '12121212-1212-4212-8212-121212121212';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-12121212-1212',
        full_name: 'Security Test Lead',
        phone: '9848000000',
        country_code: '+91',
        email: 'security@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    await expect(
      updateLeadDetails(
        leadId,
        { fee: 35000 } as any,
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/Financial and admission mutations are not permitted/i);

    await expect(
      updateLeadDetails(
        leadId,
        { payment_id: 'pay-fake-123' } as any,
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/Financial and admission mutations are not permitted/i);
  });

  // Scenario 17: Immutable fields protection
  it('17. strictly rejects attempts to mutate immutable fields (created_by, tenant_id, id, created_at)', async () => {
    const leadId = '34343434-3434-4434-8434-343434343434';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-34343434-3434',
        full_name: 'Immutable Test Lead',
        phone: '9848011223',
        country_code: '+91',
        email: 'immutable@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    await expect(
      updateLeadDetails(
        leadId,
        { created_by: superAdmin.id } as any,
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow('Forbidden: Immutable lead fields.');

    await expect(
      updateLeadDetails(
        leadId,
        { tenant_id: 'hacked-tenant' } as any,
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow('Forbidden: Immutable lead fields.');
  });

  // API Route PATCH verification
  it('18. verifies PATCH /api/crm/leads maps HTTP status codes correctly', async () => {
    const leadId = '56565656-5656-4656-8656-565656565656';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-56565656-5656',
        full_name: 'API Test Lead',
        phone: '9848099887',
        country_code: '+91',
        email: 'api@example.com',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    auth.mockResolvedValue(vineethaa);

    // 1. Success response (200)
    const successReq = new NextRequest('http://localhost:3000/api/crm/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        updates: { full_name: 'API Updated Lead' },
      }),
    });
    const successRes = await patchLeadRoute(successReq);
    expect(successRes.status).toBe(200);
    const successBody = await successRes.json();
    expect(successBody.success).toBe(true);
    expect(successBody.lead.full_name).toBe('API Updated Lead');

    // 2. Missing leadId (400)
    const badReq = new NextRequest('http://localhost:3000/api/crm/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: { full_name: 'No Lead ID' } }),
    });
    const badRes = await patchLeadRoute(badReq);
    expect(badRes.status).toBe(400);

    // 3. Cross-counsellor forbidden edit (403)
    auth.mockResolvedValue(mohan);
    const forbiddenReq = new NextRequest('http://localhost:3000/api/crm/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        updates: { full_name: 'Mohan Tampering' },
      }),
    });
    const forbiddenRes = await patchLeadRoute(forbiddenReq);
    expect(forbiddenRes.status).toBe(403);
  });

  // Scenario 19: Post-reassignment creator isolation
  it('19. creator loses access once lead is reassigned to another counsellor', async () => {
    const leadId = '19191919-1919-4919-8919-191919191919';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-19191919-1919',
        full_name: 'Reassigned Candidate',
        phone: '9848019191',
        country_code: '+91',
        email: 'reassigned@example.com',
        stage: 'Interested',
        created_by: VINEETHAA_ID, // Created by Vineethaa
        counsellor_id: MOHAN_ID, // Reassigned to Mohan
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    // Vineethaa attempts to edit the lead she originally created, but which is now assigned to Mohan
    await expect(
      updateLeadDetails(
        leadId,
        { full_name: 'Vineethaa Tampering Post-Reassignment' },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow('Forbidden: Lead access denied.');

    // Mohan (the assigned counsellor) can successfully edit
    const updated = await updateLeadDetails(
      leadId,
      { full_name: 'Mohan Authorized Update' },
      MOHAN_ID,
      mohan
    );
    expect(updated.full_name).toBe('Mohan Authorized Update');
  });

  // Scenario 20: Malformed UUID rejection
  it('20. rejects malformed non-empty UUID fields with descriptive 400 error', async () => {
    const leadId = '20202020-2020-4020-8020-202020202020';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-20202020-2020',
        full_name: 'UUID Test Lead',
        email: 'uuid-test@example.com',
        phone: '9848020202',
        country_code: '+91',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    await expect(
      updateLeadDetails(
        leadId,
        { interested_course_id: 'not-a-valid-uuid' },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/Invalid course ID format/i);

    await expect(
      updateLeadDetails(
        leadId,
        { counsellor_id: 'malformed-counsellor-id' },
        superAdmin.id,
        superAdmin
      )
    ).rejects.toThrow(/Invalid counsellor ID format/i);
  });

  // Scenario 21: Invalid date rejection
  it('21. rejects invalid date strings instead of silently wiping them', async () => {
    const leadId = '21212121-2121-4121-8121-212121212121';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-21212121-2121',
        full_name: 'Date Test Lead',
        email: 'date-test@example.com',
        phone: '9848021212',
        country_code: '+91',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        follow_up_date: '2026-11-28T10:00:00.000Z',
        demo_date: '2026-11-29T10:00:00.000Z',
        dob: '1998-05-15',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    await expect(
      updateLeadDetails(
        leadId,
        { follow_up_date: 'invalid-date' },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/Invalid date format for follow-up date/i);

    await expect(
      updateLeadDetails(
        leadId,
        { demo_date: 'bad-demo-date' },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/Invalid date format for demo date/i);

    await expect(
      updateLeadDetails(
        leadId,
        { dob: 'bad-dob' },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/Invalid date format for date of birth/i);

    // Existing dates are intact
    expect(store.leads[0].follow_up_date).toBe('2026-11-28T10:00:00.000Z');
    expect(store.leads[0].demo_date).toBe('2026-11-29T10:00:00.000Z');
  });

  // Scenario 22: Experience range normalization
  it('22. accurately parses experience ranges without defaulting senior candidates to 1 year', async () => {
    const leadId = '22222222-2222-4222-8222-222222222222';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-22222222-2222',
        full_name: 'Senior Lead',
        email: 'senior-lead@example.com',
        phone: '9848022223',
        country_code: '+91',
        stage: 'New',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    const up10 = await updateLeadDetails(leadId, { experience: '10+ Years' }, VINEETHAA_ID, vineethaa);
    expect(up10.experience_years).toBe(10);

    const up7 = await updateLeadDetails(leadId, { experience: '7-8 Years' }, VINEETHAA_ID, vineethaa);
    expect(up7.experience_years).toBe(7);

    const upFresh = await updateLeadDetails(leadId, { experience: 'Fresher' }, VINEETHAA_ID, vineethaa);
    expect(upFresh.experience_years).toBe(0);
  });

  // Scenario 23: Counsellor ownership and conversion protection
  it('23. prevents counsellors from reassigning lead ownership or demoting converted leads', async () => {
    const leadId = '23232323-2323-4232-8232-232323232323';
    store.leads = [
      {
        id: leadId,
        lead_code: 'LD-2026-23232323-2323',
        full_name: 'Converted Lead',
        email: 'converted-lead@example.com',
        phone: '9848023232',
        country_code: '+91',
        stage: 'Converted',
        counsellor_id: VINEETHAA_ID,
        created_by: VINEETHAA_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      },
    ];

    // Counsellor cannot reassign counsellor_id
    await expect(
      updateLeadDetails(
        leadId,
        { counsellor_id: MOHAN_ID },
        VINEETHAA_ID,
        vineethaa
      )
    ).rejects.toThrow(/Forbidden: Counsellors cannot reassign leads/i);

    // Converted lead cannot be demoted away from Converted
    await expect(
      updateLeadDetails(
        leadId,
        { stage: 'Interested' },
        superAdmin.id,
        superAdmin
      )
    ).rejects.toThrow(/Forbidden: Cannot alter stage of a converted lead/i);
  });
});
