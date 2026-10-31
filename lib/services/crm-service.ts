import { store } from './data-store';
import { Lead, LeadFollowup, LeadStage } from '@/types';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { CreateAdmissionInput } from './admission-service';

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
        if (json.success && Array.isArray(json.leads) && json.leads.length > 0) {
          store.leads = json.leads;
          return json.leads;
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
        store.leads = data as Lead[];
        return data as Lead[];
      }
    } catch (err) {
      console.warn('Supabase leads query error, falling back to local persistent store:', err);
    }
  }

  let list = [...store.leads];

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

export async function createLead(data: Omit<Lead, 'id' | 'lead_code' | 'created_at' | 'updated_at'>): Promise<Lead> {
  if (typeof window !== 'undefined') {
    const response = await fetch('/api/crm/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
  const count = store.leads.length + 1;
  const lead_code = `LD-2026-${String(count).padStart(3, '0')}`;
  const course = (store.courses || []).find((c) => c.id === data.interested_course_id);
  const counsellor = (store.users || []).find((u) => u.id === data.counsellor_id);

  const isUUID = (str?: string | null) =>
    Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

  const leadId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

  const newLead: Lead = {
    ...data,
    id: leadId,
    lead_code,
    interested_course_name: course?.course_name,
    counsellor_name: counsellor?.full_name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.leads.unshift(newLead);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = typeof window === 'undefined' ? createAdminClient() : createClient();
      const { error } = await supabase.from('leads').insert({
        id: newLead.id,
        lead_code: newLead.lead_code,
        full_name: newLead.full_name,
        phone: newLead.phone,
        email: newLead.email,
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
      });
      if (error) {
        throw new Error(`Database error creating lead: ${error.message}`);
      }
    } catch (err: any) {
      store.leads = store.leads.filter((l) => l.id !== newLead.id);
      store.persistSync();
      throw new Error(`Failed to create lead in database: ${err.message}`);
    }
  }

  await recordAuditLog({
    user_id: data.counsellor_id || 'system',
    user_name: counsellor?.full_name || 'System',
    user_role: 'counsellor',
    action: 'LEAD_CREATED',
    module: 'CRM',
    record_id: newLead.id,
    new_value: { name: newLead.full_name, phone: newLead.phone, stage: newLead.stage },
  });

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
