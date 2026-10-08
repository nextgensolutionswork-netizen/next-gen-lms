'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  User,
  GraduationCap,
  Calendar,
  CreditCard,
  FileCheck,
  Award,
  Briefcase,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { getStudentProfileFullDetails } from '@/lib/services/student-service';
import { formatINR, formatDate, formatDateTime } from '@/lib/utils/formatters';

export default function StudentDetailsPage() {
  const params = useParams();
  const studentId = params?.id as string;
  const [activeTab, setActiveTab] = React.useState<
    | 'overview'
    | 'courses'
    | 'batch'
    | 'attendance'
    | 'assignments'
    | 'assessments'
    | 'payments'
    | 'receipts'
    | 'finance'
    | 'certificates'
    | 'placement'
    | 'documents'
    | 'activity'
  >('overview');

  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    async function load() {
      const details = await getStudentProfileFullDetails(studentId);
      setData(details);
    }
    load();
  }, [studentId]);

  if (!data || !data.student) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Student profile not found.</p>
        <Link href="/students" className="mt-4 inline-block text-blue-600 hover:underline">
          Return to Student Directory
        </Link>
      </div>
    );
  }

  const {
    student,
    admission,
    course,
    batch,
    feeAccount,
    installments,
    payments,
    receipts,
    attendance,
    submissions,
    quizAttempts,
    placement,
    certificate,
    transfers,
    studentFees = [],
    studentLedger = [],
  } = data;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'courses', label: 'Courses' },
    { id: 'batch', label: 'Batch' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'assignments', label: 'Assignments' },
    { id: 'assessments', label: 'Assessments' },
    { id: 'payments', label: 'Payments' },
    { id: 'receipts', label: 'Receipts' },
    { id: 'finance', label: 'Finance & Ledger' },
    { id: 'certificates', label: 'Certificates' },
    { id: 'placement', label: 'Placement' },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div className="space-y-6">
      {/* Back button and profile header */}
      <div className="flex items-center space-x-2">
        <Link href="/students">
          <Button variant="ghost" size="sm" className="text-xs flex items-center space-x-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Students Directory</span>
          </Button>
        </Link>
      </div>

      {/* Main Student Header Card */}
      <Card className="bg-gradient-to-r from-slate-900 to-blue-950 text-white border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl font-extrabold text-white">
                {student.full_name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-bold">{student.full_name}</h1>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                    {student.status}
                  </span>
                </div>
                <p className="text-xs text-blue-200 mt-0.5">
                  Code: <span className="font-semibold text-white">{student.student_code}</span> | Admission #{' '}
                  <span className="font-semibold text-white">{student.admission_number}</span>
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-2">
                  <span className="flex items-center space-x-1">
                    <Mail className="h-3.5 w-3.5 text-blue-300" />
                    <span>{student.email}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Phone className="h-3.5 w-3.5 text-blue-300" />
                    <span>{student.phone}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <MapPin className="h-3.5 w-3.5 text-blue-300" />
                    <span>{student.address}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4 bg-white/5 border border-white/10 p-3 rounded-xl">
              <div className="text-center px-3 border-r border-white/10">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Attendance</p>
                <p className="text-lg font-bold text-white">{student.attendance_percentage}%</p>
              </div>
              <div className="text-center px-3 border-r border-white/10">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">LMS Progress</p>
                <p className="text-lg font-bold text-white">{student.course_progress}%</p>
              </div>
              <div className="text-center px-3">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Fee Due</p>
                <p className="text-lg font-bold text-amber-400">{formatINR(student.outstanding_amount)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 12-Tab Navigation Bar */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="flex space-x-1 min-w-max pb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-[#0A6ED1] text-[#0A6ED1] bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Academic & Enrollment Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <p className="text-slate-400 uppercase font-semibold text-[10px]">Enrolled Course</p>
                  <p className="text-slate-800 font-bold text-sm mt-0.5">{course?.course_name}</p>
                  <p className="text-slate-500 mt-0.5">Code: {course?.course_code} | Duration: {course?.duration_weeks} Weeks</p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase font-semibold text-[10px]">Batch Assignment</p>
                  <p className="text-slate-800 font-bold text-sm mt-0.5">{batch?.batch_name || 'SAP Morning Batch'}</p>
                  <p className="text-slate-500 mt-0.5">Trainer: {batch?.trainer_name || 'Faculty Lead'}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-blue-600 font-semibold text-[11px]">Training Mode</p>
                  <p className="text-slate-800 font-bold mt-1">{admission?.training_mode || 'Hybrid'}</p>
                </div>
                <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                  <p className="text-purple-600 font-semibold text-[11px]">Education</p>
                  <p className="text-slate-800 font-bold mt-1">{admission?.education}</p>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <p className="text-emerald-600 font-semibold text-[11px]">Prior Experience</p>
                  <p className="text-slate-800 font-bold mt-1">{admission?.experience_years} Years</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Fee Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Original Course Fee:</span>
                <span className="font-semibold text-slate-800">{formatINR(feeAccount?.original_fee)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-600">
                <span>Discount Applied:</span>
                <span className="font-semibold">-{formatINR(feeAccount?.discount)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 font-bold">
                <span className="text-slate-800">Net Payable:</span>
                <span className="text-slate-900">{formatINR(feeAccount?.net_payable)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-blue-600 font-bold">
                <span>Amount Paid:</span>
                <span>{formatINR(feeAccount?.paid_amount)}</span>
              </div>
              <div className="flex justify-between py-1 font-bold text-amber-600">
                <span>Outstanding Balance:</span>
                <span>{formatINR(feeAccount?.outstanding_amount)}</span>
              </div>
              <div className="pt-2">
                <Button
                  variant="sap"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setActiveTab('payments')}
                >
                  Record Fee Payment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Courses */}
      {activeTab === 'courses' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enrolled SAP Courses & Syllabus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-800">{course?.course_name}</h3>
                  <p className="text-slate-500 mt-0.5">{course?.description}</p>
                </div>
                <Badge variant="success">Active</Badge>
              </div>
              <div className="mt-4 flex items-center space-x-3">
                <span className="text-slate-600 font-medium">Syllabus Completion: {student.course_progress}%</span>
                <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#0A6ED1] h-full" style={{ width: `${student.course_progress}%` }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Batch */}
      {activeTab === 'batch' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assigned Batch & Timetable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <p className="text-slate-400 font-semibold text-[10px] uppercase">Batch Name</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{batch?.batch_name}</p>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-[10px] uppercase">Class Timings</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{batch?.start_time} - {batch?.end_time}</p>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-[10px] uppercase">Days</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{batch?.days.join(', ')}</p>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-[10px] uppercase">Batch Trainer</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{batch?.trainer_name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Attendance */}
      {activeTab === 'attendance' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance Ledger ({student.attendance_percentage}% Overall)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Marked By</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendance.map((att: any) => (
                  <tr key={att.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{formatDate(att.attendance_date)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={att.status === 'Present' ? 'success' : 'destructive'}>{att.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{att.marked_by_name || 'Faculty'}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(att.marked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Tab 5: Assignments */}
      {activeTab === 'assignments' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submitted Academic Assignments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Submission Details</th>
                  <th className="px-4 py-3">Submitted At</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Marks</th>
                  <th className="px-4 py-3">Trainer Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((sub: any) => (
                  <tr key={sub.id}>
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">{sub.submission_text}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(sub.submitted_at)}</td>
                    <td className="px-4 py-3"><Badge variant="success">{sub.status}</Badge></td>
                    <td className="px-4 py-3 font-bold text-slate-900">{sub.marks_obtained} / 100</td>
                    <td className="px-4 py-3 text-slate-600 italic">&ldquo;{sub.feedback}&rdquo;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Tab 6: Assessments */}
      {activeTab === 'assessments' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quizzes & Exam Attempts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Exam Title</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Percentage</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quizAttempts.map((qa: any) => (
                  <tr key={qa.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{qa.quiz_title}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{qa.score} / {qa.total_points}</td>
                    <td className="px-4 py-3 font-bold text-blue-600">{qa.percentage}%</td>
                    <td className="px-4 py-3">
                      <Badge variant={qa.passed ? 'success' : 'destructive'}>
                        {qa.passed ? 'Passed' : 'Failed'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(qa.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Tab 7: Payments */}
      {activeTab === 'payments' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Receipt #</th>
                  <th className="px-4 py-3">Amount Paid</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Transaction Reference</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-semibold text-blue-600">{p.receipt_number}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{formatINR(p.amount)}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{p.payment_mode}</Badge></td>
                    <td className="px-4 py-3 font-mono text-slate-600">{p.transaction_reference || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(p.payment_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Tab 8: Receipts */}
      {activeTab === 'receipts' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Official Signed Fee Receipts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {receipts.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                <div>
                  <p className="font-bold text-slate-800 text-xs">{r.receipt_number}</p>
                  <p className="text-[11px] text-slate-500">Amount: {formatINR(r.payment_amount)} | Date: {formatDate(r.payment_date)}</p>
                </div>
                <Link href={`/accounts/receipts/${r.id}`}>
                  <Button variant="outline" size="sm" className="text-xs">
                    View / Print Receipt
                  </Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tab: Centralized Finance & Ledger */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          {/* Financial Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approved Fees</p>
                <h4 className="text-xl font-bold text-slate-900 mt-1">
                  {formatINR(studentFees.filter((f: any) => f.approval_status === 'Approved').reduce((acc: number, f: any) => acc + f.final_payable, 0))}
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">{studentFees.length} Fee Category Plan(s)</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-emerald-500 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Verified Paid</p>
                <h4 className="text-xl font-bold text-emerald-700 mt-1">
                  {formatINR(studentFees.filter((f: any) => f.approval_status === 'Approved').reduce((acc: number, f: any) => acc + f.paid_amount, 0))}
                </h4>
                <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">Financially cleared</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outstanding Due</p>
                <h4 className="text-xl font-bold text-amber-700 mt-1">
                  {formatINR(studentFees.filter((f: any) => f.approval_status === 'Approved').reduce((acc: number, f: any) => acc + f.outstanding_amount, 0))}
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Remaining balance</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-indigo-500 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Clearance Standing</p>
                <h4 className="text-sm font-bold text-indigo-700 mt-1">
                  {studentFees.filter((f: any) => f.approval_status === 'Approved').reduce((acc: number, f: any) => acc + f.outstanding_amount, 0) === 0 && studentFees.length > 0 ? (
                    <Badge variant="success">Financially Cleared ✓</Badge>
                  ) : (
                    <Badge variant="warning">Payment Pending</Badge>
                  )}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">Placement & Certificate gate</p>
              </CardContent>
            </Card>
          </div>

          {/* Centralized Student Fees */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-bold text-slate-800">
                Course & Module Fee Plans
              </CardTitle>
              <Link href="/accounts/approvals">
                <Button variant="outline" size="sm" className="text-xs">
                  Fee Approvals Desk →
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Course / Module</th>
                    <th className="px-4 py-3 text-right">Standard</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right">GST (18%)</th>
                    <th className="px-4 py-3 text-right">Final Total</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Counsellor</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentFees.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-slate-400">
                        No centralized fee plan configured yet for this student.
                      </td>
                    </tr>
                  ) : (
                    studentFees.map((fee: any) => (
                      <tr key={fee.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-indigo-700">{fee.fee_category}</td>
                        <td className="px-4 py-3 text-slate-700">{fee.course_name || fee.sap_module || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500">{formatINR(fee.standard_fee)}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-700">
                          {fee.discount_amount > 0 ? `-${formatINR(fee.discount_amount)} (${fee.discount_percentage}%)` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500">{formatINR(fee.tax_gst_amount)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{formatINR(fee.final_payable)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{formatINR(fee.outstanding_amount)}</td>
                        <td className="px-4 py-3 text-slate-600">{fee.payment_plan}</td>
                        <td className="px-4 py-3 text-slate-600">{fee.counsellor_name}</td>
                        <td className="px-4 py-3">
                          <Badge variant={fee.approval_status === 'Approved' ? 'success' : fee.approval_status === 'Pending Accountant Approval' ? 'warning' : 'destructive'}>
                            {fee.approval_status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Student Financial Ledger */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-800">
                Student Financial Audit Ledger
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Entry Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Debit (₹)</th>
                    <th className="px-4 py-3 text-right">Credit (₹)</th>
                    <th className="px-4 py-3 text-right">Running Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {studentLedger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400 font-sans">
                        No financial ledger entries posted yet.
                      </td>
                    </tr>
                  ) : (
                    studentLedger.map((entry: any) => (
                      <tr key={entry.id} className="hover:bg-slate-50 font-sans">
                        <td className="px-4 py-3 text-slate-500 font-mono">{entry.entry_date}</td>
                        <td className="px-4 py-3">
                          <Badge variant={entry.debit > 0 ? 'destructive' : 'success'}>
                            {entry.entry_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{entry.description}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-800">
                          {entry.debit > 0 ? formatINR(entry.debit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">
                          {entry.credit > 0 ? formatINR(entry.credit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          {formatINR(entry.running_balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: Certificates */}
      {activeTab === 'certificates' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Issued Course Certificates</CardTitle>
          </CardHeader>
          <CardContent>
            {certificate ? (
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <Award className="h-5 w-5 text-amber-600" />
                    <h4 className="font-bold text-slate-800 text-sm">{certificate.certificate_id}</h4>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">Course: {certificate.course_name} | Grade: {certificate.grade}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Issued On: {formatDate(certificate.issue_date)}</p>
                </div>
                <Link href={`/certificate/verify/${certificate.certificate_id}`} target="_blank">
                  <Button variant="sap" size="sm" className="text-xs">
                    Public Verification Page
                  </Button>
                </Link>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No certificate issued yet. Requires completion &gt;= 80% and fees settled.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 10: Placement */}
      {activeTab === 'placement' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Placement Profile & Interview Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <p className="text-slate-400 font-semibold text-[10px] uppercase">Placement Stage</p>
                <Badge variant="default" className="mt-1">{placement?.placement_status || 'Not Started'}</Badge>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-[10px] uppercase">Resume Status</p>
                <Badge variant="success" className="mt-1">{placement?.resume_status || 'Pending'}</Badge>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-[10px] uppercase">Tech Interview Score</p>
                <p className="font-bold text-slate-800 text-sm mt-1">{placement?.technical_interview_score || '—'} / 100</p>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-[10px] uppercase">HR Interview Score</p>
                <p className="font-bold text-slate-800 text-sm mt-1">{placement?.hr_interview_score || '—'} / 100</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 11: Documents */}
      {activeTab === 'documents' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submitted Student Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span>Identity Proof (Aadhaar / Passport)</span>
              </div>
              <Badge variant="success">Verified</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-purple-600" />
                <span>Graduation Degree Certificate</span>
              </div>
              <Badge variant="success">Verified</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 12: Activity */}
      {activeTab === 'activity' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student Timeline & Audit Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="border-l-2 border-[#0A6ED1] pl-3 py-1">
              <p className="font-bold text-slate-800">Fee Payment Completed (REC-2026-0002)</p>
              <p className="text-slate-500 text-[10px]">24 Feb 2026</p>
            </div>
            <div className="border-l-2 border-emerald-500 pl-3 py-1">
              <p className="font-bold text-slate-800">Assignment 1 Graded (Score 95/100)</p>
              <p className="text-slate-500 text-[10px]">27 Feb 2026</p>
            </div>
            <div className="border-l-2 border-blue-500 pl-3 py-1">
              <p className="font-bold text-slate-800">Enrolled into {batch?.batch_name}</p>
              <p className="text-slate-500 text-[10px]">{formatDate(student.joining_date)}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
