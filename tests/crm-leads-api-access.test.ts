import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/crm/leads/route';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: mocks.auth }));
vi.mock('@/lib/services/crm-service', () => ({ createLead: mocks.create, getLeads: mocks.list }));
beforeEach(() => { vi.resetAllMocks(); });
const request = () => new NextRequest('http://localhost/api/crm/leads', { method: 'POST', body: JSON.stringify({ full_name: 'Test', counsellor_id: 'spoofed' }) });

it('rejects unauthenticated reads and writes before calling privileged services', async () => {
  mocks.auth.mockRejectedValue(new Error('Unauthorized: Signed session required.'));
  expect((await GET(new NextRequest('http://localhost/api/crm/leads'))).status).toBe(401);
  expect((await POST(request())).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{ role: 'student', tenant_id: 'default' }, { role: 'admin', tenant_id: 'another-institute' }])('denies access outside the legacy CRM scope: %o', async (actor) => {
  mocks.auth.mockResolvedValue(actor);
  expect((await POST(request())).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('binds a counsellor submission to the authenticated staff member', async () => {
  mocks.auth.mockResolvedValue({ id: 'staff-1', role: 'counsellor', tenant_id: 'default' });
  mocks.create.mockResolvedValue({ id: 'saved' });
  expect((await POST(request())).status).toBe(200);
  expect(mocks.create).toHaveBeenCalledWith({ full_name: 'Test', counsellor_id: 'staff-1' });
});
