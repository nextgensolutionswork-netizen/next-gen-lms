import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ sync: vi.fn(), commit: vi.fn() }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: m.commit,
  from: (table: string) => ({ select: () => ({ eq: () => {
    const result = Promise.resolve(table === 'profiles' ? { data: [{ id: 'synthetic-actor', role: 'counsellor', is_active: true, tenant_id: 'synthetic-tenant' }], error: null } : { data: { revision: 12, snapshot: {} }, error: null });
    return Object.assign(result, { maybeSingle: () => result });
  } }), update: () => ({ eq: m.sync }) }),
}) }));
import { store } from '@/lib/services/data-store';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
it('reports a partial failure when relational conversion rejects after workflow commit', async () => {
  store.leads = [{ id: 'synthetic-lead', stage: 'New', tenant_id: 'synthetic-tenant' } as any];
  m.commit.mockResolvedValue({ data: 13, error: null }); m.sync.mockResolvedValue({ data: null, error: { message: 'Synthetic relational lead denied' } });
  const actor = { id: 'synthetic-actor', role: 'counsellor', is_active: true, tenant_id: 'synthetic-tenant' } as any;
  await expect(paymentTransaction(actor, () => { store.leads[0].stage = 'Converted'; return { success: true }; })).rejects.toThrow();
  expect(m.commit).toHaveBeenCalledOnce(); expect(m.sync).toHaveBeenCalledOnce();
});
