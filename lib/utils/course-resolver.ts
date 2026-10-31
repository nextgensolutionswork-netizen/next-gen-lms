import { tenantId } from '@/lib/auth/tenant';

// Verified default-institute aliases from SA-004. Never infer an assignment by name.
const defaultAliases: Readonly<Record<string, string>> = {
  'crs-fico-01': 'c1000000-0000-0000-0000-000000000001',
  'crs-mm-01': 'c1000000-0000-0000-0000-000000000002',
  'crs-abap-01': 'c1000000-0000-0000-0000-000000000004',
};

export function resolveCourseId(id: string | undefined, catalogIds: ReadonlySet<string>, tenant = 'default'): string | undefined {
  if (!id) return undefined;
  const alias = tenant === 'default' ? defaultAliases[id] : undefined;
  if (alias && catalogIds.has(alias)) return alias;
  return catalogIds.has(id) ? id : undefined;
}

export function tenantRecords<T extends object>(records: readonly T[], tenant: string): T[] {
  return records.filter((record) => tenantId(record as { tenant_id?: string }) === tenant);
}

// The existing relational course catalog is shared (no tenant_id column).
// If an adapter supplies tenant-owned courses, never include another tenant's rows.
export function visibleCourses<T extends { id: string; tenant_id?: string }>(courses: readonly T[], tenant: string): T[] {
  const visible = courses.filter((course) => !course.tenant_id || course.tenant_id === tenant);
  const ids = new Set(visible.map((course) => course.id));
  return visible.filter((course) => resolveCourseId(course.id, ids, tenant) === course.id);
}
