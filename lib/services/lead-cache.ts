import type { Lead } from '@/types';

let identity: string | null = null;
let generation = 0;
let records: Lead[] = [];
export function resetLeadCache(nextIdentity: string | null = null) {
  identity = nextIdentity;
  generation++;
  records = [];
}
export function leadCacheToken() { return generation; }
export function cacheLeads(leads: Lead[], token: number) {
  if (token !== generation) throw new Error('CRM session changed. Refresh your leads.');
  records = leads;
}
export function cachedLeads(userId?: string) {
  return identity && (!userId || userId === identity) ? records : [];
}
