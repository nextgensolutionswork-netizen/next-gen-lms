import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ auth: vi.fn(), upload: vi.fn(), signed: vi.fn(), write: vi.fn(), mkdir: vi.fn() }));
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: m.auth }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ upload: m.upload, createSignedUrl: m.signed }) } }) }));
vi.mock('fs/promises', () => ({ writeFile: m.write, mkdir: m.mkdir, readFile: vi.fn() }));
import { POST, GET } from '@/app/api/fees/proof/route';
const actor = { id: 'synthetic-owner', role: 'counsellor', tenant_id: 'synthetic-tenant', is_active: true };
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue(actor); m.upload.mockResolvedValue({ error: null }); m.signed.mockResolvedValue({ data: { signedUrl: 'https://storage.example.invalid/synthetic-proof' }, error: null }); });
function request(name = 'synthetic.png', type = 'image/png', size = 8) {
  const form = new FormData(); form.set('file', new File([new Uint8Array(size)], name, { type }));
  return new NextRequest('http://localhost/api/fees/proof', { method: 'POST', body: form });
}
it('uploads through the remote adapter and retrieves an authorized signed URL', async () => {
  const response = await POST(request()); expect(response.status).toBe(200); const data = await response.json();
  expect(data.path).toMatch(/^[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9-]{36}\.png$/);
  const download = await GET(new NextRequest(`http://localhost/api/fees/proof?path=${data.path}`));
  expect(download.status).toBe(307); expect(m.upload).toHaveBeenCalledOnce(); expect(m.write).not.toHaveBeenCalled();
});
it.each([['synthetic.exe', 'application/octet-stream', 8], ['synthetic.png', 'image/png', 10 * 1024 * 1024 + 1]])('rejects invalid upload %s before storage', async (name, type, size) => {
  expect((await POST(request(name as string, type as string, size as number))).status).toBe(400); expect(m.upload).not.toHaveBeenCalled();
});
it('returns a useful remote failure without a successful disk fallback', async () => {
  m.upload.mockResolvedValue({ error: { message: 'Synthetic storage unavailable' } });
  const response = await POST(request()); expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ success: false, error: expect.stringContaining('Synthetic storage unavailable') });
  expect(m.write).not.toHaveBeenCalled(); expect(m.mkdir).not.toHaveBeenCalled();
});
it('denies unauthorized upload before invoking storage', async () => {
  m.auth.mockRejectedValue(new Error('Unauthorized: Synthetic expired session'));
  expect((await POST(request())).status).toBe(401); expect(m.upload).not.toHaveBeenCalled();
});
it('denies another counsellor and tenant access to an uploaded path', async () => {
  const data = await (await POST(request())).json();
  for (const user of [{ ...actor, id: 'different-owner' }, { ...actor, role: 'accountant', tenant_id: 'other-tenant' }]) {
    m.auth.mockResolvedValue(user); expect((await GET(new NextRequest(`http://localhost/api/fees/proof?path=${data.path}`))).status).toBe(403);
  }
  expect(m.signed).not.toHaveBeenCalled();
});
it.each(['../../secret', '%2e%2e%2fsecret'])('rejects path manipulation %s', async path => {
  expect((await GET(new NextRequest(`http://localhost/api/fees/proof?path=${path}`))).status).toBe(400); expect(m.signed).not.toHaveBeenCalled();
});
