'use client';

import * as React from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

import { useAuth } from '@/components/providers/auth-provider';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, user, isLoading } = useAuth();
  const userName = user?.full_name || 'User';
  const pathname = usePathname();
  const drawer = React.useRef<HTMLDialogElement>(null);
  const [navigationOpen, setNavigationOpen] = React.useState(false);

  React.useEffect(() => { setNavigationOpen(false); }, [pathname]);
  React.useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (navigationOpen) dialog.showModal();
    else dialog.close();
    if (!navigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setNavigationOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [navigationOpen]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <p role="status">Loading your workspace…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="hidden lg:block print:hidden">
        <Sidebar currentRole={role} currentUserName={userName} />
      </div>
      <dialog
        ref={drawer}
        id="mobile-navigation"
        aria-label="Main navigation"
        className="m-0 h-dvh max-h-none w-72 max-w-[90vw] border-0 p-0 bg-slate-900 backdrop:bg-slate-950/60 lg:hidden"
        onCancel={() => setNavigationOpen(false)}
        onClose={() => setNavigationOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget || (event.target as HTMLElement).closest('a')) setNavigationOpen(false);
        }}
      >
        <button type="button" onClick={() => setNavigationOpen(false)} aria-label="Close navigation" className="absolute right-2 top-2 z-10 rounded bg-slate-800 p-2 text-white">
          <X className="h-5 w-5" />
        </button>
        <Sidebar currentRole={role} currentUserName={userName} className="w-full h-dvh" />
      </dialog>
      <div className="flex-1 flex flex-col min-w-0">
        <Header currentRole={role} currentUserName={userName} onOpenNavigation={() => setNavigationOpen(true)} navigationOpen={navigationOpen} />
        <main className="dashboard-content flex-1 min-w-0 w-full p-3 sm:p-6 xl:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
