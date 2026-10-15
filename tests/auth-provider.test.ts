import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAvatarUrl,
  setAuthCookie,
  clearAuthCookie,
  getStoredUser,
  validateLoginPreflight,
} from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { ROLE_PERMISSIONS, hasPermission, getSafeRedirectUrl, DEFAULT_ROLE_ROUTES } from '@/lib/auth/rbac';
import { UserProfile, UserRole, Permission } from '@/types';
import { getDb } from '@/lib/supabase/db';

describe('15. Global Auth Context (useAuth & AuthProvider) Tests', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
    clearAuthCookie();
  });

  // =========================================================================
  // 1. AVATAR GENERATION TESTS
  // =========================================================================
  describe('Avatar Generation', () => {
    it('returns custom avatar_url when present on user profile', () => {
      const user: UserProfile = {
        id: 'usr-avatar-01',
        email: 'user@next-gen.com',
        full_name: 'Custom Avatar User',
        role: 'trainer',
        avatar_url: 'https://images.unsplash.com/photo-custom-avatar.jpg',
        is_active: true,
        created_at: '',
        updated_at: '',
      };

      expect(getAvatarUrl(user)).toBe('https://images.unsplash.com/photo-custom-avatar.jpg');
    });

    it('generates deterministic UI avatar URL with user full name when avatar_url is missing', () => {
      const user: UserProfile = {
        id: 'usr-no-avatar',
        email: 'suresh@next-gen.com',
        full_name: 'Suresh Kumar',
        role: 'accountant',
        is_active: true,
        created_at: '',
        updated_at: '',
      };

      const avatar = getAvatarUrl(user);
      expect(avatar).toContain('https://ui-avatars.com/api/?name=Suresh%20Kumar');
      expect(avatar).toContain('background=0A6ED1');
    });

    it('handles null user gracefully with fallback name', () => {
      const avatar = getAvatarUrl(null);
      expect(avatar).toContain('User');
    });
  });

  // =========================================================================
  // 2. COOKIE AND STORAGE PERSISTENCE (NON-SUPER-ADMIN DEFAULTING)
  // =========================================================================
  describe('Cookie & Storage Persistence & Role Resolution', () => {
    it('sets and retrieves stored accountant user (does NOT default back to super_admin)', () => {
      const accountantUser = store.users.find((u) => u.role === 'accountant')!;
      expect(accountantUser).toBeDefined();

      setAuthCookie(accountantUser);
      const stored = getStoredUser();

      expect(stored).toBeDefined();
      expect(stored?.id).toBe(accountantUser.id);
      expect(stored?.role).toBe('accountant');
      expect(stored?.email).toBe(accountantUser.email);
      expect(stored?.full_name).toBe(accountantUser.full_name);
    });

    it('sets and retrieves stored trainer user immediately without reverting to super_admin', () => {
      const trainerUser = store.users.find((u) => u.role === 'trainer')!;
      expect(trainerUser).toBeDefined();

      setAuthCookie(trainerUser);
      const stored = getStoredUser();

      expect(stored).toBeDefined();
      expect(stored?.id).toBe(trainerUser.id);
      expect(stored?.role).toBe('trainer');
      expect(stored?.full_name).toBe(trainerUser.full_name);
    });

    it('clears stored user on logout', () => {
      const trainerUser = store.users.find((u) => u.role === 'trainer')!;
      setAuthCookie(trainerUser);
      expect(getStoredUser()).toBeDefined();

      clearAuthCookie();
      expect(getStoredUser()).toBeNull();
    });
  });

  // =========================================================================
  // 3. GLOBAL PERMISSION MATRIX EVALUATION
  // =========================================================================
  describe('Global Permission Matrix & RBAC Rules', () => {
    it('populates full permissions for super_admin across all ERP modules', () => {
      const superAdminUser = store.users.find((u) => u.role === 'super_admin')!;
      expect(superAdminUser).toBeDefined();

      expect(hasPermission(superAdminUser, 'all:manage')).toBe(true);
      expect(hasPermission(superAdminUser, 'accounts:write')).toBe(true);
      expect(hasPermission(superAdminUser, 'courses:publish')).toBe(true);
      expect(hasPermission(superAdminUser, 'settings:manage')).toBe(true);
      expect(hasPermission(superAdminUser, 'audit:read')).toBe(true);
    });

    it('populates strictly financial permissions for accountant, denying academic & administrative operations', () => {
      const accountantUser = store.users.find((u) => u.role === 'accountant')!;
      expect(accountantUser).toBeDefined();

      // Financial permissions ALLOWED
      expect(hasPermission(accountantUser, 'accounts:read')).toBe(true);
      expect(hasPermission(accountantUser, 'accounts:write')).toBe(true);
      expect(hasPermission(accountantUser, 'payments:create')).toBe(true);
      expect(hasPermission(accountantUser, 'receipts:create')).toBe(true);
      expect(hasPermission(accountantUser, 'expenses:write')).toBe(true);
      expect(hasPermission(accountantUser, 'vendors:write')).toBe(true);

      // Academic and admin permissions DENIED
      expect(hasPermission(accountantUser, 'courses:publish')).toBe(false);
      expect(hasPermission(accountantUser, 'assignments:grade')).toBe(false);
      expect(hasPermission(accountantUser, 'settings:manage')).toBe(false);
      expect(hasPermission(accountantUser, 'audit:read')).toBe(false);
      expect(hasPermission(accountantUser, 'all:manage')).toBe(false);
    });

    it('populates strictly academic & grading permissions for trainer, denying finance & system settings', () => {
      const trainerUser = store.users.find((u) => u.role === 'trainer')!;
      expect(trainerUser).toBeDefined();

      // Academic permissions ALLOWED
      expect(hasPermission(trainerUser, 'courses:read')).toBe(true);
      expect(hasPermission(trainerUser, 'assignments:grade')).toBe(true);
      expect(hasPermission(trainerUser, 'attendance:write')).toBe(true);
      expect(hasPermission(trainerUser, 'doubts:resolve')).toBe(true);

      // Financial & Admin permissions DENIED
      expect(hasPermission(trainerUser, 'accounts:write')).toBe(false);
      expect(hasPermission(trainerUser, 'payments:create')).toBe(false);
      expect(hasPermission(trainerUser, 'settings:manage')).toBe(false);
      expect(hasPermission(trainerUser, 'all:manage')).toBe(false);
    });

    it('populates strictly counsellor permissions for admissions & CRM, denying financial ledger access', () => {
      const counsellorUser = store.users.find((u) => u.role === 'counsellor')!;
      expect(counsellorUser).toBeDefined();

      expect(hasPermission(counsellorUser, 'crm:read')).toBe(true);
      expect(hasPermission(counsellorUser, 'crm:write')).toBe(true);
      expect(hasPermission(counsellorUser, 'admissions:read')).toBe(true);
      expect(hasPermission(counsellorUser, 'accounts:write')).toBe(false);
      expect(hasPermission(counsellorUser, 'all:manage')).toBe(false);
    });

    it('populates strictly student permissions for learning and doubts, denying administrative access', () => {
      const studentUser = store.users.find((u) => u.role === 'student')!;
      expect(studentUser).toBeDefined();

      expect(hasPermission(studentUser, 'courses:read')).toBe(true);
      expect(hasPermission(studentUser, 'attendance:read')).toBe(true);
      expect(hasPermission(studentUser, 'doubts:write')).toBe(true);
      expect(hasPermission(studentUser, 'accounts:write')).toBe(false);
      expect(hasPermission(studentUser, 'admissions:write')).toBe(false);
      expect(hasPermission(studentUser, 'assignments:grade')).toBe(false);
    });

    it('denies all permissions when user is inactive (default-deny)', () => {
      const inactiveUser: UserProfile = {
        id: 'usr-inactive-test',
        email: 'inactive@next-gen.com',
        full_name: 'Inactive User',
        role: 'super_admin', // even as super_admin, inactive user is denied
        is_active: false,
        created_at: '',
        updated_at: '',
      };

      expect(hasPermission(inactiveUser, 'all:manage')).toBe(false);
      expect(hasPermission(inactiveUser, 'accounts:read')).toBe(false);
      expect(hasPermission(inactiveUser, 'courses:read')).toBe(false);
    });
  });

  // =========================================================================
  // 4. SUPABASE AUTH SESSION INTEGRATION
  // =========================================================================
  describe('Supabase Auth Integration', () => {
    it('reads authenticated user identity from Supabase client db.auth.getUser()', async () => {
      const db = getDb('usr-accounts');
      const { data, error } = await db.auth.getUser();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.user?.id).toBe('usr-accounts');
      expect(data.user?.email).toBe('accounts@next-generpsolutions.com');
    });

    it('resolves trainer profile and assigned courses from Supabase client', async () => {
      const db = getDb('usr-trainer-fico');
      const { data, error } = await db.auth.getUser();

      expect(error).toBeNull();
      expect(data.user?.id).toBe('usr-trainer-fico');
      expect(data.user?.email).toBe('vikram.fico@next-generpsolutions.com');

      const matched = store.users.find((u) => u.id === data.user?.id);
      expect(matched?.role).toBe('trainer');
      expect(matched?.assigned_course_ids).toContain('crs-fico-01');
    });
  });

  // =========================================================================
  // 5. UNPROVISIONED STUDENT LOGIN DEFENSE & PRE-FLIGHT VALIDATION (GAP 3)
  // =========================================================================
  describe('Unprovisioned Student Login Defense & Pre-flight Validation', () => {
    it('blocks unprovisioned student (is_active === false) with exact pending onboarding verification error', () => {
      const unprovisionedStudent: UserProfile = {
        id: 'usr-unprovisioned-test',
        email: 'unprovisioned.student@test.com',
        full_name: 'Pending Onboarding Student',
        role: 'student',
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(() => validateLoginPreflight(unprovisionedStudent)).toThrowError(
        'Your LMS portal account is currently pending onboarding verification. Please contact your student coordinator.'
      );
    });

    it('allows active provisioned student (is_active === true) to pass pre-flight check', () => {
      const activeStudent: UserProfile = {
        id: 'usr-active-student',
        email: 'active.student@test.com',
        full_name: 'Active Student',
        role: 'student',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(() => validateLoginPreflight(activeStudent)).not.toThrow();
    });

    it('blocks deactivated non-student staff with generic deactivation error', () => {
      const deactivatedStaff: UserProfile = {
        id: 'usr-deactivated-staff',
        email: 'staff@test.com',
        full_name: 'Former Trainer',
        role: 'trainer',
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(() => validateLoginPreflight(deactivatedStaff)).toThrowError(
        'This account has been deactivated. Please contact the administrator.'
      );
    });

    it('throws error when user profile is null or not found', () => {
      expect(() => validateLoginPreflight(null)).toThrowError('User profile not found');
    });
  });

  // =========================================================================
  // 6. SAFE REDIRECT & DEEP LINK BOUNDARY HANDLING (MODULE 34)
  // =========================================================================
  describe('Safe Redirect & Deep Link Boundary Handling (getSafeRedirectUrl)', () => {
    it('returns default role route when redirectTo is missing, empty, or not a string', () => {
      expect(getSafeRedirectUrl('student', null)).toBe('/portal');
      expect(getSafeRedirectUrl('accountant', undefined)).toBe('/accounts/fees');
      expect(getSafeRedirectUrl('super_admin', '')).toBe('/dashboard');
      expect(getSafeRedirectUrl('trainer', '   ')).toBe('/academics/courses');
    });

    it('honors valid deep links for authorized roles and preserves query parameters & hashes', () => {
      expect(getSafeRedirectUrl('accountant', '/accounts/payments')).toBe('/accounts/payments');
      expect(getSafeRedirectUrl('trainer', '/academics/batches?filter=active')).toBe('/academics/batches?filter=active');
      expect(getSafeRedirectUrl('counsellor', '/crm/leads?status=hot#list')).toBe('/crm/leads?status=hot#list');
      expect(getSafeRedirectUrl('super_admin', '/settings')).toBe('/settings');
      expect(getSafeRedirectUrl('admin', '/audit-logs')).toBe('/audit-logs');
    });

    it('enforces student isolation boundary (blocks /dashboard, /settings, /accounts/expenses; allows /portal, /certificate/verify, /accounts/receipts)', () => {
      // Prohibited routes fall back to /portal
      expect(getSafeRedirectUrl('student', '/dashboard')).toBe('/portal');
      expect(getSafeRedirectUrl('student', '/settings')).toBe('/portal');
      expect(getSafeRedirectUrl('student', '/accounts/expenses')).toBe('/portal');
      expect(getSafeRedirectUrl('student', '/users')).toBe('/portal');
      expect(getSafeRedirectUrl('student', '/crm/leads')).toBe('/portal');

      // Permitted student routes are honored
      expect(getSafeRedirectUrl('student', '/portal')).toBe('/portal');
      expect(getSafeRedirectUrl('student', '/portal/assignments')).toBe('/portal/assignments');
      expect(getSafeRedirectUrl('student', '/certificate/verify/CRT-SAP-2026-001')).toBe('/certificate/verify/CRT-SAP-2026-001');
      expect(getSafeRedirectUrl('student', '/accounts/receipts/REC-2026-001')).toBe('/accounts/receipts/REC-2026-001');
    });

    it('enforces onboarding team isolation boundary', () => {
      expect(getSafeRedirectUrl('onboarding_team', '/dashboard')).toBe('/onboarding');
      expect(getSafeRedirectUrl('onboarding_team', '/accounts/fees')).toBe('/onboarding');
      expect(getSafeRedirectUrl('onboarding_team', '/onboarding')).toBe('/onboarding');
      expect(getSafeRedirectUrl('onboarding_team', '/onboarding/tasks?id=123')).toBe('/onboarding/tasks?id=123');
    });

    it('enforces admin-only boundary for /settings, /audit-logs, and /users', () => {
      // Super Admin and Admin allowed
      expect(getSafeRedirectUrl('super_admin', '/settings')).toBe('/settings');
      expect(getSafeRedirectUrl('admin', '/settings')).toBe('/settings');
      expect(getSafeRedirectUrl('super_admin', '/audit-logs')).toBe('/audit-logs');
      expect(getSafeRedirectUrl('admin', '/users')).toBe('/users');

      // Non-admins denied and fall back to their role workspace
      expect(getSafeRedirectUrl('accountant', '/settings')).toBe('/accounts/fees');
      expect(getSafeRedirectUrl('trainer', '/audit-logs')).toBe('/academics/courses');
      expect(getSafeRedirectUrl('counsellor', '/users')).toBe('/crm/leads');
      expect(getSafeRedirectUrl('support', '/settings')).toBe('/support');
    });

    it('enforces super-admin only boundary for /todos probe console', () => {
      expect(getSafeRedirectUrl('super_admin', '/todos')).toBe('/todos');
      expect(getSafeRedirectUrl('admin', '/todos')).toBe('/dashboard');
      expect(getSafeRedirectUrl('accountant', '/todos')).toBe('/accounts/fees');
      expect(getSafeRedirectUrl('trainer', '/todos')).toBe('/academics/courses');
      expect(getSafeRedirectUrl('student', '/todos')).toBe('/portal');
    });

    it('defends against open redirect attacks and external protocols', () => {
      expect(getSafeRedirectUrl('super_admin', 'https://malicious.com')).toBe('/dashboard');
      expect(getSafeRedirectUrl('super_admin', 'http://malicious.com')).toBe('/dashboard');
      expect(getSafeRedirectUrl('super_admin', '//malicious.com')).toBe('/dashboard');
      expect(getSafeRedirectUrl('super_admin', '/\\malicious.com')).toBe('/dashboard');
      expect(getSafeRedirectUrl('super_admin', '/test\\malicious.com')).toBe('/dashboard');
      expect(getSafeRedirectUrl('super_admin', 'javascript:alert(1)')).toBe('/dashboard');
    });

    it('prevents redirect loops back to /login or /', () => {
      expect(getSafeRedirectUrl('trainer', '/login')).toBe('/academics/courses');
      expect(getSafeRedirectUrl('trainer', '/login?redirectTo=/dashboard')).toBe('/academics/courses');
      expect(getSafeRedirectUrl('trainer', '/login/reset')).toBe('/academics/courses');
      expect(getSafeRedirectUrl('trainer', '/')).toBe('/academics/courses');
    });

    it('prevents redirection to internal API endpoints', () => {
      expect(getSafeRedirectUrl('accountant', '/api/settings')).toBe('/accounts/fees');
      expect(getSafeRedirectUrl('trainer', '/api/courses')).toBe('/academics/courses');
    });
  });
});

