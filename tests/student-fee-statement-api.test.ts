import { it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ actor: { id: 'reader', tenant_id: 'statement-tenant', role: 'accountant' }, transaction: vi.fn() }));
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: async () => mocks.actor }));
vi.mock('@/lib/services/payment-workflow-transaction', () => ({ paymentTransaction: (...args: unknown[]) => mocks.transaction(...args) }));
import { GET } from '@/app/api/fees/statements/[id]/route';
import { store } from '@/lib/services/data-store';

beforeEach(() => {
  mocks.actor = { id: 'reader', tenant_id: 'statement-tenant', role: 'accountant' };
  mocks.transaction.mockImplementation(async (_actor, operation) => operation());
  store.students = [{ id: 'statement-student', user_id: 'student-user', tenant_id: 'statement-tenant', full_name: 'Synthetic Student', admission_number: 'TEST-1' }] as never;
  store.studentFees = [{ id: 'statement-fee', student_id: 'statement-student', tenant_id: 'statement-tenant', approval_status: 'Approved', final_payable: 45000 }] as never;
  store.feeAccounts = []; store.payments = []; store.studentPayments = []; store.receipts = []; store.installments = []; store.studentFinancialLedgers = [];
});
const get = (suffix = '') => GET(new NextRequest(`http://localhost/api/fees/statements/statement-student${suffix}`), { params: Promise.resolve({ id: 'statement-student' }) });
it('returns fresh tenant-scoped data and a downloadable PDF without a write transaction', async () => {
  const response = await get();
  expect(response.status).toBe(200);
  expect((await response.json()).statement.outstanding).toBe(45000);
  expect(mocks.transaction.mock.calls[0].slice(2)).toEqual([true, true]);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const pdf = await get('?format=pdf');
  expect(pdf.headers.get('content-type')).toBe('application/pdf');
  expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});
it('denies cross-tenant, unprivileged, and other-student access', async () => {
  mocks.actor.tenant_id = 'another-tenant'; expect((await get()).status).toBe(404);
  mocks.actor.tenant_id = 'statement-tenant'; mocks.actor.role = 'trainer'; expect((await get()).status).toBe(403);
  mocks.actor.role = 'student'; expect((await get()).status).toBe(404);
  mocks.actor.id = 'student-user'; expect((await get()).status).toBe(200);
});
it('returns an explicit unavailable response instead of stale statement data', async () => {
  mocks.transaction.mockRejectedValueOnce(new Error('offline'));
  expect((await get()).status).toBe(503);
});
