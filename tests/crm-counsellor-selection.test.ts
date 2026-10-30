import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createLead } from '@/lib/services/crm-service';

describe('CRM Counsellor Selection & Validation Regression Tests', () => {
  const ANANYA_DESAI_ID = '44444444-4444-4444-4444-444444444444';
  const VALID_COURSE_ID = 'c1000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    store.leads = [];
  });

  it('1. Successfully creates lead in live mode using Ananya Desai authoritative UUID and preserves ID in payload', async () => {
    const dbMock = await import('@/lib/supabase/db');
    vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(true);

    const mockLeadInsert = vi.fn().mockResolvedValue({ error: null });
    const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

    vi.spyOn(dbMock, 'createClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: ANANYA_DESAI_ID,
                    full_name: 'Ananya Desai (Senior Counsellor)',
                    role: 'counsellor',
                    is_active: true,
                    tenant_id: 'default',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'leads') {
          return { insert: mockLeadInsert };
        }
        return { insert: mockAuditInsert };
      }),
    } as any);

    const leadInput = {
      full_name: 'Regression Student',
      phone: '9874563217',
      email: 'test1@gmail.com',
      interested_course_id: VALID_COURSE_ID,
      current_status: 'Working Professional',
      experience_years: 1,
      training_preference: 'Hybrid' as const,
      lead_source: 'Website' as const,
      counsellor_id: ANANYA_DESAI_ID,
      notes: 'Test lead creation with Ananya Desai',
      stage: 'New' as const,
    };

    const created = await createLead(leadInput, { id: ANANYA_DESAI_ID, role: 'counsellor', tenant_id: 'default' });

    expect(created.counsellor_id).toBe(ANANYA_DESAI_ID);
    expect(created.counsellor_name).toBe('Ananya Desai (Senior Counsellor)');
    expect(mockLeadInsert).toHaveBeenCalledTimes(1);
    const insertedPayload = mockLeadInsert.mock.calls[0][0];
    expect(insertedPayload.counsellor_id).toBe(ANANYA_DESAI_ID);
    expect(insertedPayload.interested_course_id).toBe(VALID_COURSE_ID);
  });

  it('2. Rejects legacy non-UUID counsellor ID ("usr-counsellor") in live mode', async () => {
    const dbMock = await import('@/lib/supabase/db');
    vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(true);

    const leadInput = {
      full_name: 'Legacy Counsellor Prospect',
      phone: '9874563217',
      email: 'test1@gmail.com',
      interested_course_id: VALID_COURSE_ID,
      current_status: 'Working Professional',
      experience_years: 1,
      training_preference: 'Hybrid' as const,
      lead_source: 'Website' as const,
      counsellor_id: 'usr-counsellor',
      notes: '',
      stage: 'New' as const,
    };

    await expect(createLead(leadInput)).rejects.toThrow(
      'Invalid counsellor ID: Counsellor must be selected from authorized staff roster (valid UUID required).'
    );
  });

  it('3. Rejects inactive counsellor profile with descriptive error', async () => {
    const dbMock = await import('@/lib/supabase/db');
    vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(true);

    const INACTIVE_COUNSELLOR_ID = '99999999-9999-4999-8999-999999999999';
    vi.spyOn(dbMock, 'createClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: INACTIVE_COUNSELLOR_ID,
                    full_name: 'Inactive Counsellor',
                    role: 'counsellor',
                    is_active: false,
                    tenant_id: 'default',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    } as any);

    const leadInput = {
      full_name: 'Inactive Counsellor Prospect',
      phone: '9874563217',
      email: 'test1@gmail.com',
      interested_course_id: VALID_COURSE_ID,
      current_status: 'Working Professional',
      experience_years: 1,
      training_preference: 'Hybrid' as const,
      lead_source: 'Website' as const,
      counsellor_id: INACTIVE_COUNSELLOR_ID,
      notes: '',
      stage: 'New' as const,
    };

    await expect(createLead(leadInput)).rejects.toThrow(
      'Invalid counsellor ID: Assigned counsellor is inactive.'
    );
  });

  it('4. Rejects unauthorized staff role (e.g. student or trainer without counselling rights)', async () => {
    const dbMock = await import('@/lib/supabase/db');
    vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(true);

    const STUDENT_ID = '77777777-7777-4777-8777-777777777771';
    vi.spyOn(dbMock, 'createClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: STUDENT_ID,
                    full_name: 'Student Account',
                    role: 'student',
                    is_active: true,
                    tenant_id: 'default',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    } as any);

    const leadInput = {
      full_name: 'Student Assigned Prospect',
      phone: '9874563217',
      email: 'test1@gmail.com',
      interested_course_id: VALID_COURSE_ID,
      current_status: 'Working Professional',
      experience_years: 1,
      training_preference: 'Hybrid' as const,
      lead_source: 'Website' as const,
      counsellor_id: STUDENT_ID,
      notes: '',
      stage: 'New' as const,
    };

    await expect(createLead(leadInput)).rejects.toThrow(
      'Invalid counsellor ID: Assigned staff member is not authorized for lead counselling.'
    );
  });

  it('5. Rejects cross-tenant counsellor assignment', async () => {
    const dbMock = await import('@/lib/supabase/db');
    vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(true);

    const OTHER_TENANT_COUNSELLOR = '55555555-5555-4555-8555-555555555555';
    vi.spyOn(dbMock, 'createClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: OTHER_TENANT_COUNSELLOR,
                    full_name: 'Other Tenant Counsellor',
                    role: 'counsellor',
                    is_active: true,
                    tenant_id: 'tenant-beta',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    } as any);

    const leadInput = {
      full_name: 'Cross Tenant Prospect',
      phone: '9874563217',
      email: 'test1@gmail.com',
      interested_course_id: VALID_COURSE_ID,
      current_status: 'Working Professional',
      experience_years: 1,
      training_preference: 'Hybrid' as const,
      lead_source: 'Website' as const,
      counsellor_id: OTHER_TENANT_COUNSELLOR,
      notes: '',
      stage: 'New' as const,
    };

    await expect(
      createLead(leadInput, { id: 'admin-id', role: 'admin', tenant_id: 'tenant-alpha' })
    ).rejects.toThrow('Invalid counsellor ID: Counsellor belongs to another tenant.');
  });

  it('6. Fallback verification resolves Ananya Desai from store.users when profiles PostgREST query is blocked by RLS', async () => {
    const dbMock = await import('@/lib/supabase/db');
    vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(true);

    const mockLeadInsert = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(dbMock, 'createClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: mockLeadInsert };
      }),
    } as any);

    const leadInput = {
      full_name: 'RLS Fallback Student',
      phone: '9874563217',
      email: 'test1@gmail.com',
      interested_course_id: VALID_COURSE_ID,
      current_status: 'Working Professional',
      experience_years: 1,
      training_preference: 'Hybrid' as const,
      lead_source: 'Website' as const,
      counsellor_id: ANANYA_DESAI_ID,
      notes: 'Testing RLS fallback to store.users',
      stage: 'New' as const,
    };

    const created = await createLead(leadInput);
    expect(created.counsellor_id).toBe(ANANYA_DESAI_ID);
    expect(created.counsellor_name).toBe('Ananya Desai (Senior Counsellor)');
  });
});
