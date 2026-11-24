import { store } from './data-store';
import { tenantId } from '@/lib/auth/tenant';
import type { UserProfile } from '@/types';
import { resolveCanonicalCounsellorId } from './counsellor-service';
import { localTeamMembers } from './lead-security';

export const workflowKeys = [
  'studentPayments',
  'studentFees',
  'studentFinancialLedgers',
  'feeAccounts',
  'installments',
  'payments',
  'receipts',
  'students',
  'admissions',
  'onboardingCases',
  'onboardingAuditLogs',
  'notifications',
  'auditLogs',
  'users',
  'batches',
  'leads',
  'feeApprovalHistories',
  'feeRevisionRequests',
  'feeCategories',
] as const;
export type WorkflowSnapshot = Record<typeof workflowKeys[number], any[]>;

export function workflowSnapshot(tenant: string): WorkflowSnapshot {
  const students = new Set(store.students.filter((s) => tenantId(s) === tenant).map((s) => s.id));
  const users = new Set(store.users.filter((u) => tenantId(u) === tenant).map((u) => u.id));
  return Object.fromEntries(
    workflowKeys.map((key) => [
      key,
      structuredClone(
        (store[key] as any[])
          .filter((r) =>
            r.tenant_id
              ? r.tenant_id === tenant
              : r.student_id
              ? students.has(r.student_id)
              : r.user_id
              ? users.has(r.user_id)
              : tenant === 'default'
          )
          .map((r) => ({ ...r, tenant_id: tenant }))
      ),
    ])
  ) as WorkflowSnapshot;
}

export function mergeWorkflowSnapshot(snapshot: Partial<WorkflowSnapshot>, tenant?: string): void {
  for (const key of workflowKeys) {
    if (!snapshot[key]) continue;
    const rows = snapshot[key]!;
    const ids = new Set(rows.map((r) => r.id));
    (store as any)[key] =
      typeof window !== 'undefined'
        ? [...rows]
        : [
            ...rows,
            ...(store[key] as any[]).filter(
              (r) => !ids.has(r.id) && (!tenant || tenantId(r) !== tenant)
            ),
          ];
  }
}

export function visibleWorkflowSnapshot(
  actor: UserProfile,
  explicitTeamMembers?: string[]
): Partial<WorkflowSnapshot> {
  const snapshot = workflowSnapshot(tenantId(actor));
  // Profiles and operational configuration are not part of a payment response.
  const { users, batches, leads, ...result } = snapshot;
  // CRM history is served only through the parent-authorized CRM history endpoint.
  result.auditLogs = (result.auditLogs || []).filter((a) => a.module?.toUpperCase() !== 'CRM');
  result.notifications = (result.notifications || []).filter((n) => n.user_id === actor.id);

  if (actor.role === 'student' || actor.role === 'onboarding_team') {
    const allowed = new Set(
      result.students
        .filter((s) =>
          actor.role === 'student'
            ? s.user_id === actor.id
            : result.onboardingCases.some(
                (c) => c.student_id === s.id && c.assigned_staff_id === actor.id
              )
        )
        .map((s) => s.id)
    );
    for (const key of [
      'studentPayments',
      'studentFees',
      'studentFinancialLedgers',
      'feeAccounts',
      'installments',
      'payments',
      'receipts',
      'onboardingCases',
      'feeApprovalHistories',
      'feeRevisionRequests',
    ] as const) {
      result[key] = (result[key] || []).filter((r) => allowed.has(r.student_id));
    }
    result.students = result.students.filter((s) => allowed.has(s.id));
    result.admissions = result.admissions.filter((a) =>
      result.students.some((s) => s.admission_id === a.id)
    );
    result.auditLogs = [];
    result.onboardingAuditLogs = [];
  } else if (actor.role === 'counsellor') {
    const canonicalActorId = resolveCanonicalCounsellorId(actor.id) || actor.id;

    // Strict role-based isolation: Counsellors see ONLY admissions assigned to their counsellor_id
    result.admissions = (result.admissions || []).filter((a) => {
      const canonicalAdmCounsellorId =
        resolveCanonicalCounsellorId(a.counsellor_id) || a.counsellor_id;
      return canonicalAdmCounsellorId === canonicalActorId || a.counsellor_id === actor.id;
    });

    const allowedAdmissionIds = new Set(result.admissions.map((a) => a.id));
    const allowedAdmissionNumbers = new Set(
      result.admissions.map((a) => a.admission_number).filter(Boolean)
    );

    result.students = (result.students || []).filter(
      (s) =>
        allowedAdmissionIds.has(s.admission_id) ||
        allowedAdmissionNumbers.has(s.admission_number)
    );
    const allowedStudentIds = new Set(result.students.map((s) => s.id));

    result.studentPayments = (result.studentPayments || []).filter(
      (p) =>
        p.recorded_by === actor.id ||
        allowedStudentIds.has(p.student_id) ||
        allowedAdmissionIds.has(p.enrollment_id)
    );

    for (const key of [
      'studentFees',
      'studentFinancialLedgers',
      'feeAccounts',
      'installments',
      'payments',
      'receipts',
      'feeApprovalHistories',
      'feeRevisionRequests',
    ] as const) {
      result[key] = (result[key] || []).filter(
        (r: any) =>
          allowedStudentIds.has(r.student_id) ||
          allowedAdmissionIds.has(r.admission_id || r.enrollment_id) ||
          allowedAdmissionNumbers.has(r.admission_number)
      );
    }

    result.auditLogs = (result.auditLogs || []).filter(
      (a) =>
        a.user_id === actor.id ||
        allowedAdmissionIds.has(a.record_id) ||
        result.studentPayments.some((p: any) => p.id === a.record_id)
    );
  } else if (actor.role === 'counsellor_lead') {
    // Sales Lead sees own admissions + admissions assigned to verified team members
    const teamMembers =
      explicitTeamMembers ||
      localTeamMembers
        .filter((m) => m.tenant_id === actor.tenant_id && m.leader_id === actor.id)
        .map((m) => m.member_id);

    const allowedCounsellorIds = new Set([
      actor.id,
      resolveCanonicalCounsellorId(actor.id) || actor.id,
      ...teamMembers,
      ...teamMembers.map((id) => resolveCanonicalCounsellorId(id) || id),
    ]);

    result.admissions = (result.admissions || []).filter((a) => {
      const canonicalAdmCounsellorId =
        resolveCanonicalCounsellorId(a.counsellor_id) || a.counsellor_id;
      return canonicalAdmCounsellorId && allowedCounsellorIds.has(canonicalAdmCounsellorId);
    });

    const allowedAdmissionIds = new Set(result.admissions.map((a) => a.id));
    const allowedAdmissionNumbers = new Set(
      result.admissions.map((a) => a.admission_number).filter(Boolean)
    );

    result.students = (result.students || []).filter(
      (s) =>
        allowedAdmissionIds.has(s.admission_id) ||
        allowedAdmissionNumbers.has(s.admission_number)
    );
    const allowedStudentIds = new Set(result.students.map((s) => s.id));

    for (const key of [
      'studentPayments',
      'studentFees',
      'studentFinancialLedgers',
      'feeAccounts',
      'installments',
      'payments',
      'receipts',
      'feeApprovalHistories',
      'feeRevisionRequests',
    ] as const) {
      result[key] = (result[key] || []).filter(
        (r: any) =>
          allowedStudentIds.has(r.student_id) ||
          allowedAdmissionIds.has(r.admission_id || r.enrollment_id) ||
          allowedAdmissionNumbers.has(r.admission_number)
      );
    }
  }

  return result;
}
