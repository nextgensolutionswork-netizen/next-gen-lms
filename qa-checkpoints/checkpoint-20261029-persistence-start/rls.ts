import { UserProfile, UserRole } from '@/types';
import { store } from '@/lib/services/data-store';

export interface RlsAuthContext {
  userId?: string;
  role?: UserRole | string;
  token?: string;
  bypassRls?: boolean;
  email?: string;
}

export interface IAsyncLocalStorage<T> {
  run<R>(store: T, callback: () => R): R;
  getStore(): T | undefined;
}

class ContextStorageFallback<T> implements IAsyncLocalStorage<T> {
  private currentStore: T | undefined = undefined;

  run<R>(store: T, callback: () => R): R {
    const prev = this.currentStore;
    this.currentStore = store;
    try {
      return callback();
    } finally {
      this.currentStore = prev;
    }
  }

  getStore(): T | undefined {
    return this.currentStore;
  }
}

declare const __non_webpack_require__: any;

function initStorage(): IAsyncLocalStorage<RlsAuthContext> {
  if (typeof window === 'undefined') {
    try {
      const req = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : eval('require');
      const asyncHooks = req('async_hooks');
      if (asyncHooks && asyncHooks.AsyncLocalStorage) {
        return new asyncHooks.AsyncLocalStorage();
      }
    } catch {
      // Fallback in case async_hooks is unavailable
    }
  }
  return new ContextStorageFallback<RlsAuthContext>();
}

/**
 * AsyncLocalStorage context for propagating authenticated user identity
 * across asynchronous service boundaries without manual argument drilling.
 */
export const rlsContextStorage: IAsyncLocalStorage<RlsAuthContext> = initStorage();

function toBase64Url(str: string): string {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
  } catch {}
  if (typeof btoa !== 'undefined') {
    try {
      return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } catch {}
  }
  return '';
}

function fromBase64Url(str: string): string {
  try {
    if (typeof Buffer !== 'undefined') {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
  } catch {}
  if (typeof atob !== 'undefined') {
    try {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      return decodeURIComponent(escape(atob(base64)));
    } catch {}
  }
  return '';
}

/**
 * Creates a validly-formatted test/mock JWT carrying auth.uid() and role claims.
 * Used for live Supabase PostgREST header injection so Postgres sets:
 * request.jwt.claim.sub = auth.uid()
 * request.jwt.claim.role = authenticated
 * profiles.role = get_current_user_role()
 */
export function createAuthJwt(userId: string, role: string, email?: string): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: email || `${userId}@next-generpsolutions.com`,
      app_metadata: { role, provider: 'email' },
      user_metadata: { role },
      exp: Math.floor(Date.now() / 1000) + 86400,
    })
  );
  return `${header}.${payload}.rlsTokenSignature`;
}

/**
 * Resolves full UserProfile from diverse auth inputs (token, userId, UserProfile, RlsAuthContext).
 */
export function resolveUserProfile(
  auth?: RlsAuthContext | string | UserProfile | null
): UserProfile | null {
  if (!auth) {
    const ambient = rlsContextStorage.getStore();
    if (ambient) return resolveUserProfile(ambient);
    return null;
  }

  if (typeof auth === 'string') {
    // If it's a JWT with payload dots
    if (auth.includes('.')) {
      try {
        const parts = auth.split('.');
        const payload = JSON.parse(fromBase64Url(parts[1]));
        const sub = payload.sub || payload.userId;
        const matched = store.users.find((u) => u.id === sub || u.email === payload.email);
        if (matched) return matched;
        return {
          id: sub || 'unknown',
          email: payload.email || '',
          full_name: payload.name || 'Authenticated User',
          role: payload.role || payload.app_metadata?.role || payload.user_metadata?.role || 'student',
          is_active: true,
          created_at: '',
          updated_at: '',
        };
      } catch {}
    }

    // It's a userId or email
    const user = store.users.find((u) => u.id === auth || u.email.toLowerCase() === auth.toLowerCase());
    if (user) {
      return {
        ...user,
        is_active:
          user.is_active !== undefined
            ? Boolean(user.is_active)
            : (user as any).status === 'Active' || (user as any).status === undefined,
      };
    }
    return {
      id: auth,
      email: `${auth}@next-gen.com`,
      full_name: auth,
      role: 'student',
      is_active: true,
      created_at: '',
      updated_at: '',
    };
  }

  // Already a full UserProfile
  if ('role' in auth && 'email' in auth && 'full_name' in auth) {
    const profile = auth as UserProfile;
    return {
      ...profile,
      is_active:
        profile.is_active !== undefined
          ? Boolean(profile.is_active)
          : (profile as any).status === 'Active' || (profile as any).status === undefined,
    };
  }

  // RlsAuthContext object
  if (auth.userId) {
    const user = store.users.find((u) => u.id === auth.userId);
    if (user) {
      return {
        ...user,
        is_active:
          user.is_active !== undefined
            ? Boolean(user.is_active)
            : (user as any).status === 'Active' || (user as any).status === undefined,
      };
    }
    return {
      id: auth.userId,
      email: auth.email || `${auth.userId}@next-gen.com`,
      full_name: auth.userId,
      role: (auth.role as UserRole) || 'student',
      is_active: true,
      created_at: '',
      updated_at: '',
    };
  }

  return null;
}

/**
 * Validates and filters rows for a SELECT query according to:
 * - 002_rls_policies.sql
 * - 005_student_doubts.sql
 */
export function applyRlsSelectPolicy(
  table: string,
  records: any[],
  user: UserProfile | null
): any[] {
  const isUserActive = user
    ? user.is_active !== undefined
      ? Boolean(user.is_active)
      : (user as any).status === 'Active' || (user as any).status === undefined
    : false;

  // If no user or user is inactive, default-deny all tables except public certificates
  if (!user || !isUserActive) {
    if (table === 'certificates') {
      return records.filter((c) => c.is_valid);
    }
    return [];
  }

  // Super Admin bypasses all read restrictions across all tables
  if (user.role === 'super_admin') {
    return [...records];
  }

  switch (table) {
    // 1. Courses
    case 'courses': {
      if (user.role === 'admin' || user.role === 'counsellor') {
        return [...records];
      }
      if (user.role === 'trainer') {
        const assigned = user.assigned_course_ids || [];
        return records.filter((c) => assigned.includes(c.id));
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        if (!student) return [];
        return records.filter((c) => c.status === 'Published' && c.id === student.course_id);
      }
      // Accountants and other roles: default-deny
      return [];
    }

    case 'course_modules':
    case 'lessons': {
      if (user.role === 'admin') return [...records];
      if (user.role === 'trainer') {
        const assigned = user.assigned_course_ids || [];
        return records.filter((item) => assigned.includes(item.course_id));
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        if (!student) return [];
        return records.filter((item) => {
          const isPublished = table === 'lessons' ? item.is_published : true;
          return isPublished && item.course_id === student.course_id;
        });
      }
      return [];
    }

    // 2. Student Doubts (005_student_doubts.sql)
    case 'student_doubts': {
      // Staff see all doubts
      if (['admin', 'trainer', 'support'].includes(user.role)) {
        return [...records];
      }
      // Student sees ONLY own doubts
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        return records.filter((d) => d.student_id === studentId);
      }
      return [];
    }

    case 'doubt_messages': {
      if (['admin', 'trainer', 'support'].includes(user.role)) {
        return [...records];
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        const myDoubtIds = new Set(
          store.doubts.filter((d) => d.student_id === studentId).map((d) => d.id)
        );
        return records.filter((m) => myDoubtIds.has(m.doubt_id));
      }
      return [];
    }

    // 3. Financials (student_fee_accounts, payments, receipts, installments)
    case 'student_fee_accounts':
    case 'payments':
    case 'receipts':
    case 'installments': {
      if (['admin', 'accountant'].includes(user.role)) {
        return [...records];
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        return records.filter((f) => f.student_id === studentId);
      }
      // Trainers, counsellors, placement coordinators: zero financial access
      return [];
    }

    // 4. Expenses & Vendors
    case 'expenses':
    case 'vendors': {
      if (['admin', 'accountant'].includes(user.role)) {
        return [...records];
      }
      return [];
    }

    // 5. CRM Leads & Admissions
    case 'leads':
    case 'lead_followups':
    case 'admissions': {
      if (['admin', 'counsellor'].includes(user.role)) {
        return [...records];
      }
      return [];
    }

    // 6. Placement Profiles
    case 'placement_profiles': {
      if (['admin', 'placement_coordinator'].includes(user.role)) {
        return [...records];
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        return records.filter((p) => p.student_id === studentId);
      }
      return [];
    }

    case 'job_openings': {
      // Students and staff can see job openings
      return [...records];
    }

    case 'job_applications': {
      if (['admin', 'placement_coordinator'].includes(user.role)) {
        return [...records];
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        return records.filter((a) => a.student_id === studentId);
      }
      return [];
    }

    // 7. Audit Logs
    case 'audit_logs': {
      // In 002_rls_policies.sql: Only Super Admin can view audit logs (super_admin handled at line 131)
      return [];
    }

    // 8. Certificates
    case 'certificates': {
      if (['admin', 'trainer'].includes(user.role)) {
        return [...records];
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        return records.filter((c) => c.is_valid || c.student_id === studentId);
      }
      return records.filter((c) => c.is_valid);
    }

    // 9. Students
    case 'students': {
      if (
        ['admin', 'counsellor', 'trainer', 'placement_coordinator', 'accountant', 'support', 'onboarding_team'].includes(
          user.role
        )
      ) {
        return [...records];
      }
      if (user.role === 'student') {
        return records.filter((s) => s.user_id === user.id || s.id === user.id);
      }
      return [];
    }

    // 10. SAP Server Allocations
    case 'sap_server_allocations': {
      if (['admin', 'trainer'].includes(user.role)) {
        return [...records];
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        return records.filter((a) => a.student_id === studentId);
      }
      return [];
    }

    // 11. Profiles
    case 'profiles': {
      if (['admin', 'counsellor', 'trainer', 'placement_coordinator', 'accountant', 'support', 'onboarding_team'].includes(user.role)) {
        return records.filter((p) => p.role !== 'student' || p.id === user.id);
      }
      if (user.role === 'student') {
        return records.filter((p) => p.id === user.id);
      }
      return [];
    }

    // 12. Onboarding Cases (Assignment-scoped RLS)
    case 'onboarding_cases': {
      if (user.role === 'admin') {
        return [...records];
      }
      if (user.role === 'onboarding_team') {
        return records.filter((c) => c.assigned_staff_id === user.id);
      }
      return [];
    }

    // 13. Onboarding Audit Logs
    case 'onboarding_audit_logs': {
      if (user.role === 'admin') {
        return [...records];
      }
      if (user.role === 'onboarding_team') {
        const myCaseIds = store.onboardingCases
          .filter((c) => c.assigned_staff_id === user.id)
          .map((c) => c.id);
        return records.filter((l) => myCaseIds.includes(l.case_id));
      }
      return [];
    }

    default:
      return [...records];
  }
}

/**
 * Validates an INSERT operation against RLS policies.
 */
export function checkRlsInsertPolicy(
  table: string,
  record: any,
  user: UserProfile | null
): { allowed: boolean; error?: string } {
  const isUserActive = user
    ? user.is_active !== undefined
      ? Boolean(user.is_active)
      : (user as any).status === 'Active' || (user as any).status === undefined
    : false;

  if (!user || !isUserActive) {
    return {
      allowed: false,
      error: `new row violates row-level security policy for table "${table}" (unauthenticated default-deny)`,
    };
  }

  if (user.role === 'super_admin') {
    return { allowed: true };
  }

  switch (table) {
    case 'student_doubts': {
      if (['admin', 'support'].includes(user.role)) {
        return { allowed: true };
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        if (record.student_id && record.student_id !== studentId) {
          return {
            allowed: false,
            error: 'new row violates row-level security policy for table "student_doubts" (student isolation violation)',
          };
        }
        return { allowed: true };
      }
      return {
        allowed: false,
        error: 'new row violates row-level security policy for table "student_doubts"',
      };
    }

    case 'doubt_messages': {
      if (['admin', 'trainer', 'support'].includes(user.role)) {
        return { allowed: true };
      }
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        const parentDoubt = store.doubts.find((d) => d.id === record.doubt_id);
        if (parentDoubt && parentDoubt.student_id !== studentId) {
          return {
            allowed: false,
            error: 'new row violates row-level security policy for table "doubt_messages"',
          };
        }
        return { allowed: true };
      }
      return {
        allowed: false,
        error: 'new row violates row-level security policy for table "doubt_messages"',
      };
    }

    case 'courses':
    case 'course_modules':
    case 'lessons': {
      if (user.role === 'admin') return { allowed: true };
      return {
        allowed: false,
        error: `new row violates row-level security policy for table "${table}" (super_admin or admin required)`,
      };
    }

    case 'payments':
    case 'receipts':
    case 'expenses':
    case 'vendors': {
      if (['admin', 'accountant'].includes(user.role)) return { allowed: true };
      return {
        allowed: false,
        error: `new row violates row-level security policy for table "${table}" (accountant required)`,
      };
    }

    case 'leads':
    case 'lead_followups':
    case 'admissions': {
      if (['admin', 'counsellor'].includes(user.role)) return { allowed: true };
      return {
        allowed: false,
        error: `new row violates row-level security policy for table "${table}" (counsellor required)`,
      };
    }

    case 'onboarding_cases': {
      if (user.role === 'admin') return { allowed: true };
      return {
        allowed: false,
        error: 'new row violates row-level security policy for table "onboarding_cases" (admin required)',
      };
    }

    case 'onboarding_audit_logs': {
      if (['admin', 'onboarding_team'].includes(user.role)) return { allowed: true };
      return {
        allowed: false,
        error: 'new row violates row-level security policy for table "onboarding_audit_logs"',
      };
    }

    case 'audit_logs': {
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

/**
 * Validates an UPDATE operation against RLS policies.
 */
export function checkRlsUpdatePolicy(
  table: string,
  recordId: string,
  updates: any,
  existingRecord: any,
  user: UserProfile | null
): { allowed: boolean; error?: string } {
  const isUserActive = user
    ? user.is_active !== undefined
      ? Boolean(user.is_active)
      : (user as any).status === 'Active' || (user as any).status === undefined
    : false;

  if (!user || !isUserActive) {
    return {
      allowed: false,
      error: `update violates row-level security policy for table "${table}" (unauthenticated default-deny)`,
    };
  }

  if (user.role === 'super_admin') {
    return { allowed: true };
  }

  switch (table) {
    case 'student_doubts': {
      if (['admin', 'trainer', 'support'].includes(user.role)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        error: 'update violates row-level security policy for table "student_doubts" (staff required)',
      };
    }

    case 'courses': {
      if (user.role === 'admin') return { allowed: true };
      return {
        allowed: false,
        error: 'update violates row-level security policy for table "courses"',
      };
    }

    case 'placement_profiles': {
      if (['admin', 'placement_coordinator'].includes(user.role)) return { allowed: true };
      if (user.role === 'student') {
        const student = store.students.find((s) => s.user_id === user.id || s.id === user.id);
        const studentId = student?.id || user.id;
        if (existingRecord?.student_id === studentId) {
          return { allowed: true };
        }
      }
      return {
        allowed: false,
        error: 'update violates row-level security policy for table "placement_profiles"',
      };
    }

    case 'onboarding_cases': {
      if (user.role === 'admin') return { allowed: true };
      if (user.role === 'onboarding_team') {
        if (existingRecord?.assigned_staff_id === user.id) {
          return { allowed: true };
        }
        return {
          allowed: false,
          error: 'update violates row-level security policy for table "onboarding_cases" (assignment scope violation)',
        };
      }
      return {
        allowed: false,
        error: 'update violates row-level security policy for table "onboarding_cases"',
      };
    }

    default:
      return { allowed: true };
  }
}
