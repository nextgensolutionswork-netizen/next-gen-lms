import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function createMockRequest(url: string, cookieValue?: string) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: {
      host: 'localhost:3000',
    },
  });

  if (cookieValue) {
    req.cookies.set('next_gen_auth_user', cookieValue);
  }

  return req;
}

describe('8. Middleware & Session Verification Tests', () => {
  it('redirects unauthenticated user from protected /dashboard to /login with redirectTo', async () => {
    const req = createMockRequest('http://localhost:3000/dashboard');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('redirectTo=%2Fdashboard');
  });

  it('redirects unauthenticated user from protected /portal to /login with redirectTo', async () => {
    const req = createMockRequest('http://localhost:3000/portal');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('redirectTo=%2Fportal');
  });

  it('allows unauthenticated visitor to access public /login page', async () => {
    const req = createMockRequest('http://localhost:3000/login');
    const res = await middleware(req);

    // Should not redirect
    expect(res.status).toBe(200);
  });

  it('allows unauthenticated visitor to access public certificate verification', async () => {
    const req = createMockRequest('http://localhost:3000/certificate/verify/CERT-2026-FICO-0091');
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it('allows authenticated super_admin to access /dashboard', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-001',
        email: 'superadmin@next-generpsolutions.com',
        role: 'super_admin',
      })
    );
    const req = createMockRequest('http://localhost:3000/dashboard', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it('allows authenticated student to access /portal', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req = createMockRequest('http://localhost:3000/portal', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it('redirects authenticated student attempting to access staff /settings route to /portal', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req = createMockRequest('http://localhost:3000/settings', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/portal');
  });

  it('redirects authenticated student attempting to access staff /users route to /portal', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req = createMockRequest('http://localhost:3000/users', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/portal');
  });

  it('redirects authenticated visitor visiting /login to their appropriate dashboard/portal', async () => {
    const studentCookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req1 = createMockRequest('http://localhost:3000/login', studentCookie);
    const res1 = await middleware(req1);
    expect(res1.status).toBe(307);
    expect(res1.headers.get('location')).toContain('/portal');

    const adminCookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-001',
        email: 'superadmin@next-generpsolutions.com',
        role: 'super_admin',
      })
    );
    const req2 = createMockRequest('http://localhost:3000/login', adminCookie);
    const res2 = await middleware(req2);
    expect(res2.status).toBe(307);
    expect(res2.headers.get('location')).toContain('/dashboard');
  });
});
