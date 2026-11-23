import * as crm from '@/lib/services/crm-service';
import { store } from '@/lib/services/data-store';
import type { UserProfile } from '@/types';
export * from '@/lib/services/crm-service';

// Explicit actors for legacy unit fixtures. Production services never infer these.
export function fixtureActor(id?: string): UserProfile {
  const found = store.users.find(u => u.id === id);
  return { ...(found || { id: id || 'fixture-admin', role: 'admin', email: 'fixture@example.test', full_name: 'Fixture Admin', is_active: true, created_at: '', updated_at: '' }), tenant_id: found?.tenant_id || 'default' } as UserProfile;
}
export const createLead = (data: Parameters<typeof crm.createLead>[0]) => crm.createLead(data, fixtureActor(data.counsellor_id));
export const getLeads = (filters?: Parameters<typeof crm.getLeads>[0]) => crm.getLeads(filters, fixtureActor());
export const updateLeadDetails = (id: string, updates: Parameters<typeof crm.updateLeadDetails>[1], actorId: string) => crm.updateLeadDetails(id, updates, actorId, fixtureActor(actorId));
export const updateLeadStage = (id: string, stage: Parameters<typeof crm.updateLeadStage>[1], notes: string, actorId: string, date?: string | null) => crm.updateLeadStage(id, stage, notes, actorId, date, fixtureActor(actorId));
export const completeFollowup = (id: string, actorId: string, notes?: string, stage?: Parameters<typeof crm.completeFollowup>[3]) => crm.completeFollowup(id, actorId, notes, stage, fixtureActor(actorId));
export const bulkAssignLeads = (ids: string[], counsellor: string, actorId: string) => crm.bulkAssignLeads(ids, counsellor, actorId, fixtureActor(actorId));
export const bulkUpdateLeadStage = (ids: string[], stage: Parameters<typeof crm.bulkUpdateLeadStage>[1], actorId: string, notes?: string, date?: string | null) => crm.bulkUpdateLeadStage(ids, stage, actorId, notes, date, fixtureActor(actorId));
export const convertLeadToAdmission = (id: string) => crm.convertLeadToAdmission(id, fixtureActor());
