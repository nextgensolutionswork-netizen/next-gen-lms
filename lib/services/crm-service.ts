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
  if (isLiveSupabaseEnabled()) {
    try {
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
  const count = store.leads.length + 1;
  const lead_code = `LD-2026-${String(count).padStart(3, '0')}`;
  const course = store.courses.find((c) => c.id === data.interested_course_id);
  const counsellor = store.users.find((u) => u.id === data.counsellor_id);

  const newLead: Lead = {
    ...data,
    id: `lead-${Date.now()}`,
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
      const supabase = createClient();
      await supabase.from('leads').insert({
        id: newLead.id,
        lead_code: newLead.lead_code,
        full_name: newLead.full_name,
        phone: newLead.phone,
        email: newLead.email,
        interested_course_id: newLead.interested_course_id,
        current_status: newLead.current_status,
        experience_years: newLead.experience_years,
        training_preference: newLead.training_preference,
        lead_source: newLead.lead_source,
        campaign: newLead.campaign,
        counsellor_id: newLead.counsellor_id,
        demo_preference: newLead.demo_preference,
        demo_date: newLead.demo_date,
        follow_up_date: newLead.follow_up_date,
        notes: newLead.notes,
        stage: newLead.stage,
        created_at: newLead.created_at,
        updated_at: newLead.updated_at,
      });
    } catch (err) {
      console.warn('Supabase createLead direct query warning, preserved locally:', err);
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
  counsellorId: string
): Promise<Lead> {
  const lead = store.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error('Lead not found');

  const oldStage = lead.stage;
  lead.stage = stage;
  lead.updated_at = new Date().toISOString();
  if (notes) {
    lead.notes = `${lead.notes ? lead.notes + '\n' : ''}[${new Date().toLocaleDateString('en-IN')}] ${notes}`;
  }
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('leads')
        .update({
          stage,
          notes: lead.notes,
          updated_at: lead.updated_at,
        })
        .eq('id', leadId);

      // Insert audit record into lead_followups table matching migration 001
      await supabase.from('lead_followups').insert({
        lead_id: leadId,
        counsellor_id: counsellorId,
        stage_before: oldStage,
        stage_after: stage,
        notes: notes || 'Stage updated',
      });
    } catch (err) {
      console.warn('Supabase updateLeadStage direct query warning, preserved locally:', err);
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
    new_value: { stage, notes },
  });

  return lead;
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

  const course = store.courses.find((c) => c.id === lead.interested_course_id);

  const admissionPrefill: Partial<CreateAdmissionInput> = {
    student_name: lead.full_name,
    email: lead.email,
    phone: lead.phone,
    city: 'Hyderabad',
    education: lead.current_status || 'Graduate / B.Tech / MBA',
    experience_years: lead.experience_years ?? 1,
    course_id: lead.interested_course_id || (store.courses[0]?.id ?? ''),
    counsellor_id: lead.counsellor_id,
    lead_id: lead.id,
    training_mode: (lead.training_preference as any) || 'Hybrid',
    course_fee: course?.price ?? 45000,
  };

  return { lead, admissionPrefill };
}
