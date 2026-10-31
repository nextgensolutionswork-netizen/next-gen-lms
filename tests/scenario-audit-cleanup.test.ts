import { describe, expect, it, vi } from 'vitest';
import { executeCleanupWorkflow, validateCleanupPreconditions, TARGET_PAYMENT_IDS, TARGET_FEE_IDS, TARGET_ADMISSION_IDS, TARGET_LEAD_IDS, EXCLUDED_LEAD_IDS } from '@/lib/security/cleanup-dry-run';
import type { WorkflowSnapshot } from '@/lib/security/cleanup-dry-run';

// Only in-memory adapters. Target keys are never sent to a database or storage API.
function fixture() {
  const snapshot: WorkflowSnapshot = {
    studentPayments: TARGET_PAYMENT_IDS.map((id, i) => ({ id, student_fee_id: TARGET_FEE_IDS[i], student_id: `synthetic-student-${i}`, amount: 123, verification_status: 'Pending Verification', recorded_by: 'synthetic-counsellor', proof_url: 'synthetic-proof' })) as any,
    studentFees: TARGET_FEE_IDS.map(id => ({ id, approval_status: 'Approved', final_payable: 456, counsellor_id: 'synthetic-counsellor' })) as any,
    admissions: TARGET_ADMISSION_IDS.map((id, i) => ({ id, lead_id: TARGET_LEAD_IDS[i], status: 'Confirmed' })) as any,
    auditLogs: [{ id: 'synthetic-history' }], untouched: { value: 42 },
  };
  const leads = [...TARGET_LEAD_IDS, ...EXCLUDED_LEAD_IDS].map(id => ({ id, full_name: 'Synthetic Patel fixture', stage: 'New', notes: 'Preserve this synthetic note' }));
  const options = {
    accountantUser: { id: 'synthetic-accountant', full_name: 'Synthetic Accountant', role: 'accountant', tenant_id: 'synthetic-tenant', is_active: true } as any,
    initialRevision: 10n,
    getSnapshot: vi.fn(async () => structuredClone(snapshot)),
    getRelationalLeads: vi.fn(async () => structuredClone(leads)),
    commitRpc: vi.fn(async (_tenant: string, revision: bigint, _state: WorkflowSnapshot) => revision + 1n),
    updateRelationalLeads: vi.fn(async () => {}),
  };
  return { snapshot, leads, options };
}
describe('Scenario audit: cleanup safety contracts', () => {
  it('dry run never calls mutation adapters and preserves the original snapshot', async () => {
    const { snapshot, options } = fixture(); const before = structuredClone(snapshot);
    const result = await executeCleanupWorkflow({ ...options, dryRun: true });
    expect(result.dryRun).toBe(true); expect(options.commitRpc).not.toHaveBeenCalled();
    expect(options.updateRelationalLeads).not.toHaveBeenCalled(); expect(snapshot).toEqual(before);
  });
  it('must not guess a revision after a conflict when the API cannot return the fresh revision', async () => {
    const { options } = fixture();
    options.commitRpc.mockRejectedValueOnce(new Error('40001 Conflict: server revision advanced to 17'));
    await expect(executeCleanupWorkflow(options)).rejects.toThrow();
    expect(options.commitRpc).toHaveBeenCalledTimes(1);
  });
  it('refreshes relational records after conflict and aborts when a target disappears', async () => {
    const { options, leads } = fixture();
    options.getRelationalLeads.mockResolvedValueOnce(leads).mockResolvedValue([]);
    options.commitRpc.mockRejectedValueOnce(new Error('40001 Conflict'));
    await expect(executeCleanupWorkflow(options)).rejects.toThrow();
    expect(options.getRelationalLeads).toHaveBeenCalledTimes(2);
  });
  it('does not retain keys removed from the fresh snapshot on retry', async () => {
    const { options, snapshot } = fixture(); const fresh = structuredClone(snapshot); delete fresh.untouched;
    options.getSnapshot.mockResolvedValueOnce(snapshot).mockResolvedValue(fresh);
    options.commitRpc.mockRejectedValueOnce(new Error('Conflict'));
    await executeCleanupWorkflow(options);
    expect(options.commitRpc.mock.calls[1][2]).not.toHaveProperty('untouched');
  });
  it('rejects a payment that has been reassigned to an unrelated student or fee', () => {
    const { snapshot, leads } = fixture();
    Object.assign(snapshot.studentPayments![0], { student_id: 'unrelated-student', student_fee_id: 'unrelated-fee' });
    expect(validateCleanupPreconditions(snapshot, leads).valid).toBe(false);
  });
  it('commits only in the authenticated actor tenant', async () => {
    const { options } = fixture(); await executeCleanupWorkflow(options);
    expect(options.commitRpc.mock.calls[0][0]).toBe('synthetic-tenant');
  });
  it('reports partial relational failure and preserves amounts, proofs, and history', async () => {
    const { options } = fixture(); options.updateRelationalLeads.mockRejectedValue(new Error('synthetic sync failure'));
    const result = await executeCleanupWorkflow(options);
    expect(result).toMatchObject({ success: false, partialFailure: true, revisionCommitted: 11n });
    const saved = options.commitRpc.mock.calls[0][2];
    expect(saved.studentPayments![0]).toMatchObject({ amount: 123, proof_url: 'synthetic-proof' });
    expect(saved.studentFees![0].final_payable).toBe(456);
    expect(saved.auditLogs).toContainEqual({ id: 'synthetic-history' }); expect(saved.untouched).toEqual({ value: 42 });
  });
  it('stops on retry exhaustion without relational mutations', async () => {
    const { options } = fixture(); options.commitRpc.mockRejectedValue(new Error('Conflict'));
    await expect(executeCleanupWorkflow({ ...options, maxRetries: 2 })).rejects.toThrow('conflict limit');
    expect(options.commitRpc).toHaveBeenCalledTimes(3); expect(options.updateRelationalLeads).not.toHaveBeenCalled();
  });
});
