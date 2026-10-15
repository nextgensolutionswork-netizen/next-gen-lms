import { tenantId } from '@/lib/auth/tenant';
import { Permission, UserRole, UserProfile, OnboardingCase } from '@/types';
import { store } from '@/lib/services/data-store';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'all:manage',
    'users:read',
    'users:write',
    'users:manage',
    'roles:manage',
    'crm:read',
    'crm:write',
    'crm:convert',
    'admissions:read',
    'admissions:write',
    'admissions:approve',
    'students:read',
    'students:write',
    'students:export',
    'courses:read',
    'courses:write',
    'courses:publish',
    'batches:read',
    'batches:write',
    'batches:transfer',
    'schedule:read',
    'schedule:write',
    'attendance:read',
    'attendance:write',
    'assignments:read',
    'assignments:write',
    'assignments:grade',
    'assessments:read',
    'assessments:write',
    'assessments:grade',
    'accounts:read',
    'accounts:write',
    'payments:create',
    'receipts:read',
    'receipts:create',
    'expenses:read',
    'expenses:write',
    'expenses:approve',
    'vendors:read',
    'vendors:write',
    'placements:read',
    'placements:write',
    'placement:read',
    'placement:write',
    'certificates:read',
    'certificates:generate',
    'reports:read',
    'audit:read',
    'settings:manage',
    'settings:write',
    'doubts:read',
    'doubts:write',
    'doubts:assign',
    'doubts:resolve',
    'support:reply',
    'onboarding:read',
    'onboarding:write',
    'onboarding:assign',
    'onboarding:activate',
    'onboarding:complete',
  ],
  admin: [
    'users:read',
    'users:write',
    'users:manage',
    'crm:read',
    'crm:write',
    'crm:convert',
    'admissions:read',
    'admissions:write',
    'admissions:approve',
    'students:read',
    'students:write',
    'students:export',
    'courses:read',
    'courses:write',
    'courses:publish',
    'batches:read',
    'batches:write',
    'batches:transfer',
    'schedule:read',
    'schedule:write',
    'attendance:read',
    'attendance:write',
    'assignments:read',
    'assessments:read',
    'accounts:read',
    'reports:read',
    'placements:read',
    'placements:write',
    'placement:read',
    'placement:write',
    'certificates:read',
    'certificates:generate',
    'certificates:issue',
    'certificates:revoke',
    'doubts:read',
    'doubts:write',
    'doubts:assign',
    'doubts:resolve',
    'support:reply',
    'audit:read',
    'settings:manage',
    'settings:write',
    'onboarding:read',
    'onboarding:write',
    'onboarding:assign',
    'onboarding:activate',
    'onboarding:complete',
  ],
  accountant: [
    'accounts:read',
    'accounts:write',
    'payments:create',
    'receipts:read',
    'receipts:create',
    'expenses:read',
    'expenses:write',
    'vendors:read',
    'vendors:write',
    'reports:read',
    'students:read', // to look up fee balances
  ],
  counsellor: [
    'crm:read',
    'crm:write',
    'crm:convert',
    'admissions:read',
    'admissions:write',
    'courses:read', // to advise courses to prospective students
    'batches:read',
    'students:read',
    'accounts:read',
    'payments:create',
  ],
  trainer: [
    'courses:read',
    'batches:read',
    'schedule:read',
    'schedule:write',
    'attendance:read',
    'attendance:write',
    'assignments:read',
    'assignments:write',
    'assignments:grade',
    'assessments:read',
    'assessments:write',
    'assessments:grade',
    'students:read',
    'doubts:read',
    'doubts:write',
    'doubts:resolve',
    'support:reply',
  ],
  placement_coordinator: [
    'placements:read',
    'placements:write',
    'placement:read',
    'placement:write',
    'students:read',
    'certificates:read',
    'certificates:issue',
  ],
  support: [
    'doubts:read',
    'doubts:write',
    'doubts:assign',
    'doubts:resolve',
    'support:reply',
    'students:read',
    'courses:read',
    'batches:read',
    'schedule:read',
  ],
  onboarding_team: [
    'onboarding:read',
    'onboarding:write',
    'onboarding:activate',
    'onboarding:complete',
    'students:read',
    'courses:read',
    'batches:read',
  ],
  student: [
    'courses:read',
    'schedule:read',
    'attendance:read',
    'assignments:read',
    'assessments:read',
    'receipts:read',
    'certificates:read',
    'placements:read',
    'doubts:read',
    'doubts:write',
  ],
};

export function isUserActive(user: UserProfile | null | undefined): user is UserProfile {
  if (!user) return false;
  if (user.is_active !== undefined) return Boolean(user.is_active);
  if ((user as any).status !== undefined) return (user as any).status === 'Active';
  return true;
}

/**
 * Checks if a user has a specific permission.
 * Default-deny: returns false if user or role is invalid.
 */
export function hasPermission(user: UserProfile | UserRole | null | undefined, permission: Permission): boolean {
  if (!user) {
    return false;
  }

  if (typeof user === 'string') {
    if (user === 'super_admin') return true;
    const rolePermissions = ROLE_PERMISSIONS[user as UserRole] || [];
    return rolePermissions.includes(permission);
  }

  if (!isUserActive(user)) {
    return false;
  }

  if (user.role === 'super_admin') {
    return true;
  }

  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
  return rolePermissions.includes(permission);
}

/**
 * Checks if user has permission to access a specific course.
 * Super Admins and Admins can access all courses.
 * Trainers can ONLY access explicitly assigned courses.
 * If trainer has no assigned courses, returns FALSE (zero access, never fallback).
 */
export function canAccessCourse(user: UserProfile | null | undefined, courseId: string): boolean {
  if (!isUserActive(user)) {
    return false;
  }

  if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'counsellor') {
    return true;
  }

  if (user.role === 'trainer') {
    if (!user.assigned_course_ids || user.assigned_course_ids.length === 0) {
      return false; // Zero restricted courses when no assignment
    }
    return user.assigned_course_ids.includes(courseId);
  }

  if (user.role === 'accountant') {
    // Accountant is strictly prevented from accessing academic course content
    return false;
  }

  return false;
}

/**
 * Checks if user has permission to view or manage a specific onboarding case.
 * Default-deny:
 * - Super Admins and Admins can access all onboarding cases.
 * - Onboarding team members can ONLY access cases specifically assigned to them.
 * - All other roles (accountant, trainer, counsellor, student, support) have ZERO access.
 */
export function canAccessOnboardingCase(
  user: UserProfile | null | undefined,
  caseRecord: OnboardingCase | null | undefined
): boolean {
  if (!user || !user.is_active || !caseRecord || tenantId(user) !== tenantId(caseRecord)) {
    return false;
  }

  if (user.role === 'super_admin' || user.role === 'admin') {
    return true;
  }

  if (user.role === 'onboarding_team') {
    // Assignment-scoped: only assigned cases
    return Boolean(caseRecord.assigned_staff_id && caseRecord.assigned_staff_id === user.id);
  }

  return false;
}

/**
 * Checks if user has permission to assign or reassign onboarding cases.
 * Only Super Admin and Operations Admin can assign staff.
 */
export function canAssignOnboardingStaff(user: UserProfile | null | undefined): boolean {
  if (!user || !user.is_active) {
    return false;
  }
  return user.role === 'super_admin' || user.role === 'admin';
}

export const DEFAULT_ROLE_ROUTES: Record<UserRole, string> = {
  super_admin: '/dashboard',
  admin: '/dashboard',
  accountant: '/accounts/fees',
  counsellor: '/crm/leads',
  trainer: '/academics/courses',
  placement_coordinator: '/placement',
  support: '/support',
  onboarding_team: '/onboarding',
  student: '/portal',
};

/**
 * Safely evaluates and validates an intended redirect target path against the user's role and RBAC boundaries.
 * Prevents:
 * 1. Open redirects (//malicious.com, /\malicious.com, external protocols)
 * 2. Redirect loops back to /login or /
 * 3. Role privilege violations (e.g. student accessing /dashboard or /settings, non-admin accessing /todos or /users)
 *
 * If valid and permitted, returns the target URL (preserving query params/hashes).
 * If invalid, unpermitted, or empty, safely falls back to the role's default workspace route.
 */
export function getSafeRedirectUrl(
  role: UserRole | string | undefined | null,
  target?: string | null
): string {
  const safeRole = (role && (role in DEFAULT_ROLE_ROUTES)) ? (role as UserRole) : 'admin';
  const defaultRoute = DEFAULT_ROLE_ROUTES[safeRole] || '/dashboard';

  if (!target || typeof target !== 'string') {
    return defaultRoute;
  }

  const cleanTarget = target.trim();

  // 1. Open redirect & protocol safety checks
  if (
    !cleanTarget.startsWith('/') ||
    cleanTarget.startsWith('//') ||
    cleanTarget.startsWith('/\\') ||
    cleanTarget.includes('\\')
  ) {
    return defaultRoute;
  }

  // 2. Prevent loops back to login or root
  if (
    cleanTarget === '/' ||
    cleanTarget === '/login' ||
    cleanTarget.startsWith('/login?') ||
    cleanTarget.startsWith('/login/') ||
    cleanTarget.startsWith('/login#')
  ) {
    return defaultRoute;
  }

  // 3. Prevent directing to raw internal API endpoints
  if (cleanTarget === '/api' || cleanTarget.startsWith('/api/')) {
    return defaultRoute;
  }

  // Extract pure pathname without query string or hash for route authorization matching
  const pathname = cleanTarget.split('?')[0].split('#')[0];

  // 4. Student Isolation Boundary
  if (safeRole === 'student') {
    const isStudentAllowed =
      pathname === '/portal' ||
      pathname.startsWith('/portal/') ||
      pathname.startsWith('/certificate/verify') ||
      pathname.startsWith('/accounts/receipts/');
    return isStudentAllowed ? cleanTarget : defaultRoute;
  }

  // 5. Onboarding Team Boundary
  if (safeRole === 'onboarding_team') {
    const isOnboardingAllowed =
      pathname === '/onboarding' ||
      pathname.startsWith('/onboarding/') ||
      pathname.startsWith('/certificate/verify');
    return isOnboardingAllowed ? cleanTarget : defaultRoute;
  }

  // 6. Super Admin Diagnostic Probe Console (/todos)
  if (pathname === '/todos' || pathname.startsWith('/todos/')) {
    return safeRole === 'super_admin' ? cleanTarget : defaultRoute;
  }

  // 7. Sensitive Admin Settings, Security Audit Logs, and User RBAC Management
  const adminOnlyPaths = ['/settings', '/audit-logs', '/users'];
  if (adminOnlyPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    if (safeRole === 'super_admin' || safeRole === 'admin') {
      return cleanTarget;
    }
    return defaultRoute;
  }

  // 8. Onboarding Module access (only super_admin, admin)
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) {
    if (safeRole === 'super_admin' || safeRole === 'admin') {
      return cleanTarget;
    }
    return defaultRoute;
  }

  // 9. Departmental workspaces boundary checks
  // Finance & Accounts
  if (pathname.startsWith('/accounts') && !(safeRole === 'counsellor' && ['/accounts/payments', '/accounts/approvals'].includes(pathname)) && !['super_admin', 'admin', 'accountant'].includes(safeRole)) {
    return defaultRoute;
  }
  // CRM & Admissions
  if ((pathname.startsWith('/crm') || pathname.startsWith('/admissions')) && !['super_admin', 'admin', 'counsellor'].includes(safeRole)) {
    return defaultRoute;
  }
  // Placements
  if (pathname.startsWith('/placement') && !['super_admin', 'admin', 'placement_coordinator'].includes(safeRole)) {
    return defaultRoute;
  }

  return cleanTarget;
}

/**
 * Determines whether the authenticated user has access to a specific batch.
 * - Super Admins and Admins have global access to all batches.
 * - Trainers can access batches they instruct.
 * - Students can access batches they are enrolled in.
 */
export function canAccessBatch(user: any, batchId: string): boolean {
  if (!user || !batchId) return false;
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  if (user.role === 'trainer') {
    const batch = store.batches.find((b) => b.id === batchId);
    return batch?.trainer_id === user.id;
  }
  if (user.role === 'student') {
    const student = store.students.find((s) => s.user_id === user.id || s.email === user.email);
    return student?.batch_id === batchId;
  }
  return false;
}


