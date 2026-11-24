import type { Admission, UserProfile } from '@/types';
import { tenantId } from './tenant';
import { resolveCanonicalCounsellorId, validateCounsellorAssignment } from '@/lib/services/counsellor-service';
import { localTeamMembers } from '@/lib/services/lead-security';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';

export const ADMISSION_READ_ROLES = [
  'super_admin',
  'admin',
  'counsellor_lead',
  'counsellor',
  'onboarding_team',
] as const;

export const ADMISSION_WRITE_ROLES = [
  'super_admin',
  'admin',
  'counsellor_lead',
  'counsellor',
] as const;

export interface AdmissionScope {
  actor: UserProfile;
  /** Null means unrestricted access to all admissions within tenant (admin / super_admin) */
  counsellorIds: string[] | null;
  tenant: string;
  onboardingStudentIds?: Set<string>;
}

/**
 * Resolves verified team member IDs for a sales lead
 */
export async function resolveCounsellorTeamMembers(actor: UserProfile): Promise<string[]> {
  if (actor.role !== 'counsellor_lead') {
    return [];
  }

  const tenant = tenantId(actor);

  if (!isLiveSupabaseEnabled()) {
    return localTeamMembers
      .filter((m) => m.tenant_id === tenant && m.leader_id === actor.id)
      .map((m) => m.member_id);
  }

  try {
    const db = createAdminClient();
    const teams = await db
      .from('crm_teams')
      .select('id')
      .eq('tenant_id', tenant)
      .eq('leader_id', actor.id);

    if (teams.error || !teams.data?.length) {
      return [];
    }

    const members = await db
      .from('crm_team_members')
      .select('member_id')
      .eq('tenant_id', tenant)
      .in(
        'team_id',
        teams.data.map((t) => t.id)
      );

    if (members.error || !members.data) {
      return [];
    }

    return members.data.map((m) => m.member_id);
  } catch (err) {
    console.warn('[admission-access] Team member resolution failed, falling back to local teams:', err);
    return localTeamMembers
      .filter((m) => m.tenant_id === tenant && m.leader_id === actor.id)
      .map((m) => m.member_id);
  }
}

/**
 * Resolves authoritative admissions visibility scope for the authenticated actor
 */
export async function resolveAdmissionScope(
  actor: UserProfile,
  explicitTeamMembers?: string[],
  onboardingStudentIds?: Set<string>
): Promise<AdmissionScope> {
  if (!actor || actor.is_active === false) {
    throw new Error('Unauthorized: Active user account required for admissions access.');
  }

  const tenant = tenantId(actor);

  if (actor.role === 'counsellor') {
    const canonicalActorId = resolveCanonicalCounsellorId(actor.id) || actor.id;
    return {
      actor,
      counsellorIds: [actor.id, canonicalActorId],
      tenant,
    };
  }

  if (actor.role === 'counsellor_lead') {
    const teamMembers = explicitTeamMembers || (await resolveCounsellorTeamMembers(actor));
    const allMembers = [actor.id, ...teamMembers];
    const counsellorIds = Array.from(
      new Set(allMembers.flatMap((id) => [id, resolveCanonicalCounsellorId(id) || id]))
    );
    return {
      actor,
      counsellorIds,
      tenant,
    };
  }

  if (actor.role === 'admin' || actor.role === 'super_admin') {
    return {
      actor,
      counsellorIds: null, // Full tenant access
      tenant,
    };
  }

  if (actor.role === 'onboarding_team') {
    return {
      actor,
      counsellorIds: null,
      tenant,
      onboardingStudentIds: onboardingStudentIds || new Set<string>(),
    };
  }

  throw new Error(`Forbidden: Role "${actor.role}" is not permitted to access admissions.`);
}

/**
 * Synchronous scope check on a single admission record
 */
export function canAccessAdmission(
  scope: AdmissionScope,
  admission: Pick<Admission, 'id' | 'counsellor_id' | 'student_id' | 'tenant_id'> | null | undefined
): boolean {
  if (!admission) return false;

  // Tenant isolation: Super admin can access authorized tenant; all other roles strictly isolated
  if (scope.actor.role !== 'super_admin') {
    const admTenant = tenantId(admission);
    if (admTenant !== scope.tenant) {
      return false;
    }
  }

  // Onboarding staff access check
  if (scope.actor.role === 'onboarding_team') {
    if (!scope.onboardingStudentIds || scope.onboardingStudentIds.size === 0) {
      return false;
    }
    return Boolean(admission.student_id && scope.onboardingStudentIds.has(admission.student_id));
  }

  // Admin and Super Admin have full tenant access
  if (scope.counsellorIds === null) {
    return true;
  }

  // Counsellors and Sales Leads require assigned counsellor match
  if (!admission.counsellor_id) {
    return false;
  }

  const admCounsellorId = admission.counsellor_id.trim();
  const canonicalAdmCounsellorId = resolveCanonicalCounsellorId(admCounsellorId) || admCounsellorId;

  return (
    scope.counsellorIds.includes(admCounsellorId) ||
    scope.counsellorIds.includes(canonicalAdmCounsellorId)
  );
}

/**
 * Asserts admission access or throws 403 Forbidden error
 */
export function assertAdmissionAccess(
  scope: AdmissionScope,
  admission: Pick<Admission, 'id' | 'counsellor_id' | 'student_id' | 'tenant_id'> | null | undefined
): void {
  if (!admission) {
    throw new Error('Not Found: Admission record not found.');
  }

  if (scope.actor.role !== 'super_admin') {
    const admTenant = tenantId(admission);
    if (admTenant !== scope.tenant) {
      throw new Error('Forbidden: Tenant mismatch. Cross-tenant access prohibited.');
    }
  }

  if (!canAccessAdmission(scope, admission)) {
    throw new Error('Forbidden: You are not authorized to view or manage this admission record.');
  }
}

/**
 * Enforces ownership during admission registration:
 * - Counsellor: ALWAYS assigned to themselves (cannot submit another staff ID).
 * - Sales Lead: Can assign to themselves or verified team member.
 * - Admin / Super Admin: Can assign to any eligible counsellor in the tenant.
 */
export function validateAdmissionRegistrationOwnership(
  actor: UserProfile,
  requestedCounsellorId: string | undefined,
  users: UserProfile[],
  teamMemberIds?: string[]
): { counsellor_id: string; counsellor_name: string } {
  const tenant = tenantId(actor);

  if (actor.role === 'counsellor') {
    const actorCanonicalId = resolveCanonicalCounsellorId(actor.id) || actor.id;
    if (requestedCounsellorId && requestedCounsellorId.trim()) {
      const requestedCanonicalId =
        resolveCanonicalCounsellorId(requestedCounsellorId.trim()) || requestedCounsellorId.trim();
      if (requestedCanonicalId !== actorCanonicalId && requestedCounsellorId.trim() !== actor.id) {
        throw new Error('Forbidden: Counsellors can only register admissions assigned to themselves.');
      }
    }
    return {
      counsellor_id: actorCanonicalId,
      counsellor_name: actor.full_name,
    };
  }

  if (actor.role === 'counsellor_lead') {
    const allowedStaffIds = [actor.id, ...(teamMemberIds || [])];
    const allowedCanonicalIds = new Set(
      allowedStaffIds.flatMap((id) => [id, resolveCanonicalCounsellorId(id) || id])
    );

    if (requestedCounsellorId && requestedCounsellorId.trim()) {
      const cleanReqId = requestedCounsellorId.trim();
      const canonReqId = resolveCanonicalCounsellorId(cleanReqId) || cleanReqId;

      if (!allowedCanonicalIds.has(cleanReqId) && !allowedCanonicalIds.has(canonReqId)) {
        throw new Error('Forbidden: Sales Leads can only assign admissions to themselves or verified team members.');
      }

      const targetStaff = users.find(
        (u) =>
          u.id === canonReqId ||
          u.id === cleanReqId ||
          (resolveCanonicalCounsellorId(u.id) || u.id) === canonReqId
      ) || actor;

      return {
        counsellor_id: canonReqId,
        counsellor_name: targetStaff.full_name,
      };
    }

    const actorCanon = resolveCanonicalCounsellorId(actor.id) || actor.id;
    return {
      counsellor_id: actorCanon,
      counsellor_name: actor.full_name,
    };
  }

  if (actor.role === 'admin' || actor.role === 'super_admin') {
    if (requestedCounsellorId && requestedCounsellorId.trim()) {
      const validated = validateCounsellorAssignment(requestedCounsellorId, users, tenant);
      return {
        counsellor_id: validated.id,
        counsellor_name: validated.full_name,
      };
    }

    // Default to an active counsellor in the tenant or the performing admin
    const defaultCounsellor =
      users.find((u) => u.role === 'counsellor' && u.is_active && tenantId(u) === tenant) || actor;
    const canonDefaultId = resolveCanonicalCounsellorId(defaultCounsellor.id) || defaultCounsellor.id;

    return {
      counsellor_id: canonDefaultId,
      counsellor_name: defaultCounsellor.full_name,
    };
  }

  throw new Error(`Forbidden: Role "${actor.role}" cannot create admissions.`);
}
