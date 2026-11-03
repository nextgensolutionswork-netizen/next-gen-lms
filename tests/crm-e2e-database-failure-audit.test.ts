import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), select: vi.fn(), actor: { id: '11111111-1111-4111-8111-111111111111', role: 'counsellor', tenant_id: 'default' } }));
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: async () => mocks.actor }));
vi.mock('@/lib/services/audit-service', () => ({ recordAuditLog: vi.fn() }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true, createClient: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert: mocks.insert, update: (v: any) => ({ eq: () => mocks.update(v) }), select: () => ({ order: () => mocks.select() }) }) }) }));
import { store } from '@/lib/services/data-store';
import { createLead, getLeads, updateLeadDetails } from '@/lib/services/crm-service';
import { POST } from '@/app/api/crm/leads/route';
const input = () => ({ full_name: 'Synthetic Network Audit', phone: '9876543210', email: 'network@example.test', stage: 'New' as const, country_code: '+91', whatsapp_country_code: '+971', whatsapp_number: '501234567', counsellor_id: mocks.actor.id });
beforeEach(() => { store.leads = []; store.admissions = []; vi.clearAllMocks(); mocks.insert.mockResolvedValue({ error: null }); mocks.update.mockResolvedValue({ error: null }); mocks.select.mockResolvedValue({ data: [], error: null }); });
it('CRM-062 creation network timeout fails without local lead', async () => {
  mocks.insert.mockRejectedValue(new Error('Synthetic network timeout'));
  await expect(createLead(input())).rejects.toThrow(/timeout/); expect(store.leads).toHaveLength(0);
});
it('CRM-063 creation database failure fails without local lead', async () => {
  mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'Synthetic database denial' } });
  await expect(createLead(input())).rejects.toThrow(/denial/); expect(store.leads).toHaveLength(0);
});
it('CRM-068 missing-column errors must not silently drop enhanced fields and report success', async () => {
  mocks.insert.mockResolvedValueOnce({ error: { code: '42703', message: 'column canonical_phone does not exist' } }).mockResolvedValueOnce({ error: null });
  await expect(createLead(input())).rejects.toThrow();
});
it('CRM-067-068 failed edit preserves original data and reports failure', async () => {
  const l = await createLead(input()); mocks.update.mockResolvedValue({ error: { code: '42501', message: 'Synthetic update denied' } });
  await expect(updateLeadDetails(l.id, { full_name: 'Must not persist' }, mocks.actor.id)).rejects.toThrow();
  expect(l.full_name).toBe('Synthetic Network Audit');
});
it('CRM-109 database read failures must not return cached leads as authoritative', async () => {
  await createLead(input()); mocks.select.mockResolvedValue({ data: null, error: { message: 'Synthetic unavailable' } });
  await expect(getLeads()).rejects.toThrow();
});
it('CRM-108 database errors must not expose internal schema details', async () => {
  mocks.insert.mockResolvedValue({ error: { code: 'XX000', message: 'private_internal_table synthetic-secret-marker' } });
  const res = await POST(new NextRequest('http://localhost/api/crm/leads', { method: 'POST', body: JSON.stringify(input()) }));
  expect(res.status).toBe(400); expect(JSON.stringify(await res.json())).not.toContain('synthetic-secret-marker');
});
it('CRM-106 legacy course assignments must not be silently stored as NULL', async () => {
  const payloads: any[] = []; mocks.insert.mockImplementation(async v => { payloads.push(structuredClone(v)); return { error: null }; });
  await createLead({ ...input(), interested_course_id: 'crs-001' });
  expect(payloads[0].interested_course_id).not.toBeNull();
});
