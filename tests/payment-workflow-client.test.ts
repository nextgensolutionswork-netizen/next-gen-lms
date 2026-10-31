import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/payment-workflow-state', () => ({ mergeWorkflowSnapshot: vi.fn() }));
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import { mergeWorkflowSnapshot } from '@/lib/services/payment-workflow-state';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('payment refresh requests', () => {
  it('sends explicitly entered verification values and preserves field errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: 'Mismatch', fieldErrors: { amount: 'Amount Received does not match this payment record.' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const verification = { reference: 'MANUAL-REF', amount: '1250.50', payment_date: '2026-10-31' };
    await expect(paymentWorkflowClient.verifyPayment('payment-1', 'accountant', 'Checked', verification)).rejects.toMatchObject({ fieldErrors: { amount: expect.stringContaining('does not match') } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'approve', paymentId: 'payment-1', notes: 'Checked', verification });
    expect(mergeWorkflowSnapshot).not.toHaveBeenCalled();
  });

  it('shares overlapping reads and fetches fresh data after completion', async () => {
    let resolve!: (value: unknown) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetchMock);
    const first = paymentWorkflowClient.refresh();
    const second = paymentWorkflowClient.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve({ ok: true, json: async () => ({ success: true, snapshot: { studentPayments: [] } }) });
    await Promise.all([first, second]);
    expect(mergeWorkflowSnapshot).toHaveBeenCalledTimes(1);
    const next = paymentWorkflowClient.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolve({ ok: true, json: async () => ({ success: true }) });
    await next;
  });

  it('allows retry after a failed shared request', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(paymentWorkflowClient.refresh()).rejects.toThrow('offline');
    await expect(paymentWorkflowClient.refresh()).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
