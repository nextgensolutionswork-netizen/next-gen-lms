import { store } from './data-store';
import { tenantId } from '@/lib/auth/tenant';
import type { UserProfile } from '@/types';

export const workflowKeys = ['studentPayments', 'studentFees', 'studentFinancialLedgers', 'feeAccounts', 'installments', 'payments', 'receipts', 'students', 'admissions', 'onboardingCases', 'onboardingAuditLogs', 'notifications', 'auditLogs', 'users', 'batches', 'leads', 'feeApprovalHistories', 'feeRevisionRequests', 'feeCategories'] as const;
export type WorkflowSnapshot = Record<typeof workflowKeys[number], any[]>;

export function workflowSnapshot(tenant: string): WorkflowSnapshot {
  const students = new Set(store.students.filter((s) => tenantId(s) === tenant).map((s) => s.id));
  const users = new Set(store.users.filter((u) => tenantId(u) === tenant).map((u) => u.id));
  return Object.fromEntries(workflowKeys.map((key) => [key, structuredClone((store[key] as any[]).filter((r) =>
    r.tenant_id ? r.tenant_id === tenant : r.student_id ? students.has(r.student_id) : r.user_id ? users.has(r.user_id) : tenant === 'default'
  ).map((r) => ({ ...r, tenant_id: tenant })))])) as WorkflowSnapshot;
}

export function mergeWorkflowSnapshot(snapshot: Partial<WorkflowSnapshot>, tenant?: string): void {
  for (const key of workflowKeys) {
    if (!snapshot[key]) continue;
    const rows = snapshot[key]!;
    const ids = new Set(rows.map((r) => r.id));
    (store as any)[key] = typeof window !== 'undefined' ? [...rows] : [...rows, ...(store[key] as any[]).filter((r) => !ids.has(r.id) && (!tenant || tenantId(r) !== tenant))];
  }
}

export function visibleWorkflowSnapshot(actor: UserProfile): Partial<WorkflowSnapshot> {
  const snapshot = workflowSnapshot(tenantId(actor));
  // Profiles and operational configuration are not part of a payment response.
  const { users, batches, ...result } = snapshot;
  if (!['counsellor', 'admin', 'super_admin'].includes(actor.role)) {
    delete (result as any).leads;
  }
  result.notifications = result.notifications.filter((n) => n.user_id === actor.id);
  if (actor.role === 'student' || actor.role === 'onboarding_team') {
    const allowed = new Set(result.students.filter((s) => actor.role === 'student' ? s.user_id === actor.id : result.onboardingCases.some((c) => c.student_id === s.id && c.assigned_staff_id === actor.id)).map((s) => s.id));
    for (const key of ['studentPayments', 'studentFees', 'studentFinancialLedgers', 'feeAccounts', 'installments', 'payments', 'receipts', 'onboardingCases', 'feeApprovalHistories', 'feeRevisionRequests'] as const) result[key] = result[key].filter((r) => allowed.has(r.student_id));
    result.students = result.students.filter((s) => allowed.has(s.id));
    result.admissions = result.admissions.filter((a) => result.students.some((s) => s.admission_id === a.id));
    result.auditLogs = [];
    result.onboardingAuditLogs = [];
  }
  if (actor.role === 'counsellor') {
    result.studentPayments = result.studentPayments.filter((p) => p.recorded_by === actor.id);
    result.auditLogs = result.auditLogs.filter((a) => a.user_id === actor.id || result.studentPayments.some((p) => p.id === a.record_id));
    if (result.leads) {
      result.leads = result.leads.filter((l) => l.counsellor_id === actor.id);
    }
  }
  return result;
}
