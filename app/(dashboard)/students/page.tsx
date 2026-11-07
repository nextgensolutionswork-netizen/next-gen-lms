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
  User,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { BulkImportModal } from '@/components/bulk-import-modal';
import { store } from '@/lib/services/data-store';
import { Student } from '@/types';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';
import { getCanonicalPhoneDigits } from '@/lib/utils/phone-validation';
import { useAuth } from '@/components/providers/auth-provider';
import { useRecordLoad } from '@/lib/hooks/use-record-load';
import { getStudents } from '@/lib/services/student-service';

export default function StudentsListPage() {
  const { user, role, hasPermission, isLoading: authLoading } = useAuth();
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

  const loadStudents = React.useCallback((signal: AbortSignal) => getStudents(undefined, signal), []);
  const { data, status: loadStatus, error: loadError, reload } = useRecordLoad<Student[]>(
    !authLoading && user?.id && canAccessStudents ? user.id : null, loadStudents
  );
  const allStudents = React.useMemo(() => data || [], [data]);
  const [search, setSearch] = React.useState('');
  const [courseFilter, setCourseFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [batchFilter, setBatchFilter] = React.useState('All');
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const refreshList = () => {
    void reload();
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
      const q = search.trim().toLowerCase();
      const cleanDigits = q.replace(/\D/g, '');
      list = list.filter((s) => {
        if (!s) return false;
        const fullName = s.full_name ? String(s.full_name).toLowerCase() : '';
        const studentCode = s.student_code ? String(s.student_code).toLowerCase() : '';
        const studentUniqueId = s.student_unique_id ? String(s.student_unique_id).toLowerCase() : '';
        const admNumber = s.admission_number ? String(s.admission_number).toLowerCase() : '';
        const email = s.email ? String(s.email).toLowerCase() : '';
        const courseName = s.course_name ? String(s.course_name).toLowerCase() : '';
        const batchName = s.batch_name ? String(s.batch_name).toLowerCase() : '';
        const phoneRaw = s.phone != null ? String(s.phone).toLowerCase() : '';
        const phoneDigits = phoneRaw.replace(/\D/g, '');
        const altPhoneRaw = s.alternate_phone != null ? String(s.alternate_phone).toLowerCase() : '';
        const altPhoneDigits = altPhoneRaw.replace(/\D/g, '');

        return (
          fullName.includes(q) ||
          studentCode.includes(q) ||
          studentUniqueId.includes(q) ||
          admNumber.includes(q) ||
          email.includes(q) ||
          courseName.includes(q) ||
          batchName.includes(q) ||
          (phoneRaw.length > 0 && phoneRaw.includes(q)) ||
          (cleanDigits.length > 0 && phoneDigits.includes(cleanDigits)) ||
          (altPhoneRaw.length > 0 && altPhoneRaw.includes(q)) ||
          (cleanDigits.length > 0 && altPhoneDigits.includes(cleanDigits))
        );
      });
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
      'Student Unique ID': s.student_unique_id || s.student_code || 'N/A',
      'Student Code': s.student_code,
      'Full Name': s.full_name,
      'Email': s.email,
      'Phone': s.phone || 'N/A',
      'Alternate Phone': s.alternate_phone || 'N/A',
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

  if (!authLoading && !user) return <p role="alert">Please sign in to view students.</p>;
  if (canAccessStudents && loadStatus === 'loading') return <p role="status">Loading student directory…</p>;
  if (canAccessStudents && loadStatus === 'error') return <div className="space-y-3"><p role="alert">{loadError}</p><Button onClick={() => void reload()}>Retry loading students</Button></div>;
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Directory (360° Management)</h1>
          <p className="text-xs text-slate-500 mt-1">
            Comprehensive student profiles tracking academic progress, attendance, LMS milestones, fee ledger, and placement readiness.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-w-full">
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
      <Card className="p-3">
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
              <thead className="bg-slate-50 text-[11px] text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-3.5 py-2.5">Student</th>
                  <th className="px-3.5 py-2.5">Course</th>
                  <th className="px-3.5 py-2.5">Batch</th>
                  <th className="px-3.5 py-2.5">Attendance</th>
                  <th className="px-3.5 py-2.5">LMS Progress</th>
                  <th className="px-3.5 py-2.5">Fee Status</th>
                  <th className="px-3.5 py-2.5">Placement</th>
                  <th className="px-3.5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadStatus === 'loading' ? (
                  <TableSkeleton columns={8} rows={6} />
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3.5 py-12 text-center text-slate-500">
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
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center space-x-2.5">
                          {stu.photo_url || stu.profile_photo ? (
                            <img
                              src={stu.photo_url || stu.profile_photo}
                              alt={stu.full_name}
                              className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[11px] shrink-0 border border-slate-200">
                              {stu.full_name?.charAt(0) || 'S'}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/students/${stu.id}`}
                                className="font-semibold text-slate-900 text-xs hover:text-[#0A6ED1] transition-colors"
                              >
                                {stu.full_name}
                              </Link>
                              {(stu.student_unique_id || stu.student_code) && (
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 border border-slate-200/60 px-1 py-0.2 rounded font-medium">
                                  {stu.student_unique_id || stu.student_code}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 whitespace-nowrap">
                              <span className="font-medium text-slate-600">{stu.phone || stu.email}</span>
                              {stu.phone && (
                                <a
                                  href={`https://wa.me/${getCanonicalPhoneDigits('+91', stu.phone)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Chat on WhatsApp (${stu.phone})`}
                                  className="h-5 w-5 rounded-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white flex items-center justify-center transition-all shrink-0 border border-[#25D366]/30 shadow-2xs"
                                >
                                  <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                  </svg>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <p className="font-semibold text-slate-800 text-xs">{stu.course_name}</p>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-slate-700 font-medium">{stu.batch_name || 'Assigned Batch'}</span>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-slate-700 text-xs">{stu.attendance_percentage}%</span>
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
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-slate-700 text-xs">{stu.course_progress}%</span>
                          <div className="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600"
                              style={{ width: `${stu.course_progress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {stu.outstanding_amount === 0 ? (
                          <Badge variant="success" className="whitespace-nowrap font-medium text-[11px]">Paid in Full</Badge>
                        ) : (
                          <div>
                            <p className="text-amber-700 font-bold text-xs leading-none">Due: {formatINR(stu.outstanding_amount)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Paid: {formatINR(stu.paid_amount)}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <Badge variant="outline" className="whitespace-nowrap text-[11px]">{stu.placement_status}</Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <Link href={`/students/${stu.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200"
                            title="View Student Profile"
                          >
                            <User className="h-3.5 w-3.5" />
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
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <span>
                  Showing <strong>{startIndex + 1}</strong> to <strong>{endIndex}</strong> of{' '}
                  <strong>{totalStudents}</strong> students
                </span>
                <span className="text-slate-300">|</span>
                <div className="flex flex-wrap items-center gap-1 max-w-full">
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

              <div className="flex flex-wrap items-center gap-1 max-w-full">
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
