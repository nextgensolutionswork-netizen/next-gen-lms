import { cacheLeads, cachedLeads, leadCacheToken } from './lead-cache';
import { store } from './data-store';
import { resolveActiveInstitute } from './institute-service';
import { Lead, LeadStage, Admission, UserProfile } from '@/types';
import { assertLeadAccess, leadScope, canAccessLead, requireCrmActor } from '@/lib/auth/lead-access';
import { leadFields } from './lead-input';
import { authorizedLead, resolveLeadScope, scopeLeadQuery, validateLeadAssignment, teamCreators } from './lead-security';
import { matchesCourseId, resolveCanonicalCourseUuid } from '@/lib/services/academics-service';
import { formatInstituteLabel } from '@/lib/constants/institutes';
import { idempotencyService } from './idempotency-service';
import { concurrencyGuard, RecordConflictError } from './concurrency-guard';
import { emitSyncEvent } from './sync-events';

/**
 * Finds the authoritative admission linked to a lead, if one exists.
 * Resolves by lead_id, matching admission number in lead notes, or matching email and course.
 */
/**
 * Verified roster of pre-cleanup admissions intentionally purged in the 25-Nov-2026 database reset.
 * Only admissions in this verified inventory are classified as Historical Conversions.
 * Any other converted lead missing an admission is flagged as an Integrity Error.
 */
export const VERIFIED_HISTORICAL_ADMISSIONS: readonly string[] = Object.freeze([
  'ADM-2026-0001',
  'ADM-2026-0002',
  'ADM-2026-0007',
  'ADM-2026-0008',
  'ADM-2026-0009',
  'ADM-2026-0010',
  'ADM-2026-0011',
  'ADM-2026-0012',
  'ADM-2026-0013',
  'ADM-2026-0016',
  'ADM-2026-0017',
  'ADM-2026-0018',
  'ADM-2026-0021',
  'ADM-2026-0024',
]);

/**
 * Authoritative immutable mapping of verified historical leads from 25-Nov reset.
 * Precludes any manipulation of conversion status through editable lead notes.
 */
export const VERIFIED_HISTORICAL_LEAD_MAP: Readonly<Record<string, string>> = Object.freeze({
  'b350177a-4915-4a33-8c5e-d6f3b07e452a': 'ADM-2026-0001',
  'e2a8078d-f768-49d4-915d-9405cf30462b': 'ADM-2026-0002',
  '46995a17-8d37-4670-a6db-7eac8ab05423': 'ADM-2026-0007',
  '6620a551-0f9f-4f37-8404-3646c6428531': 'ADM-2026-0008',
  'ee36d411-8287-48db-9336-1bf005d5638e': 'ADM-2026-0009',
  '74f35094-4df9-498b-b92c-42e482a0aa96': 'ADM-2026-0010',
  '11e15d52-f1bd-4509-871c-f2dae5b014d1': 'ADM-2026-0011',
  '5c44d3a4-dea8-4859-a3d7-1e78bb251e93': 'ADM-2026-0012',
  '03b40812-f553-49cd-bbb3-6f43eefd165e': 'ADM-2026-0013',
  '871a4179-e085-4f75-a044-dfea0739031c': 'ADM-2026-0016',
  '5b264e6d-bfb3-4f5d-af76-12e641d6499c': 'ADM-2026-0017',
  '2d099cd5-5951-4d32-9d42-491a95546347': 'ADM-2026-0018',
  'b80a99d9-efa2-450e-930c-3713c52f7751': 'ADM-2026-0021',
  '9520e05c-48a8-4196-af55-2d2f2654e610': 'ADM-2026-0024',
});

export type LeadConversionLifecycleStatus =
  | 'unconverted'
  | 'active'
  | 'historical'
  | 'cancelled'
  | 'integrity_error';

export interface LeadConversionStatusInfo {
  status: LeadConversionLifecycleStatus;
  matchingAdmission?: Admission;
  admissionNumber?: string;
  historicalReference?: string;
  isIntegrityError: boolean;
  message: string;
}

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
 * Extracts a historical admission number reference from structured fields or legacy notes.
 * Example note: "Converted to Admission: ADM-2026-0012"
 */
export function getLeadHistoricalAdmissionNumber(lead: Lead): string | undefined {
  if ((lead as any).historical_admission_reference) {
    return (lead as any).historical_admission_reference;
  }
  if (lead.id && VERIFIED_HISTORICAL_LEAD_MAP[lead.id]) {
    return VERIFIED_HISTORICAL_LEAD_MAP[lead.id];
  }
  if (!lead.notes) return undefined;
  const match = lead.notes.match(/Converted to Admission:\s*(ADM-[\w-]+)/i);
  return match ? match[1] : undefined;
}

/**
 * Formally classifies lead conversion lifecycle according to rigorous business rules:
 * - Active: Linked admission exists in public.admissions
 * - Historical: Admission removed during verified historical cleanup
 * - Cancelled: Linked admission has status = 'Cancelled'
 * - Integrity Error: Converted status with missing admission and no verified archival evidence
 * - Unconverted: Lead has not been converted
 */
export function classifyLeadConversion(
  lead: Lead,
  admissions?: Admission[],
  verifiedHistoricalList: readonly string[] = VERIFIED_HISTORICAL_ADMISSIONS
): LeadConversionStatusInfo {
  const matchingAdmission = getLeadAdmission(lead, admissions);
  const historicalRef = (lead as any).historical_admission_reference || getLeadHistoricalAdmissionNumber(lead);
  const isMarkedConverted = lead.stage === 'Converted' || lead.stage === 'Enrolled';

  // 1. Live Admission exists
  if (matchingAdmission) {
    if (matchingAdmission.status === 'Cancelled') {
      return {
        status: 'cancelled',
        matchingAdmission,
        admissionNumber: matchingAdmission.admission_number,
        historicalReference: historicalRef,
        isIntegrityError: false,
        message: `Linked admission ${matchingAdmission.admission_number} is cancelled.`,
      };
    }
    return {
      status: 'active',
      matchingAdmission,
      admissionNumber: matchingAdmission.admission_number,
      historicalReference: historicalRef,
      isIntegrityError: false,
      message: `Active linked admission ${matchingAdmission.admission_number}.`,
    };
  }

  // 2. Marked as Converted, but no live admission exists
  if (isMarkedConverted) {
    // Check if supported by documented cleanup / archival evidence
    if (historicalRef && verifiedHistoricalList.includes(historicalRef)) {
      return {
        status: 'historical',
        historicalReference: historicalRef,
        isIntegrityError: false,
        message: `Historical conversion reference ${historicalRef} verified from 25-Nov cleanup evidence.`,
      };
    }

    // Explicit archival status on lead if present
    if ((lead as any).conversion_status === 'historical' && (lead as any).archival_reason) {
      return {
        status: 'historical',
        historicalReference: historicalRef,
        isIntegrityError: false,
        message: `Historical conversion verified: ${(lead as any).archival_reason}`,
      };
    }

    // Otherwise: this is an unexpected missing admission -> INTEGRITY ERROR
    return {
      status: 'integrity_error',
      historicalReference: historicalRef,
      isIntegrityError: true,
      message: `INTEGRITY ERROR: Lead ${lead.lead_code || lead.id} is marked Converted but has no linked admission and no verified archival evidence.`,
    };
  }

  // 3. Unconverted lead
  return {
    status: 'unconverted',
    isIntegrityError: false,
    message: 'Lead is not converted.',
  };
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

export interface LeadCourseAuditRow {
  lead_id: string;
  lead_code: string;
  candidate_name: string;
  existing_course_id: string | null;
  course_mapping_status: 'Valid' | 'Missing' | 'Invalid';
  resolved_course_name: string;
  lead_source: string;
  institute: string;
  required_corrective_action: string;
}

export function resolveLeadCourseFromMaster(
  courseId?: string | null,
  coursesList?: typeof store.courses
) {
  const courses = coursesList || store.courses || [];
  const raw = (courseId ?? '').trim();
  if (!raw) {
    return { status: 'Missing' as const, course: undefined, course_id: null, course_name: 'Not Assigned' };
  }
  const matched = courses.find(
    (c) =>
      c.id === raw ||
      matchesCourseId(c.id, raw) ||
      c.course_code?.trim().toLowerCase() === raw.toLowerCase()
  );
  if (!matched) {
    return { status: 'Invalid' as const, course: undefined, course_id: raw, course_name: 'Invalid Course Reference' };
  }
  return { status: 'Valid' as const, course: matched, course_id: matched.id, course_name: matched.course_name };
}

export function auditLeadCourseMappings(
  leadsList?: Lead[],
  coursesList?: typeof store.courses
): LeadCourseAuditRow[] {
  const leads = leadsList || store.leads || [];
  const courses = coursesList || store.courses || [];
  return leads.map((lead) => {
    const resolved = resolveLeadCourseFromMaster(lead.interested_course_id, courses);
    return {
      lead_id: lead.id,
      lead_code: lead.lead_code,
      candidate_name: lead.full_name,
      existing_course_id: lead.interested_course_id || null,
      course_mapping_status: resolved.status,
      resolved_course_name: resolved.course_name,
      lead_source: lead.lead_source || 'Unknown',
      institute: formatInstituteLabel(lead.institute_name),
      required_corrective_action:
        resolved.status === 'Valid'
          ? 'None'
          : resolved.status === 'Missing'
          ? 'Assign valid course in Edit Lead'
          : `Replace invalid course reference (${lead.interested_course_id}) with a valid Course Master ID`,
    };
  });
}

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
  store.reconcileAuthoritativeCourses();
  leads = reconcileLeadsWithAdmissions(leads.map(l => ({ ...l })), store.admissions.filter(a => (a.tenant_id || 'default') === scope.actor.tenant_id));
  for (const lead of leads) {
    const resolved = resolveLeadCourseFromMaster(lead.interested_course_id, store.courses);
    if (resolved.status === 'Valid') {
      lead.interested_course_id = resolved.course_id!;
      lead.interested_course_name = resolved.course_name;
    } else if (resolved.status === 'Missing') {
      lead.interested_course_name = undefined;
    } else {
      lead.interested_course_name = undefined;
    }
  }
  return leads.filter(l => (!teamIds || Boolean(l.created_by && teamIds.includes(l.created_by))) && (!filters.stage || filters.stage === 'All' || l.stage === filters.stage)
    && (!filters.training_preference || l.training_preference === filters.training_preference)
    && (!filters.lead_source || l.lead_source === filters.lead_source)
    && (!filters.counsellor_id || l.counsellor_id === filters.counsellor_id)
    && (!filters.created_by || l.created_by === filters.created_by)
    && (!filters.course_id || l.interested_course_id === filters.course_id || matchesCourseId(l.interested_course_id, filters.course_id))
    && (!(filters as any).institute_id || (filters as any).institute_id === 'All' || ((filters as any).institute_id === 'unassigned' ? (!l.institute_id && !l.institute_name) : (l.institute_id === (filters as any).institute_id || l.institute_name === (filters as any).institute_id)))
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
    require_institute?: boolean;
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
    if ((data as any).require_institute || data.institute_id !== undefined || data.institute_name !== undefined) {
      const resolvedInst = resolveActiveInstitute({
        institute_id: data.institute_id,
        institute_name: data.institute_name,
      });
      data = { ...data, institute_id: resolvedInst.institute_id, institute_name: resolvedInst.institute_name };
    }
    if (data.experience !== undefined && data.experience.trim() === '') {
      throw new Error('Experience is required and cannot be empty.');
    }
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
      interested_course_id: course?.id ?? (payload.interested_course_id || undefined),
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
          interested_course_id: isUUID(resolveCanonicalCourseUuid(newLead.interested_course_id) || newLead.interested_course_id)
            ? (resolveCanonicalCourseUuid(newLead.interested_course_id) || newLead.interested_course_id)
            : null,
          current_status: newLead.current_status,
          experience_years: newLead.experience_years,
          training_preference: newLead.training_preference,
          lead_source: newLead.lead_source,
          campaign: newLead.campaign,
          institute_id: newLead.institute_id ?? null,
          institute_name: newLead.institute_name ?? null,
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
    confirm_financial_institute_change?: boolean;
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
  if ('created_by' in updates || 'tenant_id' in updates || 'id' in updates || 'created_at' in updates) {
    throw new Error('Forbidden: Immutable lead fields.');
  }
  if ('payment_id' in updates || 'admission_id' in updates || 'fee' in updates || 'amount' in updates) {
    throw new Error('Forbidden: Financial and admission mutations are not permitted via lead update.');
  }
  const expectedUpdatedAt = (updates as any).expected_updated_at;
  updates = leadFields.partial().parse(updates);
  if (updates.institute_id !== undefined || updates.institute_name !== undefined) {
    const resolvedInst = resolveActiveInstitute({
      institute_id: updates.institute_id,
      institute_name: updates.institute_name,
    });
    updates = { ...updates, institute_id: resolvedInst.institute_id, institute_name: resolvedInst.institute_name };
  }
  const lead = await authorizedLead(leadId, actor);
  if (expectedUpdatedAt !== undefined) {
    concurrencyGuard.assertVersionMatch(lead, expectedUpdatedAt);
  }
  const scope = await resolveLeadScope(actor);
  if (scope.actor.role === 'counsellor' && updates.counsellor_id !== undefined && updates.counsellor_id !== lead.counsellor_id) {
    throw new Error('Forbidden: Counsellors cannot reassign leads.');
  }
  if (updates.counsellor_id !== undefined && updates.counsellor_id && updates.counsellor_id.trim() !== '') {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updates.counsellor_id.trim());
    if (!isUUID) {
      throw new Error('Invalid counsellor ID format. Must be a valid UUID or empty.');
    }
  }
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
    institute_id: lead.institute_id ?? null,
    institute_name: lead.institute_name ?? 'Not Assigned',
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
    if (updates.interested_course_id && updates.interested_course_id.trim() !== '') {
      const resolvedCourse = resolveLeadCourseFromMaster(updates.interested_course_id, store.courses);
      if (resolvedCourse.status !== 'Valid' || !resolvedCourse.course) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          updates.interested_course_id.trim()
        );
        throw new Error(
          isUUID
            ? 'Selected course is invalid or not found in Course Master.'
            : 'Invalid course ID format: Selected course is invalid or not found in Course Master.'
        );
      }
      lead.interested_course_id = resolvedCourse.course.id;
      lead.interested_course_name = resolvedCourse.course.course_name;
    } else {
      lead.interested_course_id = '';
      lead.interested_course_name = undefined;
    }
  }
  if (updates.current_status !== undefined) lead.current_status = updates.current_status;
  if (updates.training_preference !== undefined) lead.training_preference = updates.training_preference;
  if (updates.lead_source !== undefined) lead.lead_source = updates.lead_source;
  if (updates.institute_id !== undefined) lead.institute_id = updates.institute_id;
  if (updates.institute_name !== undefined) lead.institute_name = updates.institute_name;

  const instituteChanged =
    (updates.institute_id !== undefined && updates.institute_id !== oldValues.institute_id) ||
    (updates.institute_name !== undefined && updates.institute_name !== (oldValues.institute_name === 'Not Assigned' ? null : oldValues.institute_name));

  if (instituteChanged) {
    const linkedAdmission = getLeadAdmission(lead, store.admissions);
    const linkedStudent = linkedAdmission
      ? (store.students || []).find((s) => s.id === linkedAdmission.student_id || s.admission_id === linkedAdmission.id)
      : (store.students || []).find((s) => s.lead_id === lead.id);

    if (linkedAdmission || linkedStudent) {
      const hasFinancialRecords =
        (store.studentPayments || []).some(
          (p) =>
            (linkedStudent && p.student_id === linkedStudent.id) ||
            (linkedAdmission && p.enrollment_id === linkedAdmission.id)
        ) ||
        (store.receipts || []).some((r) => linkedStudent && r.student_id === linkedStudent.id);

      if (hasFinancialRecords) {
        const isAuthorizedReviewer = ['super_admin', 'admin', 'accountant'].includes(scope.actor.role);
        if (!isAuthorizedReviewer || !(updates as any).confirm_financial_institute_change) {
          throw new Error(
            'Authorized review required: Financial records exist for this converted lead. Confirm authorized review before changing institute attribution.'
          );
        }
      }

      if (linkedAdmission) {
        linkedAdmission.institute_id = lead.institute_id ?? null;
        linkedAdmission.institute_name = lead.institute_name ?? null;
        linkedAdmission.updated_at = new Date().toISOString();
      }
      if (linkedStudent) {
        linkedStudent.institute_id = lead.institute_id ?? null;
        linkedStudent.institute_name = lead.institute_name ?? null;
        linkedStudent.updated_at = new Date().toISOString();
      }
      const linkedOnboarding = (store.onboardingCases || []).find(
        (c) => (linkedStudent && c.student_id === linkedStudent.id) || (linkedAdmission && c.admission_id === linkedAdmission.id)
      );
      if (linkedOnboarding) {
        linkedOnboarding.institute_id = lead.institute_id ?? null;
        linkedOnboarding.institute_name = lead.institute_name ?? null;
        linkedOnboarding.updated_at = new Date().toISOString();
      }
    }
  }
  if (updates.counsellor_id !== undefined) {
    if (updates.counsellor_id && updates.counsellor_id.trim() !== '') {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updates.counsellor_id.trim());
      if (!isUUID) {
        throw new Error('Invalid counsellor ID format. Must be a valid UUID or empty.');
      }
      if (actor?.role === 'counsellor' && updates.counsellor_id.trim() !== lead.counsellor_id) {
        throw new Error('Forbidden: Counsellors cannot reassign lead ownership.');
      }
      lead.counsellor_id = updates.counsellor_id.trim();
    } else {
      if (actor?.role === 'counsellor' && lead.counsellor_id) {
        throw new Error('Forbidden: Counsellors cannot unassign lead ownership.');
      }
      lead.counsellor_id = undefined;
    }
    const counsellor = (store.users || []).find((u) => u.id === lead.counsellor_id);
    lead.counsellor_name = counsellor?.full_name;
  }
  const historicalRef = (lead as any).historical_admission_reference || getLeadHistoricalAdmissionNumber(lead);
  if (updates.notes !== undefined) {
    let sanitizedNotes = updates.notes;
    // Preclude forgery: if lead is not converted, strip any user-injected "Converted to Admission" strings
    if (lead.stage !== 'Converted' && lead.stage !== 'Enrolled' && updates.stage !== 'Converted' && updates.stage !== 'Enrolled') {
      sanitizedNotes = sanitizedNotes.replace(/Converted to Admission:\s*ADM-[\w-]+/gi, '').trim();
    }
    lead.notes = sanitizedNotes;
    // Always preserve historical admission reference if lead was previously converted
    if (historicalRef && !lead.notes.includes(historicalRef)) {
      const refNote = `Converted to Admission: ${historicalRef}`;
      lead.notes = lead.notes ? `${lead.notes}\n${refNote}` : refNote;
    }
  }
  if (updates.experience !== undefined) {
    lead.experience = updates.experience;
    if (updates.experience_years === undefined) {
      const exp = updates.experience.trim();
      const expMap: Record<string, number> = {
        'Fresher': 0,
        '0–2 Years': 1,
        '0-2 Years': 1,
        '2–5 Years': 3,
        '2-5 Years': 3,
        '5+ Years': 5,
        '5-8 Years': 6,
        '8+ Years': 9,
        '10+ Years': 10,
      };
      if (exp in expMap) {
        lead.experience_years = expMap[exp];
      } else {
        const match = exp.match(/^(\d+)/);
        if (match) {
          lead.experience_years = parseInt(match[1], 10);
        } else if (exp.toLowerCase().includes('fresh')) {
          lead.experience_years = 0;
        } else {
          lead.experience_years = undefined;
        }
      }
    }
  }
  if (updates.dob !== undefined) {
    if (updates.dob && updates.dob.trim()) {
      const d = new Date(updates.dob);
      if (isNaN(d.getTime())) {
        throw new Error('Invalid date format for date of birth.');
      }
      lead.dob = updates.dob.trim();
    } else {
      lead.dob = undefined;
    }
  }
  if (updates.address !== undefined) lead.address = updates.address;
  if (updates.experience_years !== undefined) lead.experience_years = updates.experience_years;
  if (updates.education !== undefined) lead.education = updates.education;
  // NOTE: do NOT modify lead.stage unless updates.stage is explicitly provided!
  if (updates.stage !== undefined) {
    if (lead.stage === 'Converted' && updates.stage !== 'Converted') {
      throw new Error('Forbidden: Cannot alter stage of a converted lead through candidate details.');
    }
    lead.stage = updates.stage;
  }

  lead.updated_at = new Date().toISOString();
  if (updates.follow_up_date !== undefined) {
    if (updates.follow_up_date && updates.follow_up_date.trim()) {
      const d = new Date(updates.follow_up_date);
      if (isNaN(d.getTime())) {
        throw new Error('Invalid date format for follow-up date.');
      }
      lead.follow_up_date = d.toISOString();
    } else {
      lead.follow_up_date = undefined;
    }
  }
  if (updates.demo_date !== undefined) {
    if (updates.demo_date && updates.demo_date.trim()) {
      const d = new Date(updates.demo_date);
      if (isNaN(d.getTime())) {
        throw new Error('Invalid date format for demo date.');
      }
      lead.demo_date = d.toISOString();
    } else {
      lead.demo_date = undefined;
    }
  }
  if (updates.demo_preference !== undefined) lead.demo_preference = updates.demo_preference;
  if (isLiveSupabaseEnabled()) {
      const supabase = createAdminClient();
      const payload: Record<string, any> = {
        full_name: lead.full_name,
        phone: lead.phone,
        country_code: lead.country_code || '+91',
        whatsapp_number: lead.whatsapp_number,
        whatsapp_country_code: lead.whatsapp_country_code || '+91',
        email: lead.email,
        interested_course_id: lead.interested_course_id || null,
        current_status: lead.current_status,
        training_preference: lead.training_preference,
        lead_source: lead.lead_source,
        institute_id: lead.institute_id ?? null,
        institute_name: lead.institute_name ?? null,
        counsellor_id: lead.counsellor_id || null,
        notes: lead.notes,
        stage: lead.stage,
        demo_preference: Boolean(lead.demo_preference),
        experience_years: typeof lead.experience_years === 'number' && !isNaN(lead.experience_years) ? lead.experience_years : null,
        updated_at: lead.updated_at,
      };
      if (updates.follow_up_date !== undefined) payload.follow_up_date = lead.follow_up_date || null;
      if (updates.demo_date !== undefined) payload.demo_date = lead.demo_date || null;
      if (updates.dob !== undefined) payload.dob = lead.dob || null;
      if (updates.address !== undefined) payload.address = lead.address || null;
      if (updates.education !== undefined) payload.education = lead.education || null;

      let updateQuery = supabase.from('leads').update(payload).eq('id', leadId);

      // Atomic SQL conditional update: check version timestamp directly in database query
      if (expectedUpdatedAt) {
        updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt);
      }

      const result = await scopeLeadQuery(updateQuery, scope).select('id, updated_at');
      if (result.error) {
        console.error('[CRM updateLeadDetails] Supabase update error:', result.error);
        throw new Error(`CRM update failed: ${result.error.message || 'Database rejected update.'}`);
      }
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
      institute_id: lead.institute_id ?? null,
      institute_name: lead.institute_name ?? 'Not Assigned',
    },
  });

  if (instituteChanged) {
    await recordAuditLog({
      user_id: actorId,
      user_name: actor?.full_name || 'Staff',
      user_role: (actor?.role as any) || 'counsellor',
      action: 'LEAD_INSTITUTE_UPDATED',
      module: 'CRM',
      record_id: leadId,
      old_value: {
        institute_id: oldValues.institute_id,
        institute_name: oldValues.institute_name,
      },
      new_value: {
        institute_id: lead.institute_id ?? null,
        institute_name: lead.institute_name ?? 'Not Assigned',
      },
    });
  }

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
  if (typeof window === 'undefined') {
    requireCrmActor(actor);
    if (actor.role === 'counsellor') {
      throw new Error('Forbidden: Counsellors cannot perform bulk stage updates.');
    }
    for (const id of leadIds) await authorizedLead(id, actor);
  }
  for (const id of leadIds) await updateLeadStage(id, stage, notes || '', updatedByUserId, followUpDate, actor);
  return leadIds.length;
}
