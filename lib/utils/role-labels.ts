import type { UserRole } from '@/types';

/** Display names only; stored role IDs and authorization rules stay unchanged. */
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Sales Lead',
  counsellor: 'Sales',
  accountant: 'Accountant',
  trainer: 'Trainer',
  placement_coordinator: 'Placement Coordinator',
  support: 'Support',
  onboarding_team: 'Onboarding Team',
  student: 'Student',
};

export function getRoleLabel(role: string | null | undefined): string {
  return role ? ROLE_LABELS[role as UserRole] || role.replace(/_/g, ' ') : 'Staff';
}
