import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ profile: vi.fn(), insert: vi.fn(), audit: vi.fn(), persist: vi.fn() }));
vi.mock('@/lib/services/data-store', () => ({ store: { users: [], leads: [], courses: [], persist: m.persist } }));
vi.mock('@/lib/services/audit-service', () => ({ recordAuditLog: m.audit }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true, createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.profile }), order: () => ({ limit: async () => ({ data: [] }) }) }), insert: m.insert }) }) }));
import { store } from '@/lib/services/data-store';
import { createLead, getLeadById } from '@/lib/services/crm-service';
const actor = '22222222-2222-4222-8222-222222222222';
const input: any = { full_name: 'Synthetic Audit', email: 'synthetic@example.invalid', phone: '9990001234', interested_course_id: '11111111-1111-4111-8111-111111111111', counsellor_id: actor, stage: 'New' };
beforeEach(() => { vi.clearAllMocks(); store.leads = []; store.users = [{ id: actor, role: 'counsellor', is_active: true } as any]; m.profile.mockResolvedValue({ data: null, error: null }); m.insert.mockResolvedValue({ error: null }); });
it('rejects a cached counsellor missing from the authoritative roster', async () => {
  await expect(createLead(input)).rejects.toThrow(); expect(m.insert).not.toHaveBeenCalled();
});
it('does not return a stale local lead when the authoritative row is missing', async () => {
  store.leads = [{ ...input, id: actor }]; expect(await getLeadById(actor)).toBeUndefined();
});
it('does not create a ghost or success audit when insert rejects with a timeout', async () => {
  m.profile.mockResolvedValue({ data: store.users[0], error: null }); m.insert.mockRejectedValue(new Error('Synthetic timeout'));
  await expect(createLead(input)).rejects.toThrow('Synthetic timeout'); expect(store.leads).toHaveLength(0); expect(m.audit).not.toHaveBeenCalled();
});
