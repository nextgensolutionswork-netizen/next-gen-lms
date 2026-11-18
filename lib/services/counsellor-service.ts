import { UserProfile, UserRole } from '@/types';
import { tenantId } from '@/lib/auth/tenant';
import { isUserActive, hasPermission } from '@/lib/auth/rbac';

export const CANONICAL_COUNSELLOR_ID_MAP: Record<string, string> = {
  'usr-counsellor': '44444444-4444-4444-4444-444444444444',
};

export interface EligibleCounsellorOption {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  display_label: string;
}

/**
 * Resolves legacy aliases to their canonical UUID user IDs.
 */
export function resolveCanonicalCounsellorId(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  return CANONICAL_COUNSELLOR_ID_MAP[trimmed] || trimmed;
}

/**
 * Validates whether a user account is eligible to be assigned as an Admissions Counsellor.
 * - Active accounts with role 'counsellor' are eligible.
 * - Non-counsellor accounts (admin, super_admin, etc.) are eligible ONLY IF they have explicit
 *   assignment permissions (can_assign_admissions === true, permissions.includes('admissions:write') / 'admissions:assign').
 * - Inactive or unauthorized accounts are strictly excluded (default-deny).
 */
export function isEligibleAdmissionsCounsellor(user: UserProfile | null | undefined): boolean {
  if (!user || !isUserActive(user)) {
    return false;
  }

  const u = user as any;
  if (u.status && typeof u.status === 'string' && (u.status.toLowerCase() === 'inactive' || u.status.toLowerCase() === 'deactivated')) {
    return false;
  }

  // Active counsellor accounts are always eligible
  if (user.role === 'counsellor') {
    return true;
  }

  // Explicit boolean assignment flags
  if (u.can_assign_admissions === true || u.can_act_as_counsellor === true || u.admissions_assignment === true) {
    return true;
  }
  if (u.can_assign_admissions === false || u.can_act_as_counsellor === false) {
    return false;
  }

  // Explicit custom permissions array on user profile
  if (Array.isArray(u.permissions)) {
    return u.permissions.includes('admissions:write') || u.permissions.includes('admissions:assign');
  }

  // Super admin and general admin accounts without explicit assignment permissions are NOT counsellors
  return false;
}

/**
 * Authoritatively retrieves, deduplicates, and formats eligible Admissions Counsellors
 * for dropdown selectors.
 *
 * Rules:
 * 1. Filter by tenant isolation: tenantId(user) === currentTenant
 * 2. Filter by eligibility: active counsellors or authorized admins with assignment permissions
 * 3. Canonical Deduplication:
 *    - Resolves legacy aliases (e.g., usr-counsellor -> 44444444-4444-4444-4444-444444444444)
 *    - Deduplicates multiple records sharing the same canonical ID or email
 *    - Prefers UUID over legacy slug IDs
 * 4. Display Disambiguation:
 *    - If multiple distinct staff share identical display names, append their email to differentiate them
 * 5. Deterministic sorting by full_name, then email
 */
export function getEligibleAdmissionsCounsellors(
  users: UserProfile[],
  currentTenant = 'default'
): EligibleCounsellorOption[] {
  if (!users || !Array.isArray(users)) {
    return [];
  }

  // 1. Filter eligible candidates in the target tenant
  const eligibleUsers = users.filter((u) => {
    if (!u) return false;
    const userTenant = tenantId(u) || 'default';
    if (userTenant !== currentTenant) return false;
    return isEligibleAdmissionsCounsellor(u);
  });

  // 2. Canonical Deduplication
  const seenCanonicalIds = new Set<string>();
  const seenEmails = new Set<string>();
  const deduplicated: UserProfile[] = [];

  for (const u of eligibleUsers) {
    const canonicalId = resolveCanonicalCounsellorId(u.id) || u.id;
    const normalizedEmail = (u.email || '').trim().toLowerCase();

    // Check if canonical ID already added
    if (seenCanonicalIds.has(canonicalId)) {
      continue;
    }

    // Check if email already added (handles alias records with different ID)
    if (normalizedEmail && seenEmails.has(normalizedEmail)) {
      // If the already-added record had a slug ID and this one has UUID, upgrade it
      const existingIdx = deduplicated.findIndex(
        (existing) => (existing.email || '').trim().toLowerCase() === normalizedEmail
      );
      if (existingIdx !== -1 && !/^[0-9a-f-]{36}$/i.test(deduplicated[existingIdx].id) && /^[0-9a-f-]{36}$/i.test(u.id)) {
        seenCanonicalIds.delete(resolveCanonicalCounsellorId(deduplicated[existingIdx].id) || deduplicated[existingIdx].id);
        deduplicated[existingIdx] = { ...u, id: canonicalId };
        seenCanonicalIds.add(canonicalId);
      }
      continue;
    }

    seenCanonicalIds.add(canonicalId);
    if (normalizedEmail) {
      seenEmails.add(normalizedEmail);
    }
    deduplicated.push({ ...u, id: canonicalId });
  }

  // 3. Name frequency analysis for display disambiguation
  const nameCounts = new Map<string, number>();
  for (const u of deduplicated) {
    const key = (u.full_name || '').trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  // 4. Format options with disambiguation
  const options: EligibleCounsellorOption[] = deduplicated.map((u) => {
    const key = (u.full_name || '').trim().toLowerCase();
    const hasNameCollision = (nameCounts.get(key) || 0) > 1;

    let display_label: string;
    if (hasNameCollision) {
      // If two distinct staff members share the exact same display name, differentiate with email
      display_label = `${u.full_name} (${u.email})`;
    } else {
      const roleBadge = u.role === 'counsellor' ? 'Sales' : 'Admin';
      // If full_name already includes title like (Senior Counsellor), avoid duplicate parentheses
      display_label = `${u.full_name} (${roleBadge})`;
    }

    return {
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      display_label,
    };
  });

  // 5. Deterministic sorting: full_name ascending, then email ascending
  return options.sort((a, b) => {
    const nameDiff = a.full_name.localeCompare(b.full_name);
    if (nameDiff !== 0) return nameDiff;
    return a.email.localeCompare(b.email);
  });
}

/**
 * Validates counsellor assignment on server-side creation / update.
 */
export function validateCounsellorAssignment(
  counsellorId: string | null | undefined,
  users: UserProfile[],
  tenant = 'default'
): UserProfile {
  if (!counsellorId) {
    throw new Error('Admissions counsellor is required.');
  }

  const canonicalId = resolveCanonicalCounsellorId(counsellorId) || counsellorId;
  const counsellor = users.find((u) => u.id === canonicalId || u.id === counsellorId);

  if (!counsellor) {
    throw new Error(`Invalid admissions counsellor: Staff ID "${counsellorId}" not found.`);
  }

  if (tenantId(counsellor) !== tenant) {
    throw new Error(`Unauthorized cross-tenant admissions counsellor assignment.`);
  }

  if (!isEligibleAdmissionsCounsellor(counsellor)) {
    throw new Error(
      `Unauthorized admissions counsellor assignment: Staff member "${counsellor.full_name}" is not eligible for admissions assignment.`
    );
  }

  return { ...counsellor, id: canonicalId };
}
