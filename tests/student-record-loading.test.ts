import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ single: vi.fn(), list: vi.fn(), eq: vi.fn(), live: true }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => mocks.live, createClient: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => ({ select: () => ({
  eq: (...args: unknown[]) => { mocks.eq(...args); return { maybeSingle: mocks.single }; },
  order: mocks.list,
}) }) }) }));
import { getStudentById, getStudents } from '@/lib/services/student-service';
import { store } from '@/lib/services/data-store';

beforeEach(() => { vi.clearAllMocks(); mocks.live = true; vi.stubGlobal('window', {}); });
afterEach(() => vi.unstubAllGlobals());

it('does not replace a failed authorized lookup with a cached student', async () => {
  const id = store.students[0].id;
  mocks.single.mockResolvedValue({ data: null, error: { message: 'network failure' } });
  await expect(getStudentById(id)).rejects.toThrow('Unable to verify');
});

it('treats an RLS-empty successful lookup as absent without a seed fallback', async () => {
  mocks.single.mockResolvedValue({ data: null, error: null });
  expect(await getStudentById(store.students[0].id)).toBeUndefined();
});

it('queries UUIDs and student codes separately instead of sending non-UUID values to the UUID column', async () => {
  mocks.single.mockResolvedValue({ data: { id: 'found' }, error: null });
  await getStudentById('10000000-0000-4000-8000-000000000001');
  expect(mocks.eq).toHaveBeenLastCalledWith('id', '10000000-0000-4000-8000-000000000001');
  await getStudentById('STU-2026-001');
  expect(mocks.eq).toHaveBeenLastCalledWith('student_code', 'STU-2026-001');
});

it('does not populate an empty authorized directory from cached seed records', async () => {
  const previous = store.students;
  try {
    mocks.list.mockResolvedValue({ data: [], error: null });
    expect(await getStudents()).toEqual([]);
    expect(store.students).toEqual([]);
  } finally { store.students = previous; }
});

it('surfaces directory transport failures instead of claiming no students exist', async () => {
  mocks.list.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
  await expect(getStudents()).rejects.toThrow('Unable to load students');
});

it('does not replace the shared directory after its account request is cancelled', async () => {
  const previous = store.students;
  const controller = new AbortController();
  mocks.list.mockImplementation(async () => {
    controller.abort();
    return { data: [{ id: 'obsolete-account-record' }], error: null };
  });
  await expect(getStudents(undefined, controller.signal)).rejects.toThrow('cancelled');
  expect(store.students).toBe(previous);
});
