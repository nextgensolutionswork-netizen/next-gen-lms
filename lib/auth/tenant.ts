import { UserProfile } from '@/types';

// Untagged records belong only to the original single-institute installation.
// They must never become visible to a newly provisioned tenant.
export const LEGACY_TENANT = 'default';
export function tenantId(record: { tenant_id?: string }): string {
  return record.tenant_id || LEGACY_TENANT;
}
export function assertSameTenant(actor: UserProfile, record: { tenant_id?: string }): void {
  if (tenantId(actor) !== tenantId(record)) throw new Error('Access denied: Record belongs to another tenant.');
}
export function isAccountsUser(user?: UserProfile): boolean {
  return !!user && user.is_active !== false && ['accountant', 'admin', 'super_admin'].includes(user.role);
}
