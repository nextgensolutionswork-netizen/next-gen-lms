'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Download,
  GraduationCap,
  Calendar,
  CreditCard,
  CheckCircle,
  ExternalLink,
  Phone,
  Mail,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { Student } from '@/types';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';

export default function StudentsListPage() {
  const [students, setStudents] = React.useState<Student[]>(store.students);
  const [search, setSearch] = React.useState('');
  const [courseFilter, setCourseFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');

  const refreshList = () => {
    let list = [...store.students];
    if (courseFilter !== 'All') {
      list = list.filter((s) => s.course_id === courseFilter);
    }
    if (statusFilter !== 'All') {
      list = list.filter((s) => s.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.full_name.toLowerCase().includes(q) ||
          s.student_code.toLowerCase().includes(q) ||
          s.admission_number.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          s.email.toLowerCase().includes(q)
      );
    }
    setStudents(list);
  };

  React.useEffect(() => {
    refreshList();
  }, [search, courseFilter, statusFilter]);

  const handleExportCSV = () => {
    exportToCSV('sap_enrolled_students', students);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Directory (360° Management)</h1>
          <p className="text-xs text-slate-500 mt-1">
            Comprehensive student profiles tracking academic progress, attendance, LMS milestones, fee ledger, and placement readiness.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-xs flex items-center space-x-1">
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>
          <Link href="/admissions">
            <Button variant="sap" size="sm" className="text-xs">
              Admissions Desk
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by student name, code, admission #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <div>
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
              >
                <option value="All">All Courses</option>
                {store.courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.course_name}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Students Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Student Code</th>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Course & Batch</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">LMS Progress</th>
                  <th className="px-4 py-3">Fee Status</th>
                  <th className="px-4 py-3">Placement</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((stu) => (
                  <tr key={stu.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-blue-600">{stu.student_code}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{stu.full_name}</p>
                      <p className="text-[10px] text-slate-400">{stu.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{stu.course_name}</p>
                      <p className="text-[10px] text-slate-500">{stu.batch_name || 'Assigned Batch'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-slate-700">{stu.attendance_percentage}%</span>
                        <div className="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${stu.attendance_percentage >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${stu.attendance_percentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-slate-700">{stu.course_progress}%</span>
                        <div className="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${stu.course_progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {stu.outstanding_amount === 0 ? (
                        <Badge variant="success">Paid in Full</Badge>
                      ) : (
                        <div>
                          <p className="text-amber-700 font-bold">Due: {formatINR(stu.outstanding_amount)}</p>
                          <p className="text-[10px] text-slate-400">Paid: {formatINR(stu.paid_amount)}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{stu.placement_status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/students/${stu.id}`}>
                        <Button variant="sap" size="sm" className="text-xs px-2.5 py-1 flex items-center space-x-1">
                          <span>360° Profile</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
