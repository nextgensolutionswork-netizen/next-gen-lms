import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { store } from '@/lib/services/data-store';
import {
  auditLeadCourseMappings,
  createLead,
  getLeads,
  resolveLeadCourseFromMaster,
  updateLeadDetails,
} from '@/lib/services/crm-service';
import { validateLeadRows } from '@/lib/services/bulk-import-service';
import { GET as leadsGet } from '@/app/api/crm/leads/route';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import type { Lead, UserProfile } from '@/types';

const makeUser = (id: string, role: UserProfile['role']): UserProfile => ({
  id,
  role,
  tenant_id: 'default',
  email: `${id}@example.test`,
  full_name: id,
  is_active: true,
  created_at: '2026-11-28',
  updated_at: '2026-11-28',
});

const adminUser = makeUser('11111111-1111-1111-1111-111111111111', 'super_admin');
const counsellorUser = makeUser('44444444-4444-4444-4444-444444444444', 'counsellor');

describe('Interested Course Mapping and Display Consistency', () => {
  beforeEach(() => {
    vi.spyOn(store, 'persist').mockImplementation(() => {});
    vi.spyOn(store, 'persistSync').mockReturnValue(true);
    store.reconcileAuthoritativeCourses();
    store.users = [structuredClone(adminUser), structuredClone(counsellorUser)];
    store.leads = [];
    store.admissions = [];
    store.auditLogs = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves Course Master names without falling back to the first course on missing or invalid IDs', () => {
    const secondCourse = store.courses[1] || store.courses[0];
    const valid = resolveLeadCourseFromMaster(secondCourse.id, store.courses);
    expect(valid.status).toBe('Valid');
    expect(valid.course_name).toBe(secondCourse.course_name);

    const missing = resolveLeadCourseFromMaster('', store.courses);
    expect(missing.status).toBe('Missing');
    expect(missing.course_name).toBe('Not Assigned');

    const invalid = resolveLeadCourseFromMaster('non-existent-course-999', store.courses);
    expect(invalid.status).toBe('Invalid');
    expect(invalid.course_name).toBe('Invalid Course Reference');
  });

  it('hydrates interested_course_name in getLeads from Course Master and supports alias course filtering', async () => {
    const targetCourse = store.courses[1] || store.courses[0];
    const lead: Lead = {
      id: 'lead-stale-name',
      lead_code: 'LD-2026-901',
      full_name: 'Stale Name Lead',
      phone: '9876540001',
      email: 'stale@example.test',
      interested_course_id: targetCourse.id,
      interested_course_name: undefined, // Simulates DB row where interested_course_name is not stored
      stage: 'New',
      counsellor_id: counsellorUser.id,
      created_by: counsellorUser.id,
      tenant_id: 'default',
      created_at: '2026-11-28T00:00:00Z',
      updated_at: '2026-11-28T00:00:00Z',
    };
    const unassignedLead: Lead = {
      id: 'lead-unassigned-course',
      lead_code: 'LD-2026-902',
      full_name: 'Unassigned Course Lead',
      phone: '9876540002',
      email: 'unassigned@example.test',
      interested_course_id: '',
      stage: 'New',
      counsellor_id: counsellorUser.id,
      created_by: counsellorUser.id,
      tenant_id: 'default',
      created_at: '2026-11-28T00:00:00Z',
      updated_at: '2026-11-28T00:00:00Z',
    };
    store.leads.push(lead, unassignedLead);

    const fetched = await getLeads({}, adminUser);
    expect(fetched.find((l) => l.id === lead.id)?.interested_course_name).toBe(targetCourse.course_name);
    expect(fetched.find((l) => l.id === unassignedLead.id)?.interested_course_name).toBeUndefined();

    const filtered = await getLeads({ course_id: targetCourse.id }, adminUser);
    expect(filtered.map((l) => l.id)).toEqual([lead.id]);
  });

  it('rejects invalid course updates in Edit Lead and persists valid updates', async () => {
    const firstCourse = store.courses[0];
    const secondCourse = store.courses[1] || store.courses[0];

    const created = await createLead(
      {
        full_name: 'Course Edit Lead',
        phone: '9876540003',
        email: 'editcourse@example.test',
        experience: 'Fresher',
        stage: 'New',
        interested_course_id: firstCourse.id,
        counsellor_id: counsellorUser.id,
      },
      counsellorUser
    );
    expect(created.interested_course_name).toBe(firstCourse.course_name);

    await expect(
      updateLeadDetails(created.id, { interested_course_id: 'invalid-course-id' }, counsellorUser.id, counsellorUser)
    ).rejects.toThrow(/Course Master/i);

    const updated = await updateLeadDetails(
      created.id,
      { interested_course_id: secondCourse.id },
      counsellorUser.id,
      counsellorUser
    );
    expect(updated.interested_course_id).toBe(secondCourse.id);
    expect(updated.interested_course_name).toBe(secondCourse.course_name);
  });

  it('does not auto-assign courses[0] during CSV import and flags invalid course codes', () => {
    const result = validateLeadRows([
      {
        rowNumber: 2,
        data: {
          full_name: 'CSV No Course',
          email: 'nocourse@example.test',
          phone: '9876540010',
          course_code: '',
        },
      },
      {
        rowNumber: 3,
        data: {
          full_name: 'CSV Bad Course',
          email: 'badcourse@example.test',
          phone: '9876540011',
          course_code: 'NON-EXISTENT-999',
        },
      },
      {
        rowNumber: 4,
        data: {
          full_name: 'CSV Valid Course',
          email: 'goodcourse@example.test',
          phone: '9876540012',
          course_code: store.courses[0].course_code,
        },
      },
    ]);

    expect(result.previewRows[0].isValid).toBe(true);
    expect(result.previewRows[0].data.interested_course_id).toBeUndefined();
    expect(result.previewRows[1].isValid).toBe(false);
    expect(result.previewRows[1].errors[0]).toMatch(/Course Master/i);
    expect(result.previewRows[2].isValid).toBe(true);
    expect(result.previewRows[2].data.interested_course_id).toBe(store.courses[0].id);
  });

  it('generates a non-destructive audit report for missing and invalid lead course mappings via GET /api/crm/leads?audit_courses=true', async () => {
    store.leads.push(
      {
        id: 'audit-valid',
        lead_code: 'LD-AUD-1',
        full_name: 'Valid Candidate',
        phone: '9876500101',
        email: 'a1@example.test',
        interested_course_id: store.courses[0].id,
        lead_source: 'Meta Ads',
        institute_name: 'NextGen',
        stage: 'New',
        tenant_id: 'default',
        created_at: '2026-11-28T00:00:00Z',
        updated_at: '2026-11-28T00:00:00Z',
      },
      {
        id: 'audit-missing',
        lead_code: 'LD-AUD-2',
        full_name: 'Missing Candidate',
        phone: '9876500102',
        email: 'a2@example.test',
        interested_course_id: '',
        lead_source: 'Google Ads',
        stage: 'New',
        tenant_id: 'default',
        created_at: '2026-11-28T00:00:00Z',
        updated_at: '2026-11-28T00:00:00Z',
      },
      {
        id: 'audit-invalid',
        lead_code: 'LD-AUD-3',
        full_name: 'Invalid Candidate',
        phone: '9876500103',
        email: 'a3@example.test',
        interested_course_id: 'crs-broken-id',
        lead_source: 'Other',
        stage: 'New',
        tenant_id: 'default',
        created_at: '2026-11-28T00:00:00Z',
        updated_at: '2026-11-28T00:00:00Z',
      }
    );

    const directReport = auditLeadCourseMappings(store.leads, store.courses);
    expect(directReport.map((r) => r.course_mapping_status)).toEqual(['Valid', 'Missing', 'Invalid']);
    expect(directReport[1].institute).toBe('Not Assigned');
    expect(directReport[2].existing_course_id).toBe('crs-broken-id');

    const value = encodeURIComponent(JSON.stringify(adminUser));
    const sig = await generateAuthCookieSignature(value);
    const res = await leadsGet(
      new NextRequest('http://localhost/api/crm/leads?audit_courses=true', {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${sig}` },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit).toHaveLength(3);
    // Original historical records remain untouched
    expect(store.leads[1].interested_course_id).toBe('');
    expect(store.leads[2].interested_course_id).toBe('crs-broken-id');
  });
});
