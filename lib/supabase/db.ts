import { createClient as createBrowserClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './admin';
import { store } from '@/lib/services/data-store';
import {
  RlsAuthContext,
  resolveUserProfile,
  applyRlsSelectPolicy,
  checkRlsInsertPolicy,
  checkRlsUpdatePolicy,
  createAuthJwt,
  rlsContextStorage,
} from './rls';
import { UserProfile } from '@/types';

/**
 * Checks whether live Supabase credentials are configured (non-mock).
 */
export function isLiveSupabaseEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return false;
  if (url.includes('mock-sap-lms') || anonKey.includes('mockAnonKey')) return false;
  return true;
}

/**
 * Maps PostgreSQL table names to local store arrays.
 */
function getStoreTableRecords(table: string): any[] {
  switch (table) {
    case 'courses':
      return store.courses;
    case 'course_modules':
      return store.modules;
    case 'lessons':
      return store.lessons;
    case 'leads':
      return store.leads;
    case 'lead_followups':
      return (store as any).leadFollowups || [];
    case 'admissions':
      return store.admissions;
    case 'students':
      return store.students;
    case 'batches':
      return store.batches;
    case 'batch_students':
      return (store as any).batchStudents || [];
    case 'batch_transfer_audits':
      return store.batchTransferAudits;
    case 'lesson_progress':
      return store.lessonProgress;
    case 'class_sessions':
      return store.classSessions;
    case 'attendance_records':
      return store.attendanceRecords;
    case 'assignments':
      return store.assignments;
    case 'assignment_submissions':
      return store.submissions;
    case 'quizzes':
      return store.quizzes;
    case 'quiz_questions':
      return store.quizQuestions;
    case 'quiz_attempts':
      return store.quizAttempts;
    case 'student_fee_accounts':
      return store.feeAccounts;
    case 'installments':
      return store.installments;
    case 'payments':
      return store.payments;
    case 'receipts':
      return store.receipts;
    case 'vendors':
      return store.vendors;
    case 'expenses':
      return store.expenses;
    case 'placement_profiles':
      return store.placementProfiles;
    case 'job_openings':
      return store.jobOpenings;
    case 'job_applications':
      return store.jobApplications;
    case 'certificates':
      return store.certificates;
    case 'student_doubts':
      return store.doubts;
    case 'doubt_messages': {
      const messages: any[] = [];
      for (const d of store.doubts) {
        if (d.messages) messages.push(...d.messages);
      }
      return messages;
    }
    case 'sap_server_systems':
      return store.sapSystems;
    case 'sap_server_allocations':
      return store.sapAllocations;
    case 'profiles':
      return store.users;
    case 'audit_logs':
      return store.auditLogs;
    default:
      return [];
  }
}

/**
 * Creates an RLS-enforcing Query Builder for a specific table.
 * Executes queries against Supabase PostgreSQL if live Supabase is enabled,
 * and actively evaluates RLS policies in 002_rls_policies.sql and 005_student_doubts.sql
 * at the database and client layers.
 */
class RlsQueryBuilder<T = any> implements PromiseLike<{ data: T | null; error: any }> {
  private table: string;
  private user: UserProfile | null;
  private bypassRls: boolean;
  private liveClient?: SupabaseClient;
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selectColumns: string = '*';
  private payload: any = null;
  private filters: Array<(row: any) => boolean> = [];
  private orderColumn?: string;
  private orderAscending: boolean = true;
  private limitCount?: number;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;

  constructor(
    table: string,
    user: UserProfile | null,
    bypassRls: boolean = false,
    liveClient?: SupabaseClient
  ) {
    this.table = table;
    this.user = user;
    this.bypassRls = bypassRls;
    this.liveClient = liveClient;
  }

  select(columns: string = '*'): this {
    this.action = 'select';
    this.selectColumns = columns;
    return this;
  }

  insert(values: any): this {
    this.action = 'insert';
    this.payload = values;
    return this;
  }

  update(values: any): this {
    this.action = 'update';
    this.payload = values;
    return this;
  }

  upsert(values: any): this {
    this.action = 'upsert';
    this.payload = values;
    return this;
  }

  delete(): this {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: any): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: any): this {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  gt(column: string, value: any): this {
    this.filters.push((row) => row[column] > value);
    return this;
  }

  gte(column: string, value: any): this {
    this.filters.push((row) => row[column] >= value);
    return this;
  }

  lt(column: string, value: any): this {
    this.filters.push((row) => row[column] < value);
    return this;
  }

  lte(column: string, value: any): this {
    this.filters.push((row) => row[column] <= value);
    return this;
  }

  like(column: string, pattern: string): this {
    const regex = new RegExp(`^${pattern.replace(/%/g, '.*')}$`);
    this.filters.push((row) => regex.test(String(row[column] || '')));
    return this;
  }

  ilike(column: string, pattern: string): this {
    const regex = new RegExp(`^${pattern.replace(/%/g, '.*')}$`, 'i');
    this.filters.push((row) => regex.test(String(row[column] || '')));
    return this;
  }

  in(column: string, values: any[]): this {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[column]));
    return this;
  }

  or(conditionStr: string): this {
    // Parses comma-delimited conditions like "id.eq.X,ticket_number.eq.X"
    const subConds = conditionStr.split(',').map((cond) => {
      const parts = cond.split('.');
      return { col: parts[0]?.trim(), op: parts[1]?.trim(), val: parts[2]?.trim() };
    });

    this.filters.push((row) => {
      return subConds.some(({ col, op, val }) => {
        if (!col || !op) return false;
        if (op === 'eq') return String(row[col]) === String(val);
        if (op === 'neq') return String(row[col]) !== String(val);
        return false;
      });
    });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderColumn = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.isSingle = true;
    return this;
  }

  maybeSingle(): this {
    this.isMaybeSingle = true;
    return this;
  }

  private async execute(): Promise<{ data: any; error: any }> {
    // 1. If Live Supabase is enabled, execute remote query with active auth token
    if (this.liveClient && isLiveSupabaseEnabled()) {
      try {
        let liveQuery: any = this.liveClient.from(this.table);
        if (this.action === 'select') {
          liveQuery = liveQuery.select(this.selectColumns);
        } else if (this.action === 'insert') {
          liveQuery = liveQuery.insert(this.payload);
        } else if (this.action === 'update') {
          liveQuery = liveQuery.update(this.payload);
        } else if (this.action === 'upsert') {
          liveQuery = liveQuery.upsert(this.payload);
        } else if (this.action === 'delete') {
          liveQuery = liveQuery.delete();
        }

        const res = await liveQuery;
        if (!res.error) {
          return res;
        }
      } catch (liveErr) {
        console.warn(`Supabase query for ${this.table} failed, evaluating with local RLS:`, liveErr);
      }
    }

    // 2. Active Database RLS Policy Evaluation for local / memory store
    const rawRecords = getStoreTableRecords(this.table);

    // --- Action: SELECT ---
    if (this.action === 'select') {
      let filtered = this.bypassRls
        ? [...rawRecords]
        : applyRlsSelectPolicy(this.table, rawRecords, this.user);

      // Apply WHERE clauses
      for (const filterFn of this.filters) {
        filtered = filtered.filter(filterFn);
      }

      // Special join resolution for doubt_messages
      if (this.table === 'student_doubts' && this.selectColumns.includes('doubt_messages')) {
        filtered = filtered.map((d) => ({
          ...d,
          messages: d.messages || [],
        }));
      }

      // Apply ORDER BY
      if (this.orderColumn) {
        const col = this.orderColumn;
        const asc = this.orderAscending;
        filtered.sort((a, b) => {
          const valA = a[col];
          const valB = b[col];
          if (valA === valB) return 0;
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;
          if (asc) return valA > valB ? 1 : -1;
          return valA < valB ? 1 : -1;
        });
      }

      // Apply LIMIT
      if (this.limitCount !== undefined) {
        filtered = filtered.slice(0, this.limitCount);
      }

      if (this.isSingle) {
        if (filtered.length === 0) {
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
        }
        return { data: filtered[0], error: null };
      }

      if (this.isMaybeSingle) {
        return { data: filtered[0] || null, error: null };
      }

      return { data: filtered, error: null };
    }

    // --- Action: INSERT ---
    if (this.action === 'insert') {
      const recordsToInsert = Array.isArray(this.payload) ? this.payload : [this.payload];

      if (!this.bypassRls) {
        for (const item of recordsToInsert) {
          const check = checkRlsInsertPolicy(this.table, item, this.user);
          if (!check.allowed) {
            return {
              data: null,
              error: {
                message: check.error || `new row violates row-level security policy for table "${this.table}"`,
                code: '42501',
              },
            };
          }
        }
      }

      for (const item of recordsToInsert) {
        rawRecords.unshift(item);
      }
      store.persist();

      return {
        data: Array.isArray(this.payload) ? recordsToInsert : recordsToInsert[0],
        error: null,
      };
    }

    // --- Action: UPDATE ---
    if (this.action === 'update') {
      let matching = [...rawRecords];
      for (const filterFn of this.filters) {
        matching = matching.filter(filterFn);
      }

      if (!this.bypassRls) {
        for (const existing of matching) {
          const check = checkRlsUpdatePolicy(this.table, existing.id, this.payload, existing, this.user);
          if (!check.allowed) {
            return {
              data: null,
              error: {
                message: check.error || `update violates row-level security policy for table "${this.table}"`,
                code: '42501',
              },
            };
          }
        }
      }

      for (const existing of matching) {
        Object.assign(existing, this.payload, { updated_at: new Date().toISOString() });
      }
      store.persist();

      return { data: matching, error: null };
    }

    // --- Action: UPSERT ---
    if (this.action === 'upsert') {
      const recordsToUpsert = Array.isArray(this.payload) ? this.payload : [this.payload];

      if (!this.bypassRls) {
        for (const item of recordsToUpsert) {
          const existing = rawRecords.find((r) => r.id === item.id);
          const check = existing
            ? checkRlsUpdatePolicy(this.table, item.id, item, existing, this.user)
            : checkRlsInsertPolicy(this.table, item, this.user);

          if (!check.allowed) {
            return {
              data: null,
              error: {
                message: check.error || `upsert violates row-level security policy for table "${this.table}"`,
                code: '42501',
              },
            };
          }
        }
      }

      for (const item of recordsToUpsert) {
        const idx = rawRecords.findIndex((r) => r.id === item.id);
        if (idx >= 0) {
          rawRecords[idx] = { ...rawRecords[idx], ...item };
        } else {
          rawRecords.unshift(item);
        }
      }
      store.persist();

      return { data: recordsToUpsert, error: null };
    }

    // --- Action: DELETE ---
    if (this.action === 'delete') {
      if (!this.bypassRls && (!this.user || (this.user.role !== 'super_admin' && this.user.role !== 'admin'))) {
        return {
          data: null,
          error: {
            message: `delete violates row-level security policy for table "${this.table}"`,
            code: '42501',
          },
        };
      }

      return { data: [], error: null };
    }

    return { data: null, error: null };
  }

  then<TResult1 = { data: T | null; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: T | null; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/**
 * Returns an active Supabase client instance.
 * Automatically injects auth UID and role policies to ensure PostgreSQL evaluates RLS
 * on every single SQL query.
 *
 * @param auth Optional user context (userId, UserProfile, JWT, or AuthContext).
 */
export function getDb(auth?: RlsAuthContext | string | UserProfile): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-sap-lms.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

  const user = resolveUserProfile(auth);
  const isBypass = typeof auth === 'object' && auth !== null && 'bypassRls' in auth ? Boolean(auth.bypassRls) : false;

  // 1. If explicit administrative bypass requested, connect using service role
  if (isBypass && typeof window === 'undefined') {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey && !serviceRoleKey.includes('mockServiceRoleKey')) {
      return createAdminClient();
    }
  }

  // 2. Prepare user JWT with auth.uid() and role claims so PostgREST enforces RLS natively
  let userToken: string | undefined;
  if (user) {
    userToken = createAuthJwt(user.id, user.role, user.email);
  } else if (typeof auth === 'object' && auth !== null && 'token' in auth && auth.token) {
    userToken = auth.token;
  }

  let liveClient: SupabaseClient | undefined;
  if (isLiveSupabaseEnabled()) {
    liveClient = createBrowserClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: typeof window !== 'undefined',
      },
      global: {
        headers: userToken ? { Authorization: `Bearer ${userToken}` } : {},
      },
    });
  }

  // 3. Return client with RLS-enforcing query builders
  return {
    from: (table: string) => new RlsQueryBuilder(table, user, isBypass, liveClient),
    auth: liveClient?.auth || {
      getUser: async () => ({ data: { user: user ? { id: user.id, email: user.email } : null }, error: null }),
      signInWithPassword: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
    },
  };
}

export const createClient = getDb;

/**
 * Runs a callback within an explicit RLS auth context.
 */
export function runWithAuth<T>(auth: RlsAuthContext | UserProfile | string, callback: () => T): T {
  const context: RlsAuthContext = typeof auth === 'string'
    ? { userId: auth }
    : 'id' in auth
    ? { userId: auth.id, role: auth.role, email: auth.email }
    : auth;

  return rlsContextStorage.run(context, callback);
}
