import { store } from './data-store';
import { Lead, LeadFollowup, LeadStage, Admission } from '@/types';

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
      (lead.notes && a.admission_number && lead.notes.includes(a.admission_number)) ||
      (a.email && lead.email && a.email.toLowerCase() === lead.email.toLowerCase() && a.course_id === lead.interested_course_id)
  );
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

export async function getLeads(filters?: {
  stage?: LeadStage | 'All';
  counsellor_id?: string;
  course_id?: string;
  search?: string;
}): Promise<Lead[]> {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams();
      if (filters?.stage && filters.stage !== 'All') params.set('stage', filters.stage);
      if (filters?.search) params.set('search', filters.search);
      const res = await fetch(`/api/crm/leads?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.leads)) {
          const reconciled = reconcileLeadsWithAdmissions(json.leads);
          store.leads = reconciled;
          return reconciled;
        }
      }
    } catch (err) {
      console.warn('GET /api/crm/leads fetch error, using local fallback:', err);
    }
  }

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = typeof window === 'undefined' ? createAdminClient() : createClient();
      let query = supabase.from('leads').select('*').order('created_at', { ascending: false });

      if (filters?.stage && filters.stage !== 'All') {
        query = query.eq('stage', filters.stage);
      }
      if (filters?.counsellor_id) {
        query = query.eq('counsellor_id', filters.counsellor_id);
      }
      if (filters?.course_id) {
        query = query.eq('interested_course_id', filters.course_id);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const reconciled = reconcileLeadsWithAdmissions(data as Lead[]);
        store.leads = reconciled;
        return reconciled;
      }
    } catch (err) {
      console.warn('Supabase leads query error, falling back to local persistent store:', err);
    }
  }

  let list = reconcileLeadsWithAdmissions([...store.leads]);

  if (filters?.stage && filters.stage !== 'All') {
    list = list.filter((l) => l.stage === filters.stage);
  }
  if (filters?.counsellor_id) {
    list = list.filter((l) => l.counsellor_id === filters.counsellor_id);
  }
  if (filters?.course_id) {
    list = list.filter((l) => l.interested_course_id === filters.course_id);
  }
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    list = list.filter(
      (l) =>
        l.full_name.toLowerCase().includes(s) ||
        l.email.toLowerCase().includes(s) ||
        l.phone.includes(s) ||
        l.lead_code.toLowerCase().includes(s)
    );
  }

  return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getLeadById(id: string): Promise<Lead | undefined> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
      if (!error && data) {
        return data as Lead;
      }
    } catch (err) {
      console.warn('Supabase getLeadById error, checking local store:', err);
    }
  }

  return store.leads.find((l) => l.id === id);
}

export async function createLead(
  data: Omit<Lead, 'id' | 'lead_code' | 'created_at' | 'updated_at'> & {
    rejectOnDuplicate?: boolean;
    allowDuplicate?: boolean;
  }
): Promise<Lead> {
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

  // 3. Duplicate mobile number check
  const duplicate = findDuplicateLeadByPhone(
    store.leads || [],
    normalizedPhone,
    country_code,
    undefined,
    data.tenant_id
  );
  if (duplicate && data.rejectOnDuplicate) {
    throw new Error(
      `A lead with this mobile number already exists: ${duplicate.lead_code} (${duplicate.full_name}).`
    );
  }

  const payload: typeof data = {
    ...data,
    country_code,
    phone: normalizedPhone,
    whatsapp_country_code,
    whatsapp_number,
  };

  if (typeof window !== 'undefined') {
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
    store.leads = store.leads || [];
    if (!store.leads.some((l) => l.id === createdLead.id)) {
      store.leads.unshift(createdLead);
    }
    return createdLead;
  }

  store.leads = store.leads || [];
  const id = globalThis.crypto.randomUUID();
  const lead_code = `LD-${new Date().getFullYear()}-${id}`;
  const course = (store.courses || []).find((c) => c.id === payload.interested_course_id);
  const counsellor = (store.users || []).find((u) => u.id === payload.counsellor_id);

  const isUUID = (str?: string | null) =>
    Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

  let finalNotes = payload.notes || '';
  if (duplicate && !data.rejectOnDuplicate) {
    const dupNotice = `[Duplicate Inquiry: matches ${duplicate.lead_code} (${duplicate.full_name})]`;
    finalNotes = finalNotes ? `${dupNotice} ${finalNotes}` : dupNotice;
  }

  const newLead: Lead = {
    ...payload,
    id,
    lead_code,
    notes: finalNotes,
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
        // Fallback if country_code / whatsapp columns don't exist yet on remote db
        if (error.code === '42703' || error.message.includes('column')) {
          delete insertPayload.country_code;
          delete insertPayload.whatsapp_country_code;
          delete insertPayload.whatsapp_number;
          const { error: retryErr } = await supabase.from('leads').insert(insertPayload);
          if (!retryErr) break;
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
    user_id: data.counsellor_id || 'system',
    user_name: counsellor?.full_name || 'System',
    user_role: 'counsellor',
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

  return newLead;
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
  actorId: string
): Promise<Lead> {
  if (typeof window !== 'undefined') {
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
    store.leads = store.leads || [];
    const idx = store.leads.findIndex((l) => l.id === leadId);
    if (idx !== -1) {
      store.leads[idx] = updatedLead;
    }
    return updatedLead;
  }

  const lead = (store.leads || []).find((l) => l.id === leadId);
  if (!lead) throw new Error('Lead not found');

  const country_code = updates.country_code || lead.country_code || '+91';
  let phone = updates.phone;
  if (phone !== undefined) {
    const phoneVal = validatePhoneNumber(country_code, phone, 'Mobile number');
    if (!phoneVal.isValid) {
      throw new Error(phoneVal.error || 'Invalid mobile number');
    }
    phone = phoneVal.normalized || phone;

    const duplicate = findDuplicateLeadByPhone(
      store.leads || [],
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
  if (updates.email !== undefined) lead.email = updates.email;
  if (updates.interested_course_id !== undefined) {
    lead.interested_course_id = updates.interested_course_id;
    const course = (store.courses || []).find((c) => c.id === updates.interested_course_id);
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
  if (updates.experience_years !== undefined) lead.experience_years = updates.experience_years;
  if (updates.education !== undefined) lead.education = updates.education;
  // NOTE: do NOT modify lead.stage unless updates.stage is explicitly provided!
  if (updates.stage !== undefined) lead.stage = updates.stage;

  lead.updated_at = new Date().toISOString();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createAdminClient();
      await supabase.from('leads').update({
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
        updated_at: lead.updated_at,
      }).eq('id', leadId);
    } catch (err) {
      console.warn('Supabase updateLeadDetails warning:', err);
    }
  }

  const actor = (store.users || []).find((u) => u.id === actorId);
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

  return lead;
}

export async function updateLeadStage(
  leadId: string,
  stage: LeadStage,
  notes: string,
  counsellorId: string,
  followUpDate?: string | null
): Promise<Lead> {
  const lead = store.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error('Lead not found');

  const oldStage = lead.stage;
  const oldNotes = lead.notes;
  const oldFollowUp = lead.follow_up_date;
  const oldUpdatedAt = lead.updated_at;

  lead.stage = stage;
  lead.updated_at = new Date().toISOString();
  if (followUpDate !== undefined) {
    lead.follow_up_date = followUpDate ? followUpDate : undefined;
  }
  if (notes) {
    lead.notes = `${lead.notes ? lead.notes + '\n' : ''}[${new Date().toLocaleDateString('en-IN')}] ${notes}`;
  }
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from('leads')
        .update({
          stage,
          notes: lead.notes,
          follow_up_date: lead.follow_up_date || null,
          updated_at: lead.updated_at,
        })
        .eq('id', leadId);

      if (updErr) {
        throw new Error(`Database error updating lead: ${updErr.message}`);
      }

      // Insert audit record into lead_followups table matching migration 001
      const { error: fErr } = await supabase.from('lead_followups').insert({
        lead_id: leadId,
        counsellor_id: counsellorId,
        stage_before: oldStage,
        stage_after: stage,
        notes: notes || 'Stage updated',
      });
      if (fErr) {
        console.warn('Lead followups insert warning:', fErr.message);
      }
    } catch (err: any) {
      lead.stage = oldStage;
      lead.notes = oldNotes;
      lead.follow_up_date = oldFollowUp;
      lead.updated_at = oldUpdatedAt;
      store.persistSync();
      throw new Error(`Failed to update lead stage in database: ${err.message}`);
    }
  }

  const counsellor = store.users.find((u) => u.id === counsellorId);

  await recordAuditLog({
    user_id: counsellorId,
    user_name: counsellor?.full_name || 'Counsellor',
    user_role: 'counsellor',
    action: 'LEAD_STAGE_UPDATED',
    module: 'CRM',
    record_id: leadId,
    old_value: { stage: oldStage },
    new_value: { stage, notes, follow_up_date: lead.follow_up_date },
  });

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
  nextStage?: LeadStage
): Promise<Lead> {
  const lead = store.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error('Lead not found');

  const resolvedStage: LeadStage =
    nextStage || (lead.stage === 'Demo Scheduled' ? 'Demo Attended' : 'Interested');

  return updateLeadStage(leadId, resolvedStage, `[COMPLETED] ${notes}`, counsellorId, null);
}

/**
 * One-click Convert Lead to Admission workflow helper:
 * Transitions the lead stage to 'Enrolled' and prepares prefilled admission input.
 */
export function convertLeadToAdmission(leadId: string): {
  lead: Lead;
  admissionPrefill: Partial<CreateAdmissionInput>;
} {
  const lead = store.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  if (isLeadConverted(lead)) {
    throw new Error("Lead " + (lead.lead_code || lead.id) + " has already been converted to an admission.");
  }

  lead.stage = 'Converted';
  lead.updated_at = new Date().toISOString();
  store.persist();

  const course = (store.courses || []).find((c) => c.id === lead.interested_course_id) || store.courses?.[0];

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

export async function bulkAssignLeads(
  leadIds: string[],
  counsellorId: string,
  assignedByUserId: string
): Promise<number> {
  const counsellor = store.users.find((u) => u.id === counsellorId);
  const counsellorName = counsellor?.full_name || 'Assigned Counsellor';
  let count = 0;

  for (const id of leadIds) {
    const lead = store.leads.find((l) => l.id === id);
    if (lead) {
      lead.counsellor_id = counsellorId;
      lead.counsellor_name = counsellorName;
      lead.updated_at = new Date().toISOString();
      count++;
    }
  }

  if (count > 0) {
    store.persist();
    if (isLiveSupabaseEnabled()) {
      try {
        const supabase = createClient();
        await supabase
          .from('leads')
          .update({
            counsellor_id: counsellorId,
            updated_at: new Date().toISOString(),
          })
          .in('id', leadIds);
      } catch (err) {
        console.warn('Supabase bulkAssignLeads warning:', err);
      }
    }

    const assignedBy = store.users.find((u) => u.id === assignedByUserId);
    await recordAuditLog({
      user_id: assignedByUserId,
      user_name: assignedBy?.full_name || 'Staff',
      user_role: 'counsellor',
      action: 'LEADS_BULK_ASSIGNED',
      module: 'CRM',
      record_id: leadIds.join(','),
      new_value: { count, counsellorId, counsellorName, leadIds },
    });
  }

  return count;
}

export async function bulkUpdateLeadStage(
  leadIds: string[],
  stage: LeadStage,
  updatedByUserId: string,
  notes?: string,
  followUpDate?: string | null
): Promise<number> {
  let count = 0;
  const now = new Date().toISOString();
  const dateLabel = new Date().toLocaleDateString('en-IN');

  for (const id of leadIds) {
    const lead = store.leads.find((l) => l.id === id);
    if (lead) {
      lead.stage = stage;
      lead.updated_at = now;
      if (followUpDate !== undefined) {
        lead.follow_up_date = followUpDate ? followUpDate : undefined;
      }
      if (notes) {
        lead.notes = `${lead.notes ? lead.notes + '\n' : ''}[${dateLabel}] [Bulk Stage Update]: ${notes}`;
      }
      count++;
    }
  }

  if (count > 0) {
    store.persist();
    if (isLiveSupabaseEnabled()) {
      try {
        const supabase = createClient();
        const updatePayload: Record<string, any> = {
          stage,
          updated_at: now,
        };
        if (followUpDate !== undefined) {
          updatePayload.follow_up_date = followUpDate || null;
        }
        await supabase
          .from('leads')
          .update(updatePayload)
          .in('id', leadIds);
      } catch (err) {
        console.warn('Supabase bulkUpdateLeadStage warning:', err);
      }
    }

    const updatedBy = store.users.find((u) => u.id === updatedByUserId);
    await recordAuditLog({
      user_id: updatedByUserId,
      user_name: updatedBy?.full_name || 'Staff',
      user_role: 'counsellor',
      action: 'LEADS_BULK_STAGE_UPDATED',
      module: 'CRM',
      record_id: leadIds.join(','),
      new_value: { count, stage, leadIds, follow_up_date: followUpDate },
    });
  }

  return count;
}
