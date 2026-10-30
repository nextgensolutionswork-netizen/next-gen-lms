import { store } from './data-store';
import { Lead, LeadFollowup, LeadStage } from '@/types';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { CreateAdmissionInput } from './admission-service';

export async function getLeads(filters?: {
  stage?: LeadStage | 'All';
  counsellor_id?: string;
  course_id?: string;
  search?: string;
}): Promise<Lead[]> {
  let list: Lead[];
  if (isLiveSupabaseEnabled()) {
      const supabase = createClient();
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
      if (error) throw new Error(`Unable to load leads: ${error.message}`);
      list = (data || []) as Lead[];
      // A filtered query must not replace the complete local cache.
      if (!filters?.stage && !filters?.counsellor_id && !filters?.course_id && !filters?.search) store.leads = list;
  } else {
    list = [...store.leads];
  }

  if (filters?.stage && filters.stage !== 'All') {
    list = list.filter((l) => l.stage === filters.stage);
  }
  if (filters?.counsellor_id) {
    list = list.filter((l) => l.counsellor_id === filters.counsellor_id);
  }
  if (filters?.course_id) {
    list = list.filter((l) => l.interested_course_id === filters.course_id);
  }
  if (filters?.search?.trim()) {
    const s = filters.search.trim().toLowerCase();
    list = list.filter(
      (l) =>
        l.full_name?.toLowerCase().includes(s) ||
        l.email?.toLowerCase().includes(s) ||
        l.phone?.includes(s) ||
        l.lead_code?.toLowerCase().includes(s)
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
  data: Omit<Lead, 'id' | 'lead_code' | 'created_at' | 'updated_at'>,
  authContext?: any
): Promise<Lead> {
  store.leads = store.leads || [];
  const existingCodes = (store.leads || [])
    .map((l) => {
      const m = l.lead_code?.match(/LD-\d{4}-(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n) && n < 900);
  let nextNum = (existingCodes.length > 0 ? Math.max(...existingCodes) : store.leads.length) + 1;
  while ((store.leads || []).some((l) => l.lead_code === `LD-2026-${String(nextNum).padStart(3, '0')}`)) {
    nextNum++;
  }
  if (isLiveSupabaseEnabled()) {
    try {
      const client = createClient(authContext || data.counsellor_id);
      const { data: recent } = await client.from('leads').select('lead_code').order('created_at', { ascending: false }).limit(25);
      if (recent && recent.length > 0) {
        for (const r of recent) {
          const m = r.lead_code?.match(/LD-\d{4}-(\d+)/);
          if (m) {
            const num = parseInt(m[1], 10);
            if (!isNaN(num) && num >= nextNum) nextNum = num + 1;
          }
        }
      }
    } catch {}
  }
  const lead_code = `LD-2026-${String(nextNum).padStart(3, '0')}`;
  const course = (store.courses || []).find((c) => c.id === data.interested_course_id);
  const counsellor = (store.users || []).find((u) => u.id === data.counsellor_id);

  let newId: string;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      newId = crypto.randomUUID();
    } else {
      newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
  } catch {
    newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let verifiedCounsellorName = counsellor?.full_name;

  if (isLiveSupabaseEnabled()) {
    if (!data.interested_course_id) throw new Error('Please select a course.');
    if (data.interested_course_id && !UUID_REGEX.test(data.interested_course_id)) {
      throw new Error('Invalid course ID: Course must be selected from authorized database records (valid UUID required).');
    }
    if (data.counsellor_id && !UUID_REGEX.test(data.counsellor_id)) {
      throw new Error('Invalid counsellor ID: Counsellor must be selected from authorized staff roster (valid UUID required).');
    }
    if (data.counsellor_id) {
      const supabase = createClient(authContext || data.counsellor_id);
      if (typeof supabase.from('profiles')?.select === 'function') {
        let profile: any = null;
        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('id, full_name, role, is_active, tenant_id')
          .eq('id', data.counsellor_id)
          .maybeSingle();

        if (profErr) {
          throw new Error('Invalid counsellor ID: Selected counsellor does not exist in authorized staff roster.');
        }
        profile = prof;
        if (!profile) {
          profile = (store.users || []).find((u) => u.id === data.counsellor_id);
        }
        if (!profile) {
          throw new Error('Invalid counsellor ID: Selected counsellor does not exist in authorized staff roster.');
        }
        if (profile.is_active === false) {
          throw new Error('Invalid counsellor ID: Assigned counsellor is inactive.');
        }
        if (!['counsellor', 'admin', 'super_admin'].includes(profile.role)) {
          throw new Error('Invalid counsellor ID: Assigned staff member is not authorized for lead counselling.');
        }
        if (authContext?.tenant_id && profile.tenant_id && profile.tenant_id !== authContext.tenant_id) {
          throw new Error('Invalid counsellor ID: Counsellor belongs to another tenant.');
        }
        verifiedCounsellorName = profile.full_name;
      }
    }
  } else {
    if (data.counsellor_id && data.counsellor_id !== 'usr-unassigned') {
      const localCounsellor = (store.users || []).find((u) => u.id === data.counsellor_id);
      if (!localCounsellor) {
        throw new Error('Invalid counsellor ID: Selected counsellor does not exist in authorized staff roster.');
      }
      if (localCounsellor.is_active === false) {
        throw new Error('Invalid counsellor ID: Assigned counsellor is inactive.');
      }
      if (!['counsellor', 'admin', 'super_admin'].includes(localCounsellor.role)) {
        throw new Error('Invalid counsellor ID: Assigned staff member is not authorized for lead counselling.');
      }
      if (authContext?.tenant_id && localCounsellor.tenant_id && localCounsellor.tenant_id !== authContext.tenant_id) {
        throw new Error('Invalid counsellor ID: Counsellor belongs to another tenant.');
      }
      verifiedCounsellorName = localCounsellor.full_name;
    }
  }

  const newLead: Lead = {
    ...data,
    id: newId,
    lead_code,
    interested_course_name: course?.course_name,
    counsellor_name: verifiedCounsellorName,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isLiveSupabaseEnabled()) {
    const supabase = createClient(authContext || data.counsellor_id);
    const supabasePayload: Record<string, any> = {
      id: newLead.id,
      lead_code: newLead.lead_code,
      full_name: newLead.full_name,
      phone: newLead.phone,
      email: newLead.email,
      current_status: newLead.current_status,
      experience_years: newLead.experience_years,
      training_preference: newLead.training_preference,
      lead_source: newLead.lead_source,
      campaign: newLead.campaign,
      demo_preference: newLead.demo_preference,
      demo_date: newLead.demo_date,
      follow_up_date: newLead.follow_up_date,
      notes: newLead.notes,
      stage: newLead.stage,
      interested_course_id: newLead.interested_course_id || null,
      counsellor_id: newLead.counsellor_id || null,
      created_at: newLead.created_at,
      updated_at: newLead.updated_at,
    };

    let { error } = await supabase.from('leads').insert(supabasePayload);
    if (error && error.message && error.message.includes('leads_lead_code_key')) {
      const uniqueSuffix = Date.now().toString().slice(-4);
      const retryCode = `${newLead.lead_code}-${uniqueSuffix}`;
      newLead.lead_code = retryCode;
      supabasePayload.lead_code = retryCode;
      const retryRes = await supabase.from('leads').insert(supabasePayload);
      error = retryRes.error;
    }
    if (error) {
      throw new Error(`Failed to create lead in database: Database error creating lead: ${error.message}`);
    }
  }

  store.leads.unshift(newLead);
  store.persist();

  try {
    await recordAuditLog({
      user_id: data.counsellor_id || 'system',
      user_name: counsellor?.full_name || 'System',
      user_role: 'counsellor',
      action: 'LEAD_CREATED',
      module: 'CRM',
      record_id: newLead.id,
      new_value: { name: newLead.full_name, phone: newLead.phone, stage: newLead.stage },
    });
  } catch (auditErr) {
    console.warn('Audit log notice:', auditErr);
  }

  return newLead;
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
  const updated = { ...lead, stage, updated_at: new Date().toISOString() };
  if (followUpDate !== undefined) updated.follow_up_date = followUpDate || undefined;
  if (notes) updated.notes = `${lead.notes ? lead.notes + '\n' : ''}[${new Date().toLocaleDateString('en-IN')}] ${notes}`;
  if (stage === 'Demo Scheduled') {
    updated.demo_date = followUpDate || undefined;
    updated.demo_preference = true;
  }

  if (isLiveSupabaseEnabled()) {
      const supabase = createClient(counsellorId);
      const isUuid = (str?: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '');

      if (!isUuid(leadId) || !isUuid(counsellorId)) throw new Error('A valid lead and counsellor UUID are required. Refresh and retry.');
        const { data: saved, error: updErr } = await supabase
          .from('leads')
          .update({
            stage,
            notes: updated.notes,
            follow_up_date: updated.follow_up_date?.slice(0, 10) || null,
            updated_at: updated.updated_at,
            ...(stage === 'Demo Scheduled' ? { demo_date: updated.demo_date || null, demo_preference: true } : {}),
          })
          .eq('id', leadId).select('*').single();

        if (updErr) {
          throw new Error(`Unable to save lead stage: ${updErr.message}`);
        }
        if (!saved) throw new Error('Lead was not updated. Refresh and check your access.');
        // The stage is now durable. Keep the cache truthful even if history fails.
        Object.assign(updated, saved);
        Object.assign(lead, updated);
        store.persist();

        // Insert audit record into lead_followups table matching migration 001
        if (isUuid(counsellorId)) {
          const { error: fErr } = await supabase.from('lead_followups').insert({
            lead_id: leadId,
            counsellor_id: counsellorId,
            stage_before: oldStage,
            stage_after: stage,
            notes: notes || 'Stage updated',
            next_follow_up_date: updated.follow_up_date?.slice(0, 10) || null,
          });
          if (fErr) {
            throw new Error(`Lead stage saved, but follow-up history could not be saved: ${fErr.message}. Refresh before retrying.`);
          }
        }
  } else {
    Object.assign(lead, updated);
    store.persist();
  }

  const counsellor = store.users.find((u) => u.id === counsellorId);

  try {
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
  } catch (auditErr) {
    console.warn('Audit log notice:', auditErr);
  }

  return lead;
}

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

  lead.stage = 'Enrolled';
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
