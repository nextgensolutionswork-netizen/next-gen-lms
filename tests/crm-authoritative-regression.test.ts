import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ read: vi.fn(), profile: vi.fn(), save: vi.fn(), insert: vi.fn(), persist: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/services/data-store', () => ({ store: { leads: [], courses: [], users: [], persist: m.persist } }));
vi.mock('@/lib/services/audit-service', () => ({ recordAuditLog: m.audit }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true, createClient: () => ({ from: () => ({
  select: () => ({ order: m.read, eq: () => ({ maybeSingle: m.profile }) }),
  update: () => ({ eq: () => ({ select: () => ({ single: m.save }) }) }),
  insert: m.insert,
}) }) }));
import { store } from '@/lib/services/data-store';
import { createLead, getLeads, updateLeadStage } from '@/lib/services/crm-service';
const id = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const lead = () => ({ id, full_name: 'Synthetic Candidate', email: 'audit@example.invalid', phone: '9990001234', lead_code: 'LD-2026-001', stage: 'New', created_at: '2026-10-29' } as any);
beforeEach(() => { vi.clearAllMocks(); store.leads = [lead()]; m.insert.mockResolvedValue({ error: null }); m.save.mockResolvedValue({ data: { ...lead(), stage: 'Follow-up' }, error: null }); });
it('rejects empty course before any live insertion', async () => {
  await expect(createLead({ ...lead(), interested_course_id: '', counsellor_id: actor })).rejects.toThrow('select a course');
  expect(m.insert).not.toHaveBeenCalled();
});
it('does not use a cached counsellor after live profile access is denied', async () => {
  store.users = [{ id: actor, role: 'counsellor', is_active: true } as any];
  m.profile.mockResolvedValue({ data: null, error: { message: 'Synthetic profile denied' } });
  await expect(createLead({ ...lead(), interested_course_id: id, counsellor_id: actor })).rejects.toThrow('authorized staff roster');
  expect(m.insert).not.toHaveBeenCalled();
});
it.each(['Synthetic RLS rejection', 'Synthetic network failure'])('keeps state unchanged on failed stage save: %s', async (message) => {
  m.save.mockResolvedValue({ data: null, error: { message } });
  await expect(updateLeadStage(id, 'Follow-up', 'Note', actor)).rejects.toThrow(message);
  expect(store.leads[0].stage).toBe('New'); expect(m.persist).not.toHaveBeenCalled(); expect(m.insert).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
});
it('rejects a zero-row update instead of claiming success', async () => {
  m.save.mockResolvedValue({ data: null, error: null });
  await expect(updateLeadStage(id, 'Follow-up', '', actor)).rejects.toThrow('not updated');
  expect(store.leads[0].stage).toBe('New');
});
it('waits for acknowledgement before persisting', async () => {
  let finish!: (value: any) => void;
  m.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = updateLeadStage(id, 'Follow-up', '', actor);
  expect(store.leads[0].stage).toBe('New'); expect(m.persist).not.toHaveBeenCalled();
  finish({ data: { ...lead(), stage: 'Follow-up' }, error: null });
  await pending; expect(store.leads[0].stage).toBe('Follow-up'); expect(m.insert).toHaveBeenCalledOnce();
});
it('reports partial history failure accurately after an acknowledged stage update', async () => {
  m.insert.mockResolvedValue({ error: { message: 'Synthetic history denied' } });
  await expect(updateLeadStage(id, 'Follow-up', '', actor)).rejects.toThrow('Lead stage saved, but follow-up history');
  expect(store.leads[0].stage).toBe('Follow-up'); expect(m.audit).not.toHaveBeenCalled();
});
it.each(['synthetic', 'AUDIT@EXAMPLE.INVALID', '999000', 'ld-2026', '  Synthetic  '])('searches live results by %s', async (search) => {
  m.read.mockResolvedValue({ data: [lead()], error: null }); expect(await getLeads({ search })).toHaveLength(1);
});
it('returns no matches instead of unfiltered live results', async () => {
  m.read.mockResolvedValue({ data: [lead()], error: null }); expect(await getLeads({ search: 'missing' })).toEqual([]);
});
it('clears stale cached leads on an empty authoritative result', async () => {
  m.read.mockResolvedValue({ data: [], error: null }); expect(await getLeads()).toEqual([]); expect(store.leads).toEqual([]);
});
it('does not expose local leads when the live read fails', async () => {
  m.read.mockResolvedValue({ data: null, error: { message: 'Denied' } }); await expect(getLeads()).rejects.toThrow('Denied');
});
