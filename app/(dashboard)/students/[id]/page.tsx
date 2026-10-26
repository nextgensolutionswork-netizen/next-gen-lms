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
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  ShieldCheck,
  ArrowRightLeft,
  Send,
  UploadCloud,
  XCircle,
  Plus,
  RefreshCw,
  Check,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FileUpload } from '@/components/ui/file-upload';
import { store } from '@/lib/services/data-store';
import { getStudentProfileFullDetails } from '@/lib/services/student-service';
import { formatINR, formatDate, formatDateTime } from '@/lib/utils/formatters';
import { useAuth } from '@/components/providers/auth-provider';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import { transferStudentBatch } from '@/lib/services/academics-service';
import { issueCertificate } from '@/lib/services/certificate-service';
import { PaymentMethod } from '@/types';
import { useRecordLoad } from '@/lib/hooks/use-record-load';

export default function StudentDetailsPage() {
  const { user, role, isLoading: authLoading } = useAuth();
  const params = useParams();
  const studentId = typeof params?.id === 'string' ? params.id : '';
  const [activeTab, setActiveTab] = React.useState<
    | 'overview'
    | 'onboarding'
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

  const loadDetails = React.useCallback(async () => {
    return getStudentProfileFullDetails(studentId);
  }, [studentId]);
  const { data, status: loadStatus, error: loadError, reload: reloadData } = useRecordLoad<any>(
    !authLoading && user?.id && studentId ? `${user.id}:${studentId}` : null, loadDetails
  );

  // Quick Record Payment Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = React.useState(false);
  const [payFeeId, setPayFeeId] = React.useState('');
  const [payAmount, setPayAmount] = React.useState<number>(0);
  const [payMode, setPayMode] = React.useState<PaymentMethod>('UPI');
  const [payDate, setPayDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [payTxnRef, setPayTxnRef] = React.useState('');
  const [payBankUpiRef, setPayBankUpiRef] = React.useState('');
  const [payNotes, setPayNotes] = React.useState('');
  const [payProofUrl, setPayProofUrl] = React.useState('');
  const [payProofUploading, setPayProofUploading] = React.useState(false);
  const [payLoading, setPayLoading] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [paySuccessMsg, setPaySuccessMsg] = React.useState<string | null>(null);

  // Batch Transfer Modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = React.useState(false);
  const [targetBatchId, setTargetBatchId] = React.useState('');
  const [transferReason, setTransferReason] = React.useState('');
  const [transferLoading, setTransferLoading] = React.useState(false);
  const [transferError, setTransferError] = React.useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = React.useState<string | null>(null);

  // Certificate Issuance state
  const [isIssuingCert, setIsIssuingCert] = React.useState(false);
  const [certMsg, setCertMsg] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!authLoading && !user) return <p role="alert">Please sign in to view this student profile.</p>;
  if (loadStatus === 'loading') return <p role="status" className="p-8 text-center">Loading student profile…</p>;
  if (loadStatus === 'error') return <div className="p-8 text-center space-y-3"><p role="alert">{loadError}</p><Button onClick={() => void reloadData()}>Retry loading profile</Button></div>;
  if (loadStatus === 'missing' || !data?.student) {
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
    payments = [],
    receipts = [],
    attendance = [],
    submissions = [],
    quizAttempts = [],
    placement,
    certificate,
    transfers = [],
    studentFees = [],
    studentPayments = [],
    studentLedger = [],
    jobApplications = [],
    doubts = [],
  } = data;

  // Student ownership security validation (IDOR protection)
  if (role === 'student' && user) {
    const isOwnProfile =
      student.user_id === user.id ||
      student.id === user.id ||
      student.email?.toLowerCase() === user.email?.toLowerCase();

    if (!isOwnProfile) {
      return (
        <div className="max-w-md mx-auto my-16 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500">
            You are only authorized to view your own student academic and fee profile.
          </p>
          <div className="pt-2">
            <Link href="/portal">
              <Button variant="sap" size="sm" className="text-xs">
                Back to Student Portal
              </Button>
            </Link>
          </div>
        </div>
      );
    }
  }

  const canRecordPayment =
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'counsellor';
  const canTransferBatch =
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'trainer';
  const canIssueCertificate =
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'trainer';

  const onboardingCase = store.onboardingCases.find(
    (c) =>
      c.student_id === student.id ||
      c.student_id === student.student_code ||
      c.admission_id === student.admission_id ||
      c.admission_number === student.admission_number
  );

  const availableBatches = (store.batches || []).filter(
    (b) => b.course_id === student.course_id && b.id !== student.batch_id
  );

  const isCertEligible =
    (student.attendance_percentage || 0) >= 80 &&
    (student.course_progress || 0) >= 80 &&
    (student.outstanding_amount || 0) <= 0;

  const openRecordPaymentModal = (feeId?: string, defaultAmt?: number) => {
    setPayError(null);
    setPaySuccessMsg(null);
    const targetFeeId = feeId || studentFees[0]?.id || (feeAccount ? `fee-${feeAccount.id}` : '');
    setPayFeeId(targetFeeId);
    const due = defaultAmt ?? (feeAccount?.outstanding_amount || studentFees[0]?.outstanding_amount || 0);
    setPayAmount(due > 0 ? due : 5000);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayTxnRef('');
    setPayBankUpiRef('');
    setPayProofUrl('');
    setPayNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !student) return;
    if (payAmount <= 0) {
      setPayError('Please enter a valid payment amount greater than zero.');
      return;
    }
    if (payProofUploading) {
      setPayError('Please wait for the payment proof file to finish uploading.');
      return;
    }
    if (!payProofUrl && payMode !== 'Cash') {
      setPayError('Payment proof (deposit slip or transaction screenshot) is required for non-cash payments.');
      return;
    }
    if (payMode !== 'Cash' && !payTxnRef.trim() && !payBankUpiRef.trim()) {
      setPayError('Please enter a transaction reference or UTR number.');
      return;
    }

    setPayLoading(true);
    setPayError(null);
    try {
      let feeIdToUse = payFeeId;
      if (!feeIdToUse && studentFees.length > 0) {
        feeIdToUse = studentFees[0].id;
      }
      if (!feeIdToUse) {
        const newSF = {
          id: `fee-${feeAccount?.id || Date.now()}`,
          student_id: student.id,
          student_name: student.full_name,
          student_code: student.student_code,
          admission_number: student.admission_number,
          course_id: student.course_id,
          course_name: course?.course_name || 'SAP Course',
          batch_id: student.batch_id,
          batch_name: batch?.batch_name || 'SAP Batch',
          fee_category: 'Tuition Fee',
          reference_type: 'Course' as const,
          standard_fee: feeAccount?.original_fee || 45000,
          proposed_fee: feeAccount?.original_fee || 45000,
          discount_amount: feeAccount?.discount || 0,
          discount_percentage: 0,
          tax_gst_amount: 0,
          additional_charges: 0,
          final_payable: feeAccount?.net_payable || 45000,
          paid_amount: feeAccount?.paid_amount || 0,
          outstanding_amount: feeAccount?.outstanding_amount || 45000,
          number_of_installments: 0,
          payment_plan: 'Full Payment',
          first_due_date: new Date().toISOString().split('T')[0],
          counsellor_id: user.id,
          counsellor_name: user.full_name || 'Admissions Desk',
          approval_status: 'Approved',
          version: 1,
          is_payable: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        store.studentFees.unshift(newSF as any);
        feeIdToUse = newSF.id;
      }

      const enrollmentId = student.admission_id || student.admission_number || student.id;
      const userRole = (role as any) || (user.role as any) || 'counsellor';
      const proofToUse = payProofUrl.trim() || (payMode === 'Cash' ? `/api/fees/proof?path=cash-counter-receipt-${student.id}.pdf` : '');

      const paymentRec = await paymentWorkflowClient.recordPayment(
        {
          fee_id: feeIdToUse,
          student_id: student.id,
          enrollment_id: enrollmentId,
          amount_paid: payAmount,
          payment_mode: payMode,
          payment_date: payDate,
          transaction_reference: payTxnRef.trim() || undefined,
          bank_upi_reference: payBankUpiRef.trim() || undefined,
          payment_proof_url: proofToUse,
          notes: payNotes.trim() || undefined,
        },
        user.id,
        userRole
      );

      store.reconcileDualLedgers();
      store.persist();
      await reloadData();

      const isCounsellor = userRole === 'counsellor';
      setPaySuccessMsg(
        isCounsellor || paymentRec?.status === 'Pending Approval'
          ? `Payment of ${formatINR(payAmount)} submitted with status "Pending Approval"! Automatically forwarded to Accounts for verification at /accounts/approvals.`
          : `Payment of ${formatINR(payAmount)} successfully recorded and verified!`
      );
      setTimeout(() => {
        setIsPaymentModalOpen(false);
        setPaySuccessMsg(null);
      }, 1600);
    } catch (err: any) {
      setPayError(err.message || 'Failed to record payment');
    } finally {
      setPayLoading(false);
    }
  };

  const handleBatchTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBatchId) {
      setTransferError('Please select a target batch.');
      return;
    }
    if (!transferReason.trim()) {
      setTransferError('Please provide a reason for the batch transfer.');
      return;
    }
    setTransferLoading(true);
    setTransferError(null);
    try {
      await transferStudentBatch(student.id, targetBatchId, transferReason, user?.id || 'usr-admin');
      store.persist();
      await reloadData();
      setTransferSuccess('Student transferred to new cohort successfully!');
      setTimeout(() => {
        setIsTransferModalOpen(false);
        setTransferSuccess(null);
        setTransferReason('');
      }, 1200);
    } catch (err: any) {
      setTransferError(err.message || 'Failed to transfer batch');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleIssueCertificate = async () => {
    if (!user) return;
    setIsIssuingCert(true);
    setCertMsg(null);
    try {
      const res = await issueCertificate(student.id, student.course_id, user.id);
      if (res.eligible && res.certificate) {
        store.persist();
        await reloadData();
        setCertMsg({ type: 'success', text: `Certificate #${res.certificate.certificate_id} successfully issued!` });
      } else {
        setCertMsg({
          type: 'error',
          text: `Ineligible: ${res.reasons.join(', ')}`,
        });
      }
    } catch (err: any) {
      setCertMsg({ type: 'error', text: err.message || 'Error generating certificate' });
    } finally {
      setIsIssuingCert(false);
    }
  };

  const activityTimeline = (() => {
    const events: Array<{
      id: string;
      date: string;
      title: string;
      description: string;
      badge: string;
      badgeVariant: 'default' | 'success' | 'destructive' | 'warning' | 'info' | 'outline';
      iconType: 'payment' | 'assignment' | 'assessment' | 'batch' | 'onboarding' | 'admission' | 'doubt';
    }> = [];

    if (admission) {
      events.push({
        id: `adm-${admission.id}`,
        date: admission.admission_date || student.created_at,
        title: `Admission Confirmed (#${admission.admission_number})`,
        description: `Admitted into ${admission.course_name} (Counselor: ${admission.counsellor_name || 'Admissions Desk'})`,
        badge: 'Admission',
        badgeVariant: 'success',
        iconType: 'admission',
      });
    }

    if (student.joining_date) {
      events.push({
        id: `join-${student.id}`,
        date: student.joining_date,
        title: `Enrolled into ${batch?.batch_name || 'Academic Batch'}`,
        description: `Course: ${course?.course_name || 'SAP Program'} | Code: ${student.student_code}`,
        badge: 'Enrolled',
        badgeVariant: 'info',
        iconType: 'batch',
      });
    }

    (transfers || []).forEach((t: any) => {
      events.push({
        id: `transfer-${t.id}`,
        date: t.transferred_at,
        title: `Cohort Transferred: ${t.from_batch_name} → ${t.to_batch_name}`,
        description: `Reason: ${t.reason} (Approved by ${t.transferred_by})`,
        badge: 'Batch Transfer',
        badgeVariant: 'warning',
        iconType: 'batch',
      });
    });

    const allPayments = studentPayments && studentPayments.length > 0 ? studentPayments : payments;
    (allPayments || []).forEach((p: any) => {
      const isVerified = p.verification_status === 'Verified' || p.status === 'Success';
      events.push({
        id: `pay-${p.id}`,
        date: p.payment_date || p.created_at,
        title: `Fee Payment Recorded (${formatINR(p.amount_paid ?? p.amount)})`,
        description: `Mode: ${p.payment_mode} | Ref: ${p.transaction_reference || p.bank_upi_reference || p.receipt_number || 'N/A'}${p.recorded_by_name ? ` | Collected by: ${p.recorded_by_name}` : ''}`,
        badge: isVerified ? 'Verified' : 'Pending',
        badgeVariant: isVerified ? 'success' : 'warning',
        iconType: 'payment',
      });
    });

    (submissions || []).forEach((s: any) => {
      events.push({
        id: `sub-${s.id}`,
        date: s.submitted_at,
        title: `Assignment Submission (${s.marks_obtained !== undefined ? `Score: ${s.marks_obtained}/100` : s.status})`,
        description: `${s.submission_text || 'Completed Assignment submission'}${s.feedback ? ` • Feedback: "${s.feedback}"` : ''}`,
        badge: s.status || 'Graded',
        badgeVariant: s.status === 'Graded' ? 'success' : 'info',
        iconType: 'assignment',
      });
    });

    (quizAttempts || []).forEach((qa: any) => {
      events.push({
        id: `quiz-${qa.id}`,
        date: qa.completed_at,
        title: `Quiz Attempt: ${qa.quiz_title || 'Modular Exam'}`,
        description: `Score: ${qa.score}/${qa.total_points} (${qa.percentage}%) • Result: ${qa.passed ? 'PASSED' : 'NEEDS RETAKE'}`,
        badge: qa.passed ? 'Passed' : 'Failed',
        badgeVariant: qa.passed ? 'success' : 'destructive',
        iconType: 'assessment',
      });
    });

    if (onboardingCase) {
      const caseLogs = (store.onboardingAuditLogs || []).filter((l) => l.case_id === onboardingCase.id);
      caseLogs.forEach((evt: any) => {
        events.push({
          id: `onb-${evt.id}`,
          date: evt.timestamp,
          title: `Onboarding Event: ${evt.action}`,
          description: `${evt.details} (Actor: ${evt.actor_name} [${evt.actor_role}])`,
          badge: 'Onboarding',
          badgeVariant: 'outline',
          iconType: 'onboarding',
        });
      });
    }

    (doubts || []).forEach((d: any) => {
      events.push({
        id: `dbt-${d.id}`,
        date: d.created_at,
        title: `Academic Query: ${d.title}`,
        description: `Module: ${d.sap_module || 'General'} | Status: ${d.status}${d.resolution_summary ? ` | Resolution: ${d.resolution_summary}` : ''}`,
        badge: d.status,
        badgeVariant: d.status === 'Resolved' ? 'success' : 'warning',
        iconType: 'doubt',
      });
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  })();

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'onboarding', label: 'Onboarding & Induction' },
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
                {student.full_name?.charAt(0) || 'S'}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-bold">{student.full_name}</h1>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                    {student.status}
                  </span>
                  {onboardingCase && (
                    <Link href={`/onboarding?search=${encodeURIComponent(student.admission_number || student.full_name)}`}>
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border flex items-center space-x-1 cursor-pointer hover:opacity-90 transition-opacity ${
                          onboardingCase.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : onboardingCase.status === 'in_progress'
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                            : onboardingCase.status === 'blocked'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        <span>Onboarding: {onboardingCase.status === 'in_progress' ? 'In Progress' : onboardingCase.status.replace('_', ' ')}</span>
                        <ExternalLink className="h-2.5 w-2.5 ml-0.5 inline" />
                      </span>
                    </Link>
                  )}
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
              {/* Onboarding Checklist Summary Card */}
              {onboardingCase ? (
                <div className="p-4 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border border-blue-200/80 rounded-xl shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center space-x-3">
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold text-xs shadow-xs flex-shrink-0 ${
                        onboardingCase.status === 'completed'
                          ? 'bg-emerald-600 text-white'
                          : onboardingCase.status === 'blocked'
                          ? 'bg-rose-600 text-white'
                          : 'bg-[#0A6ED1] text-white'
                      }`}>
                        {onboardingCase.status === 'completed' ? '✓' : '⚡'}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs">Onboarding & Induction:</span>
                          <Badge
                            variant={
                              onboardingCase.status === 'completed'
                                ? 'success'
                                : onboardingCase.status === 'in_progress'
                                ? 'info'
                                : onboardingCase.status === 'blocked'
                                ? 'destructive'
                                : 'warning'
                            }
                            className="text-[10px] capitalize font-semibold"
                          >
                            {onboardingCase.status === 'in_progress' ? 'In Progress' : onboardingCase.status.replace('_', ' ')}
                          </Badge>
                          <span className="text-[10px] text-slate-500 font-medium">
                            Case #{onboardingCase.case_number}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Specialist: <span className="font-semibold text-slate-800">{onboardingCase.assigned_staff_name || 'Unassigned'}</span>
                          {onboardingCase.orientation_date && (
                            <> • Orientation: <span className="font-semibold text-slate-800">{formatDate(onboardingCase.orientation_date)}</span></>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => setActiveTab('onboarding')}
                      >
                        Open Onboarding Tab
                      </Button>
                      <Link href={`/onboarding?search=${encodeURIComponent(student.admission_number || onboardingCase.case_number)}`}>
                        <Button
                          variant="sap"
                          size="sm"
                          className="text-xs flex items-center space-x-1"
                        >
                          <span>View Onboarding Case</span>
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* Progress Bar & Step Metrics */}
                  <div className="space-y-1.5 pt-2 border-t border-blue-100">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium">Checklist Verification Progress</span>
                      <span className="font-bold text-slate-900">
                        {Object.values(onboardingCase.checklist).filter((i) => i.completed).length} of{' '}
                        {Object.values(onboardingCase.checklist).length} Steps Completed (
                        {Math.round(
                          (Object.values(onboardingCase.checklist).filter((i) => i.completed).length /
                            Math.max(1, Object.values(onboardingCase.checklist).length)) *
                            100
                        )}
                        %)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          onboardingCase.status === 'completed' ? 'bg-emerald-600' : 'bg-[#0A6ED1]'
                        }`}
                        style={{
                          width: `${Math.round(
                            (Object.values(onboardingCase.checklist).filter((i) => i.completed).length /
                              Math.max(1, Object.values(onboardingCase.checklist).length)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-8 w-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs">
                      ℹ
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-xs">Onboarding Case Not Generated</p>
                      <p className="text-[11px] text-slate-500">
                        No active onboarding case was linked to Admission #{student.admission_number || 'N/A'}.
                      </p>
                    </div>
                  </div>
                  <Link href={`/onboarding?search=${encodeURIComponent(student.admission_number || '')}`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      Check Onboarding Workspace
                    </Button>
                  </Link>
                </div>
              )}

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
              <div className="pt-2 flex flex-col space-y-2">
                {canRecordPayment && (
                  <Button
                    variant="sap"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => openRecordPaymentModal()}
                  >
                    Record Fee Payment
                  </Button>
                )}
                <Link href={`/accounts/payments?studentId=${student.id}&feeAccountId=${feeAccount?.id || ''}&amount=${feeAccount?.outstanding_amount || 0}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                  >
                    Open Payment Desk &rarr;
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: Onboarding & Induction */}
      {activeTab === 'onboarding' && (
        <div className="space-y-6">
          {!onboardingCase ? (
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <AlertCircle className="h-8 w-8" />
                </div>
                <div className="max-w-md mx-auto">
                  <h3 className="text-base font-bold text-slate-800">No Onboarding Case Found</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    There is no active onboarding workflow case associated with Student ID {student.student_code} (Admission #{student.admission_number}). This usually occurs if the student was admitted prior to the onboarding system rollout.
                  </p>
                </div>
                <div className="pt-2">
                  <Link href="/onboarding">
                    <Button variant="sap" size="sm" className="text-xs">
                      Open Onboarding Workspace
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Header / Case Snapshot Card */}
              <Card>
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <CardTitle className="text-base">Onboarding & Induction Case #{onboardingCase.case_number}</CardTitle>
                        <Badge
                          variant={
                            onboardingCase.status === 'completed'
                              ? 'success'
                              : onboardingCase.status === 'in_progress'
                              ? 'info'
                              : onboardingCase.status === 'blocked'
                              ? 'destructive'
                              : 'warning'
                          }
                          className="text-[10px] capitalize font-semibold"
                        >
                          {onboardingCase.status === 'in_progress' ? 'In Progress' : onboardingCase.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Created on {formatDate(onboardingCase.created_at)} • Target SLA Due: {onboardingCase.due_date ? formatDate(onboardingCase.due_date) : 'Standard 3-Day SLA'}
                      </p>
                    </div>
                    <Link href={`/onboarding?search=${encodeURIComponent(student.admission_number || onboardingCase.case_number)}`}>
                      <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open in Onboarding Workspace &rarr;</span>
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {onboardingCase.blocked_reason && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2 text-rose-800 text-xs">
                      <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Workflow Blocked: </span>
                        <span>{onboardingCase.blocked_reason}</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="text-slate-400 font-semibold text-[10px] uppercase">Assigned Specialist</p>
                      <p className="font-bold text-slate-800 text-sm mt-0.5">{onboardingCase.assigned_staff_name || 'Unassigned'}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Academic Operations</p>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-blue-600 font-semibold text-[10px] uppercase">Checklist Progress</p>
                      <p className="font-bold text-slate-900 text-sm mt-0.5">
                        {Object.values(onboardingCase.checklist).filter((i) => i.completed).length} / {Object.values(onboardingCase.checklist).length} Steps
                      </p>
                      <p className="text-[10px] text-blue-700 mt-0.5">
                        {Math.round((Object.values(onboardingCase.checklist).filter((i) => i.completed).length / Math.max(1, Object.values(onboardingCase.checklist).length)) * 100)}% Completed
                      </p>
                    </div>
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                      <p className="text-indigo-600 font-semibold text-[10px] uppercase">Orientation Schedule</p>
                      <p className="font-bold text-slate-900 text-sm mt-0.5">
                        {onboardingCase.orientation_date ? formatDate(onboardingCase.orientation_date) : 'Pending Schedule'}
                      </p>
                      <p className="text-[10px] text-indigo-700 mt-0.5">Mode: {onboardingCase.orientation_mode || 'Hybrid'}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                      <p className="text-emerald-600 font-semibold text-[10px] uppercase">LMS & Handover</p>
                      <p className="font-bold text-slate-900 text-sm mt-0.5">
                        {onboardingCase.lms_account_created ? 'LMS Provisioned' : 'LMS Pending'}
                      </p>
                      <p className="text-[10px] text-emerald-700 mt-0.5">
                        {onboardingCase.academic_handover_confirmed ? 'Handover Complete' : 'Handover Pending'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 10-Point Checklist Card */}
              <Card>
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">10-Point Onboarding Verification Checklist</CardTitle>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Mandatory compliance and verification gates required before final academic handover.
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs bg-slate-50 font-semibold">
                      {Object.values(onboardingCase.checklist).filter((i) => i.completed).length} of {Object.values(onboardingCase.checklist).length} Completed
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    {Object.values(onboardingCase.checklist).map((item, idx) => (
                      <div key={item.key} className="p-4 flex items-start justify-between hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-start space-x-3">
                          <div
                            className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                              item.completed
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {item.completed ? '✓' : idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-slate-800 text-xs">{item.title}</span>
                              {item.mandatory && (
                                <span className="text-[9px] uppercase px-1.5 py-0.5 bg-slate-100 text-slate-600 font-bold rounded">
                                  Mandatory
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 text-[11px] mt-0.5">{item.description}</p>
                            {item.notes && (
                              <p className="text-blue-600 text-[11px] mt-1 bg-blue-50/60 p-1.5 rounded border border-blue-100">
                                Note: {item.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <Badge variant={item.completed ? 'success' : 'outline'} className="text-[10px]">
                            {item.completed ? 'Verified & Completed' : 'Pending'}
                          </Badge>
                          {item.completed && item.completed_at && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              {formatDateTime(item.completed_at)}
                              {item.completed_by_name ? ` • ${item.completed_by_name}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Uploaded Verification Documents Card */}
              <Card>
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Uploaded Verification Documents</CardTitle>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Government ID proof, degree certificates, and academic records attached to this case.
                      </p>
                    </div>
                    <Link href={`/onboarding?search=${encodeURIComponent(student.admission_number || onboardingCase.case_number)}`}>
                      <Button variant="outline" size="sm" className="text-xs">
                        Manage Documents
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {onboardingCase.documents && onboardingCase.documents.length > 0 ? (
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                        <tr>
                          <th className="px-4 py-3">Document Name</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Uploaded</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {onboardingCase.documents.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800">
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-blue-600" />
                                <span>{doc.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 capitalize text-slate-600">{doc.doc_type.replace('_', ' ')}</td>
                            <td className="px-4 py-3 text-slate-500">{formatDate(doc.uploaded_at)}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={
                                  doc.status === 'verified'
                                    ? 'success'
                                    : doc.status === 'rejected'
                                    ? 'destructive'
                                    : 'warning'
                                }
                                className="text-[10px] capitalize"
                              >
                                {doc.status}
                              </Badge>
                              {doc.rejection_reason && (
                                <p className="text-[10px] text-rose-600 mt-0.5">{doc.rejection_reason}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {doc.file_url ? (
                                <a
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  <span>View File</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-slate-400 italic">No link</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      <FileCheck className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="font-semibold text-slate-600">No verification documents attached yet</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Student identity documents can be uploaded in the Onboarding Workspace drawer.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Handover & Induction Snapshot */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Orientation & Student Induction Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Scheduled Date:</span>
                      <span className="font-semibold text-slate-800">
                        {onboardingCase.orientation_date ? formatDate(onboardingCase.orientation_date) : 'Not Scheduled'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Delivery Mode:</span>
                      <span className="font-semibold text-slate-800">{onboardingCase.orientation_mode || 'Hybrid'}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">LMS Account Provisioning:</span>
                      <Badge variant={onboardingCase.lms_account_created ? 'success' : 'warning'} className="text-[10px]">
                        {onboardingCase.lms_account_created ? 'Provisioned & Active' : 'Pending Activation'}
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">LMS Activated At:</span>
                      <span className="font-medium text-slate-700">
                        {onboardingCase.lms_account_activated_at ? formatDateTime(onboardingCase.lms_account_activated_at) : 'Pending'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-500">Portal Access Confirmed:</span>
                      <Badge variant={onboardingCase.portal_access_confirmed ? 'success' : 'outline'} className="text-[10px]">
                        {onboardingCase.portal_access_confirmed ? 'Confirmed' : 'Pending Verification'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Academic Operations Handover</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Academic Handover Status:</span>
                      <Badge variant={onboardingCase.academic_handover_confirmed ? 'success' : 'warning'} className="text-[10px]">
                        {onboardingCase.academic_handover_confirmed ? 'Handed Over' : 'Pending Handover'}
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Assigned Batch:</span>
                      <span className="font-semibold text-slate-800">{batch?.batch_name || onboardingCase.batch_name || 'SAP Morning Batch'}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Designated Faculty Lead:</span>
                      <span className="font-semibold text-slate-800">{batch?.trainer_name || onboardingCase.trainer_name || 'Lead Trainer'}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Workflow Completion Date:</span>
                      <span className="font-medium text-slate-700">
                        {onboardingCase.completed_at ? formatDateTime(onboardingCase.completed_at) : 'In Progress'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-500">Case Internal Notes:</span>
                      <span className="font-medium text-slate-600 truncate max-w-[200px]">
                        {onboardingCase.notes || 'No notes added'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
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
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Assigned Batch & Timetable</CardTitle>
              {canTransferBatch && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs flex items-center space-x-1"
                  onClick={() => {
                    setTransferError(null);
                    setTransferSuccess(null);
                    setTargetBatchId(availableBatches[0]?.id || '');
                    setTransferReason('');
                    setIsTransferModalOpen(true);
                  }}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>Transfer Batch Cohort</span>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {batch ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div>
                    <p className="text-slate-400 font-semibold text-[10px] uppercase">Batch Name</p>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{batch.batch_name}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold text-[10px] uppercase">Class Timings</p>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{batch.start_time} - {batch.end_time}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold text-[10px] uppercase">Days</p>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">
                      {Array.isArray(batch.days) ? batch.days.join(', ') : 'Flexible Schedule'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold text-[10px] uppercase">Batch Trainer</p>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{batch.trainer_name}</p>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400">
                  No active batch cohort assigned to this student.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Batch Transfer History Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Batch Transfer Audit History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Transfer Date</th>
                    <th className="px-4 py-3">From Batch</th>
                    <th className="px-4 py-3">To Batch</th>
                    <th className="px-4 py-3">Transfer Reason</th>
                    <th className="px-4 py-3">Transferred By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!transfers || transfers.length === 0) ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                        No batch transfers recorded. Student remains in initial cohort.
                      </td>
                    </tr>
                  ) : (
                    transfers.map((t: any) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{formatDateTime(t.transferred_at)}</td>
                        <td className="px-4 py-3 text-slate-600 font-medium">{t.from_batch_name}</td>
                        <td className="px-4 py-3 font-bold text-blue-600">{t.to_batch_name}</td>
                        <td className="px-4 py-3 text-slate-700">{t.reason}</td>
                        <td className="px-4 py-3 text-slate-500">{t.transferred_by}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
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
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      No attendance records logged for this student yet.
                    </td>
                  </tr>
                ) : (
                  attendance.map((att: any) => (
                    <tr key={att.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{formatDate(att.attendance_date)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={att.status === 'Present' ? 'success' : 'destructive'}>{att.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{att.marked_by_name || 'Faculty'}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(att.marked_at)}</td>
                    </tr>
                  ))
                )}
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
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No assignment submissions found for this student.
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub: any) => (
                    <tr key={sub.id}>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">{sub.submission_text}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(sub.submitted_at)}</td>
                      <td className="px-4 py-3"><Badge variant="success">{sub.status}</Badge></td>
                      <td className="px-4 py-3 font-bold text-slate-900">{sub.marks_obtained} / 100</td>
                      <td className="px-4 py-3 text-slate-600 italic">&ldquo;{sub.feedback}&rdquo;</td>
                    </tr>
                  ))
                )}
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
                {quizAttempts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No quiz or exam attempts recorded for this student.
                    </td>
                  </tr>
                ) : (
                  quizAttempts.map((qa: any) => (
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
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Tab 7: Payments */}
      {activeTab === 'payments' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Payment History</CardTitle>
            <div className="flex items-center space-x-2">
              {canRecordPayment && (
                <Button
                  variant="sap"
                  size="sm"
                  className="text-xs"
                  onClick={() => openRecordPaymentModal()}
                >
                  Record Payment
                </Button>
              )}
              <Link href={`/accounts/payments?studentId=${student.id}&feeAccountId=${feeAccount?.id || ''}&amount=${feeAccount?.outstanding_amount || 0}`}>
                <Button variant="outline" size="sm" className="text-xs">
                  Payment Desk &rarr;
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Receipt / Ref #</th>
                  <th className="px-4 py-3">Amount Paid</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Transaction Reference</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Recorded By</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(!studentPayments || studentPayments.length === 0) && (!payments || payments.length === 0) ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      No payment records found for this student.
                    </td>
                  </tr>
                ) : (
                  ((studentPayments && studentPayments.length > 0) ? studentPayments : payments).map((p: any) => {
                    const isVerified = p.verification_status === 'Verified' || p.status === 'Success';
                    const isRejected = p.verification_status === 'Rejected' || p.status === 'Failed';
                    const isPending = !isVerified && !isRejected;
                    return (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-semibold text-blue-600">
                          {isVerified ? (p.receipt_number || p.id) : (p.id || 'Pending Ref')}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600">
                          {formatINR(p.amount_paid ?? p.amount)}
                        </td>
                        <td className="px-4 py-3"><Badge variant="outline">{p.payment_mode}</Badge></td>
                        <td className="px-4 py-3 font-mono text-slate-600">
                          {p.transaction_reference || p.bank_upi_reference || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {isVerified ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              Verified
                            </Badge>
                          ) : isRejected ? (
                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                              Rejected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              Pending Approval
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {p.recorded_by_name || p.collected_by_name || 'Finance Staff'}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(p.payment_date)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/accounts/payments?search=${encodeURIComponent(student.student_code || student.id)}`}>
                            <Button variant="outline" size="sm" className="text-[11px] h-6 px-2">
                              Desk
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
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
            {receipts.length === 0 ? (
              <p className="py-6 text-center text-slate-400 text-xs">
                No official fee receipts found for this student.
              </p>
            ) : (
              receipts.map((r: any) => (
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
              ))
            )}
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
                  {formatINR(studentFees.filter((f: any) => f.approval_status === 'Approved').reduce((acc: number, f: any) => acc + (f.final_payable || 0), 0))}
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">{studentFees.length} Fee Category Plan(s)</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-emerald-500 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Verified Paid</p>
                <h4 className="text-xl font-bold text-emerald-700 mt-1">
                  {formatINR(studentFees.filter((f: any) => f.approval_status === 'Approved').reduce((acc: number, f: any) => acc + (f.paid_amount || 0), 0))}
                </h4>
                <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">Financially cleared</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outstanding Due</p>
                <h4 className="text-xl font-bold text-amber-700 mt-1">
                  {formatINR(studentFees.filter((f: any) => f.approval_status === 'Approved').reduce((acc: number, f: any) => acc + (f.outstanding_amount || 0), 0))}
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Remaining balance</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-indigo-500 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Clearance Standing</p>
                <h4 className="text-sm font-bold text-indigo-700 mt-1">
                  {studentFees.filter((f: any) => f.approval_status === 'Approved').reduce((acc: number, f: any) => acc + (f.outstanding_amount || 0), 0) === 0 && studentFees.length > 0 ? (
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
                    
                    <th className="px-4 py-3 text-right">Final Total</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    
                    <th className="px-4 py-3">Counsellor</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentFees.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
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
                        
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{formatINR(fee.final_payable)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{formatINR(fee.outstanding_amount)}</td>
                        
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
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Course Completion Certificate</CardTitle>
              {canIssueCertificate && !certificate && isCertEligible && (
                <Button
                  variant="sap"
                  size="sm"
                  className="text-xs"
                  onClick={handleIssueCertificate}
                  disabled={isIssuingCert}
                >
                  {isIssuingCert ? 'Issuing...' : 'Issue Graduation Certificate'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {certMsg && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
                    certMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {certMsg.type === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{certMsg.text}</span>
                </div>
              )}

              {certificate ? (
                <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <Award className="h-5 w-5 text-amber-600" />
                      <h4 className="font-bold text-slate-800 text-sm">{certificate.certificate_id}</h4>
                      <Badge variant="success" className="text-[10px]">Official Ledger Verified</Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Program: <span className="font-semibold text-slate-800">{certificate.course_name}</span> | Grade: <span className="font-bold text-amber-700">{certificate.grade}</span>
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Issued On: {formatDate(certificate.issue_date)} • Completion: {formatDate(certificate.completion_date || certificate.issue_date)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Link href={`/certificate/verify/${certificate.certificate_id}`} target="_blank">
                      <Button variant="sap" size="sm" className="text-xs">
                        Public Verification Page &rarr;
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Certificate Issuance Eligibility Matrix
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-[11px] text-slate-500 font-medium">1. Attendance Standard (≥ 80%)</p>
                          <p className="text-sm font-bold text-slate-800 mt-0.5">{student.attendance_percentage}%</p>
                        </div>
                        <Badge variant={student.attendance_percentage >= 80 ? 'success' : 'destructive'} className="text-[10px]">
                          {student.attendance_percentage >= 80 ? 'Requirement Met ✓' : 'Below 80%'}
                        </Badge>
                      </div>

                      <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-[11px] text-slate-500 font-medium">2. LMS Progress (≥ 80%)</p>
                          <p className="text-sm font-bold text-slate-800 mt-0.5">{student.course_progress}%</p>
                        </div>
                        <Badge variant={student.course_progress >= 80 ? 'success' : 'destructive'} className="text-[10px]">
                          {student.course_progress >= 80 ? 'Requirement Met ✓' : 'Below 80%'}
                        </Badge>
                      </div>

                      <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-[11px] text-slate-500 font-medium">3. Fee Balance (₹0 Remaining)</p>
                          <p className="text-sm font-bold text-slate-800 mt-0.5">{formatINR(student.outstanding_amount)}</p>
                        </div>
                        <Badge variant={(student.outstanding_amount || 0) <= 0 ? 'success' : 'destructive'} className="text-[10px]">
                          {(student.outstanding_amount || 0) <= 0 ? 'Financially Cleared ✓' : 'Fee Pending'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {!isCertEligible ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      <span>
                        Student does not yet meet all graduation criteria. All 3 thresholds (attendance &ge; 80%, syllabus &ge; 80%, and zero outstanding dues) must be satisfied.
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <span>All academic and financial eligibility criteria met! Student is eligible for certification.</span>
                      </div>
                      {canIssueCertificate && (
                        <Button
                          variant="sap"
                          size="sm"
                          className="text-xs"
                          onClick={handleIssueCertificate}
                          disabled={isIssuingCert}
                        >
                          {isIssuingCert ? 'Issuing...' : 'Issue Graduation Certificate'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 10: Placement */}
      {activeTab === 'placement' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Placement Profile & Interview Readiness</CardTitle>
              <Link href="/placement">
                <Button variant="outline" size="sm" className="text-xs">
                  Placement Workspace &rarr;
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <p className="text-slate-400 font-semibold text-[10px] uppercase">Placement Stage</p>
                  <Badge variant="default" className="mt-1">{placement?.placement_status || 'Not Started'}</Badge>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold text-[10px] uppercase">Resume Status</p>
                  <Badge variant={placement?.resume_status === 'Reviewed & Approved' ? 'success' : 'warning'} className="mt-1">
                    {placement?.resume_status || 'Pending'}
                  </Badge>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold text-[10px] uppercase">Tech Interview Score</p>
                  <p className="font-bold text-slate-800 text-sm mt-1">
                    {typeof placement?.technical_interview_score === 'number'
                      ? `${placement.technical_interview_score} / 100`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold text-[10px] uppercase">HR Interview Score</p>
                  <p className="font-bold text-slate-800 text-sm mt-1">
                    {typeof placement?.hr_interview_score === 'number'
                      ? `${placement.hr_interview_score} / 100`
                      : '—'}
                  </p>
                </div>
              </div>

              {placement?.skills && placement.skills.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Verified Core Competencies & Skills:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {placement.skills.map((skill: string, idx: number) => (
                      <span key={idx} className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] px-2 py-0.5 rounded-md font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Job Applications Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Applied Placement Opportunities</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Applied Date</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Job Role</th>
                    <th className="px-4 py-3">Application Status</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!jobApplications || jobApplications.length === 0) ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                        No job applications submitted yet.
                      </td>
                    </tr>
                  ) : (
                    jobApplications.map((app: any) => (
                      <tr key={app.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500">{formatDate(app.applied_at)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{app.company_name || 'SAP Partner Corp'}</td>
                        <td className="px-4 py-3 text-slate-700">{app.job_title || 'SAP Consultant'}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              app.status === 'Selected'
                                ? 'success'
                                : app.status === 'Rejected'
                                ? 'destructive'
                                : app.status === 'Interview Scheduled'
                                ? 'info'
                                : 'default'
                            }
                            className="text-[10px]"
                          >
                            {app.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{app.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 11: Documents */}
      {activeTab === 'documents' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Submitted Student Documents & Verification</CardTitle>
            {onboardingCase && (
              <Link href={`/onboarding?search=${encodeURIComponent(student.admission_number || onboardingCase.case_number)}`}>
                <Button variant="outline" size="sm" className="text-xs">
                  Manage in Onboarding Workspace &rarr;
                </Button>
              </Link>
            )}
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            {onboardingCase && onboardingCase.documents && onboardingCase.documents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {onboardingCase.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between shadow-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-800 text-xs">{doc.name}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{doc.doc_type.replace('_', ' ')}</p>
                      {doc.uploaded_at && (
                        <p className="text-[10px] text-slate-400">
                          Uploaded: {formatDate(doc.uploaded_at)}
                        </p>
                      )}
                      {doc.verified_by && (
                        <p className="text-[10px] text-emerald-700">
                          Verified by {doc.verified_by}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      <Badge
                        variant={
                          doc.status === 'verified'
                            ? 'success'
                            : doc.status === 'rejected'
                            ? 'destructive'
                            : 'warning'
                        }
                        className="text-[10px] capitalize"
                      >
                        {doc.status}
                      </Badge>
                      {doc.file_url && (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-blue-600 hover:underline flex items-center space-x-0.5"
                        >
                          <span>View Doc</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="max-w-md mx-auto">
                  <h4 className="font-semibold text-slate-700 text-sm">No Documents Uploaded Yet</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Identity proofs (Aadhaar/Passport), graduation certificates, and work experience documents have not been attached to this student record.
                  </p>
                </div>
                <div className="pt-2">
                  <Link href={onboardingCase ? `/onboarding?search=${encodeURIComponent(student.admission_number || onboardingCase.case_number)}` : '/onboarding'}>
                    <Button variant="sap" size="sm" className="text-xs">
                      Open Onboarding Upload Desk
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 12: Activity */}
      {activeTab === 'activity' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student Timeline & Audit Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            {activityTimeline.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                No activity records found for this student.
              </div>
            ) : (
              activityTimeline.map((evt) => (
                <div key={evt.id} className="border-l-2 border-[#0A6ED1] pl-3 py-1 space-y-0.5">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <span className="font-bold text-slate-800 text-xs">{evt.title}</span>
                    <Badge variant={evt.badgeVariant} className="text-[10px]">
                      {evt.badge}
                    </Badge>
                  </div>
                  <p className="text-slate-600 text-xs">{evt.description}</p>
                  <p className="text-slate-400 text-[10px]">{formatDateTime(evt.date)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal: Quick Record Fee Payment */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Record Student Fee Payment"
        description={`Student: ${student.full_name} (ID: ${student.student_code || student.id}) | Enrollment: ${student.admission_id || student.admission_number || 'N/A'}`}
      >
        <form onSubmit={handleRecordPaymentSubmit} className="space-y-4 text-xs">
          {payError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{payError}</span>
            </div>
          )}
          {paySuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>{paySuccessMsg}</span>
            </div>
          )}

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-[11px]">
            <div>
              <span className="text-slate-500">Student ID: </span>
              <span className="font-mono font-bold text-slate-800">{student.student_code || student.id}</span>
            </div>
            <div>
              <span className="text-slate-500">Enrollment ID: </span>
              <span className="font-mono font-bold text-slate-800">{student.admission_id || student.admission_number || 'N/A'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Fee Category / Plan</label>
              <select
                value={payFeeId}
                onChange={(e) => setPayFeeId(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              >
                {studentFees.length > 0 ? (
                  studentFees.map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.fee_category} - {formatINR(f.final_payable)} (Due: {formatINR(f.outstanding_amount)})
                    </option>
                  ))
                ) : (
                  <option value={feeAccount ? `fee-${feeAccount.id}` : 'default-fee'}>
                    Tuition Fee - {formatINR(feeAccount?.net_payable || 45000)} (Due: {formatINR(feeAccount?.outstanding_amount || 45000)})
                  </option>
                )}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Payment Amount (₹) <span className="text-amber-600 font-normal">(Outstanding: {formatINR(student.outstanding_amount)})</span>
              </label>
              <Input
                type="number"
                min="1"
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                placeholder="Enter amount"
                className="text-xs"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Payment Mode</label>
              <select
                value={payMode}
                onChange={(e) => setPayMode(e.target.value as PaymentMethod)}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              >
                <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                <option value="Net Banking">Net Banking / NEFT / RTGS / IMPS</option>
                <option value="Card">Debit / Credit Card</option>
                <option value="Cash">Cash at Counter</option>
                <option value="Bank Transfer">Direct Bank Transfer</option>
                <option value="Cheque">Cheque / Demand Draft</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Payment Date</label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="text-xs"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Transaction Ref / UTR / Cheque #</label>
              <Input
                type="text"
                value={payTxnRef}
                onChange={(e) => setPayTxnRef(e.target.value)}
                placeholder="e.g. UTR192837482"
                className="text-xs"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Bank / UPI App Reference</label>
              <Input
                type="text"
                value={payBankUpiRef}
                onChange={(e) => setPayBankUpiRef(e.target.value)}
                placeholder="e.g. HDFC Bank UPI"
                className="text-xs"
              />
            </div>
          </div>

          <FileUpload
            bucket="payment-proofs"
            label="Payment Proof (Bank / UPI Slip or Counter Voucher) *"
            value={payProofUrl}
            onChange={setPayProofUrl}
            onUploadingChange={setPayProofUploading}
          />

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Internal Notes / Remarks</label>
            <Input
              type="text"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="e.g. Initial payment collected at front desk"
              className="text-xs"
            />
          </div>

          {role === 'counsellor' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] space-y-1">
              <p className="font-semibold">⚠️ Counsellor Submission Policy:</p>
              <p>
                This payment will be saved with status <strong>Pending Approval</strong> and forwarded to the Accounts Team at <strong>/accounts/approvals</strong>. Official receipt generation, fee ledger clearance, and onboarding progression occur upon Accounts verification.
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setIsPaymentModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sap"
              size="sm"
              className="text-xs"
              disabled={payLoading || payProofUploading || (!payProofUrl && payMode !== 'Cash')}
            >
              {payLoading ? 'Submitting...' : role === 'counsellor' ? 'Submit Payment for Approval' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Transfer Student Batch Cohort */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title="Transfer Student Batch Cohort"
        description={`Student: ${student.full_name} | Current Batch: ${batch?.batch_name || 'Unassigned'}`}
      >
        <form onSubmit={handleBatchTransferSubmit} className="space-y-4 text-xs">
          {transferError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{transferError}</span>
            </div>
          )}
          {transferSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>{transferSuccess}</span>
            </div>
          )}

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Select Target Batch</label>
            {availableBatches.length === 0 ? (
              <p className="text-amber-600 text-xs py-2">
                No alternative active batches found for course &quot;{course?.course_name}&quot;. Create an additional batch before transferring.
              </p>
            ) : (
              <select
                value={targetBatchId}
                onChange={(e) => setTargetBatchId(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                required
              >
                {availableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_name} ({b.start_time} - {b.end_time} | Trainer: {b.trainer_name} | Seats: {b.current_enrolled}/{b.maximum_capacity || 30})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Transfer Reason / Academic Justification *</label>
            <textarea
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="e.g. Student requested weekend cohort due to weekday employment shift"
              rows={3}
              className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              required
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-[11px]">
            <p className="font-semibold">Audit Notice:</p>
            <p className="mt-0.5">
              This action transfers the student immediately, updates current enrolled seats in both batches, and registers an immutable entry into the Batch Transfer Audit log.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setIsTransferModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sap"
              size="sm"
              className="text-xs"
              disabled={transferLoading || availableBatches.length === 0}
            >
              {transferLoading ? 'Transferring...' : 'Confirm Cohort Transfer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
