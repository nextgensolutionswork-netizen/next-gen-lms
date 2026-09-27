import { Permission, UserRole, UserProfile } from '@/types';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'all:manage',
    'users:read',
    'users:write',
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
    'certificates:read',
    'certificates:generate',
    'reports:read',
    'audit:read',
    'settings:manage',
  ],
  admin: [
    'users:read',
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
    'certificates:read',
    'certificates:generate',
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
  ],
  placement_coordinator: [
    'placements:read',
    'placements:write',
    'students:read',
    'certificates:read',
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
  ],
};

/**
 * Checks if a user has a specific permission.
 * Default-deny: returns false if user or role is invalid.
 */
export function hasPermission(user: UserProfile | null | undefined, permission: Permission): boolean {
  if (!user || !user.is_active) {
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
  if (!user || !user.is_active) {
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
