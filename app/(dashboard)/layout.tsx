'use client';

import * as React from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { UserRole } from '@/types';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [role, setRole] = React.useState<UserRole>('super_admin');
  const [userName, setUserName] = React.useState('Rajesh Sharma (Director)');

  const handleRoleSwitch = (newRole: UserRole) => {
    setRole(newRole);
    const names: Record<UserRole, string> = {
      super_admin: 'Rajesh Sharma (Director)',
      admin: 'Priya Nair (Operations Head)',
      accountant: 'Suresh Kumar (Chief Accountant)',
      counsellor: 'Ananya Desai (Senior Counsellor)',
      trainer: 'Vikram Rao (SAP FICO Lead)',
      support: 'Ananya Deshmukh (SAP Support Lead)',
      placement_coordinator: 'Sunita Reddy (Placement Head)',
      student: 'Amit Gupta (Student)',
    };
    setUserName(names[newRole] || 'User');
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Sidebar currentRole={role} currentUserName={userName} onRoleSwitch={handleRoleSwitch} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header currentRole={role} currentUserName={userName} />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
