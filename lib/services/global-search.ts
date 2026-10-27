import { hasPermission } from '@/lib/auth/rbac';
import { tenantId } from '@/lib/auth/tenant';
import type { Permission, UserProfile } from '@/types';

export interface SearchResult { id: string; kind: string; title: string; reference: string; href: string }
export const searchGroups: { table: string; kind: string; permission: Permission; fields: string[]; path: string }[] = [
  { table: 'students', kind: 'Student', permission: 'students:read', fields: ['full_name', 'student_code', 'email', 'phone'], path: '/students' },
  { table: 'admissions', kind: 'Admission', permission: 'admissions:read', fields: ['student_name', 'admission_number', 'email', 'phone'], path: '/admissions' },
  { table: 'leads', kind: 'Lead', permission: 'crm:read', fields: ['full_name', 'lead_code', 'email', 'phone'], path: '/crm/leads' },
  { table: 'receipts', kind: 'Receipt', permission: 'accounts:read', fields: ['student_name', 'receipt_number', 'student_code'], path: '/accounts/receipts' },
  { table: 'batches', kind: 'Batch', permission: 'batches:read', fields: ['batch_name', 'batch_code'], path: '/academics/batches' },
];

// The supplied client must enforce row-level access for the authenticated actor.
export async function searchRecords(actor: UserProfile, query: string, db: any, live: boolean): Promise<SearchResult[]> {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const groups = searchGroups.filter((group) => hasPermission(actor, group.permission));
  const results = await Promise.all(groups.map(async (group) => {
    // Legacy CRM/batch tables have no tenant_id column. They belong to the
    // original default institute; never expose them to another tenant.
    const tenantScoped = group.table !== 'leads' && group.table !== 'batches';
    if (!tenantScoped && tenantId(actor) !== 'default') return [];
    let rows: Record<string, any>[] = [];
    if (live) {
      // Separate parameterized filters avoid interpolating user input into PostgREST OR syntax.
      const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
      const responses = await Promise.all(group.fields.map((field) => {
        let request = db.from(group.table).select(['id', ...(tenantScoped ? ['tenant_id'] : []), ...group.fields].join(','));
        if (tenantScoped) request = request.eq('tenant_id', tenantId(actor));
        return request.ilike(field, pattern).order('id').limit(5);
      }));
      for (const response of responses) {
        if (response.error) throw new Error('Search is unavailable. Please try again.');
        rows.push(...(response.data || []));
      }
      if (group.table === 'receipts') {
        try {
          const { createAdminClient } = await import('@/lib/supabase/admin');
          const adminDb = createAdminClient();
          const { data: st } = await adminDb.from('fee_workflow_state').select('snapshot').eq('tenant_id', tenantId(actor)).maybeSingle();
          if (st?.snapshot?.receipts && Array.isArray(st.snapshot.receipts)) {
            rows.push(...st.snapshot.receipts);
          }
        } catch {
          // Continue if adminDb is not configured
        }
      }
    } else {
      const response = await db.from(group.table).select('*');
      if (response.error) throw new Error('Search is unavailable. Please try again.');
      rows = response.data || [];
    }
    return [...new Map(rows.filter((row) => tenantId(row) === tenantId(actor)
      && group.fields.some((field) => String(row[field] ?? '').toLowerCase().includes(term)))
      .map((row) => [row.id || row.receipt_number, row])).values()].slice(0, 5).map((row) => {
      const reference = String(row.receipt_number || row[group.fields[1]] || row.id);
      const detail = group.table === 'students' || group.table === 'receipts';
      const targetId = group.table === 'receipts' && row.receipt_number ? row.receipt_number : row.id;
      return { id: row.id || reference, kind: group.kind, title: String(row.student_name || row[group.fields[0]] || reference), reference,
        href: detail ? `${group.path}/${encodeURIComponent(targetId)}` : `${group.path}?search=${encodeURIComponent(reference)}` };
    });
  }));
  return results.flat();
}
