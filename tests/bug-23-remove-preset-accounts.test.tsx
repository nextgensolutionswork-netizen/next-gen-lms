import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '@/app/login/page';
import { getSafeRedirectUrl } from '@/lib/auth/rbac';
import { getRoleLabel } from '@/lib/utils/role-labels';
import type { UserRole } from '@/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

// Mock auth provider
const mockLogin = vi.fn().mockResolvedValue(true);
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: null,
    role: null,
    login: mockLogin,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

describe('BUG-23: Remove Preset Role Accounts from LMS Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Removal of Preset Accounts Panel & Demo Credentials', () => {
    it('renders the login page without any preset role accounts section', () => {
      const html = renderToString(<LoginPage />);
      expect(html).toBeDefined();

      // Ensure obsolete demo headings and prompts are absent
      expect(html).not.toContain('Preset Role Accounts');
      expect(html).not.toContain('9 PRESET ROLE ACCOUNTS');
      expect(html).not.toContain('Click to fill');
      expect(html).not.toContain('Instant 1-Click Launch');
      expect(html).not.toContain('Select any of the');
      expect(html).not.toContain('Ready as');
    });

    it('does not embed or expose demo account identities or demo emails in the page HTML', () => {
      const html = renderToString(<LoginPage />);

      const demoEmails = [
        'superadmin@next-generpsolutions.com',
        'accounts@next-generpsolutions.com',
        'counsellor@next-generpsolutions.com',
        'vikram.fico@next-generpsolutions.com',
        'placement@next-generpsolutions.com',
        'support@next-generpsolutions.com',
        'onboarding@next-generpsolutions.com',
        'amit.gupta@student.next-gen.com',
      ];

      for (const email of demoEmails) {
        expect(html).not.toContain(email);
      }

      const demoNames = [
        'Rajesh Sharma (Director)',
        'Priya Nair (Operations Head)',
        'Suresh Kumar (Chief Accountant)',
        'Ananya Desai (Senior Sales)',
        'Vikram Rao (SAP FICO Lead)',
        'Sunita Reddy (Placement Head)',
        'Ananya Deshmukh (SAP Support Lead)',
        'Sneha Patel (Student Onboarding Lead)',
        'Amit Gupta (SAP Student)',
      ];

      for (const name of demoNames) {
        expect(html).not.toContain(name);
      }
    });

    it('does not embed or expose demo passwords anywhere in the page HTML', () => {
      const html = renderToString(<LoginPage />);

      const demoPasswords = [
        'AdminPass#2026',
        'AccountsPass#2026',
        'CounsellorPass#2026',
        'TrainerPass#2026',
        'PlacementPass#2026',
        'SupportPass#2026',
        'OnboardPass#2026',
        'StudentPass#2026',
      ];

      for (const pass of demoPasswords) {
        expect(html).not.toContain(pass);
      }
    });
  });

  describe('2. Updated Login Page Text & Layout', () => {
    it('displays the authoritative introductory instruction', () => {
      const html = renderToString(<LoginPage />);
      expect(html).toContain('Enter your email address and password to sign in securely.');
    });

    it('preserves official Next-Gen ERP Solutions institute branding', () => {
      const html = renderToString(<LoginPage />);
      expect(html).toContain('Next-Gen ERP');
      expect(html).toContain('Solutions &amp; Learning');
      expect(html).toContain('Multi-Role Institute ERP &amp; LMS');
      expect(html).toContain('9 Dedicated Role Workspaces &amp; Portals');
      expect(html).toContain('admin@next-generpsolutions.com');
    });
  });

  describe('3. Required Login Form Structure (5 Core Controls)', () => {
    it('contains all five required form elements', () => {
      const html = renderToString(<LoginPage />);

      // 1. Email Address Input
      expect(html).toContain('id="email"');
      expect(html).toContain('name="email"');
      expect(html).toContain('Email address');

      // 2. Password Input
      expect(html).toContain('id="password"');
      expect(html).toContain('name="password"');
      expect(html).toContain('Password');

      // 3. Show/Hide Password Toggle
      expect(html).toContain('aria-label="Show password"');

      // 4. Forgot Password Button
      expect(html).toContain('Forgot password?');

      // 5. Sign In Button
      expect(html).toContain('Sign in');
    });
  });

  describe('4. Preservation of 9 Authorized LMS Roles & Redirections', () => {
    const allNineRoles: { role: UserRole; expectedHome: string }[] = [
      { role: 'super_admin', expectedHome: '/dashboard' },
      { role: 'admin', expectedHome: '/dashboard' },
      { role: 'accountant', expectedHome: '/accounts/fees' },
      { role: 'counsellor', expectedHome: '/crm/leads' },
      { role: 'trainer', expectedHome: '/academics/courses' },
      { role: 'placement_coordinator', expectedHome: '/placement' },
      { role: 'support', expectedHome: '/support' },
      { role: 'onboarding_team', expectedHome: '/onboarding' },
      { role: 'student', expectedHome: '/portal' },
    ];

    it('verifies all nine authoritative LMS roles have defined role labels', () => {
      for (const item of allNineRoles) {
        const label = getRoleLabel(item.role);
        expect(label).toBeDefined();
        expect(label.length).toBeGreaterThan(0);
      }
    });

    it('verifies safe role-based redirection works for all nine roles', () => {
      for (const item of allNineRoles) {
        const dest = getSafeRedirectUrl(item.role);
        expect(dest).toBe(item.expectedHome);
      }
    });

    it('preserves deep link redirection when authorized', () => {
      // Super admin can access dashboard deep links
      const adminRedirect = getSafeRedirectUrl('super_admin', '/settings/audit');
      expect(adminRedirect).toBe('/settings/audit');

      // Accountant cannot access CRM leads, redirects safely to accounts
      const accountantRedirect = getSafeRedirectUrl('accountant', '/crm/leads');
      expect(accountantRedirect).toBe('/accounts/fees');
    });
  });
});
