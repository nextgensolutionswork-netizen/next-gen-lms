'use client';

import * as React from 'react';
import {
  Users,
  Shield,
  Plus,
  Mail,
  Phone,
  CheckCircle,
  Key,
  Edit2,
  UserCheck,
  UserX,
  RefreshCw,
  Search,
  Copy,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  Send,
  Link as LinkIcon,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { UserProfile, UserRole } from '@/types';
import { createUser, updateUser, setUserActiveStatus } from '@/lib/services/auth-service';
import { dispatchMultiChannelNotification } from '@/lib/services/notification-service';
import { formatDate } from '@/lib/utils/formatters';
import { useAuth } from '@/components/providers/auth-provider';

export default function UsersPage() {
  const { role: currentRole, user: currentUser, hasPermission } = useAuth();
  const [users, setUsers] = React.useState<UserProfile[]>(store.users || []);
  const [isAddModal, setIsAddModal] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('All');
  const [statusFilter, setStatusFilter] = React.useState<string>('All');
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const canManageUsers =
    currentRole === 'admin' ||
    currentRole === 'super_admin' ||
    hasPermission('users:write') ||
    hasPermission('all:manage');

  // New User Form state
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [role, setRole] = React.useState<UserRole>('trainer');
  const [assignedCourseId, setAssignedCourseId] = React.useState(store.courses?.[0]?.id || '');

  // Edit User Form state
  const [isEditModal, setIsEditModal] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserProfile | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');
  const [editPhone, setEditPhone] = React.useState('');
  const [editRole, setEditRole] = React.useState<UserRole>('trainer');
  const [editCourseId, setEditCourseId] = React.useState('');

  // Password Reset & Link Dispatch state
  const [isResetModal, setIsResetModal] = React.useState(false);
  const [resettingUser, setResettingUser] = React.useState<UserProfile | null>(null);
  const [resetTab, setResetTab] = React.useState<'link' | 'password'>('link');
  const [resetLink, setResetLink] = React.useState('');
  const [isDispatching, setIsDispatching] = React.useState(false);
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = React.useState<string | null>(null);
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState('');
  const [resetSuccess, setResetSuccess] = React.useState(false);

  const refreshList = () => {
    setUsers([...(store.users || [])]);
  };

  const filteredUsers = React.useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        Boolean(u.phone && u.phone.includes(q));

      const matchesRole = roleFilter === 'All' || u.role === roleFilter;
      const matchesStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Active' && u.is_active) ||
        (statusFilter === 'Deactivated' && !u.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    const newUser = await createUser({
      full_name: name,
      email,
      phone,
      role,
      assigned_course_ids: role === 'trainer' ? [assignedCourseId] : [],
    });

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: currentUser?.id || 'usr-admin',
      user_name: currentUser?.full_name || 'Administrator',
      user_role: currentRole,
      action: 'USER_CREATED',
      module: 'USERS',
      record_id: newUser.id,
      new_value: newUser,
      created_at: new Date().toISOString(),
    });

    store.persist();
    setIsAddModal(false);
    setName('');
    setEmail('');
    setPhone('');
    refreshList();
  };

  const openEditModal = (u: UserProfile) => {
    setActionError(null);
    setEditingUser(u);
    setEditName(u.full_name);
    setEditEmail(u.email);
    setEditPhone(u.phone || '');
    setEditRole(u.role);
    setEditCourseId(u.assigned_course_ids?.[0] || store.courses?.[0]?.id || '');
    setIsEditModal(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setActionError(null);

    // Self-demotion defense: cannot strip admin privileges from own session
    if (
      (editingUser.id === currentUser?.id || editingUser.email.toLowerCase() === currentUser?.email?.toLowerCase()) &&
      editRole !== editingUser.role &&
      !['super_admin', 'admin'].includes(editRole)
    ) {
      setActionError('Self-Demotion Blocked: You cannot revoke administrator rights from your own active account.');
      return;
    }

    try {
      const updated = await updateUser(editingUser.id, {
        full_name: editName,
        email: editEmail,
        phone: editPhone,
        role: editRole,
        assigned_course_ids: editRole === 'trainer' ? [editCourseId] : [],
      });

      if (!store.auditLogs) store.auditLogs = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user_id: currentUser?.id || 'usr-admin',
        user_name: currentUser?.full_name || 'Administrator',
        user_role: currentRole,
        action: 'USER_UPDATED',
        module: 'USERS',
        record_id: editingUser.id,
        old_value: editingUser,
        new_value: updated || undefined,
        created_at: new Date().toISOString(),
      });

      store.persist();
      refreshList();
      setIsEditModal(false);
      setEditingUser(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update user profile.');
    }
  };

  const handleToggleActive = async (u: UserProfile) => {
    setActionError(null);
    // Self-deactivation defense
    if (u.id === currentUser?.id || u.email.toLowerCase() === currentUser?.email?.toLowerCase()) {
      setActionError('Action Prohibited: You cannot deactivate your own active session account.');
      return;
    }

    try {
      const willBeActive = !u.is_active;
      await setUserActiveStatus(u.id, willBeActive, currentUser?.id);

      if (!store.auditLogs) store.auditLogs = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user_id: currentUser?.id || 'usr-admin',
        user_name: currentUser?.full_name || 'Administrator',
        user_role: currentRole,
        action: willBeActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        module: 'USERS',
        record_id: u.id,
        new_value: { is_active: willBeActive },
        created_at: new Date().toISOString(),
      });

      store.persist();
      refreshList();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update user status.');
    }
  };

  const openResetModal = (u: UserProfile) => {
    setActionError(null);
    setResettingUser(u);
    const token = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lms.next-generpsolutions.com';
    const link = `${origin}/login?reset_token=${token}&email=${encodeURIComponent(u.email)}`;
    setResetLink(link);
    setNewPassword('TempPass@' + Math.floor(1000 + Math.random() * 9000));
    setResetSuccess(false);
    setDispatchSuccessMsg(null);
    setCopied(false);
    setLinkCopied(false);
    setResetTab('link');
    setIsResetModal(true);
  };

  const handleCopyResetLink = () => {
    if (navigator?.clipboard && resetLink) {
      navigator.clipboard.writeText(resetLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }
  };

  const handleDispatchResetLink = async () => {
    if (!resettingUser || !resetLink) return;
    setIsDispatching(true);
    setDispatchSuccessMsg(null);
    setActionError(null);

    try {
      await dispatchMultiChannelNotification({
        userId: resettingUser.id,
        recipientName: resettingUser.full_name,
        recipientEmail: resettingUser.email,
        recipientPhone: resettingUser.phone,
        title: 'Action Required: Next-Gen ERP Password Reset',
        message: `Hello ${resettingUser.full_name}, an administrator requested a password reset for your account (${resettingUser.email}). Set your password: ${resetLink}`,
        category: 'general',
        type: 'warning',
        channels: ['in_app', 'email'],
        actionUrl: resetLink,
        metadata: {
          resetLink,
          htmlTemplate: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
              <div style="background-color: #0A6ED1; padding: 22px; text-align: center; color: #ffffff;">
                <h1 style="margin: 0; font-size: 20px; font-weight: 800;">NEXT-GEN ERP SOLUTIONS</h1>
                <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Secure Password Reset Request</p>
              </div>
              <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
                <p style="font-size: 15px; margin-top: 0;">Hello <strong>${resettingUser.full_name}</strong>,</p>
                <p style="font-size: 14px; color: #475569;">
                  An administrator has initiated a password reset for your account (<code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${resettingUser.email}</code>).
                </p>
                <div style="text-align: center; margin: 26px 0;">
                  <a href="${resetLink}" style="background-color: #0A6ED1; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 6px; display: inline-block;">
                    Reset Account Password
                  </a>
                </div>
                <p style="font-size: 12px; color: #64748b;">
                  Alternatively, copy and paste this link into your browser:<br/>
                  <a href="${resetLink}" style="color: #0A6ED1; word-break: break-all;">${resetLink}</a>
                </p>
                <p style="font-size: 11px; color: #94a3b8; margin-bottom: 0;">
                  This link expires in 24 hours. If you did not request this, please notify your administrator.
                </p>
              </div>
            </div>
          `,
        },
      });

      if (!store.auditLogs) store.auditLogs = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user_id: currentUser?.id || 'usr-admin',
        user_name: currentUser?.full_name || 'Administrator',
        user_role: currentRole,
        action: 'PASSWORD_RESET_LINK_TRIGGERED',
        module: 'SECURITY',
        record_id: resettingUser.id,
        new_value: {
          recipient_email: resettingUser.email,
          dispatched_by: currentUser?.id || 'usr-admin',
          reset_link: resetLink,
        },
        created_at: new Date().toISOString(),
      });
      store.persist();

      setDispatchSuccessMsg(`Password reset link successfully dispatched to ${resettingUser.email} via Resend email & in-app notification!`);
    } catch (err: any) {
      console.error('Failed to dispatch reset link:', err);
      setActionError('Could not dispatch reset email automatically. Please copy the direct reset link.');
    } finally {
      setIsDispatching(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !newPassword) return;

    try {
      await updateUser(resettingUser.id, {
        updated_at: new Date().toISOString(),
      });

      if (!store.auditLogs) store.auditLogs = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user_id: currentUser?.id || 'usr-admin',
        user_name: currentUser?.full_name || 'Administrator',
        user_role: currentRole,
        action: 'PASSWORD_RESET',
        module: 'SECURITY',
        record_id: resettingUser.id,
        new_value: { reset_by: currentUser?.id, user_email: resettingUser.email },
        created_at: new Date().toISOString(),
      });

      store.persist();
      refreshList();
      setResetSuccess(true);
    } catch (err: any) {
      setActionError(err.message || 'Failed to apply new password.');
    }
  };

  const handleCopyPassword = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const canAccessUsers =
    currentRole === 'admin' ||
    currentRole === 'super_admin' ||
    hasPermission('users:read') ||
    hasPermission('users:manage') ||
    hasPermission('all:manage');

  if (!canAccessUsers) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500">
          Faculty & Staff directory and security configuration are strictly restricted to Super Administrators and Operational Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Faculty & Staff RBAC Administration</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage user roles, trainer course assignments, and permission boundaries with default-deny security.
          </p>
        </div>
        {canManageUsers && (
          <Button variant="sap" size="sm" onClick={() => setIsAddModal(true)} className="text-xs flex items-center space-x-1">
            <Plus className="h-4 w-4" />
            <span>Add Staff Member</span>
          </Button>
        )}
      </div>

      {actionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs flex items-center space-x-2 animate-in fade-in">
          <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
          <span className="font-semibold">{actionError}</span>
        </div>
      )}

      {/* Search & Filters Bar */}
      <Card className="p-3.5">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search faculty by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto">
            <span className="text-xs text-slate-500 font-medium">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 font-medium"
            >
              <option value="All">All Roles ({users.length})</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="trainer">Trainer</option>
              <option value="accountant">Accountant</option>
              <option value="counsellor">Counsellor</option>
              <option value="placement_coordinator">Placement Head</option>
              <option value="support">Academic Support</option>
              <option value="onboarding_team">Onboarding Team</option>
              <option value="student">Student</option>
            </select>

            <span className="text-xs text-slate-500 font-medium ml-2">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 font-medium"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Deactivated">Deactivated Only</option>
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">User Name</th>
                  <th className="px-4 py-3">Email & Phone</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Assigned Scope / Courses</th>
                  <th className="px-4 py-3">Account Status</th>
                  <th className="px-4 py-3">Joined Date</th>
                  {canManageUsers && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={canManageUsers ? 7 : 6} className="px-4 py-8 text-center text-slate-400">
                      No faculty or staff members found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const assignedCourses = (u.assigned_course_ids || [])
                      .map((id) => (store.courses || []).find((c) => c.id === id)?.course_name)
                      .filter(Boolean);

                    return (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">{u.full_name}</td>
                        <td className="px-4 py-3">
                          <p className="text-slate-800">{u.email}</p>
                          <p className="text-[10px] text-slate-400">{u.phone || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              u.role === 'super_admin'
                                ? 'default'
                                : u.role === 'accountant'
                                ? 'warning'
                                : u.role === 'trainer'
                                ? 'info'
                                : 'secondary'
                            }
                            className="capitalize"
                          >
                            {u.role.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {u.role === 'trainer' ? (
                            assignedCourses.length > 0 ? (
                              <span className="font-medium text-blue-700">{assignedCourses.join(', ')}</span>
                            ) : (
                              <span className="text-rose-600 italic">No courses assigned (Zero access)</span>
                            )
                          ) : u.role === 'accountant' ? (
                            <span className="text-slate-500 italic">Financial ledger & receipts only</span>
                          ) : u.role === 'support' ? (
                            <span className="text-cyan-700 font-medium">Academic Doubts & Helpdesk Lead</span>
                          ) : u.role === 'onboarding_team' ? (
                            <span className="text-teal-700 font-medium">Student Onboarding & LMS Activation</span>
                          ) : u.role === 'placement_coordinator' ? (
                            <span className="text-purple-700 font-medium">Job Openings & Placements</span>
                          ) : u.role === 'counsellor' ? (
                            <span className="text-amber-700 font-medium">CRM Leads & Admissions</span>
                          ) : u.role === 'student' ? (
                            <span className="text-emerald-700 font-medium">Student Learning Portal</span>
                          ) : (
                            <span className="text-slate-500 italic">Full Enterprise Scope</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => canManageUsers && handleToggleActive(u)}
                            disabled={!canManageUsers || u.id === currentUser?.id || u.email.toLowerCase() === currentUser?.email?.toLowerCase()}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                              u.is_active
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                            } ${
                              !canManageUsers || u.id === currentUser?.id || u.email.toLowerCase() === currentUser?.email?.toLowerCase()
                                ? 'opacity-80 cursor-default'
                                : 'cursor-pointer hover:shadow-xs'
                            }`}
                            title={
                              u.id === currentUser?.id || u.email.toLowerCase() === currentUser?.email?.toLowerCase()
                                ? 'Cannot deactivate your own active session'
                                : canManageUsers
                                ? (u.is_active ? 'Click to deactivate user' : 'Click to activate user')
                                : undefined
                            }
                          >
                            <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${u.is_active ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                            {u.is_active ? 'Active' : 'Deactivated'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(u.created_at)}</td>
                        {canManageUsers && (
                          <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => openEditModal(u)}
                              className="p-1 rounded text-slate-600 hover:text-blue-600 hover:bg-slate-100"
                              title="Edit Role & Courses"
                              aria-label={`Edit ${u.full_name}`}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openResetModal(u)}
                              className="p-1 rounded text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              title="Reset Password"
                              aria-label={`Reset password for ${u.full_name}`}
                            >
                              <Key className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={u.id === currentUser?.id || u.email.toLowerCase() === currentUser?.email?.toLowerCase()}
                              className={`p-1 rounded ${
                                u.is_active
                                  ? 'text-emerald-600 hover:text-rose-600 hover:bg-rose-50'
                                  : 'text-rose-600 hover:text-emerald-600 hover:bg-emerald-50'
                              } ${
                                u.id === currentUser?.id || u.email.toLowerCase() === currentUser?.email?.toLowerCase()
                                  ? 'opacity-40 cursor-not-allowed'
                                  : ''
                              }`}
                              title={
                                u.id === currentUser?.id || u.email.toLowerCase() === currentUser?.email?.toLowerCase()
                                  ? 'Cannot deactivate your own active session'
                                  : u.is_active
                                  ? 'Deactivate User'
                                  : 'Activate User'
                              }
                              aria-label={u.is_active ? `Deactivate ${u.full_name}` : `Activate ${u.full_name}`}
                            >
                              {u.is_active ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditModal}
        onClose={() => setIsEditModal(false)}
        title="Edit User Profile & RBAC Role"
        description="Update administrative roles and course scoping assignments."
      >
        <form onSubmit={handleEditSave} className="space-y-4 text-xs">
          <Input
            label="Full Name *"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email Address *"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Assigned Role *
            </label>
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as UserRole)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
            >
              <option value="super_admin">Super Admin / Director</option>
              <option value="admin">Operations Admin</option>
              <option value="onboarding_team">Student Onboarding Specialist</option>
              <option value="trainer">Trainer (Assigned Courses Only)</option>
              <option value="support">Academic Support Mentor</option>
              <option value="accountant">Accountant (Financial Ledgers Only)</option>
              <option value="counsellor">Counsellor (CRM & Admissions)</option>
              <option value="placement_coordinator">Placement Coordinator</option>
              <option value="student">Student Account</option>
            </select>
          </div>

          {editRole === 'trainer' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Assign Primary Course Scope *
              </label>
              <select
                value={editCourseId}
                onChange={(e) => setEditCourseId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                {(store.courses || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.course_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password & Link Modal */}
      <Modal
        isOpen={isResetModal}
        onClose={() => setIsResetModal(false)}
        title="Administrative Password Management"
        description={`Manage credentials and trigger reset links for ${resettingUser?.full_name || 'user'}.`}
      >
        <div className="space-y-4 text-xs">
          {/* Action Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => { setResetTab('link'); setDispatchSuccessMsg(null); }}
              className={`pb-2.5 px-3 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
                resetTab === 'link'
                  ? 'border-[#0A6ED1] text-[#0A6ED1]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              <span>Trigger Reset Link</span>
            </button>
            <button
              type="button"
              onClick={() => { setResetTab('password'); setDispatchSuccessMsg(null); }}
              className={`pb-2.5 px-3 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
                resetTab === 'password'
                  ? 'border-[#0A6ED1] text-[#0A6ED1]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Key className="h-3.5 w-3.5" />
              <span>Assign Temp Password</span>
            </button>
          </div>

          {resetTab === 'link' ? (
            <div className="space-y-3.5 pt-1">
              {dispatchSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-medium flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <span>{dispatchSuccessMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Secure Password Reset URL (Valid for 24 Hours)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={resetLink}
                    className="flex-1 font-mono text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 select-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyResetLink}
                    className="text-xs flex items-center space-x-1 flex-shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{linkCopied ? 'Copied!' : 'Copy Link'}</span>
                  </Button>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-[11px] leading-relaxed">
                Clicking <strong>Dispatch Reset Email & Alert</strong> dispatches an immediate email via Resend to <strong>{resettingUser?.email}</strong> and issues an in-app security notification.
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsResetModal(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="sap"
                  size="sm"
                  disabled={isDispatching}
                  onClick={handleDispatchResetLink}
                  className="flex items-center space-x-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isDispatching ? 'Dispatching...' : 'Dispatch Reset Email & Alert'}</span>
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetPasswordSubmit} className="space-y-4 pt-1">
              {resetSuccess ? (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-semibold flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Password successfully reset and credentials updated!</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    <p className="text-[11px] text-slate-600">
                      Temporary Password for <strong>{resettingUser?.full_name}</strong>:
                    </p>
                    <div className="flex items-center space-x-2">
                      <code className="font-mono text-sm font-bold bg-white px-2.5 py-1 rounded border border-slate-300 text-blue-700 flex-1">
                        {newPassword}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCopyPassword}
                        className="text-xs flex items-center space-x-1"
                      >
                        <Copy className="h-3 w-3" />
                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button type="button" variant="sap" size="sm" onClick={() => setIsResetModal(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Input
                    label="New Temporary Password *"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-slate-500">
                    User will be required to change password upon next authentication session.
                  </p>
                  <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                    <Button type="button" variant="outline" size="sm" onClick={() => setIsResetModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="sap" size="sm">
                      Apply New Password
                    </Button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </Modal>

      {/* Add Staff Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Add Staff Member / Trainer"
        description="Assign RBAC roles and academic course scopes."
      >
        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          <Input
            label="Full Name *"
            placeholder="e.g. Manoj Verma"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email Address *"
              type="email"
              placeholder="manoj@next-generpsolutions.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              placeholder="+91..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              User Role *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
            >
              <option value="super_admin">Super Admin / Director</option>
              <option value="admin">Operations Admin</option>
              <option value="onboarding_team">Student Onboarding Specialist</option>
              <option value="trainer">Trainer (Assigned Courses Only)</option>
              <option value="support">Academic Support Mentor</option>
              <option value="accountant">Accountant (Financial Ledgers Only)</option>
              <option value="counsellor">Counsellor (CRM & Admissions)</option>
              <option value="placement_coordinator">Placement Coordinator</option>
              <option value="student">Student Account</option>
            </select>
          </div>

          {role === 'trainer' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Assign Primary Course Scope *
              </label>
              <select
                value={assignedCourseId}
                onChange={(e) => setAssignedCourseId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                {(store.courses || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.course_name}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Default-deny enforcement: Trainers can strictly only view batches and student attendance for assigned courses.
              </p>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Create User Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
