/**
 * TASK-02: Distributed Idempotency Service
 * Server-side duplicate operation prevention with atomic database reservation
 * across multi-instance Vercel serverless environments and local memory cache.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';

export class IdempotencyConflictError extends Error {
  public statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

interface IdempotencyRecord {
  key: string;
  actorId: string;
  tenantId: string;
  operation: string;
  payloadHash: string;
  status: 'processing' | 'completed' | 'failed';
  result?: any;
  createdAt: number;
  completedAt?: number;
}

// In-memory store for fast local resolution and fallback
const idempotencyStore = new Map<string, IdempotencyRecord>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function computeHash(payload: any): string {
  if (!payload) return 'empty';
  try {
    const normalize = (obj: any): any => {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(normalize);
      const sorted: Record<string, any> = {};
      for (const k of Object.keys(obj).sort()) {
        sorted[k] = normalize(obj[k]);
      }
      return sorted;
    };
    const str = typeof payload === 'string' ? payload : JSON.stringify(normalize(payload));
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36) + '_' + str.length;
  } catch {
    return 'unhashable';
  }
}

function makeCompositeKey(key: string, actorId: string, tenantId: string, operation: string = 'default'): string {
  return `${tenantId}:${actorId}:${operation}:${key}`;
}

export const idempotencyService = {
  /**
   * Check or acquire lock synchronously (in-memory fast path).
   */
  acquire(
    key: string,
    actorId: string,
    tenantId: string,
    payload: any,
    operation: string = 'default'
  ): { isExisting: boolean; result?: any } {
    if (!key || !key.trim()) return { isExisting: false };

    const compositeKey = makeCompositeKey(key.trim(), actorId, tenantId, operation);
    const hash = computeHash(payload);
    const existing = idempotencyStore.get(compositeKey);

    if (existing) {
      if (Date.now() - existing.createdAt > TTL_MS) {
        idempotencyStore.delete(compositeKey);
      } else {
        if (existing.payloadHash !== hash && existing.payloadHash !== 'unhashable' && hash !== 'unhashable') {
          throw new IdempotencyConflictError(
            'Idempotency key reuse conflict: The provided idempotency key has already been used with a different request payload.'
          );
        }

        if (existing.status === 'completed') {
          return { isExisting: true, result: existing.result };
        }

        if (existing.status === 'processing') {
          if (Date.now() - existing.createdAt < 30000) {
            throw new IdempotencyConflictError(
              'A request with this idempotency key is currently processing. Please wait.'
            );
          }
        }
      }
    }

    idempotencyStore.set(compositeKey, {
      key: key.trim(),
      actorId,
      tenantId,
      operation,
      payloadHash: hash,
      status: 'processing',
      createdAt: Date.now(),
    });

    return { isExisting: false };
  },

  /**
   * Asynchronously acquire lock with durable PostgreSQL reservation across Vercel serverless instances.
   */
  async acquireAsync(
    key: string,
    actorId: string,
    tenantId: string,
    payload: any,
    operation: string = 'default'
  ): Promise<{ isExisting: boolean; result?: any }> {
    if (!key || !key.trim()) return { isExisting: false };

    const trimmedKey = key.trim();
    const compositeKey = makeCompositeKey(trimmedKey, actorId, tenantId, operation);
    const hash = computeHash(payload);

    // Fast-path in-memory check
    const local = idempotencyStore.get(compositeKey);
    if (local && local.status === 'completed' && local.payloadHash === hash) {
      return { isExisting: true, result: local.result };
    }

    if (isLiveSupabaseEnabled()) {
      try {
        const supabase = createAdminClient();
        // 1. Try atomic insert with ON CONFLICT DO NOTHING
        const { error: insertError } = await supabase
          .from('idempotency_keys')
          .insert({
            key: trimmedKey,
            tenant_id: tenantId,
            actor_id: actorId,
            operation,
            payload_hash: hash,
            status: 'processing',
            created_at: new Date().toISOString(),
          });

        if (!insertError) {
          // Successfully reserved atomically in PostgreSQL across all instances
          idempotencyStore.set(compositeKey, {
            key: trimmedKey,
            actorId,
            tenantId,
            operation,
            payloadHash: hash,
            status: 'processing',
            createdAt: Date.now(),
          });
          return { isExisting: false };
        }

        // 2. Insert collided: retrieve existing authoritative record
        const { data: existingRow, error: selectError } = await supabase
          .from('idempotency_keys')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('actor_id', actorId)
          .eq('key', trimmedKey)
          .maybeSingle();

        if (existingRow && !selectError) {
          // Check for payload hash mismatch
          if (existingRow.payload_hash !== hash && existingRow.payload_hash !== 'unhashable' && hash !== 'unhashable') {
            throw new IdempotencyConflictError(
              'Idempotency key reuse conflict: The provided idempotency key has already been used with a different request payload.'
            );
          }

          if (existingRow.status === 'completed') {
            // Update local memory cache with authoritative result
            idempotencyStore.set(compositeKey, {
              key: trimmedKey,
              actorId,
              tenantId,
              operation,
              payloadHash: hash,
              status: 'completed',
              result: existingRow.result,
              createdAt: new Date(existingRow.created_at).getTime(),
              completedAt: existingRow.completed_at ? new Date(existingRow.completed_at).getTime() : undefined,
            });
            return { isExisting: true, result: existingRow.result };
          }

          if (existingRow.status === 'processing') {
            const ageMs = Date.now() - new Date(existingRow.created_at).getTime();
            if (ageMs < 30000) {
              throw new IdempotencyConflictError(
                'A request with this idempotency key is currently processing. Please wait.'
              );
            } else {
              // Stale crashed processing lock (>30s): take over safely
              await supabase
                .from('idempotency_keys')
                .update({
                  payload_hash: hash,
                  created_at: new Date().toISOString(),
                  status: 'processing',
                })
                .eq('tenant_id', tenantId)
                .eq('actor_id', actorId)
                .eq('key', trimmedKey);

              idempotencyStore.set(compositeKey, {
                key: trimmedKey,
                actorId,
                tenantId,
                operation,
                payloadHash: hash,
                status: 'processing',
                createdAt: Date.now(),
              });
              return { isExisting: false };
            }
          }
        }
      } catch (err) {
        if (err instanceof IdempotencyConflictError) throw err;
        console.warn('[idempotency-service] Distributed DB check failed, using local safeguard:', err);
      }
    }

    // Fallback to local synchronous implementation
    return this.acquire(trimmedKey, actorId, tenantId, payload, operation);
  },

  /**
   * Mark operation completed and store its authoritative result.
   */
  complete(key: string, actorId: string, tenantId: string, result: any, operation: string = 'default'): void {
    if (!key || !key.trim()) return;
    const compositeKey = makeCompositeKey(key.trim(), actorId, tenantId, operation);
    const existing = idempotencyStore.get(compositeKey);
    if (existing) {
      existing.status = 'completed';
      existing.result = result;
      existing.completedAt = Date.now();
    }
    // Async DB update in background if called synchronously
    if (isLiveSupabaseEnabled()) {
      void this.completeAsync(key, actorId, tenantId, result, operation).catch(() => {});
    }
  },

  /**
   * Mark operation completed in PostgreSQL durable store.
   */
  async completeAsync(
    key: string,
    actorId: string,
    tenantId: string,
    result: any,
    operation: string = 'default'
  ): Promise<void> {
    if (!key || !key.trim()) return;
    const trimmedKey = key.trim();
    const compositeKey = makeCompositeKey(trimmedKey, actorId, tenantId, operation);
    const existing = idempotencyStore.get(compositeKey);
    if (existing) {
      existing.status = 'completed';
      existing.result = result;
      existing.completedAt = Date.now();
    }

    if (isLiveSupabaseEnabled()) {
      try {
        const supabase = createAdminClient();
        await supabase
          .from('idempotency_keys')
          .update({
            status: 'completed',
            result: result || {},
            completed_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)
          .eq('actor_id', actorId)
          .eq('key', trimmedKey);
      } catch (err) {
        console.warn('[idempotency-service] Failed to persist completion to DB:', err);
      }
    }
  },

  /**
   * Release lock if operation failed so retries can proceed safely.
   */
  fail(key: string, actorId: string, tenantId: string, operation: string = 'default'): void {
    if (!key || !key.trim()) return;
    const compositeKey = makeCompositeKey(key.trim(), actorId, tenantId, operation);
    idempotencyStore.delete(compositeKey);
    if (isLiveSupabaseEnabled()) {
      void this.failAsync(key, actorId, tenantId, operation).catch(() => {});
    }
  },

  /**
   * Release lock in PostgreSQL durable store on failure.
   */
  async failAsync(key: string, actorId: string, tenantId: string, operation: string = 'default'): Promise<void> {
    if (!key || !key.trim()) return;
    const trimmedKey = key.trim();
    const compositeKey = makeCompositeKey(trimmedKey, actorId, tenantId, operation);
    idempotencyStore.delete(compositeKey);

    if (isLiveSupabaseEnabled()) {
      try {
        const supabase = createAdminClient();
        await supabase
          .from('idempotency_keys')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('actor_id', actorId)
          .eq('key', trimmedKey)
          .eq('status', 'processing');
      } catch (err) {
        console.warn('[idempotency-service] Failed to release failed key from DB:', err);
      }
    }
  },

  /**
   * Clear store for testing or tenant reset.
   */
  clear(): void {
    idempotencyStore.clear();
  },
};
