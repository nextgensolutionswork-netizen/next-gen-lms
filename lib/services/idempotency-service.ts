/**
 * TASK-02: Idempotency Service
 * Server-side duplicate operation prevention, idempotency key tracking,
 * and concurrent duplicate request resolution.
 */

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
  payloadHash: string;
  status: 'processing' | 'completed' | 'failed';
  result?: any;
  createdAt: number;
  completedAt?: number;
}

// In-memory store with TTL (24 hours)
const idempotencyStore = new Map<string, IdempotencyRecord>();
const TTL_MS = 24 * 60 * 60 * 1000;

function computeHash(payload: any): string {
  if (!payload) return 'empty';
  try {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload, Object.keys(payload).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  } catch {
    return 'unhashable';
  }
}

function makeCompositeKey(key: string, actorId: string, tenantId: string): string {
  return `${tenantId}:${actorId}:${key}`;
}

export const idempotencyService = {
  /**
   * Check or acquire lock for an idempotency key.
   * If already completed, returns the cached result.
   * If processing, throws error to prevent concurrent race conditions.
   * If payload differs, throws 409 Conflict.
   */
  acquire(key: string, actorId: string, tenantId: string, payload: any): { isExisting: boolean; result?: any } {
    if (!key || !key.trim()) return { isExisting: false };

    const compositeKey = makeCompositeKey(key.trim(), actorId, tenantId);
    const hash = computeHash(payload);
    const existing = idempotencyStore.get(compositeKey);

    if (existing) {
      // Clean up if expired
      if (Date.now() - existing.createdAt > TTL_MS) {
        idempotencyStore.delete(compositeKey);
      } else {
        // If payload hash differs, reject with conflict
        if (existing.payloadHash !== hash && existing.payloadHash !== 'unhashable' && hash !== 'unhashable') {
          throw new IdempotencyConflictError(
            'Idempotency key reuse conflict: The provided idempotency key has already been used with a different request payload.'
          );
        }

        if (existing.status === 'completed') {
          return { isExisting: true, result: existing.result };
        }

        if (existing.status === 'processing') {
          // If in flight for more than 30s, treat as stale attempt and allow retry
          if (Date.now() - existing.createdAt < 30000) {
            throw new IdempotencyConflictError(
              'A request with this idempotency key is currently processing. Please wait.'
            );
          }
        }
      }
    }

    // Mark processing
    idempotencyStore.set(compositeKey, {
      key,
      actorId,
      tenantId,
      payloadHash: hash,
      status: 'processing',
      createdAt: Date.now(),
    });

    return { isExisting: false };
  },

  /**
   * Mark an operation completed and store its authoritative result.
   */
  complete(key: string, actorId: string, tenantId: string, result: any): void {
    if (!key || !key.trim()) return;
    const compositeKey = makeCompositeKey(key.trim(), actorId, tenantId);
    const existing = idempotencyStore.get(compositeKey);
    if (existing) {
      existing.status = 'completed';
      existing.result = result;
      existing.completedAt = Date.now();
    }
  },

  /**
   * Release lock if the operation failed so the user can safely retry without duplicate rejection.
   */
  fail(key: string, actorId: string, tenantId: string): void {
    if (!key || !key.trim()) return;
    const compositeKey = makeCompositeKey(key.trim(), actorId, tenantId);
    idempotencyStore.delete(compositeKey);
  },

  /**
   * Clear store for testing or tenant reset.
   */
  clear(): void {
    idempotencyStore.clear();
  },
};
