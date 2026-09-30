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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { UserProfile, UserRole } from '@/types';
import { createUser } from '@/lib/services/auth-service';
import { formatDate } from '@/lib/utils/formatters';

export default function UsersPage() {
  const [users, setUsers] = React.useState<UserProfile[]>(store.users);
  const [isAddModal, setIsAddModal] = React.useState(false);

  // New User Form state
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [role, setRole] = React.useState<UserRole>('trainer');
  const [assignedCourseId, setAssignedCourseId] = React.useState(store.courses[0]?.id || '');

  const refreshList = () => {
    setUsers([...store.users]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    await createUser({
      full_name: name,
      email,
      phone,
      role,
      assigned_course_ids: role === 'trainer' ? [assignedCourseId] : [],
    });

    setIsAddModal(false);
    setName('');
    setEmail('');
    refreshList();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Faculty & Staff RBAC Administration</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage user roles, trainer course assignments, and permission boundaries with default-deny security.
          </p>
        </div>
        <Button variant="sap" size="sm" onClick={() => setIsAddModal(true)} className="text-xs flex items-center space-x-1">
          <Plus className="h-4 w-4" />
          <span>Add Staff Member</span>
        </Button>
      </div>

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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const assignedCourses = (u.assigned_course_ids || [])
                    .map((id) => store.courses.find((c) => c.id === id)?.course_name)
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
                        <Badge variant="success">Active</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(u.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
                {store.courses.map((c) => (
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
