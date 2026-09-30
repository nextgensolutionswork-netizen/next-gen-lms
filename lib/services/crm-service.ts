import { store } from './data-store';
import { Lead, LeadFollowup, LeadStage } from '@/types';
import { recordAuditLog } from './audit-service';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { dbGetLeads, dbCreateLead } from '@/lib/supabase/db-service';

export async function getLeads(filters?: {
  stage?: LeadStage | 'All';
  counsellor_id?: string;
  course_id?: string;
  search?: string;
}): Promise<Lead[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const dbList = await dbGetLeads();
      if (dbList && dbList.length > 0) return dbList;
    } catch (err) {
      console.warn('Supabase leads query error, falling back to local store:', err);
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

  if (isLiveSupabaseEnabled()) {
    try {
      await dbCreateLead(newLead);
    } catch (err) {
      console.warn('Supabase lead insert error, saved locally:', err);
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
