import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createLead } from '@/lib/services/crm-service';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true, createClient: vi.fn(() => { throw new Error('Fallback client must not be used'); }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }) }));
vi.mock('@/lib/services/audit-service', () => ({ recordAuditLog: mocks.audit }));

describe('lead creation with stale or concurrent browser state', () => {
  const input = { full_name: 'Regression Lead', email: 'lead@example.test', phone: '9999999999', stage: 'New' as const };
  const original = store.leads;
  beforeEach(() => {
    vi.clearAllMocks();
    store.leads = [];
    vi.spyOn(store, 'persist').mockImplementation(() => {});
    mocks.insert.mockResolvedValue({ error: null });
  });
  afterEach(() => { store.leads = original; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('uses the server API in the browser and caches only its accepted record', async () => {
    vi.stubGlobal('window', {});
    const saved = { ...input, id: 'server-id', lead_code: 'LD-server' };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, lead: saved }) });
    vi.stubGlobal('fetch', fetch);
    expect(await createLead(input)).toEqual(saved);
    expect(fetch).toHaveBeenCalledWith('/api/crm/leads', expect.objectContaining({ method: 'POST' }));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(store.leads).toEqual([saved]);
  });

  it('creates distinct UUID IDs and codes for simultaneous submissions with an empty cache', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-06-01T12:00:00Z'));
    const leads = await Promise.all(Array.from({ length: 50 }, () => createLead(input)));
    expect(new Set(leads.map(l => l.id)).size).toBe(50);
    expect(new Set(leads.map(l => l.lead_code)).size).toBe(50);
    expect(leads.every(l => l.lead_code.startsWith('LD-2031-'))).toBe(true);
    expect(leads[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('regenerates a conflicting code without altering the lead ID', async () => {
    mocks.insert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key violates unique constraint "leads_lead_code_key"' } });
    const lead = await createLead(input);
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.insert.mock.calls.map(call => call[0]);
    expect(first.id).toBe(second.id);
    expect(first.lead_code).not.toBe(second.lead_code);
    expect(lead.lead_code).toBe(second.lead_code);
    expect(store.leads).toHaveLength(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it('does not cache or audit an insert before the database accepts it', async () => {
    let finish!: (value: any) => void;
    mocks.insert.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = createLead(input);
    expect(store.leads).toHaveLength(0);
    expect(store.persist).not.toHaveBeenCalled();
    finish({ error: { code: '42501', message: 'permission denied' } });
    await expect(pending).rejects.toThrow('permission denied');
    expect(store.leads).toHaveLength(0);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
  it('bounds collision retries and preserves existing records on failure', async () => {
    const existing = { ...input, id: 'existing', lead_code: 'LD-2026-001', created_at: '', updated_at: '' };
    store.leads = [existing];
    mocks.insert.mockResolvedValue({ error: { code: '23505', message: 'leads_lead_code_key' } });
    await expect(createLead(input)).rejects.toThrow('leads_lead_code_key');
    expect(mocks.insert).toHaveBeenCalledTimes(3);
    expect(store.leads).toEqual([existing]);
  });
  it('does not retry unrelated unique violations or ambiguous network failures', async () => {
    mocks.insert.mockResolvedValueOnce({ error: { code: '23505', message: 'leads_email_key' } });
    await expect(createLead(input)).rejects.toThrow('leads_email_key');
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    mocks.insert.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(createLead(input)).rejects.toThrow('network unavailable');
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(store.leads).toHaveLength(0);
  });
});
