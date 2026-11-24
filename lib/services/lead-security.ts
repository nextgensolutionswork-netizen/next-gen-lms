import type { Lead, UserProfile } from '@/types';
import { assertLeadAccess, leadScope, requireCrmActor, type LeadScope } from '@/lib/auth/lead-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { store } from './data-store';

// Server callers pass only the profile returned by verified request authentication.
// Privileged queries are always tenant AND creator scoped, including writes.
export async function resolveLeadScope(actor: UserProfile): Promise<LeadScope> {
  if (typeof window !== 'undefined') throw new Error('Forbidden: Server authorization required.');
  if (isLiveSupabaseEnabled()) {
    const profile = await createAdminClient().from('profiles').select('*').eq('id', actor.id).single();
    if (profile.error || !profile.data) throw new Error('Forbidden: CRM profile unavailable.');
    actor = profile.data as UserProfile;
  }
  requireCrmActor(actor);
  if (actor.role !== 'counsellor_lead') return leadScope(actor);
  if (!isLiveSupabaseEnabled()) return leadScope(actor, localTeamMembers
    .filter(m => m.tenant_id === actor.tenant_id && m.leader_id === actor.id).map(m => m.member_id));
  const db = createAdminClient();
  const teams = await db.from('crm_teams').select('id').eq('tenant_id', actor.tenant_id!).eq('leader_id', actor.id);
  if (teams.error) throw new Error('CRM team authorization unavailable.');
  if (!teams.data?.length) return leadScope(actor);
  const members = await db.from('crm_team_members').select('member_id').eq('tenant_id', actor.tenant_id!).in('team_id', teams.data.map(t => t.id));
  if (members.error) throw new Error('CRM team authorization unavailable.');
  return leadScope(actor, (members.data || []).map(m => m.member_id));
}

// Local-only fixtures; never hydrated from client input or exposed through an API.
export const localTeamMembers: { tenant_id: string; leader_id: string; member_id: string }[] = [
  // Radhika (Counsellor Lead) manages Amulya and Sandhya
  {
    tenant_id: 'default',
    leader_id: '2983a160-0764-40c5-ab50-a41cff9f0c68',
    member_id: '987c67ef-388c-4467-90d6-4c4635398ed7',
  },
  {
    tenant_id: 'default',
    leader_id: '2983a160-0764-40c5-ab50-a41cff9f0c68',
    member_id: '3f5ba75a-ba23-4612-be74-e075a7d81f9b',
  },
];

export function scopeLeadQuery(query: any, scope: LeadScope): any {
  query = query.eq('tenant_id', scope.actor.tenant_id);
  return scope.creatorIds === null ? query : query.in('created_by', scope.creatorIds);
}

export async function authorizedLead(id: string, actor: UserProfile): Promise<Lead> {
  const scope = await resolveLeadScope(actor);
  let lead: Lead | undefined;
  if (isLiveSupabaseEnabled()) {
    const result = await scopeLeadQuery(createAdminClient().from('leads').select('*').eq('id', id), scope).maybeSingle();
    if (result.error) throw new Error('CRM lookup unavailable.');
    lead = result.data;
  } else lead = store.leads.find(l => l.id === id);
  assertLeadAccess(scope, lead);
  return { ...lead };
}

export async function validateLeadAssignment(id: string | undefined, actor: UserProfile) {
  if (!id) return;
  let profile: UserProfile | undefined;
  if (isLiveSupabaseEnabled()) {
    const result = await createAdminClient().from('profiles').select('*').eq('id', id).eq('tenant_id', actor.tenant_id!).maybeSingle();
    if (result.error) throw new Error('CRM assignment lookup unavailable.');
    profile = result.data as UserProfile;
  } else profile = store.users.find(u => u.id === id);
  if (!profile || profile.is_active === false || (profile.tenant_id || 'default') !== actor.tenant_id || !['super_admin','admin','counsellor','counsellor_lead'].includes(profile.role)) {
    throw new Error('Forbidden: Invalid salesperson assignment.');
  }
}

export async function teamCreators(teamId: string, scope: LeadScope): Promise<string[]> {
  if (!isLiveSupabaseEnabled()) return [];
  const db = createAdminClient();
  let query = db.from('crm_teams').select('id,leader_id').eq('tenant_id', scope.actor.tenant_id!).eq('id', teamId);
  if (scope.creatorIds) query = query.eq('leader_id', scope.actor.id);
  const team = await query.maybeSingle();
  if (team.error) throw new Error('CRM team lookup unavailable.');
  if (!team.data) return [];
  const members = await db.from('crm_team_members').select('member_id').eq('tenant_id', scope.actor.tenant_id!).eq('team_id', teamId);
  if (members.error) throw new Error('CRM team lookup unavailable.');
  return [team.data.leader_id, ...(members.data || []).map(m => m.member_id)];
}
