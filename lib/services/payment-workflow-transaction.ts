import { store } from './data-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled, isProductionEnvironment } from '@/lib/supabase/db';
import { tenantId } from '@/lib/auth/tenant';
import { UserProfile } from '@/types';
import { workflowKeys, workflowSnapshot, mergeWorkflowSnapshot } from './payment-workflow-state';

let transactionQueue: Promise<unknown> = Promise.resolve();

let currentPostCommitTasks: Array<() => Promise<void>> | null = null;

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
export function paymentTransaction<T>(actor: UserProfile, operation: () => Promise<T> | T, readOnly = false, requireFresh = false): Promise<T> {
  const run = transactionQueue.then(async () => {
    const live = isLiveSupabaseEnabled();
    const tenant = tenantId(actor);
    const db = live ? createAdminClient() : null;
    let revision = 0;
    if (db) {
      try {
        const [state, roster] = await Promise.all([
          db.from('fee_workflow_state').select('revision, snapshot').eq('tenant_id', tenant).maybeSingle(),
          db.from('profiles').select('*').eq('tenant_id', tenant),
        ]);
        const { data, error } = state;
        if (error) {
          if (readOnly && !requireFresh) {
            console.warn('[paymentTransaction] Database query failed in readOnly mode:', error.message);
          } else {
            throw new Error(`Payment database unavailable: ${error.message}`);
          }
        }
        if (roster.error) {
          throw new Error('Payment database unavailable: Could not verify the current staff roster.');
        }
        if (data) {
          revision = data.revision;
          mergeWorkflowSnapshot(data.snapshot, tenant);

          // TASK-01: In live Supabase mode or production, PostgreSQL tables are the authoritative source.
          // Never allow a stale JSON snapshot in fee_workflow_state to restore records that were deleted from PostgreSQL.
          if (isLiveSupabaseEnabled() || isProductionEnvironment()) {
            const [admsRes, studsRes, paysRes, rcptsRes] = await Promise.all([
              db.from('admissions').select('id, course_id, status').eq('tenant_id', tenant),
              db.from('students').select('id, total_fee, paid_amount, outstanding_amount').eq('tenant_id', tenant),
              db.from('payments').select('id, external_payment_id, amount, receipt_number').eq('tenant_id', tenant),
              db.from('receipts').select('id, payment_id, receipt_number, amount').eq('tenant_id', tenant),
            ]);

            if (!admsRes.error && Array.isArray(admsRes.data)) {
              const liveAdmMap = new Map(admsRes.data.map((r: any) => [r.id, r]));
              store.admissions = store.admissions
                .filter((a) => tenantId(a) !== tenant || liveAdmMap.has(a.id))
                .map((a) => {
                  const row = liveAdmMap.get(a.id);
                  if (!row) return a;
                  return {
                    ...a,
                    course_id: row.course_id || a.course_id,
                    status: row.status || a.status,
                  };
                });
            }
            if (!studsRes.error && Array.isArray(studsRes.data)) {
              const liveStudMap = new Map(studsRes.data.map((r: any) => [r.id, r]));
              store.students = store.students
                .filter((s) => tenantId(s) !== tenant || liveStudMap.has(s.id))
                .map((s) => {
                  const row = liveStudMap.get(s.id);
                  if (!row) return s;
                  return {
                    ...s,
                    total_fee: typeof row.total_fee === 'number' ? row.total_fee : s.total_fee,
                    paid_amount: typeof row.paid_amount === 'number' ? row.paid_amount : s.paid_amount,
                    outstanding_amount: typeof row.outstanding_amount === 'number' ? row.outstanding_amount : s.outstanding_amount,
                  };
                });
            }
            if (!paysRes.error && Array.isArray(paysRes.data)) {
              const livePayMap = new Map<string, any>();
              for (const r of paysRes.data as any[]) {
                livePayMap.set(r.id, r);
                if (r.external_payment_id) livePayMap.set(r.external_payment_id, r);
              }
              store.payments = store.payments
                .filter((p) => tenantId(p) !== tenant || livePayMap.has(p.id))
                .map((p) => {
                  const row = livePayMap.get(p.id);
                  if (!row) return p;
                  return {
                    ...p,
                    amount: typeof row.amount === 'number' ? row.amount : p.amount,
                    receipt_number: row.receipt_number || p.receipt_number,
                  };
                });
            }
            if (!rcptsRes.error && Array.isArray(rcptsRes.data)) {
              const liveRcptMap = new Map(rcptsRes.data.map((r: any) => [r.id, r]));
              store.receipts = store.receipts
                .filter((r) => tenantId(r) !== tenant || liveRcptMap.has(r.id))
                .map((r) => {
                  const row = liveRcptMap.get(r.id);
                  if (!row) return r;
                  return {
                    ...r,
                    payment_amount: typeof row.amount === 'number' ? row.amount : r.payment_amount,
                    receipt_number: row.receipt_number || r.receipt_number,
                  };
                });
            }
            const validStudentIds = new Set(store.students.filter((s) => tenantId(s) === tenant).map((s) => s.id));
            store.feeAccounts = store.feeAccounts.filter((fa) => tenantId(fa) !== tenant || validStudentIds.has(fa.student_id));
            store.studentFees = store.studentFees.filter((sf) => tenantId(sf) !== tenant || validStudentIds.has(sf.student_id));
            store.studentPayments = store.studentPayments.filter((sp) => tenantId(sp) !== tenant || validStudentIds.has(sp.student_id));
          }
        } else {
        // Explicit bootstrap, performed from trusted database rows, never a browser snapshot.
        const tables = { users: 'profiles', students: 'students', admissions: 'admissions', feeAccounts: 'student_fee_accounts', installments: 'installments', payments: 'payments', receipts: 'receipts', onboardingCases: 'onboarding_cases' } as const;
        const rows = await Promise.all(Object.entries(tables).map(async ([key, table]) => {
          const response = key === 'users' ? roster : await db.from(table).select('*').eq('tenant_id', tenant);
          if (response.error) throw new Error(`Payment bootstrap failed: ${response.error.message}`);
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
        store.reconcileAdmissionsAndStudents();
        store.reconcileDualLedgers();
      }
      // Assignment and notification recipients must use current membership, not
      // roles or active flags from an older financial snapshot.
      const profileIds = new Set((roster.data || []).map((u) => u.id));
      store.users = [
        ...store.users.filter((u) => tenantId(u) !== tenant || (u.role === 'student' && !profileIds.has(u.id))),
        ...(roster.data || []) as UserProfile[],
      ];
      } catch (dbErr: any) {
        if (readOnly && !requireFresh && !dbErr?.message?.includes('current staff roster')) {
          console.warn('[paymentTransaction] Database network error in readOnly mode, using in-memory store:', dbErr?.message);
        } else {
          throw dbErr;
        }
      }
    }
    const userIndex = store.users.findIndex((u) => u.id === actor.id);
    if (userIndex < 0) store.users.push(actor); else store.users[userIndex] = actor;
    const before = Object.fromEntries(workflowKeys.map((key) => [key, structuredClone(store[key])]));
    const originalPersist = store.persist;
    const previousPostCommitTasks = currentPostCommitTasks;
    let postCommitTasks: Array<() => Promise<void>> | null = null;
    if (!readOnly) {
      store.persist = () => {}; // no intermediate durable snapshots
      postCommitTasks = [];
      currentPostCommitTasks = postCommitTasks;
    }
    try {
      const result = await operation();
      if (!readOnly) {
        store.reconcileAdmissionsAndStudents();
        store.reconcileDualLedgers();
        const snapshot = workflowSnapshot(tenant);
        if (db) {
          const response = await db.rpc('commit_fee_workflow', { p_tenant: tenant, p_revision: revision, p_snapshot: snapshot });
          if (response.error) {
            const pgCode = (response.error as { code?: string }).code;
            const pgMsg = response.error.message || '';
            console.error('[paymentTransaction] commit_fee_workflow failed:', {
              code: pgCode,
              message: pgMsg,
              tenant,
              expectedRevision: revision,
            });
            if (pgCode === '40001' || pgMsg.includes('Conflict: workflow revision changed')) {
              throw new Error('Conflict: This payment was updated by another user. Review the latest payment details before continuing.');
            }
            if (pgCode === '22023' || pgMsg.includes('Receipt issuer identity')) {
              throw new Error('Database failure: Receipt issuer identity is missing or invalid. Please sign in again and retry.');
            }
            if (pgCode === '42501' || pgMsg.includes('Unauthorized or inactive receipt issuer')) {
              throw new Error('Forbidden: Receipt issuer is unauthorized, inactive, or belongs to a different tenant.');
            }
            if (pgCode === '23505') {
              if (pgMsg.includes('transaction_reference')) {
                throw new Error('Conflict: This transaction reference is already associated with another payment.');
              }
              if (pgMsg.includes('receipt_number') || pgMsg.includes('payment_id')) {
                throw new Error('Conflict: This payment has already been verified. View the existing receipt.');
              }
              throw new Error('Conflict: Duplicate financial record prevented commit. Refresh and check payment status.');
            }
            throw new Error('Database failure: Payment verification could not be completed. Please try again after checking the transaction status.');
          }
          if (!response.data) {
            throw new Error('Conflict: This payment was updated by another user. Review the latest payment details before continuing.');
          }
        } else if (!store.persistSync()) {
          throw new Error('Payment storage failed; no changes were committed.');
        }
        currentPostCommitTasks = previousPostCommitTasks;
        if (postCommitTasks) {
          for (const task of postCommitTasks) {
            try {
              await task();
            } catch (taskErr) {
              console.warn('Post-commit task execution error:', taskErr);
            }
          }
        }
      }
      return result;
    } catch (error) {
      if (!readOnly) {
        currentPostCommitTasks = previousPostCommitTasks;
        Object.assign(store, before);
      }
      throw error;
    } finally {
      if (!readOnly) {
        store.persist = originalPersist;
      }
    }
  });
  if (!readOnly) {
    transactionQueue = run.catch(() => {});
  }
  return run;
}
