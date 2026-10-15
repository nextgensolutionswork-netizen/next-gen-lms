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
  Upload,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BulkImportModal } from '@/components/bulk-import-modal';
import { store } from '@/lib/services/data-store';
import { Student } from '@/types';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';
import { useAuth } from '@/components/providers/auth-provider';

export default function StudentsListPage() {
  const { user, role, hasPermission } = useAuth();
  const canAccessStudents =
    role === 'super_admin' ||
    role === 'admin' ||
    role === 'accountant' ||
    role === 'trainer' ||
    role === 'placement_coordinator' ||
    role === 'support' ||
    role === 'onboarding_team' ||
    role === 'counsellor' ||
    hasPermission('students:read');

  const canExport = role === 'super_admin' || role === 'admin' || hasPermission('students:export');
  const canImport = role === 'super_admin' || role === 'admin' || hasPermission('students:write');

  const [allStudents, setAllStudents] = React.useState<Student[]>(store.students || []);
  const [search, setSearch] = React.useState('');
  const [courseFilter, setCourseFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [batchFilter, setBatchFilter] = React.useState('All');
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const refreshList = () => {
    setAllStudents([...(store.students || [])]);
  };

  // Full filtered dataset (all matching students, not limited to current page)
  const filteredStudents = React.useMemo(() => {
    let list = [...allStudents];

    if (courseFilter !== 'All') {
      list = list.filter((s) => s.course_id === courseFilter);
    }
    if (batchFilter !== 'All') {
      list = list.filter((s) => s.batch_id === batchFilter);
    }
    if (statusFilter !== 'All') {
      list = list.filter((s) => s.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.full_name?.toLowerCase().includes(q) ||
          s.student_code?.toLowerCase().includes(q) ||
          s.admission_number?.toLowerCase().includes(q) ||
          s.phone?.includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.course_name?.toLowerCase().includes(q) ||
          s.batch_name?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [allStudents, courseFilter, batchFilter, statusFilter, search]);

  // Reset page to 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, courseFilter, batchFilter, statusFilter, pageSize]);

  // Pagination computations
  const totalStudents = filteredStudents.length;
  const totalPages = Math.ceil(totalStudents / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalStudents);
  const paginatedStudents = React.useMemo(() => {
    return filteredStudents.slice(startIndex, startIndex + pageSize);
  }, [filteredStudents, startIndex, pageSize]);

  // Available batches for current course filter
  const availableBatches = React.useMemo(() => {
    if (courseFilter === 'All') return store.batches || [];
    return (store.batches || []).filter((b) => b.course_id === courseFilter);
  }, [courseFilter]);

  // Export full filtered dataset (not just the current page)
  const handleExportCSV = () => {
    if (!canExport) {
      alert('Access Denied: You do not have permission to export student records.');
      return;
    }

    if (filteredStudents.length === 0) {
      alert('No students match the current filters to export.');
      return;
    }

    const exportData = filteredStudents.map((s) => ({
      'Student Code': s.student_code,
      'Full Name': s.full_name,
      'Email': s.email,
      'Phone': s.phone || 'N/A',
      'Course': s.course_name || 'N/A',
      'Batch': s.batch_name || 'N/A',
      'Joining Date': formatDate(s.joining_date),
      'Status': s.status,
      'Attendance %': `${s.attendance_percentage || 0}%`,
      'Course Progress %': `${s.course_progress || 0}%`,
      'Total Fee (INR)': s.total_fee,
      'Paid Amount (INR)': s.paid_amount,
      'Outstanding (INR)': s.outstanding_amount,
      'Placement Status': s.placement_status,
    }));

    exportToCSV(`sap_enrolled_students_${new Date().toISOString().slice(0, 10)}`, exportData);
  };

  if (!canAccessStudents) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          You do not have authorization to view the central student directory. This area is restricted to Institute Staff and Faculty.
        </p>
        <div className="pt-2">
          <Link href={role === 'student' ? '/portal' : '/dashboard'}>
            <Button variant="sap" size="sm" className="text-xs">
              Return to {role === 'student' ? 'Student Portal' : 'Dashboard'}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isFiltering = search.trim() !== '' || courseFilter !== 'All' || statusFilter !== 'All' || batchFilter !== 'All';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Directory (360° Management)</h1>
          <p className="text-xs text-slate-500 mt-1">
            Comprehensive student profiles tracking academic progress, attendance, LMS milestones, fee ledger, and placement readiness.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {canImport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImportModalOpen(true)}
              className="text-xs flex items-center space-x-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Bulk Import</span>
            </Button>
          )}
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-xs flex items-center space-x-1"
              title={`Export all ${filteredStudents.length} filtered students to CSV`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV ({filteredStudents.length})</span>
            </Button>
          )}
          <Link href="/admissions">
            <Button variant="sap" size="sm" className="text-xs">
              Admissions Desk
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by student name, code, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Course Filter */}
            <div>
              <select
                value={courseFilter}
                onChange={(e) => {
                  setCourseFilter(e.target.value);
                  setBatchFilter('All');
                }}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
              >
                <option value="All">All Courses</option>
                {(store.courses || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.course_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Filter */}
            <div>
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
              >
                <option value="All">All Batches</option>
                {availableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>

            {/* Reset Filters Button */}
            {isFiltering && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setCourseFilter('All');
                  setBatchFilter('All');
                  setStatusFilter('All');
                }}
                className="text-xs h-8 px-2 text-slate-500 hover:text-slate-800"
                title="Reset all filters"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                <span>Reset</span>
              </Button>
            )}
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
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      <Users className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                      <h3 className="font-semibold text-slate-700 text-sm">
                        No students found matching your search
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        {isFiltering
                          ? `No student records matched your search query "${search || 'the active filters'}". Try resetting or adjusting your filter criteria.`
                          : 'There are currently no enrolled students registered in the directory.'}
                      </p>
                      {isFiltering && (
                        <div className="mt-4 flex items-center justify-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSearch('');
                              setCourseFilter('All');
                              setBatchFilter('All');
                              setStatusFilter('All');
                            }}
                            className="text-xs"
                          >
                            Reset Filters
                          </Button>
                          <Link href="/admissions">
                            <Button variant="sap" size="sm" className="text-xs">
                              Admissions Desk
                            </Button>
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((stu) => (
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
                              className={`h-full ${
                                stu.attendance_percentage >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredStudents.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-600 bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <span>
                  Showing <strong>{startIndex + 1}</strong> to <strong>{endIndex}</strong> of{' '}
                  <strong>{totalStudents}</strong> students
                </span>
                <span className="text-slate-300">|</span>
                <div className="flex items-center space-x-1">
                  <span className="text-slate-500">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="text-xs bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-medium"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-7 w-7 p-0 flex items-center justify-center"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>

                <span className="px-2 font-medium">
                  Page {currentPage} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 w-7 p-0 flex items-center justify-center"
                  title="Next Page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        defaultEntity="students"
        onSuccess={refreshList}
      />
    </div>
  );
}
