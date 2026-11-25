/**
 * TASK-02: Centralized Synchronization Events & Publisher
 * Dispatches lightweight, secure change signals across authorized user sessions.
 * Never broadcasts sensitive confidential data; acts as an invalidation signal.
 */

import { publishRealtimeEvent } from './realtime-service';
import { UserRole } from '@/types';

export type SyncTopic =
  | 'leads'
  | 'admissions'
  | 'payments'
  | 'receipts'
  | 'expenses'
  | 'onboarding'
  | 'batches'
  | 'attendance'
  | 'placement'
  | 'sap_lab'
  | 'certificates'
  | 'doubts'
  | 'system';

export type SyncEventAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'archived'
  | 'assigned'
  | 'approved'
  | 'rejected'
  | 'verified'
  | 'voided'
  | 'completed'
  | 'revalidated';

export interface SyncSignalPayload {
  entity_id?: string;
  action: SyncEventAction | string;
  tenant_id?: string;
  actor_id?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Allowed subscriber roles per topic (RLS & Authorization boundary)
export const TOPIC_ROLE_PERMISSIONS: Record<SyncTopic, UserRole[]> = {
  leads: ['super_admin', 'admin', 'counsellor', 'counsellor_lead'],
  admissions: ['super_admin', 'admin', 'counsellor', 'counsellor_lead', 'accountant', 'onboarding_team'],
  payments: ['super_admin', 'admin', 'accountant', 'counsellor', 'student', 'onboarding_team'],
  receipts: ['super_admin', 'admin', 'accountant', 'counsellor', 'student'],
  expenses: ['super_admin', 'admin', 'accountant'],
  onboarding: ['super_admin', 'admin', 'onboarding_team', 'counsellor', 'counsellor_lead', 'student'],
  batches: ['super_admin', 'admin', 'trainer', 'counsellor', 'student', 'support'],
  attendance: ['super_admin', 'admin', 'trainer', 'student'],
  placement: ['super_admin', 'admin', 'placement_coordinator', 'student'],
  sap_lab: ['super_admin', 'admin', 'trainer', 'student', 'support'],
  certificates: ['super_admin', 'admin', 'trainer', 'student', 'support'],
  doubts: ['super_admin', 'admin', 'trainer', 'student', 'support'],
  system: ['super_admin', 'admin'],
};

/**
 * Validates whether a user with the given role is authorized to subscribe to a topic.
 */
export function isUserAuthorizedForTopic(role: UserRole, topic: string): boolean {
  if (['super_admin', 'admin'].includes(role)) return true;
  const baseTopic = topic.split(':')[0] as SyncTopic;
  const allowedRoles = TOPIC_ROLE_PERMISSIONS[baseTopic];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

/**
 * Emits a centralized synchronization event across in-memory and Supabase channels.
 */
export function emitSyncEvent(
  topic: SyncTopic | string,
  action: SyncEventAction | string,
  payload: {
    entity_id?: string;
    tenant_id?: string;
    actor_id?: string;
    metadata?: Record<string, any>;
  }
): void {
  const signal: SyncSignalPayload = {
    entity_id: payload.entity_id,
    action,
    tenant_id: payload.tenant_id || 'default',
    actor_id: payload.actor_id,
    timestamp: new Date().toISOString(),
    metadata: payload.metadata,
  };

  // Publish to RealtimeHub (which dispatches locally and broadcasts over Supabase channel if active)
  try {
    publishRealtimeEvent(topic, `${topic}_${action}`, signal);
  } catch (err) {
    // Avoid interrupting mutation on notification failure
    console.warn(`[SyncEvents] Failed to publish sync event for topic "${topic}":`, err);
  }
}
