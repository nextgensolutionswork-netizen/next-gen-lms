import { cacheLeads, cachedLeads, leadCacheToken } from './lead-cache';
import { store } from './data-store';
import { Lead, LeadStage, Admission, UserProfile } from '@/types';
import { assertLeadAccess, leadScope, canAccessLead, requireCrmActor } from '@/lib/auth/lead-access';
import { leadFields } from './lead-input';
import { authorizedLead, resolveLeadScope, scopeLeadQuery, validateLeadAssignment, teamCreators } from './lead-security';
import { matchesCourseId } from '@/lib/services/academics-service';
import { idempotencyService } from './idempotency-service';
import { concurrencyGuard, RecordConflictError } from './concurrency-guard';
import { emitSyncEvent } from './sync-events';

/**
 * Finds the authoritative admission linked to a lead, if one exists.
 * Resolves by lead_id, matching admission number in lead notes, or matching email and course.
 */
export function getLeadAdmission(lead: Lead, admissions?: Admission[]): Admission | undefined {
  const list = admissions || store.admissions || [];
  return list.find(
    (a) =>
      a.lead_id === lead.id ||
      (a as any).lead_id === lead.id ||
      (lead.notes && a.admission_number && lead.notes.includes(a.admission_number) && (!lead.email || !a.email || a.email.toLowerCase() === lead.email.toLowerCase())) ||
      (a.email && lead.email && a.email.toLowerCase() === lead.email.toLowerCase() && (a.course_id === lead.interested_course_id || matchesCourseId(a.course_id, lead.interested_course_id)))
  );
}

/**
 * Extracts a historical admission number reference from lead notes if present.
 * Example note: "Converted to Admission: ADM-2026-0012"
 */
export function getLeadHistoricalAdmissionNumber(lead: Lead): string | undefined {
  if (!lead.notes) return undefined;
  const match = lead.notes.match(/Converted to Admission:\s*(ADM-[\w-]+)/i);
  return match ? match[1] : undefined;
}

/**
 * Authoritatively determines whether a lead has already been converted to an admission.
 */
export function isLeadConverted(lead: Lead, admissions?: Admission[]): boolean {
  if (lead.stage === 'Converted' || lead.stage === 'Enrolled') {
    return true;
  }
  return Boolean(getLeadAdmission(lead, admissions));
}

/**
 * Reconciles lead records with authoritative admissions:
 * If an admission exists for a lead, its stage is authoritatively 'Converted'.
 */
export function reconcileLeadsWithAdmissions(leads: Lead[], admissions?: Admission[]): Lead[] {
  const adms = admissions || store.admissions || [];
  for (const lead of leads) {
    if (lead.stage !== 'Converted' && lead.stage !== 'Enrolled') {
      const matchingAdmission = getLeadAdmission(lead, adms);
      if (matchingAdmission) {
        lead.stage = 'Converted';
        if (!lead.notes?.includes(matchingAdmission.admission_number)) {
          lead.notes = (lead.notes ? lead.notes + '\n' : '') + 'Converted to Admission: ' + matchingAdmission.admission_number;
        }
      }
    }
  }
  return leads;
}
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { CreateAdmissionInput } from './admission-service';
import { validatePhoneNumber, findDuplicateLeadByPhone, normalizePhoneForStorage, getCanonicalPhoneDigits } from '@/lib/utils/phone-validation';
import { validateEmailAddress } from '@/lib/utils/email-validation';

export interface LeadFilters {
  stage?: LeadStage | 'All'; counsellor_id?: string; course_id?: string; search?: string;
  created_by?: string; from?: string; to?: string; team_id?: string; training_preference?: string; lead_source?: string;
}

export async function getLeads(filters: LeadFilters = {}, actor?: UserProfile): Promise<Lead[]> {
  if (typeof window !== 'undefined') {
    const token = leadCacheToken();
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][]);
    try {
      const response = await fetch('/api/crm/leads?' + params, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Lead access denied.');
      cacheLeads(result.leads, token);
      store.leads = result.leads;
      return result.leads;
    } catch (error) { if (token === leadCacheToken()) { cacheLeads([], token); store.leads = []; } throw error; }
  }
  requireCrmActor(actor);
  const scope = await resolveLeadScope(actor);
  const teamIds = filters.team_id ? await teamCreators(filters.team_id, scope) : null;
  let leads: Lead[];
  if (isLiveSupabaseEnabled()) {
    leads = [];
    const db = createAdminClient();
    for (let offset = 0; ; offset += 1000) {
      const result = await scopeLeadQuery(db.from('leads').select('*'), scope).order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
      if (result.error) throw new Error('CRM query unavailable.');
      leads.push(...(result.data || []));
      if (!result.data || result.data.length < 1000) break;
    }
  } else leads = store.leads.filter(l => canAccessLead(scope, l));
  leads = reconcileLeadsWithAdmissions(leads.map(l => ({ ...l })), store.admissions.filter(a => (a.tenant_id || 'default') === scope.actor.tenant_id));
  return leads.filter(l => (!teamIds || Boolean(l.created_by && teamIds.includes(l.created_by))) && (!filters.stage || filters.stage === 'All' || l.stage === filters.stage)
    && (!filters.training_preference || l.training_preference === filters.training_preference)
    && (!filters.lead_source || l.lead_source === filters.lead_source)
    && (!filters.counsellor_id || l.counsellor_id === filters.counsellor_id)
    && (!filters.created_by || l.created_by === filters.created_by)
    && (!filters.course_id || l.interested_course_id === filters.course_id)
    && (!filters.from || l.created_at.slice(0, 10) >= filters.from)
    && (!filters.to || l.created_at.slice(0, 10) <= filters.to)
    && (!filters.search || [l.full_name, l.email, l.phone, l.lead_code].some(v => (v || '').toLowerCase().includes(filters.search!.toLowerCase()))))
    .map(l => ({ ...l })).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getLeadById(id: string, actor?: UserProfile): Promise<Lead | undefined> {
  if (typeof window !== 'undefined') return (await getLeads()).find(l => l.id === id);
  requireCrmActor(actor);
  return authorizedLead(id, actor);
}

// In-flight mutex for concurrent lead creation deduplication
const inFlightLeadCreations = new Map<string, Promise<Lead>>();

export async function createLead(
  data: Omit<Lead, 'id' | 'lead_code' | 'created_at' | 'updated_at'> & {
    rejectOnDuplicate?: boolean;
    allowDuplicate?: boolean;
    idempotency_key?: string;
    external_lead_id?: string;
  },
  actor?: UserProfile
): Promise<Lead> {
  if (typeof window === 'undefined') {
    if (!actor) {
      // In internal background or test executions, fall back to active admin profile if present
      const fallback = (store.users || []).find((u) => ['super_admin', 'admin'].includes(u.role) && u.is_active);
      if (fallback) actor = fallback;
    }
    requireCrmActor(actor);
    actor = (await resolveLeadScope(actor)).actor;
    if (data.created_by !== undefined && data.created_by !== actor.id) throw new Error('Forbidden: Cannot impersonate a creator.');
    if (data.tenant_id !== undefined && data.tenant_id !== actor.tenant_id) throw new Error('Forbidden: Tenant mismatch.');
    data = leadFields.parse(data);
    await validateLeadAssignment(data.counsellor_id, actor);
    data = { ...data, created_by: actor.id, tenant_id: actor.tenant_id };
  }
  // 1. Mobile number validation based on country code
  const country_code = data.country_code || '+91';
  const phoneValidation = validatePhoneNumber(country_code, data.phone, 'Mobile number');
  if (!phoneValidation.isValid) {
    throw new Error(phoneValidation.error || 'Invalid mobile number');
  }
  const normalizedPhone = phoneValidation.normalized || data.phone;

  // 2. WhatsApp number validation (with country code support)
  let whatsapp_country_code = data.whatsapp_country_code || country_code;
  let whatsapp_number = data.whatsapp_number;
  if (whatsapp_number && whatsapp_number.trim()) {
    const waValidation = validatePhoneNumber(whatsapp_country_code, whatsapp_number, 'WhatsApp number');
    if (!waValidation.isValid) {
      throw new Error(waValidation.error || 'Invalid WhatsApp number');
    }
    whatsapp_number = waValidation.normalized || whatsapp_number;
  } else {
    // If empty, sync with mobile number
    whatsapp_country_code = country_code;
    whatsapp_number = normalizedPhone;
  }

  // 3. Email validation (if provided)
  let normalizedEmail = data.email?.trim() || undefined;
  if (normalizedEmail) {
    const emailValidation = validateEmailAddress(normalizedEmail, 'Email address', false);
    if (!emailValidation.isValid) {
      throw new Error(emailValidation.error || 'Please enter a valid email address.');
    }
    normalizedEmail = emailValidation.normalized;
  }

  const targetTenant = data.tenant_id || actor?.tenant_id || 'default';
  if (data.idempotency_key) {
    const idemp = await idempotencyService.acquireAsync(data.idempotency_key, actor?.id || 'sys', targetTenant, data, 'lead_create');
    if (idemp.isExisting && idemp.result) {
      return idemp.result;
    }
  }
  const targetDigits = getCanonicalPhoneDigits(country_code, data.phone);
  const lockKey = `${targetTenant}:${targetDigits || data.phone}:${data.idempotency_key || data.external_lead_id || ''}`;

  if (!data.allowDuplicate && inFlightLeadCreations.has(lockKey)) {
    try {
      const concurrentResult = await inFlightLeadCreations.get(lockKey)!;
      return concurrentResult;
    } catch {
      // Proceed if previous concurrent attempt threw
    }
  }

  const creationPromise = (async (): Promise<Lead> => {
    // 4. Duplicate mobile number check across the entire tenant
    const allTenantLeads = typeof window === 'undefined'
      ? (isLiveSupabaseEnabled()
          ? ((await createAdminClient().from('leads').select('*').eq('tenant_id', targetTenant)).data || store.leads)
          : store.leads)
      : (cachedLeads() || store.leads);

    let duplicate = !data.allowDuplicate
      ? findDuplicateLeadByPhone(
          allTenantLeads,
          normalizedPhone,
          country_code,
          undefined,
          targetTenant
        )
      : undefined;

    if (!duplicate && !data.allowDuplicate && (data.external_lead_id || data.idempotency_key)) {
      duplicate = allTenantLeads.find((l: any) =>
        l.tenant_id === targetTenant &&
        ((data.external_lead_id && l.external_lead_id === data.external_lead_id) ||
         (data.idempotency_key && l.idempotency_key === data.idempotency_key))
      );
    }

    if (duplicate && data.rejectOnDuplicate) {
      throw new Error(
        `A lead with this mobile number already exists: ${duplicate.lead_code} (${duplicate.full_name}).`
      );
    }

    store.reconcileAuthoritativeCourses();
    const course = (store.courses || []).find((c) => c.id === data.interested_course_id || matchesCourseId(c.id, data.interested_course_id));
    const counsellor = (store.users || []).find((u) => u.id === data.counsellor_id);

    if (duplicate && !data.allowDuplicate) {
      // If a lead already exists, do not create another lead automatically.
      // Preserve: Lead ownership, assigned counsellor, follow-up history, pipeline stage, notes, and enrollment relationships.
      const dupNotice = `[Duplicate Inquiry: matches ${duplicate.lead_code} (${duplicate.full_name})]`;
      const newNotes = data.notes ? `${dupNotice} ${data.notes}` : dupNotice;

      // Append to existing lead's notes if not already present
      if (data.notes && !duplicate.notes?.includes(data.notes)) {
        duplicate.notes = duplicate.notes ? `${duplicate.notes}\n${newNotes}` : newNotes;
      } else if (!duplicate.notes?.includes(dupNotice)) {
        duplicate.notes = duplicate.notes ? `${duplicate.notes}\n${dupNotice}` : dupNotice;
      }

      // Update existing lead information only when appropriate, without overwriting valid CRM data
      if (!duplicate.email && normalizedEmail) duplicate.email = normalizedEmail;
      if (!duplicate.whatsapp_number && whatsapp_number) {
        duplicate.whatsapp_number = whatsapp_number;
        duplicate.whatsapp_country_code = whatsapp_country_code;
      }
      if (!duplicate.interested_course_id && data.interested_course_id) {
        duplicate.interested_course_id = data.interested_course_id;
        duplicate.interested_course_name = course?.course_name;
      }
      duplicate.updated_at = new Date().toISOString();

      if (isLiveSupabaseEnabled()) {
        try {
          const supabase = createAdminClient();
          await supabase.from('leads').update({
            notes: duplicate.notes,
            email: duplicate.email,
            whatsapp_number: duplicate.whatsapp_number,
            whatsapp_country_code: duplicate.whatsapp_country_code,
            updated_at: duplicate.updated_at,
          }).eq('id', duplicate.id);
        } catch (err: any) {
          console.warn('[crm-service] Failed to update existing lead notes on duplicate prevention:', err);
        }
      }

      store.persist();

      await recordAuditLog({
        user_id: actor?.id || duplicate.counsellor_id || 'system',
        user_name: actor?.full_name || duplicate.counsellor_name || 'System / Integration',
        user_role: actor?.role || 'admin',
        action: 'DUPLICATE_LEAD_DETECTED',
        module: 'CRM',
        record_id: duplicate.id,
        old_value: { lead_code: duplicate.lead_code, stage: duplicate.stage, counsellor_id: duplicate.counsellor_id },
        new_value: { incoming_source: data.lead_source, duplicate_action: 'preserved_existing', incoming_phone: normalizedPhone },
      });

      return { ...duplicate, is_duplicate_prevented: true } as Lead;
    }

    const payload: typeof data = {
      ...data,
      country_code,
      phone: normalizedPhone,
      whatsapp_country_code,
      whatsapp_number,
      email: normalizedEmail || data.email,
    };

    if (typeof window !== 'undefined') {
      const token = leadCacheToken();
      const response = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create lead');
      }
      const createdLead: Lead = result.lead;
      cacheLeads([...cachedLeads(), createdLead], token);
      store.leads = [...cachedLeads()];
      if (!store.leads.some((l) => l.id === createdLead.id)) {
        store.leads.unshift(createdLead);
      }
      cacheLeads(store.leads, token);
      return createdLead;
    }

    store.leads = store.leads || [];
    const id = globalThis.crypto.randomUUID();
    const lead_code = `LD-${new Date().getFullYear()}-${id}`;

    const isUUID = (str?: string | null) =>
      Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

    const newLead: Lead = {
      ...payload,
      id,
      lead_code,
      notes: payload.notes || '',
      interested_course_name: course?.course_name,
      counsellor_name: counsellor?.full_name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createAdminClient();
      for (let attempt = 0; attempt < 3; attempt++) {
        const insertPayload: Record<string, any> = {
          id: newLead.id,
          created_by: actor!.id,
          tenant_id: actor!.tenant_id,
          lead_code: newLead.lead_code,
          full_name: newLead.full_name,
          phone: newLead.phone,
          email: newLead.email,
          country_code: newLead.country_code || '+91',
          whatsapp_country_code: newLead.whatsapp_country_code || '+91',
          whatsapp_number: newLead.whatsapp_number,
          interested_course_id: isUUID(newLead.interested_course_id) ? newLead.interested_course_id : null,
          current_status: newLead.current_status,
          experience_years: newLead.experience_years,
          training_preference: newLead.training_preference,
          lead_source: newLead.lead_source,
          campaign: newLead.campaign,
          counsellor_id: isUUID(newLead.counsellor_id) ? newLead.counsellor_id : null,
          demo_preference: newLead.demo_preference,
          demo_date: newLead.demo_date,
          follow_up_date: newLead.follow_up_date,
          notes: newLead.notes,
          stage: newLead.stage,
          created_at: newLead.created_at,
          updated_at: newLead.updated_at,
        };

        const { error } = await supabase.from('leads').insert(insertPayload);
        if (!error) break;
        if (error.code === '23505' && error.message.includes('leads_lead_code_key') && attempt < 2) {
          newLead.lead_code = `LD-${new Date().getFullYear()}-${globalThis.crypto.randomUUID()}`;
          continue;
        }
        throw new Error(`Database error creating lead: ${error.message}`);
      }
    } catch (err: any) {
      throw new Error(`Failed to create lead in database: ${err.message}`);
    }
  }

  store.leads.unshift(newLead);
  store.persist();

  await recordAuditLog({
    user_id: actor!.id,
    user_name: actor!.full_name,
    user_role: actor!.role,
    action: 'LEAD_CREATED',
    module: 'CRM',
    record_id: newLead.id,
    new_value: {
      name: newLead.full_name,
      phone: newLead.phone,
      country_code: newLead.country_code,
      whatsapp_number: newLead.whatsapp_number,
      stage: newLead.stage,
      training_preference: newLead.training_preference,
      lead_source: newLead.lead_source,
      current_status: newLead.current_status,
    },
  });

    if (data.idempotency_key) {
      await idempotencyService.completeAsync(data.idempotency_key, actor?.id || 'sys', targetTenant, newLead, 'lead_create');
    }
    emitSyncEvent('leads', 'created', {
      entity_id: newLead.id,
      tenant_id: targetTenant,
      actor_id: actor?.id,
    });

    return newLead;
  })();

  inFlightLeadCreations.set(lockKey, creationPromise);
  try {
    return await creationPromise;
  } catch (err) {
    if (data.idempotency_key) {
      await idempotencyService.failAsync(data.idempotency_key, actor?.id || 'sys', targetTenant, 'lead_create');
    }
    throw err;
  } finally {
    inFlightLeadCreations.delete(lockKey);
  }
}

/**
 * Updates lead details (contact information, training preference, lead source, current status, etc.)
 * Preserves the CRM pipeline stage unless explicitly specified.
 */
export async function updateLeadDetails(
  leadId: string,
  updates: Partial<Omit<Lead, 'id' | 'lead_code' | 'created_at'>> & {
    rejectOnDuplicate?: boolean;
  },
  actorId: string,
  actor?: UserProfile
): Promise<Lead> {
  if (typeof window !== 'undefined') {
    const token = leadCacheToken();
    const response = await fetch('/api/crm/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, updates }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to update lead');
    }
    const updatedLead: Lead = result.lead;
    cacheLeads(cachedLeads().map(l => l.id === leadId ? updatedLead : l), token);
    store.leads = [...cachedLeads()];
    return updatedLead;
  }

  requireCrmActor(actor);
  if ('created_by' in updates || 'tenant_id' in updates || 'id' in updates || 'created_at' in updates) throw new Error('Forbidden: Immutable lead fields.');
  const expectedUpdatedAt = (updates as any).expected_updated_at;
  updates = leadFields.partial().parse(updates);
  const lead = await authorizedLead(leadId, actor);
  if (expectedUpdatedAt !== undefined) {
    concurrencyGuard.assertVersionMatch(lead, expectedUpdatedAt);
  }
  const scope = await resolveLeadScope(actor);
  await validateLeadAssignment(updates.counsellor_id, scope.actor);

  const country_code = updates.country_code || lead.country_code || '+91';
  let phone = updates.phone;
  if (phone !== undefined) {
    const phoneVal = validatePhoneNumber(country_code, phone, 'Mobile number');
    if (!phoneVal.isValid) {
      throw new Error(phoneVal.error || 'Invalid mobile number');
    }
    phone = phoneVal.normalized || phone;

    const duplicate = findDuplicateLeadByPhone(
      await getLeads({}, actor),
      phone,
      country_code,
      leadId,
      lead.tenant_id
    );
    if (duplicate && updates.rejectOnDuplicate) {
      throw new Error(
        `A lead with this mobile number already exists: ${duplicate.lead_code} (${duplicate.full_name}).`
      );
    }
  }

  let whatsapp_country_code = updates.whatsapp_country_code || lead.whatsapp_country_code || country_code;
  let whatsapp_number = updates.whatsapp_number;
  if (whatsapp_number !== undefined && whatsapp_number.trim()) {
    const waVal = validatePhoneNumber(whatsapp_country_code, whatsapp_number, 'WhatsApp number');
    if (!waVal.isValid) {
      throw new Error(waVal.error || 'Invalid WhatsApp number');
    }
    whatsapp_number = waVal.normalized || whatsapp_number;
  }

  const oldValues = {
    full_name: lead.full_name,
    phone: lead.phone,
    country_code: lead.country_code,
    whatsapp_number: lead.whatsapp_number,
    current_status: lead.current_status,
    training_preference: lead.training_preference,
    lead_source: lead.lead_source,
    stage: lead.stage,
  };

  if (updates.full_name !== undefined) lead.full_name = updates.full_name;
  if (phone !== undefined) lead.phone = phone;
  if (updates.country_code !== undefined) lead.country_code = country_code;
  if (whatsapp_number !== undefined) lead.whatsapp_number = whatsapp_number;
  if (updates.whatsapp_country_code !== undefined) lead.whatsapp_country_code = whatsapp_country_code;
  if (updates.email !== undefined) {
    if (updates.email && updates.email.trim()) {
      const emailValidation = validateEmailAddress(updates.email, 'Email address', false);
      if (!emailValidation.isValid) {
        throw new Error(emailValidation.error || 'Please enter a valid email address.');
      }
      lead.email = emailValidation.normalized || updates.email.trim();
    } else {
      lead.email = '';
    }
  }
  if (updates.interested_course_id !== undefined) {
    lead.interested_course_id = updates.interested_course_id;
    const course = (store.courses || []).find((c) => c.id === updates.interested_course_id || matchesCourseId(c.id, updates.interested_course_id));
    lead.interested_course_name = course?.course_name;
  }
  if (updates.current_status !== undefined) lead.current_status = updates.current_status;
  if (updates.training_preference !== undefined) lead.training_preference = updates.training_preference;
  if (updates.lead_source !== undefined) lead.lead_source = updates.lead_source;
  if (updates.counsellor_id !== undefined) {
    lead.counsellor_id = updates.counsellor_id;
    const counsellor = (store.users || []).find((u) => u.id === updates.counsellor_id);
    lead.counsellor_name = counsellor?.full_name;
  }
  if (updates.notes !== undefined) lead.notes = updates.notes;
  if (updates.experience !== undefined) lead.experience = updates.experience;
  if (updates.dob !== undefined) lead.dob = updates.dob;
  if (updates.address !== undefined) lead.address = updates.address;
  if (updates.experience_years !== undefined) lead.experience_years = updates.experience_years;
  if (updates.education !== undefined) lead.education = updates.education;
  // NOTE: do NOT modify lead.stage unless updates.stage is explicitly provided!
  if (updates.stage !== undefined) lead.stage = updates.stage;

  lead.updated_at = new Date().toISOString();
  if (updates.follow_up_date !== undefined) lead.follow_up_date = updates.follow_up_date || undefined;
  if (updates.demo_date !== undefined) lead.demo_date = updates.demo_date;
  if (updates.demo_preference !== undefined) lead.demo_preference = updates.demo_preference;
  if (isLiveSupabaseEnabled()) {
      const supabase = createAdminClient();
      let updateQuery = supabase.from('leads').update({
        full_name: lead.full_name,
        phone: lead.phone,
        country_code: lead.country_code || '+91',
        whatsapp_number: lead.whatsapp_number,
        whatsapp_country_code: lead.whatsapp_country_code || '+91',
        email: lead.email,
        interested_course_id: lead.interested_course_id,
        current_status: lead.current_status,
        training_preference: lead.training_preference,
        lead_source: lead.lead_source,
        counsellor_id: lead.counsellor_id,
        notes: lead.notes,
        stage: lead.stage,
        follow_up_date: lead.follow_up_date || null,
        demo_date: lead.demo_date || null,
        demo_preference: lead.demo_preference,
        experience_years: lead.experience_years,
        updated_at: lead.updated_at,
      }).eq('id', leadId);

      // Atomic SQL conditional update: check version timestamp directly in database query
      if (expectedUpdatedAt) {
        updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt);
      }

      const result = await scopeLeadQuery(updateQuery, scope).select('id, updated_at');
      if (result.error) throw new Error('CRM update failed.');
      if (!result.data || result.data.length === 0) {
        // Row was modified by another user or deleted concurrently
        const fresh = await supabase.from('leads').select('id, updated_at').eq('id', leadId).maybeSingle();
        if (!fresh.data) {
          throw new RecordConflictError(
            'This record has been deleted or is no longer available.',
            'deleted'
          );
        }
        throw new RecordConflictError(
          'This record has been updated by another user. Please review the latest information before saving your changes.',
          'modified',
          fresh.data
        );
      }
  }
  const index = store.leads.findIndex(l => l.id === leadId);
  if (index >= 0) store.leads[index] = lead;
  store.persist();
  await recordAuditLog({
    user_id: actorId,
    user_name: actor?.full_name || 'Staff',
    user_role: (actor?.role as any) || 'counsellor',
    action: 'LEAD_DETAILS_UPDATED',
    module: 'CRM',
    record_id: leadId,
    old_value: oldValues,
    new_value: {
      full_name: lead.full_name,
      phone: lead.phone,
      current_status: lead.current_status,
      training_preference: lead.training_preference,
      lead_source: lead.lead_source,
      stage: lead.stage,
    },
  });

  emitSyncEvent('leads', 'updated', {
    entity_id: leadId,
    tenant_id: lead.tenant_id,
    actor_id: actorId,
    metadata: { stage: lead.stage, counsellor_id: lead.counsellor_id },
  });

  return lead;
}

export async function updateLeadStage(leadId: string, stage: LeadStage, notes: string, counsellorId: string, followUpDate?: string | null, actor?: UserProfile): Promise<Lead> {
  if (typeof window !== 'undefined') {
    const token = leadCacheToken();
    const response = await fetch('/api/crm/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, action: 'stage', stage, notes, followUpDate }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Lead update denied.');
    cacheLeads(cachedLeads().map(l => l.id === leadId ? result.lead : l), token);
    store.leads = [...cachedLeads()];
    return result.lead;
  }
  requireCrmActor(actor);
  const current = await authorizedLead(leadId, actor);
  const lead = await updateLeadDetails(leadId, { stage, notes: notes ? [current.notes, notes].filter(Boolean).join('\n') : current.notes,
    ...(followUpDate !== undefined ? { follow_up_date: followUpDate || '' } : {}) }, actor.id, actor);
  if (isLiveSupabaseEnabled()) {
    const result = await createAdminClient().from('lead_followups').insert({ lead_id: leadId, tenant_id: actor.tenant_id, counsellor_id: actor.id, stage_before: current.stage, stage_after: stage, notes: notes || 'Stage updated', next_follow_up_date: followUpDate || null });
    if (result.error) throw new Error('Stage saved, but follow-up history failed. Refresh before retrying.');
  }
  return lead;
}

/**
 * Mark a follow-up or demo completed.
 * Clears the active follow-up date and transitions stage to 'Demo Attended' or 'Interested'.
 */
export async function completeFollowup(
  leadId: string,
  counsellorId: string,
  notes: string = 'Follow-up marked as completed',
  nextStage?: LeadStage,
  actor?: UserProfile
): Promise<Lead> {
  const lead = typeof window !== 'undefined' ? cachedLeads().find(l => l.id === leadId) : actor ? await authorizedLead(leadId, actor) : undefined;
  if (!lead) throw new Error('Lead not found');

  const resolvedStage: LeadStage =
    nextStage || (lead.stage === 'Demo Scheduled' ? 'Demo Attended' : 'Interested');

  return updateLeadStage(leadId, resolvedStage, `[COMPLETED] ${notes}`, counsellorId, null, actor);
}

/**
 * One-click Convert Lead to Admission workflow helper:
 * Transitions the lead stage to 'Enrolled' and prepares prefilled admission input.
 */
export function convertLeadToAdmission(leadId: string, actor?: UserProfile): {
  lead: Lead;
  admissionPrefill: Partial<CreateAdmissionInput>;
} {
  const lead = (typeof window !== 'undefined' ? cachedLeads() : store.leads).find((l) => l.id === leadId);
  if (!lead) throw new Error(`Lead not found: ${leadId}`);
  if (typeof window === 'undefined') { requireCrmActor(actor); assertLeadAccess(leadScope(actor), lead); }

  if (isLeadConverted(lead)) {
    throw new Error("Lead " + (lead.lead_code || lead.id) + " has already been converted to an admission.");
  }

  // Prefill is read-only. Conversion is committed only by the admission workflow.

  store.reconcileAuthoritativeCourses();
  const course = lead.interested_course_id
    ? (store.courses || []).find((c) => c.id === lead.interested_course_id || matchesCourseId(c.id, lead.interested_course_id))
    : store.courses?.[0];

  const admissionPrefill: Partial<CreateAdmissionInput> = {
    student_name: lead.full_name,
    email: lead.email,
    phone: lead.phone,
    city: '',
    education: lead.education || lead.current_status || '',
    experience_years: lead.experience_years ?? 0,
    course_id: lead.interested_course_id || (store.courses?.[0]?.id ?? ''),
    counsellor_id: lead.counsellor_id,
    lead_id: lead.id,
    training_mode: (lead.training_preference as any) || 'Hybrid',
    course_fee: course?.price ?? 0,
  };

  return { lead, admissionPrefill };
}

export async function bulkAssignLeads(leadIds: string[], counsellorId: string, assignedByUserId: string, actor?: UserProfile): Promise<number> {
  if (typeof window === 'undefined') { requireCrmActor(actor); for (const id of leadIds) await authorizedLead(id, actor); }
  for (const id of leadIds) await updateLeadDetails(id, { counsellor_id: counsellorId }, assignedByUserId, actor);
  emitSyncEvent('leads', 'assigned', {
    tenant_id: actor?.tenant_id,
    actor_id: assignedByUserId,
    metadata: { leadIds, counsellorId },
  });
  return leadIds.length;
}

export async function bulkUpdateLeadStage(leadIds: string[], stage: LeadStage, updatedByUserId: string, notes?: string, followUpDate?: string | null, actor?: UserProfile): Promise<number> {
  if (typeof window === 'undefined') { requireCrmActor(actor); for (const id of leadIds) await authorizedLead(id, actor); }
  for (const id of leadIds) await updateLeadStage(id, stage, notes || '', updatedByUserId, followUpDate, actor);
  return leadIds.length;
}
