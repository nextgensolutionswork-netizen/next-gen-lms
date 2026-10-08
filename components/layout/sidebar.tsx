'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarDays,
  CheckCircle,
  FileText,
  BadgeHelp,
  IndianRupee,
  Briefcase,
  ShieldAlert,
  Settings,
  Bell,
  Layers,
  Building2,
  ChevronDown,
  UserCheck,
  CreditCard,
  Receipt,
  Wallet,
} from 'lucide-react';
import { UserRole } from '@/types';

interface SidebarProps {
  currentRole: UserRole;
  currentUserName: string;
  onRoleSwitch?: (role: UserRole) => void;
  avatar?: string;
}

export function Sidebar({ currentRole, currentUserName, onRoleSwitch, avatar }: SidebarProps) {
  const pathname = usePathname();
  const [openSection, setOpenSection] = React.useState<string | null>('academics');

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  // RBAC Menu Filtering
  const isSuperAdmin = currentRole === 'super_admin';
  const isAdmin = isSuperAdmin || currentRole === 'admin';
  const isAccountant = isSuperAdmin || currentRole === 'accountant';
  const isCounsellor = isSuperAdmin || isAdmin || currentRole === 'counsellor';
  const isTrainer = isSuperAdmin || isAdmin || currentRole === 'trainer';
  const isPlacement = isSuperAdmin || isAdmin || currentRole === 'placement_coordinator';
  const isSupport = isSuperAdmin || isAdmin || currentRole === 'support' || currentRole === 'trainer';

  return (
    <aside className="w-64 flex-shrink-0 bg-slate-900 text-slate-200 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center space-x-3 bg-slate-950/50">
        <div className="h-10 w-10 rounded-lg bg-[#0A6ED1] flex items-center justify-center font-bold text-white shadow-md text-lg">
          SAP
        </div>
        <div className="overflow-hidden">
          <h1 className="font-bold text-sm tracking-wide text-white truncate">NEXT-GEN ERP</h1>
          <p className="text-[10px] text-slate-400 font-medium truncate">LMS & Institute Management</p>
        </div>
      </div>

      {/* Role Switcher for Interactive Live Testing */}
      <div className="px-4 py-2 bg-slate-800/60 border-b border-slate-800 text-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Preview Role:</span>
          <span className="font-bold text-[#0A6ED1] uppercase text-[10px] bg-blue-950 px-1.5 py-0.5 rounded border border-blue-800">
            {currentRole.replace('_', ' ')}
          </span>
        </div>
        <select
          value={currentRole}
          onChange={(e) => onRoleSwitch && onRoleSwitch(e.target.value as UserRole)}
          className="w-full text-xs bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
        >
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="accountant">Accountant</option>
          <option value="counsellor">Counsellor</option>
          <option value="trainer">Trainer</option>
          <option value="support">Support Mentor</option>
          <option value="placement_coordinator">Placement Coord</option>
          <option value="student">Student</option>
        </select>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 text-sm font-medium">
        {/* Main Dashboard */}
        <Link
          href="/dashboard"
          className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
            pathname === '/dashboard' || pathname === '/'
              ? 'bg-[#0A6ED1] text-white font-semibold shadow-sm'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span>Dashboard</span>
        </Link>

        {/* CRM Module (Counsellor, Admin, Super Admin) */}
        {isCounsellor && (
          <div>
            <button
              onClick={() => toggleSection('crm')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Users className="h-4 w-4 text-emerald-400" />
                <span>CRM & Leads</span>
              </div>
              <ChevronDown className={`h-3 w-3 transition-transform ${openSection === 'crm' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'crm' && (
              <div className="pl-9 pr-2 py-1 space-y-1">
                <Link
                  href="/crm/leads"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/crm/leads') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Leads
                </Link>
                <Link
                  href="/crm/followups"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/crm/followups') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Follow-ups & Demos
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Admissions (Counsellor, Admin, Super Admin) */}
        {isCounsellor && (
          <div>
            <button
              onClick={() => toggleSection('admissions')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <div className="flex items-center space-x-3">
                <UserCheck className="h-4 w-4 text-amber-400" />
                <span>Admissions</span>
              </div>
              <ChevronDown className={`h-3 w-3 transition-transform ${openSection === 'admissions' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'admissions' && (
              <div className="pl-9 pr-2 py-1 space-y-1">
                <Link
                  href="/admissions"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/admissions') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Admissions List
                </Link>
                <Link
                  href="/students"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/students') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Enrolled Students (360°)
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Academics (Trainer, Admin, Super Admin) */}
        {isTrainer && (
          <div>
            <button
              onClick={() => toggleSection('academics')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <div className="flex items-center space-x-3">
                <GraduationCap className="h-4 w-4 text-blue-400" />
                <span>Academics & LMS</span>
              </div>
              <ChevronDown className={`h-3 w-3 transition-transform ${openSection === 'academics' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'academics' && (
              <div className="pl-9 pr-2 py-1 space-y-1">
                <Link
                  href="/academics/courses"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/academics/courses') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Courses & Modules
                </Link>
                <Link
                  href="/academics/batches"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/academics/batches') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Batches & Transfers
                </Link>
                <Link
                  href="/academics/schedule"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/academics/schedule') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Timetable & Sessions
                </Link>
                <Link
                  href="/academics/attendance"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/academics/attendance') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mark Attendance
                </Link>
                <Link
                  href="/academics/assignments"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/academics/assignments') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Assignments & Grading
                </Link>
                <Link
                  href="/academics/assessments"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/academics/assessments') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Quizzes & Exams
                </Link>
                <Link
                  href="/academics/sap-servers"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/academics/sap-servers') ? 'bg-slate-800 text-white font-bold text-amber-300' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SAP Lab Servers
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Accounts & Finance (Accountant, Admin, Super Admin, Counsellor) */}
        {(isAccountant || isCounsellor) && (
          <div>
            <button
              onClick={() => toggleSection('accounts')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <div className="flex items-center space-x-3">
                <IndianRupee className="h-4 w-4 text-emerald-400" />
                <span>Accounts & Finance</span>
              </div>
              <ChevronDown className={`h-3 w-3 transition-transform ${openSection === 'accounts' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'accounts' && (
              <div className="pl-9 pr-2 py-1 space-y-1">
                <Link
                  href="/accounts/approvals"
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/accounts/approvals') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Fee Approvals</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                    Approvals
                  </span>
                </Link>
                <Link
                  href="/accounts/fees"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/accounts/fees') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Student Fee Ledger
                </Link>
                <Link
                  href="/accounts/payments"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/accounts/payments') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Payments & Receipts
                </Link>
                <Link
                  href="/accounts/installments"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/accounts/installments') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Installments & Overdue
                </Link>
                {isAccountant && (
                  <>
                    <Link
                      href="/accounts/expenses"
                      className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                        isActive('/accounts/expenses') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Expenses & Approvals
                    </Link>
                    <Link
                      href="/accounts/vendors"
                      className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                        isActive('/accounts/vendors') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Vendors & GST
                    </Link>
                  </>
                )}
                <Link
                  href="/accounts/reports"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/accounts/reports') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Financial Analytics
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Placement Support (Placement, Admin, Super Admin) */}
        {isPlacement && (
          <div>
            <button
              onClick={() => toggleSection('placement')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Briefcase className="h-4 w-4 text-purple-400" />
                <span>Placement Support</span>
              </div>
              <ChevronDown className={`h-3 w-3 transition-transform ${openSection === 'placement' ? 'rotate-180' : ''}`} />
            </button>
            {(openSection === 'placement' || isActive('/placement')) && (
              <div className="pl-9 pr-2 py-1 space-y-1">
                <Link
                  href="/placement"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    pathname === '/placement' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Drives & Openings
                </Link>
                <Link
                  href="/placement/enrollments"
                  className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive('/placement/enrollments') ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Enrollments & Candidates
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Academic Support Helpdesk (Support, Trainer, Admin, Super Admin) */}
        {isSupport && (
          <Link
            href="/support"
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/support') ? 'bg-[#0A6ED1] text-white font-semibold shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <BadgeHelp className="h-4 w-4 text-cyan-400" />
            <div className="flex-1 flex items-center justify-between">
              <span>Academic Support</span>
              <span className="text-[10px] bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-800 font-semibold">Helpdesk</span>
            </div>
          </Link>
        )}

        {/* Certificates */}
        <Link
          href="/certificates"
          className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
            isActive('/certificates') ? 'bg-[#0A6ED1] text-white font-semibold shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <CheckCircle className="h-4 w-4 text-amber-400" />
          <span>Certificates</span>
        </Link>

        {/* Dedicated Student Portal Switch */}
        <div className="pt-2 border-t border-slate-800">
          <Link
            href="/portal"
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-gradient-to-r from-blue-900 to-indigo-900 text-white text-xs font-semibold hover:from-blue-800 hover:to-indigo-800 transition-colors shadow-sm"
          >
            <div className="flex items-center space-x-2">
              <BookOpen className="h-4 w-4 text-blue-300" />
              <span>Student LMS Portal</span>
            </div>
            <span className="text-[10px] bg-blue-500/30 px-1.5 py-0.5 rounded text-blue-200">Live</span>
          </Link>
        </div>

        {/* Admin Tools */}
        {isAdmin && (
          <div className="pt-2 border-t border-slate-800 space-y-1">
            <Link
              href="/users"
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/users') ? 'bg-slate-800 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="h-4 w-4 text-slate-400" />
              <span>Staff & Roles</span>
            </Link>

            {isSuperAdmin && (
              <Link
                href="/audit-logs"
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive('/audit-logs') ? 'bg-slate-800 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <ShieldAlert className="h-4 w-4 text-rose-400" />
                <span>Audit Logs</span>
              </Link>
            )}

            <Link
              href="/settings"
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/settings') ? 'bg-slate-800 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Settings className="h-4 w-4 text-slate-400" />
              <span>Institute Settings</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center space-x-3">
        {avatar ? (
          <img
            src={avatar}
            alt={currentUserName}
            className="h-8 w-8 rounded-full object-cover border border-slate-700"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs border border-slate-600">
            {currentUserName.charAt(0)}
          </div>
        )}
        <div className="overflow-hidden flex-1">
          <p className="text-xs font-semibold text-white truncate">{currentUserName}</p>
          <p className="text-[10px] text-slate-400 capitalize truncate">{currentRole.replace('_', ' ')}</p>
        </div>
      </div>
    </aside>
  );
}
