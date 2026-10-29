'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Bell, Search, ExternalLink, ShieldCheck, CheckCircle2, LogOut, Menu } from 'lucide-react';
import { UserRole, NotificationItem } from '@/types';
import { useAuth } from '@/components/providers/auth-provider';

interface HeaderProps {
  currentRole: UserRole;
  currentUserName: string;
  avatar?: string;
  onOpenNavigation?: () => void;
  navigationOpen?: boolean;
}

export function Header({ currentRole, currentUserName, avatar, onOpenNavigation, navigationOpen }: HeaderProps) {
  const { logout, user } = useAuth();
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  React.useEffect(() => {
    if (!user?.id) { setNotifications([]); return; }
    let active = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        if (document.visibilityState !== 'hidden') {
          const response = await fetch('/api/workflow/notifications', { cache: 'no-store', signal: controller.signal });
          const data = await response.json();
          if (active && response.ok) setNotifications(data.notifications || []);
        }
      } catch {}
      if (active) timer = setTimeout(refresh, 15000);
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [user?.id]);
  const [showNotifications, setShowNotifications] = React.useState(false);

  return (
    <header className="min-h-16 gap-2 border-b border-slate-200 bg-white px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between sticky top-0 z-40 print:hidden">
      {onOpenNavigation && <button type="button" aria-label="Open navigation" aria-controls="mobile-navigation" aria-expanded={navigationOpen} onClick={onOpenNavigation} className="lg:hidden rounded-lg border border-slate-200 p-2"><Menu className="h-5 w-5" /></button>}
      {/* Search Input */}
      <div className="flex items-center min-w-0 flex-1 max-w-96">
        <div className="relative w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search students, admissions, leads, receipts, batches..."
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Quick Actions & User Indicators */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        {/* Verification Portal Link */}
        <Link
          href="/certificate/verify/CERT-2026-FICO-0091"
          target="_blank"
          className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-medium transition-colors"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>Verify Certificate</span>
          <ExternalLink className="h-3 w-3 text-slate-400" />
        </Link>

        {/* Dedicated Student LMS Portal Link */}
        <Link
          href="/portal"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-[#0A6ED1] hover:bg-blue-100 text-xs font-semibold transition-colors"
        >
          <span>Student Portal</span>
          <ExternalLink className="h-3 w-3" />
        </Link>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors relative"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {notifications.some((n) => !n.is_read) && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />}
          </button>

          {showNotifications && (
            <div className="fixed left-3 right-3 sm:absolute sm:left-auto sm:right-0 mt-2 sm:w-80 rounded-xl bg-white shadow-xl border border-slate-200 py-2 z-50 text-xs">
              <div className="px-4 py-2 border-b border-slate-100 font-bold text-slate-800 flex justify-between items-center">
                <span>Notifications ({notifications.filter((n) => !n.is_read).length} new)</span>
                <button type="button" className="text-[10px] text-blue-600 hover:underline" onClick={async () => { const response = await fetch('/api/workflow/notifications', { method: 'POST' }); if (response.ok) setNotifications((items) => items.map((n) => ({ ...n, is_read: true }))); }}>Mark all read</button>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {notifications.length === 0 && <p className="p-3 text-slate-500">No notifications yet.</p>}
                {notifications.map((notification) => (
                  <Link key={notification.id} href={notification.action_url || '#'} className="block p-3 hover:bg-slate-50 transition-colors" onClick={() => setShowNotifications(false)}>
                    <p className="font-semibold text-slate-800">{notification.title}</p>
                    <p className="text-slate-500 mt-0.5">{notification.message}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">{new Date(notification.created_at).toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Badge */}
        <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
          {avatar ? (
            <Image
              width={32}
              height={32}
              src={avatar}
              alt={currentUserName}
              className="h-8 w-8 rounded-full object-cover shadow-sm border border-slate-200"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-[#0A6ED1] to-blue-500 flex items-center justify-center font-bold text-white text-xs shadow-sm">
              {currentUserName.charAt(0)}
            </div>
          )}
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-slate-800 leading-tight">{currentUserName}</p>
            <p className="text-[10px] font-medium text-slate-500 capitalize">{currentRole.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Sign Out Action */}
        <button
          onClick={() => logout()}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200 text-xs font-medium transition-colors"
          title="Sign out of account"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
}
