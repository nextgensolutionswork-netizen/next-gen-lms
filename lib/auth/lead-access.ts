import type { Lead, UserProfile } from '@/types';
import { tenantId } from './tenant';

export const CRM_ROLES = ['super_admin', 'admin', 'counsellor_lead', 'counsellor'];
export interface LeadScope { actor: UserProfile; creatorIds: string[] | null }

export function requireCrmActor(actor?: UserProfile | null): asserts actor is UserProfile {
  if (!actor) throw new Error('Unauthorized: Authenticated CRM session required.');
  if (!actor.is_active || !actor.tenant_id || !CRM_ROLES.includes(actor.role)) {
    throw new Error('Forbidden: Active CRM membership required.');
  }
}

// Membership IDs must be loaded on the server, never accepted from request data.
export function leadScope(actor: UserProfile, teamCreatorIds: string[] = []): LeadScope {
  requireCrmActor(actor);
  return { actor, creatorIds: ['super_admin', 'admin'].includes(actor.role) ? null
    : actor.role === 'counsellor_lead' ? [...new Set([actor.id, ...teamCreatorIds])] : [actor.id] };
}

export function canAccessLead(scope: LeadScope, lead?: Pick<Lead, 'created_by' | 'counsellor_id' | 'tenant_id'> | null): boolean {
  if (!lead) return false;
  if (tenantId(lead) !== tenantId(scope.actor)) return false;
  if (scope.creatorIds === null) return true;

  if (scope.actor.role === 'counsellor') {
    if (lead.counsellor_id) return lead.counsellor_id === scope.actor.id;
    return Boolean(lead.created_by && lead.created_by === scope.actor.id);
  }

  if (scope.actor.role === 'counsellor_lead') {
    if (lead.counsellor_id) return scope.creatorIds.includes(lead.counsellor_id);
    return Boolean(lead.created_by && scope.creatorIds.includes(lead.created_by));
  }

  return false;
}

export function assertLeadAccess(scope: LeadScope, lead?: Lead | null): asserts lead is Lead {
  if (!canAccessLead(scope, lead)) throw new Error('Forbidden: Lead access denied.');
}
