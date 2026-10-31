import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ courses: [] as any[], response: {} as any, query: vi.fn() }));
vi.mock('@/lib/services/data-store', () => ({ store: fixture }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fixture.query }) }));
import { validateAdmissionCourse } from '@/lib/services/admission-course';
const id = 'c1000000-0000-0000-0000-000000000001';
beforeEach(() => {
  fixture.courses = [{ id, course_name: 'Stale cached name' }, { id: 'crs-fico-01' }];
  fixture.response = { data: { id, course_name: 'Authoritative name' }, error: null };
  fixture.query.mockReset().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => fixture.response }) }) });
});
describe('SA-004 new live admissions require canonical database courses', () => {
  it('validates against the database even when the cached course matches', async () => {
    expect(await validateAdmissionCourse(id, 'default')).toEqual(fixture.response.data);
    expect(fixture.query).toHaveBeenCalledWith('courses');
    expect(fixture.courses[0].course_name).toBe('Stale cached name');
  });
  it.each(['crs-fico-01', 'crs-mm-01', 'crs-abap-01', '', 'unknown'])('rejects noncanonical new admission %s', async (value) => {
    await expect(validateAdmissionCourse(value, 'default')).rejects.toThrow('canonical');
    expect(fixture.query).not.toHaveBeenCalled();
  });
  it('rejects a UUID absent from the live database despite cached data', async () => {
    fixture.response.data = null;
    await expect(validateAdmissionCourse(id, 'default')).rejects.toThrow('Invalid Course');
  });
  it('fails closed on catalog errors despite cached data', async () => {
    fixture.response = { data: null, error: { message: 'Synthetic database outage' } };
    await expect(validateAdmissionCourse(id, 'default')).rejects.toThrow('Unable to validate course catalog');
  });
  it('rejects a foreign tenant course from an adapter', async () => {
    fixture.response.data.tenant_id = 'tenant-b';
    await expect(validateAdmissionCourse(id, 'default')).rejects.toThrow('Invalid Course');
  });
  it('rejects an archived course', async () => {
    fixture.response.data.status = 'Archived';
    await expect(validateAdmissionCourse(id, 'default')).rejects.toThrow('Archived');
  });
});
