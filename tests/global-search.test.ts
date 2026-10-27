import { describe, expect, it, vi } from 'vitest';
import { searchRecords } from '@/lib/services/global-search';
import { store } from '@/lib/services/data-store';
import { createClient } from '@/lib/supabase/db';
import { GET } from '@/app/api/search/route';
import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';

describe('global search', () => {
  const admin = store.users.find((user) => user.role === 'super_admin')!;
  it('requires authentication and returns results through the route with no caching', async () => {
    expect((await GET(new NextRequest('http://localhost/api/search?q=test'))).status).toBe(401);
    const payload = encodeURIComponent(JSON.stringify(admin));
    const request = new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(store.students[0].student_code)}`);
    request.cookies.set(AUTH_COOKIE_NAME, payload);
    request.cookies.set(AUTH_SIG_COOKIE_NAME, generateAuthCookieSignatureSync(payload));
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect((await response.json()).results.some((result: { id: string }) => result.id === store.students[0].id)).toBe(true);
  });
  it('matches names and codes case-insensitively and generates detail links', async () => {
    const student = store.students[0];
    const results = await searchRecords(admin, `  ${student.student_code.toLowerCase()}  `, createClient(admin), false);
    expect(results).toContainEqual(expect.objectContaining({ kind: 'Student', id: student.id, href: `/students/${encodeURIComponent(student.id)}` }));
  });
  it('returns no matches for blank or unknown terms', async () => {
    expect(await searchRecords(admin, '   ', createClient(admin), false)).toEqual([]);
    expect(await searchRecords(admin, 'no-such-record-unique-987654321', createClient(admin), false)).toEqual([]);
  });
  it('does not query financial or CRM records for a trainer', async () => {
    const from = vi.fn(() => ({ select: async () => ({ data: [], error: null }) }));
    await searchRecords({ ...admin, role: 'trainer' }, 'test', { from }, false);
    expect(from.mock.calls.flat()).not.toContain('receipts');
    expect(from.mock.calls.flat()).not.toContain('leads');
  });
  it('filters other tenants, deduplicates and caps each category', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ id: String(index), full_name: 'Needle', student_code: `S${index}`, tenant_id: admin.tenant_id || 'default' }));
    rows.unshift({ ...rows[0], id: 'private', tenant_id: 'other-tenant' });
    const db = { from: () => ({ select: async () => ({ data: [...rows, ...rows], error: null }) }) };
    const results = await searchRecords(admin, 'needle', db, false);
    expect(results.some((row) => row.id === 'private')).toBe(false);
    expect(results.filter((row) => row.kind === 'Student')).toHaveLength(5);
  });
  it('reports database failures instead of returning false empty results', async () => {
    const db = { from: () => ({ select: async () => ({ data: null, error: new Error('offline') }) }) };
    await expect(searchRecords(admin, 'test', db, false)).rejects.toThrow('Search is unavailable');
  });
});
