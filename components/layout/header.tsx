'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, Search, ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { UserRole } from '@/types';

interface HeaderProps {
  currentRole: UserRole;
  currentUserName: string;
}

export function Header({ currentRole, currentUserName }: HeaderProps) {
  const [showNotifications, setShowNotifications] = React.useState(false);

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Search Input */}
      <div className="flex items-center space-x-3 w-96">
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
      <div className="flex items-center space-x-4">
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
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white shadow-xl border border-slate-200 py-2 z-50 text-xs">
              <div className="px-4 py-2 border-b border-slate-100 font-bold text-slate-800 flex justify-between items-center">
                <span>Notifications (2 new)</span>
                <span className="text-[10px] text-blue-600 cursor-pointer hover:underline">Mark all read</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                <div className="p-3 hover:bg-slate-50 transition-colors">
                  <p className="font-semibold text-slate-800">New Payment Recorded</p>
                  <p className="text-slate-500 mt-0.5">₹10,000 received for Amit Gupta (REC-2026-0002).</p>
                  <span className="text-[10px] text-slate-400 mt-1 block">15 mins ago</span>
                </div>
                <div className="p-3 hover:bg-slate-50 transition-colors">
                  <p className="font-semibold text-slate-800">Demo Scheduled</p>
                  <p className="text-slate-500 mt-0.5">Vikas Sharma booked a SAP FICO demo session.</p>
                  <span className="text-[10px] text-slate-400 mt-1 block">1 hour ago</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Badge */}
        <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-[#0A6ED1] to-blue-500 flex items-center justify-center font-bold text-white text-xs shadow-sm">
            {currentUserName.charAt(0)}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-slate-800 leading-tight">{currentUserName}</p>
            <p className="text-[10px] font-medium text-slate-500 capitalize">{currentRole.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
