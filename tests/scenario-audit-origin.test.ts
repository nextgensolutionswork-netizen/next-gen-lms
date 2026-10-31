import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { validateCsrfOrigin } from '@/lib/security/rate-limiter';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
afterEach(() => vi.unstubAllEnvs());
it('does not let a client-provided forwarded host approve a foreign production origin', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(validateCsrfOrigin(new NextRequest('https://lms.example.invalid/api/auth/login', { method: 'POST', headers: { origin: 'https://attacker.example.invalid', 'x-forwarded-host': 'attacker.example.invalid' } }))).toBe(false);
});
it('payment origin validation rejects the same spoofed forwarded host before authentication', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  await expect(authenticatePaymentRequest(new NextRequest('https://lms.example.invalid/api/fees/payments', { method: 'POST', headers: { origin: 'https://attacker.example.invalid', 'x-forwarded-host': 'attacker.example.invalid' } }))).rejects.toThrow('Invalid request origin');
});
