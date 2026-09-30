import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAvatarUrl,
  setAuthCookie,
  clearAuthCookie,
  getStoredUser,
} from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { ROLE_PERMISSIONS, hasPermission } from '@/lib/auth/rbac';
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
});
