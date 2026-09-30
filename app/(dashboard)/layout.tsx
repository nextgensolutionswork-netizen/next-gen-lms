'use client';

import * as React from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { UserRole } from '@/types';

import { useAuth } from '@/components/providers/auth-provider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, user, switchRole } = useAuth();
  const userName = user?.full_name || 'User';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Sidebar currentRole={role} currentUserName={userName} onRoleSwitch={switchRole} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header currentRole={role} currentUserName={userName} />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
