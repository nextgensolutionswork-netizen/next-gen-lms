import { store } from './data-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { tenantId } from '@/lib/auth/tenant';
import { UserProfile } from '@/types';
import { workflowKeys, workflowSnapshot, mergeWorkflowSnapshot } from './payment-workflow-state';
import { isTransientNetworkError } from '@/lib/supabase/fetch-resilience';

let transactionQueue: Promise<unknown> = Promise.resolve();

let currentPostCommitTasks: Array<() => Promise<void>> | null = null;

// Track the latest synced database revision per tenant to avoid unnecessary 2MB+ snapshot downloads
const tenantRevisions = new Map<string, number>();

/**
 * Register an external action (emails, WhatsApp, webhooks) to run ONLY
 * after the database transaction successfully commits. Discarded if transaction conflicts or aborts.
 */
export function onTransactionCommit(task: () => Promise<void>): void {
  if (currentPostCommitTasks) {
    currentPostCommitTasks.push(task);
  } else {
    task().catch((err) => console.warn('Post-commit task failed outside transaction:', err));
  }
}

/** Serialize the local adapter; use compare-and-swap for cross-process PostgreSQL commits.
 * All financial effects, receipts, audits and in-app notifications commit in one row update.
 * A stale writer fails with 409; no partial ledger changes or external effects escape.
 */
export function paymentTransaction<T>(actor: UserProfile, operation: () => Promise<T> | T, readOnly = false): Promise<T> {
  const run = transactionQueue.then(async () => {
    const live = isLiveSupabaseEnabled();
    const tenant = tenantId(actor);
    const db = live ? createAdminClient() : null;
    let revision = 0;

    if (db) {
      let stateData: { revision: number; snapshot: any } | null = null;
      let rosterData: UserProfile[] | null = null;
      let lastDbError: unknown = null;

      // Resilient fetch with up to 3 retries for transient socket/network drops
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const cachedRev = tenantRevisions.get(tenant);
          const hasLocalData = (store.studentFees || []).length > 0;

          // Bandwidth & socket optimization: on read-only queries with existing local data,
          // check lightweight revision first before pulling the multi-megabyte JSON snapshot.
          if (readOnly && cachedRev !== undefined && hasLocalData) {
            const [revRes, rosterRes] = await Promise.all([
              db.from('fee_workflow_state').select('revision').eq('tenant_id', tenant).maybeSingle(),
              db.from('profiles').select('*').eq('tenant_id', tenant),
            ]);

            if (revRes.error || rosterRes.error) {
              const err = revRes.error || rosterRes.error;
              if (isTransientNetworkError(err) && attempt < 3) {
                await new Promise((r) => setTimeout(r, attempt * 150));
                continue;
              }
              throw err;
            }

            if (revRes.data && revRes.data.revision === cachedRev) {
              revision = cachedRev;
              stateData = { revision: cachedRev, snapshot: null };
              rosterData = (rosterRes.data || []) as UserProfile[];
              break;
            }
          }

          // Full snapshot fetch
          const [stateRes, rosterRes] = await Promise.all([
            db.from('fee_workflow_state').select('revision, snapshot').eq('tenant_id', tenant).maybeSingle(),
            db.from('profiles').select('*').eq('tenant_id', tenant),
          ]);

          if (stateRes.error || rosterRes.error) {
            const err = stateRes.error || rosterRes.error;
            if (isTransientNetworkError(err) && attempt < 3) {
              await new Promise((r) => setTimeout(r, attempt * 150));
              continue;
            }
            throw err;
          }

          stateData = stateRes.data;
          rosterData = (rosterRes.data || []) as UserProfile[];
          break;
        } catch (fetchErr: any) {
          lastDbError = fetchErr;
          if (isTransientNetworkError(fetchErr) && attempt < 3) {
            await new Promise((r) => setTimeout(r, attempt * 150));
            continue;
          }
          break;
        }
      }

      if (lastDbError && !stateData) {
        const errorMsg = isTransientNetworkError(lastDbError)
          ? 'Connection to the database was interrupted (network socket terminated). Please verify your connection or retry.'
          : (lastDbError instanceof Error ? lastDbError.message : 'Database connection failed.');
        throw new Error(`Payment database unavailable: ${errorMsg}`);
      }

      if (stateData) {
        revision = stateData.revision;
        tenantRevisions.set(tenant, revision);
        if (stateData.snapshot) {
          mergeWorkflowSnapshot(stateData.snapshot, tenant);
        }
      } else {
        // Explicit bootstrap, performed from trusted database rows, never a browser snapshot.
        const tables = { users: 'profiles', students: 'students', admissions: 'admissions', feeAccounts: 'student_fee_accounts', installments: 'installments', payments: 'payments', receipts: 'receipts', onboardingCases: 'onboarding_cases' } as const;
        const rows = await Promise.all(Object.entries(tables).map(async ([key, table]) => {
          const response = key === 'users' ? { data: rosterData, error: null } : await db.from(table).select('*').eq('tenant_id', tenant);
          if (response.error) throw new Error(`Payment bootstrap failed: ${(response.error as any).message}`);
          return { key, response };
        }));
        for (const { key, response } of rows) {
          (store as any)[key] = [...(store[key as keyof typeof tables] as any[]).filter((r) => tenantId(r) !== tenant), ...(response.data || [])];
        }
        for (const key of ['studentPayments', 'studentFees', 'studentFinancialLedgers'] as const) (store as any)[key] = store[key].filter((r) => tenantId(r) !== tenant);
        // The original SQL payments table predates a status column. Only an
        // existing official receipt establishes historical verification.
        for (const payment of store.payments.filter((p) => tenantId(p) === tenant && !p.status)) {
          payment.status = store.receipts.some((r) => r.payment_id === payment.id && tenantId(r) === tenant) ? 'Success' : 'Pending';
        }
        store.reconcileDualLedgers();
      }

      // Assignment and notification recipients must use current membership, not
      // roles or active flags from an older financial snapshot.
      const activeProfiles = rosterData || [];
      const profileIds = new Set(activeProfiles.map((u) => u.id));
      store.users = [
        ...store.users.filter((u) => tenantId(u) !== tenant || (u.role === 'student' && !profileIds.has(u.id))),
        ...activeProfiles,
      ];
    }

    const userIndex = store.users.findIndex((u) => u.id === actor.id);
    if (userIndex < 0) store.users.push(actor); else store.users[userIndex] = actor;
    const before = Object.fromEntries(workflowKeys.map((key) => [key, structuredClone(store[key])]));
    const originalPersist = store.persist;
    store.persist = () => {}; // no intermediate durable snapshots
    const postCommitTasks: Array<() => Promise<void>> = [];
    currentPostCommitTasks = postCommitTasks;

    try {
      const result = await operation();
      if (!readOnly) {
        store.reconcileDualLedgers();
        const snapshot = workflowSnapshot(tenant);
        if (db) {
          let response: any = null;
          for (let commitAttempt = 1; commitAttempt <= 2; commitAttempt++) {
            response = await db.rpc('commit_fee_workflow', { p_tenant: tenant, p_revision: revision, p_snapshot: snapshot });
            if (response.error && isTransientNetworkError(response.error) && commitAttempt < 2) {
              await new Promise((r) => setTimeout(r, 200));
              continue;
            }
            break;
          }
          if (response.error || !response.data) throw new Error('Conflict: Payment state changed or could not be committed. Refresh and retry.');
          tenantRevisions.set(tenant, revision + 1);
        } else if (!store.persistSync()) {
          throw new Error('Payment storage failed; no changes were committed.');
        }
      }
      currentPostCommitTasks = null;
      for (const task of postCommitTasks) {
        try {
          await task();
        } catch (taskErr) {
          console.warn('Post-commit task execution error:', taskErr);
        }
      }
      return result;
    } catch (error) {
      currentPostCommitTasks = null;
      Object.assign(store, before);
      throw error;
    } finally {
      store.persist = originalPersist;
    }
  });

  if (!readOnly) {
    transactionQueue = run.catch(() => {});
  }
  return run;
}
