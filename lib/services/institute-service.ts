import { store } from '@/lib/services/data-store';
import { DEFAULT_INSTITUTES } from '@/lib/constants/institutes';
import { recordAuditLog } from '@/lib/services/audit-service';
import type { InstituteBrand, UserProfile } from '@/types';

function ensureInstitutesSeeded(): InstituteBrand[] {
  if (!Array.isArray(store.institutes) || store.institutes.length === 0) {
    store.institutes = DEFAULT_INSTITUTES.map((inst) => ({ ...inst }));
  }
  return store.institutes;
}

export function getInstitutes(options?: { activeOnly?: boolean }): InstituteBrand[] {
  const list = ensureInstitutesSeeded();
  if (options?.activeOnly) {
    return list.filter((i) => i.is_active !== false);
  }
  return [...list];
}

export function resolveActiveInstitute(input: {
  institute_id?: string | null;
  institute_name?: string | null;
}): { institute_id: string; institute_name: string } {
  const institutes = getInstitutes({ activeOnly: true });
  const id = (input.institute_id ?? '').trim();
  const name = (input.institute_name ?? '').trim();

  const match = institutes.find(
    (inst) =>
      (id && inst.id === id) ||
      (name && inst.name.trim().toLowerCase() === name.toLowerCase())
  );

  if (!match) {
    throw new Error('Please select a valid active Institute / Brand.');
  }

  return { institute_id: match.id, institute_name: match.name };
}

export async function createInstituteBrand(
  actor: Pick<UserProfile, 'id' | 'full_name' | 'role'>,
  input: {
    name: string;
    code?: string;
    tagline?: string;
    email?: string;
    phone?: string;
    address?: string;
  }
): Promise<InstituteBrand> {
  if (!['super_admin', 'admin'].includes(actor.role)) {
    throw new Error('Forbidden: Only Super Admin or Admin can manage Institute Master.');
  }
  const name = (input.name || '').trim();
  if (!name) {
    throw new Error('Institute name is required.');
  }
  const list = ensureInstitutesSeeded();
  if (list.some((i) => i.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error(`An institute named "${name}" already exists.`);
  }

  const now = new Date().toISOString();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const created: InstituteBrand = {
    id: `inst-${slug || Date.now()}`,
    name,
    code: input.code?.trim().toUpperCase() || slug.toUpperCase().slice(0, 10),
    is_active: true,
    tagline: input.tagline?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    address: input.address?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };

  list.push(created);
  store.persist();

  await recordAuditLog({
    user_id: actor.id,
    user_name: actor.full_name,
    user_role: actor.role,
    action: 'INSTITUTE_CREATED',
    module: 'Settings',
    record_id: created.id,
    new_value: created,
  });

  return created;
}

export async function updateInstituteBrand(
  actor: Pick<UserProfile, 'id' | 'full_name' | 'role'>,
  id: string,
  updates: {
    name?: string;
    code?: string;
    is_active?: boolean;
    tagline?: string;
    email?: string;
    phone?: string;
    address?: string;
  }
): Promise<InstituteBrand> {
  if (!['super_admin', 'admin'].includes(actor.role)) {
    throw new Error('Forbidden: Only Super Admin or Admin can manage Institute Master.');
  }
  const list = ensureInstitutesSeeded();
  const inst = list.find((i) => i.id === id);
  if (!inst) {
    throw new Error('Institute not found.');
  }

  const before = structuredClone(inst);

  if (updates.name !== undefined) {
    const cleanName = updates.name.trim();
    if (!cleanName) {
      throw new Error('Institute name cannot be empty.');
    }
    if (list.some((i) => i.id !== id && i.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      throw new Error(`An institute named "${cleanName}" already exists.`);
    }
    inst.name = cleanName;
  }
  if (updates.code !== undefined) inst.code = updates.code.trim().toUpperCase();
  if (updates.is_active !== undefined) inst.is_active = Boolean(updates.is_active);
  if (updates.tagline !== undefined) inst.tagline = updates.tagline.trim() || undefined;
  if (updates.email !== undefined) inst.email = updates.email.trim() || undefined;
  if (updates.phone !== undefined) inst.phone = updates.phone.trim() || undefined;
  if (updates.address !== undefined) inst.address = updates.address.trim() || undefined;
  inst.updated_at = new Date().toISOString();

  store.persist();

  await recordAuditLog({
    user_id: actor.id,
    user_name: actor.full_name,
    user_role: actor.role,
    action: 'INSTITUTE_UPDATED',
    module: 'Settings',
    record_id: inst.id,
    old_value: before,
    new_value: inst,
  });

  return inst;
}
