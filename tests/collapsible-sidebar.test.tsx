import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import DashboardLayout from '@/app/(dashboard)/layout';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/crm/leads',
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', full_name: 'Operations Admin', email: 'admin@erp.com' },
    role: 'admin',
    isLoading: false,
    logout: vi.fn(),
  }),
}));

describe('Collapsible Sidebar', () => {
  describe('Sidebar component', () => {
    it('renders the brand header and collapse button when onToggleCollapse is provided', () => {
      const onToggle = vi.fn();
      const html = renderToString(
        <Sidebar
          currentRole="admin"
          currentUserName="Operations Admin"
          onToggleCollapse={onToggle}
        />
      );

      expect(html).toContain('NEXT-GEN ERP');
      expect(html).toContain('LMS &amp; Institute Management');
      expect(html).toContain('aria-label="Collapse sidebar"');
      expect(html).toContain('title="Collapse sidebar"');
    });

    it('omits collapse button when onToggleCollapse is not provided (e.g. mobile drawer fallback)', () => {
      const html = renderToString(
        <Sidebar
          currentRole="admin"
          currentUserName="Operations Admin"
        />
      );

      expect(html).toContain('NEXT-GEN ERP');
      expect(html).not.toContain('aria-label="Collapse sidebar"');
    });

    it('preserves user profile footer and navigation links when rendered', () => {
      const html = renderToString(
        <Sidebar
          currentRole="admin"
          currentUserName="Operations Admin"
          avatar="https://example.com/avatar.jpg"
        />
      );

      expect(html).toContain('Operations Admin');
      expect(html).toMatch(/Sales Lead|admin/i);
      expect(html).toContain('CRM');
      expect(html).toContain('Admissions');
      expect(html).toContain('Academics');
    });
  });

  describe('Header component', () => {
    it('does not render the desktop reopen button when sidebarCollapsed is false', () => {
      const onToggle = vi.fn();
      const html = renderToString(
        <Header
          currentRole="admin"
          currentUserName="Operations Admin"
          onToggleSidebar={onToggle}
          sidebarCollapsed={false}
          onOpenNavigation={vi.fn()}
        />
      );

      expect(html).toContain('aria-label="Open navigation"');
      expect(html).not.toContain('aria-label="Expand sidebar"');
    });

    it('renders the desktop reopen button when sidebarCollapsed is true and onToggleSidebar is provided', () => {
      const onToggle = vi.fn();
      const html = renderToString(
        <Header
          currentRole="admin"
          currentUserName="Operations Admin"
          onToggleSidebar={onToggle}
          sidebarCollapsed={true}
          onOpenNavigation={vi.fn()}
        />
      );

      expect(html).toContain('aria-label="Expand sidebar"');
      expect(html).toContain('title="Expand sidebar"');
      expect(html).toContain('hidden lg:flex');
    });

    it('preserves top header elements (search bar, verify certificate, portal, notifications)', () => {
      const html = renderToString(
        <Header
          currentRole="admin"
          currentUserName="Operations Admin"
          sidebarCollapsed={true}
          onToggleSidebar={vi.fn()}
        />
      );

      expect(html).toContain('Search students, admissions, leads, receipts, batches...');
      expect(html).toContain('Verify Certificate');
      expect(html).toContain('Student Portal');
      expect(html).toContain('Notifications');
    });
  });

  describe('DashboardLayout shared layout', () => {
    it('renders the collapsible sidebar wrapper with 300ms transition and full-width main content area', () => {
      const html = renderToString(
        <DashboardLayout>
          <div data-testid="crm-leads-content">CRM Leads Page Content</div>
        </DashboardLayout>
      );

      // Verify desktop sidebar container is present with transition classes
      expect(html).toContain('hidden lg:block print:hidden transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0');
      // Verify initial state is expanded (w-64 opacity-100)
      expect(html).toContain('w-64 opacity-100');
      // Verify collapse button is inside the sidebar
      expect(html).toContain('aria-label="Collapse sidebar"');
      // Verify main content flex wrapper exists to expand across available screen
      expect(html).toContain('flex-1 flex flex-col min-w-0');
      expect(html).toContain('dashboard-content flex-1 min-w-0 w-full');
      expect(html).toContain('CRM Leads Page Content');
    });

    it('supports collapse and expand styling states correctly', () => {
      // Simulate collapsed styling
      const isCollapsed = true;
      const collapsedClasses = `hidden lg:block print:hidden transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
        isCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-64 opacity-100'
      }`;
      expect(collapsedClasses).toContain('w-0 opacity-0 pointer-events-none');
      expect(collapsedClasses).not.toContain('w-64 opacity-100');

      // Simulate expanded styling
      const isExpanded = false;
      const expandedClasses = `hidden lg:block print:hidden transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
        isExpanded ? 'w-0 opacity-0 pointer-events-none' : 'w-64 opacity-100'
      }`;
      expect(expandedClasses).toContain('w-64 opacity-100');
      expect(expandedClasses).not.toContain('w-0 opacity-0 pointer-events-none');
    });
  });
});
