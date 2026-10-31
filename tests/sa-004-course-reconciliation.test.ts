import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveCourseId, tenantRecords, visibleCourses } from '@/lib/utils/course-resolver';
import { courseBucket, paymentCourseBucket, UNASSIGNED_COURSE } from '@/lib/utils/dashboard-metrics';
import evidence from '@/docs/audits/sa-004-affected-records.json';

const fixture = vi.hoisted(() => ({ courses: [] as any[], response: {} as any }));
vi.mock('@/lib/services/data-store', () => ({ store: fixture }));
vi.mock('@/lib/services/audit-service', () => ({ recordAuditLog: vi.fn() }));
vi.mock('@/lib/supabase/db', () => ({
  isLiveSupabaseEnabled: () => true,
  createClient: () => ({ from: () => ({ select: () => ({
    order: async () => { if (fixture.response instanceof Error) throw fixture.response; return fixture.response; },
    eq: () => ({ maybeSingle: async () => fixture.response }),
  }) }) }),
}));
import { getCourses, getCourseById } from '@/lib/services/academics-service';

const fico = 'c1000000-0000-0000-0000-000000000001';
const mm = 'c1000000-0000-0000-0000-000000000002';
const sd = 'c1000000-0000-0000-0000-000000000003';
const abap = 'c1000000-0000-0000-0000-000000000004';
const catalog = new Set([fico, mm, sd, abap]);

describe('SA-004 course reconciliation acceptance', () => {
  it.each(evidence.records)('resolves affected record $student_id without rewriting admission data', (record) => {
    const before = structuredClone(record);
    expect(courseBucket(record.student_course_id, catalog, evidence.tenant)).toBe(record.candidate_course_id);
    expect(courseBucket(record.admission_course_id, catalog, evidence.tenant)).toBe(record.candidate_course_id);
    expect(record).toEqual(before);
  });
  it('recognizes a valid canonical course ID', () => {
    expect(courseBucket(fico, catalog)).toBe(fico);
  });
  it.each([undefined, '', 'deleted-course'])('keeps missing or invalid ID %s unresolved', (id) => {
    expect(courseBucket(id, catalog)).toBe(UNASSIGNED_COURSE);
  });
  it('reconciles all 22 records including all 13 legacy assignments without modifying them', () => {
    // Aggregate distribution from read-only default-tenant snapshot revision 75.
    const ids = [...Array(6).fill(fico), mm, sd, abap,
      ...Array(11).fill('crs-fico-01'), 'crs-mm-01', 'crs-abap-01'];
    const before = [...ids];
    const unresolved = ids.filter((id) => courseBucket(id, catalog) === UNASSIGNED_COURSE);
    expect(ids).toHaveLength(22);
    expect(unresolved).toHaveLength(0);
    expect([fico, mm, sd, abap].map((id) => ids.filter((stored) => courseBucket(stored, catalog) === id).length)).toEqual([17, 2, 1, 2]);
    expect(ids.length - unresolved.length).toBe(22);
    expect(unresolved.every(Boolean)).toBe(true);
    expect(ids).toEqual(before);
  });
  it('a stored Admissions label does not establish catalog referential integrity', () => {
    const admission = { course_id: 'unknown', course_name: 'SAP S/4HANA Finance (FICO)' };
    expect(admission.course_name).toBe('SAP S/4HANA Finance (FICO)');
    expect(courseBucket(admission.course_id, catalog)).toBe(UNASSIGNED_COURSE);
  });
  it.each([['crs-fico-01', fico], ['crs-mm-01', mm], ['crs-abap-01', abap]])(
    'legacy %s should reconcile to a reviewed canonical alias %s', (legacy, canonical) => {
      expect(courseBucket(legacy, catalog)).toBe(canonical);
    });
});

describe('SA-004 catalog failures (mock database; no network)', () => {
  beforeEach(() => { fixture.courses = [{ id: 'crs-fico-01', course_name: 'Cached FICO' }]; });
  it('replaces legacy cached courses after a successful live catalog read', async () => {
    fixture.response = { data: [{ id: fico, course_name: 'Canonical FICO' }], error: null };
    expect(await getCourses()).toEqual(fixture.response.data);
    expect(courseBucket('crs-fico-01', new Set(fixture.courses.map((c) => c.id)))).toBe(fico);
  });
  it('rejects a catalog database error without returning cached courses', async () => {
    fixture.response = { data: null, error: { message: 'Synthetic catalog read denied' } };
    await expect(getCourses()).rejects.toThrow('Unable to load course catalog');
  });
  it('clears stale catalog after a successful empty result', async () => {
    fixture.response = { data: [], error: null };
    expect(await getCourses()).toHaveLength(0);
    expect(fixture.courses).toEqual([]);
  });
  it('propagates transport failures instead of using cached courses', async () => {
    fixture.response = new Error('Synthetic network failure');
    await expect(getCourses()).rejects.toThrow('Unable to load course catalog');
  });
  it('does not resurrect a deleted course from cache', async () => {
    fixture.response = { data: null, error: null };
    await expect(getCourseById('crs-fico-01')).resolves.toBeUndefined();
  });
  it('surfaces errors from individual course retrieval', async () => {
    fixture.response = { data: null, error: { message: 'Synthetic catalog read denied' } };
    await expect(getCourseById(fico)).rejects.toThrow('Unable to load course');
  });
});

describe('SA-004 tenant and catalog boundaries', () => {
  it('never applies default-tenant aliases to another tenant', () => {
    expect(courseBucket('crs-fico-01', catalog, 'tenant-b')).toBe(UNASSIGNED_COURSE);
    expect(courseBucket(fico, catalog, 'tenant-b')).toBe(fico);
  });
  it('counts only the authenticated tenant, including untagged legacy rows only for default', () => {
    const rows = [{ id: 'a', course_id: 'crs-fico-01' }, { id: 'b', tenant_id: 'tenant-b', course_id: fico }];
    expect(tenantRecords(rows, 'default').map((r) => r.id)).toEqual(['a']);
    expect(tenantRecords(rows, 'tenant-b').map((r) => r.id)).toEqual(['b']);
  });
  it('requires an available alias target and never resolves against foreign owned catalog rows', () => {
    const visible = visibleCourses([{ id: fico, tenant_id: 'tenant-b' }], 'default');
    expect(resolveCourseId('crs-fico-01', new Set(visible.map((c) => c.id)))).toBeUndefined();
  });
  it('deduplicates aliases in a mixed catalog so filters and totals use one row', () => {
    const visible = visibleCourses([{ id: fico }, { id: 'crs-fico-01' }, { id: mm }], 'default');
    expect(visible.map((c) => c.id)).toEqual([fico, mm]);
  });
  it('preserves historical payment attribution and prevents cross-tenant fallback', () => {
    expect(paymentCourseBucket({ course_id: 'crs-fico-01', student_id: 's' }, catalog, [], [{ id: 's', course_id: mm }])).toBe(fico);
    expect(paymentCourseBucket({ course_id: 'deleted', student_id: 's' }, catalog, [], [{ id: 's', course_id: mm }])).toBe(UNASSIGNED_COURSE);
    expect(paymentCourseBucket({ fee_account_id: 'f', student_id: 's' }, catalog,
      [{ id: 'f', course_id: fico, tenant_id: 'foreign' }], [{ id: 's', course_id: mm, tenant_id: 'foreign' }])).toBe(UNASSIGNED_COURSE);
    expect(paymentCourseBucket({ tenant_id: 'foreign', course_id: fico, student_id: 's' }, catalog, [], [])).toBe(UNASSIGNED_COURSE);
  });
});
