import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ query: vi.fn(), update: vi.fn(), returning: vi.fn(), single: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => ({
  select: () => ({ eq: m.query }),
  update: m.update,
}) }) }));
import { getDb } from '@/lib/supabase/db';
import { store } from '@/lib/services/data-store';
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('window', {});
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://isolated.invalid'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'synthetic-public');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('returns live read errors instead of local records', async () => {
  m.query.mockResolvedValue({ data: null, error: { code: '42501', message: 'Denied' } });
  const result = await getDb(store.users[0]).from('profiles').select('*').eq('id', store.users[0].id);
  expect(result.error.code).toBe('42501'); expect(result.data).toBeNull();
});
it('does not mutate the local store on a failed live update', async () => {
  const lead = store.leads[0]; const stage = lead.stage;
  m.update.mockReturnValue({ eq: () => Promise.resolve({ data: null, error: { message: 'Denied' } }) });
  const result = await getDb(store.users[0]).from('leads').update({ stage: 'Lost' }).eq('id', lead.id);
  expect(result.error.message).toBe('Denied'); expect(lead.stage).toBe(stage);
});
it('preserves update when requesting returned rows', async () => {
  m.single.mockResolvedValue({ data: { id: 'synthetic', stage: 'Lost' }, error: null });
  m.returning.mockReturnValue({ eq: () => ({ single: m.single }) });
  m.update.mockReturnValue({ select: m.returning });
  const result = await getDb().from('leads').update({ stage: 'Lost' }).eq('id', 'synthetic').select('*').single();
  expect(m.update).toHaveBeenCalledWith({ stage: 'Lost' }); expect(m.returning).toHaveBeenCalledWith('*'); expect(result.data.stage).toBe('Lost');
});
it('turns transport exceptions into errors, not local success', async () => {
  m.query.mockRejectedValue(new Error('Offline'));
  const result = await getDb().from('leads').select('*').eq('id', 'synthetic');
  expect(result.error.message).toBe('Offline'); expect(result.data).toBeNull();
});
