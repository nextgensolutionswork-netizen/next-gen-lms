'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  PlayCircle,
  CheckCircle,
  Clock,
  Calendar,
  CreditCard,
  Award,
  Briefcase,
  FileText,
  User,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Volume2,
  Video,
  Server,
  Key,
  Copy,
  Check,
  Download,
  QrCode,
  CheckCircle2,
  Building,
  ShieldCheck,
  HelpCircle,
  MessageSquare,
  Send,
  PlusCircle,
  ChevronDown,
  LogOut,
  Paperclip,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { FileUpload } from '@/components/ui/file-upload';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { updateVideoProgress, getStudentCourseProgress } from '@/lib/services/academics-service';
import { getAllocationForStudent, generateSapGuiShortcutContent } from '@/lib/services/sap-lab-service';
import { recordPaymentAtomic } from '@/lib/services/finance-service';
import { getDoubts, createStudentDoubt, replyToDoubt } from '@/lib/services/doubt-service';
import { uploadStudentResume } from '@/lib/services/placement-service';
import { useRealtime } from '@/lib/hooks/use-realtime';
import { StudentDoubt, DoubtCategory, DoubtPriority } from '@/types';
import { formatINR, formatDate, formatDateTime } from '@/lib/utils/formatters';

export default function StudentPortalPage() {
  const { user, logout } = useAuth();
  const student =
    (user &&
      store.students.find(
        (s) =>
          s.email?.toLowerCase() === user.email?.toLowerCase() ||
          s.id === user.id ||
          s.user_id === user.id
      )) ||
    store.students[0];
  const course = store.courses.find((c) => c.id === student.course_id);
  const modules = store.modules.filter((m) => m.course_id === student.course_id);
  const lessons = store.lessons.filter((l) => l.course_id === student.course_id && l.is_published);
  const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id);
  const payments = store.payments.filter((p) => p.student_id === student.id);
  const assignments = store.assignments.filter((a) => a.course_id === student.course_id);
  const submissions = store.submissions.filter((s) => s.student_id === student.id);
  const certificate = store.certificates.find((c) => c.student_id === student.id);
  const sessions = store.classSessions.filter((cs) => cs.course_id === student.course_id);
  const placementProfile = store.placementProfiles.find((p) => p.student_id === student.id);
  const [studentResumeUrl, setStudentResumeUrl] = React.useState<string>(
    placementProfile?.resume_url || (student as any).resume_url || ''
  );
  const [isResumeModalOpen, setIsResumeModalOpen] = React.useState(false);

  // Active Lesson for Video Player
  const [activeLesson, setActiveLesson] = React.useState(lessons[0]);
  const [videoPosition, setVideoPosition] = React.useState(0);
  const [videoDuration, setVideoDuration] = React.useState(2700); // 45 mins
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [courseProgress, setCourseProgress] = React.useState(student.course_progress);
  const [paymentsList, setPaymentsList] = React.useState(store.payments.filter((p) => p.student_id === student.id));
  const [outstandingAmount, setOutstandingAmount] = React.useState(student.outstanding_amount);
  const [paidAmount, setPaidAmount] = React.useState(student.paid_amount);
  const [isPayModalOpen, setIsPayModalOpen] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState(10000);
  const [payMode, setPayMode] = React.useState<'UPI' | 'Card' | 'Net Banking'>('UPI');
  const [upiId, setUpiId] = React.useState('amit.gupta@okaxis');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [successReceipt, setSuccessReceipt] = React.useState<any>(null);

  // Student Doubts & Academic Support
  const [doubtsList, setDoubtsList] = React.useState<StudentDoubt[]>([]);
  const [expandedDoubtId, setExpandedDoubtId] = React.useState<string | null>('dbt-01');
  const [isAskModalOpen, setIsAskModalOpen] = React.useState(false);
  const [doubtTitle, setDoubtTitle] = React.useState('');
  const [doubtCategory, setDoubtCategory] = React.useState<DoubtCategory>('SAP Configuration');
  const [doubtPriority, setDoubtPriority] = React.useState<DoubtPriority>('Medium');
  const [doubtSapTcode, setDoubtSapTcode] = React.useState('');
  const [doubtDescription, setDoubtDescription] = React.useState('');
  const [doubtAttachmentUrl, setDoubtAttachmentUrl] = React.useState('');
  const [isSubmittingDoubt, setIsSubmittingDoubt] = React.useState(false);
  const [replyText, setReplyText] = React.useState('');
  const [replyAttachmentUrl, setReplyAttachmentUrl] = React.useState('');
  const [isReplying, setIsReplying] = React.useState(false);

  const fetchStudentDoubts = async () => {
    const list = await getDoubts({ student_id: student.id });
    setDoubtsList(list);
    if (!expandedDoubtId && list.length > 0) {
      setExpandedDoubtId(list[0].id);
    }
  };

  React.useEffect(() => {
    fetchStudentDoubts();
  }, [student.id]);

  // Realtime Live Stream for Student Helpdesk
  const { isConnected: isRealtimeConnected } = useRealtime({
    topics: ['doubts', `doubt:${expandedDoubtId || ''}`, `notifications:${student.user_id || student.id}`],
    onEvent: (event) => {
      if (event.event === 'doubt_reply') {
        const { doubtId, message, status } = event.payload;
        setDoubtsList((prevList) =>
          prevList.map((d) =>
            d.id === doubtId
              ? {
                  ...d,
                  status: status || d.status,
                  messages: d.messages.some((m) => m.id === message.id)
                    ? d.messages
                    : [...d.messages, message],
                }
              : d
          )
        );
      } else if (event.event === 'doubt_resolved') {
        const { doubtId } = event.payload;
        setDoubtsList((prevList) =>
          prevList.map((d) => (d.id === doubtId ? { ...d, status: 'Resolved' } : d))
        );
      }
    },
  });

  const handleAskDoubtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doubtTitle.trim() || !doubtDescription.trim()) return;
    setIsSubmittingDoubt(true);
    try {
      const created = await createStudentDoubt(
        {
          student_id: student.id,
          title: doubtTitle.trim(),
          description: doubtDescription.trim(),
          category: doubtCategory,
          priority: doubtPriority,
          sap_tcode: doubtSapTcode.trim() ? doubtSapTcode.trim() : undefined,
          attachment_url: doubtAttachmentUrl || undefined,
        },
        student.user_id
      );
      setDoubtTitle('');
      setDoubtDescription('');
      setDoubtSapTcode('');
      setDoubtAttachmentUrl('');
      setIsAskModalOpen(false);
      await fetchStudentDoubts();
      setExpandedDoubtId(created.id);
    } catch (err: any) {
      alert(err.message || 'Error submitting doubt ticket');
    } finally {
      setIsSubmittingDoubt(false);
    }
  };

  const handleSendStudentReply = async (doubtId: string) => {
    if (!replyText.trim() && !replyAttachmentUrl) return;
    setIsReplying(true);
    try {
      await replyToDoubt(
        doubtId,
        replyText.trim() || 'Attachment shared:',
        student.user_id,
        'student',
        student.full_name,
        replyAttachmentUrl || undefined
      );
      setReplyText('');
      setReplyAttachmentUrl('');
      await fetchStudentDoubts();
    } catch (err: any) {
      alert(err.message || 'Error posting reply');
    } finally {
      setIsReplying(false);
    }
  };

  const handleOnlinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeAccount || payAmount <= 0) return;
    setIsProcessing(true);
    try {
      const chargeAmount = Math.min(payAmount, outstandingAmount);

      // 1. Create order on Gateway
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: chargeAmount,
          currency: 'INR',
          student_id: student.id,
          course_id: student.course_id,
          fee_account_id: feeAccount.id,
          student_name: student.full_name,
          student_email: student.email,
          notes: {
            pay_mode: payMode,
            source: 'student_portal',
          },
        }),
      });

      const orderData = await orderRes.json();
      if (!orderData.success) {
        throw new Error(orderData.error || 'Failed to initialize payment gateway order');
      }

      // 2. Verify payment & record settlement
      const txRef = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const verifyRes = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderData.order.order_id,
          payment_id: txRef,
          signature: 'test_signature',
          student_id: student.id,
          course_id: student.course_id,
          fee_account_id: feeAccount.id,
          amount: chargeAmount,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        throw new Error(verifyData.error || 'Payment signature verification failed');
      }

      setOutstandingAmount(verifyData.feeAccount.outstanding_amount);
      setPaidAmount(verifyData.feeAccount.paid_amount);
      setPaymentsList([...store.payments.filter((p) => p.student_id === student.id)]);
      setSuccessReceipt(verifyData.receipt);
    } catch (err: any) {
      alert(err.message || 'Payment processing error');
    } finally {
      setIsProcessing(false);
    }
  };

  const sapAllocation = store.sapAllocations.find((a) => a.student_id === student.id && a.status === 'Active');
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadShortcut = () => {
    if (!sapAllocation) return;
    const content = generateSapGuiShortcutContent(sapAllocation);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sapAllocation.sid}_${sapAllocation.sap_user_id}.sap`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLessonSelect = (les: any) => {
    setActiveLesson(les);
    const existingProgress = store.lessonProgress.find(
      (lp) => lp.student_id === student.id && lp.lesson_id === les.id
    );
    setVideoPosition(existingProgress?.last_watched_seconds || 0);
  };

  const handleSimulateWatch = async () => {
    // Advance progress by 25%
    const nextPos = Math.min(videoDuration, videoPosition + Math.round(videoDuration * 0.25));
    setVideoPosition(nextPos);
    await updateVideoProgress(student.id, activeLesson.id, student.course_id, nextPos, videoDuration);
    const updated = await getStudentCourseProgress(student.id, student.course_id);
    setCourseProgress(updated.overallProgress);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      {/* Student Portal Navigation Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {user?.role && user.role !== 'student' && (
              <Link href="/dashboard" className="text-slate-400 hover:text-white mr-2" title="Return to Admin Panel">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            )}
            <div className="h-9 w-9 rounded-lg bg-[#0A6ED1] flex items-center justify-center font-bold text-white text-base shadow">
              SAP
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white leading-tight">Student Learning Portal</h1>
              <p className="text-[10px] text-blue-300">Next-Gen ERP Solutions</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <span className="hidden sm:inline-block text-slate-300">
              Welcome back, <strong className="text-white">{student.full_name}</strong> ({student.student_code})
            </span>
            {user?.role && user.role !== 'student' && (
              <Link href="/dashboard">
                <Button variant="outline" size="sm" className="text-xs bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700">
                  Staff Admin Panel
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => logout()}
              className="text-xs bg-slate-800 text-red-300 border-slate-700 hover:bg-red-950/60 hover:text-red-200 hover:border-red-800 flex items-center space-x-1.5"
              title="Sign out of student account"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Student Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Welcome Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-950 text-white p-6 md:p-8 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
                Active Enrolled Program
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold mt-1">{course?.course_name}</h2>
              <p className="text-xs text-slate-300 mt-1">Batch: {student.batch_name} | Faculty: {student.trainer_name}</p>
            </div>

            <div className="flex items-center space-x-4 bg-white/10 p-4 rounded-xl border border-white/15">
              <div>
                <p className="text-[10px] uppercase font-bold text-blue-200">Overall Course Progress</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-3xl font-black text-white">{courseProgress}%</span>
                  <span className="text-xs text-emerald-300 font-semibold">On Track</span>
                </div>
                <div className="w-36 bg-white/20 h-2 rounded-full overflow-hidden mt-1.5">
                  <div className="bg-[#10B981] h-full transition-all duration-300" style={{ width: `${courseProgress}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 border-l-4 border-l-blue-600">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Class Attendance</p>
            <h3 className="text-xl font-bold text-slate-800 mt-1">{student.attendance_percentage}%</h3>
            <p className="text-[11px] text-emerald-600 font-medium">Benchmark: 80%</p>
          </Card>

          <Card className="p-4 border-l-4 border-l-emerald-600">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Assignments Graded</p>
            <h3 className="text-xl font-bold text-slate-800 mt-1">{submissions.length} / {assignments.length}</h3>
            <p className="text-[11px] text-slate-500 font-medium">Avg Score: 95/100</p>
          </Card>

          <Card className="p-4 border-l-4 border-l-amber-500 flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Outstanding Fee Due</p>
              <h3 className="text-xl font-bold text-amber-700 mt-1">{formatINR(outstandingAmount)}</h3>
              <p className="text-[11px] text-slate-500 font-medium">Paid: {formatINR(paidAmount)}</p>
            </div>
            {outstandingAmount > 0 && (
              <Button
                variant="sap"
                size="sm"
                onClick={() => {
                  setSuccessReceipt(null);
                  setIsPayModalOpen(true);
                }}
                className="mt-2 text-[11px] py-1 h-7 bg-amber-600 hover:bg-amber-700 w-full"
              >
                Pay Online (UPI / Card)
              </Button>
            )}
          </Card>

          <Card className="p-4 border-l-4 border-l-purple-600 flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Placement & Career</p>
              <h3 className="text-xl font-bold text-purple-900 mt-1">{student.placement_status}</h3>
              <p className="text-[11px] text-purple-600 font-medium">
                Resume: {placementProfile?.resume_status || 'Pending Upload'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsResumeModalOpen(true)}
              className="mt-2 text-[11px] py-1 h-7 border-purple-200 text-purple-700 hover:bg-purple-50 w-full flex items-center justify-center space-x-1"
            >
              <FileText className="h-3 w-3" />
              <span>Manage Resume</span>
            </Button>
          </Card>
        </div>

        {/* LMS Interactive Video Player & Lesson Curriculum Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Player Column */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="overflow-hidden shadow-md border-slate-200">
              {/* Fake Video Player Canvas */}
              <div className="bg-black aspect-video relative flex flex-col justify-between p-4 text-white">
                <div className="flex items-center justify-between text-xs bg-black/60 p-2 rounded backdrop-blur-xs">
                  <div className="flex items-center space-x-2">
                    <Video className="h-4 w-4 text-blue-400" />
                    <span className="font-semibold truncate max-w-sm">{activeLesson?.title}</span>
                  </div>
                  <span className="text-[10px] bg-red-600 px-2 py-0.5 rounded font-bold">SECURE STREAM</span>
                </div>

                <div className="flex items-center justify-center my-auto">
                  <PlayCircle className="h-16 w-16 text-white/80 hover:text-white cursor-pointer transition-all hover:scale-105" />
                </div>

                {/* Video Controls Bar */}
                <div className="bg-black/80 p-3 rounded-lg backdrop-blur-xs space-y-2">
                  {/* Scrubber */}
                  <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0A6ED1] h-full"
                      style={{ width: `${Math.round((videoPosition / videoDuration) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>
                      {Math.floor(videoPosition / 60)}:
                      {String(videoPosition % 60).padStart(2, '0')} / {Math.floor(videoDuration / 60)}:00
                    </span>
                    <Button
                      variant="sap"
                      size="sm"
                      onClick={handleSimulateWatch}
                      className="text-[11px] py-1 px-3 h-7 bg-blue-600 hover:bg-blue-700"
                    >
                      Simulate Progress (+25%)
                    </Button>
                  </div>
                </div>
              </div>

              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{activeLesson?.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Duration: {activeLesson?.duration_minutes} Minutes | Module: Enterprise Structure
                    </p>
                  </div>
                  <Badge variant="success">Published</Badge>
                </div>
                {activeLesson?.text_content && (
                  <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-700 leading-relaxed border border-slate-100">
                    <p className="font-bold text-slate-800 mb-1">Lesson Brief:</p>
                    {activeLesson.text_content}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Course Playlist / Curriculum Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Course Syllabus & Lessons</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
                {lessons.map((les, idx) => {
                  const prog = store.lessonProgress.find(
                    (lp) => lp.student_id === student.id && lp.lesson_id === les.id
                  );
                  const isCompleted = prog?.is_completed;
                  const isSelected = activeLesson?.id === les.id;

                  return (
                    <div
                      key={les.id}
                      onClick={() => handleLessonSelect(les)}
                      className={`cursor-pointer p-3 rounded-xl border transition-all text-xs flex items-center justify-between ${
                        isSelected
                          ? 'bg-blue-50 border-[#0A6ED1] shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 overflow-hidden">
                        {isCompleted ? (
                          <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        ) : (
                          <PlayCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                        )}
                        <div className="truncate">
                          <p className={`font-semibold truncate ${isSelected ? 'text-[#0A6ED1]' : 'text-slate-800'}`}>
                            {les.title}
                          </p>
                          <p className="text-[10px] text-slate-400">{les.duration_minutes} mins</p>
                        </div>
                      </div>
                      {isCompleted && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Done
                        </span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Classes & Assignments Two-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Today's & Upcoming Classes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Scheduled Live Classes & Labs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 text-xs">
                {sessions.map((sess) => (
                  <div key={sess.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <h4 className="font-bold text-slate-800">{sess.topic}</h4>
                      <p className="text-slate-500 mt-0.5">
                        {formatDate(sess.session_date)} ({sess.start_time} - {sess.end_time})
                      </p>
                      <p className="text-[11px] text-blue-600 font-medium mt-0.5">Faculty: {sess.trainer_name}</p>
                    </div>
                    {sess.meeting_link && (
                      <a href={sess.meeting_link} target="_blank" rel="noreferrer">
                        <Button variant="sap" size="sm" className="text-xs px-2.5 py-1">
                          Join Live
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Payments & Receipts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">My Fee Receipts</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 text-xs">
                {paymentsList.map((p) => {
                  const r = store.receipts.find((rec) => rec.payment_id === p.id);
                  return (
                    <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <p className="font-bold text-blue-600">{p.receipt_number}</p>
                        <p className="text-slate-500 mt-0.5">Date: {formatDate(p.payment_date)} | Mode: {p.payment_mode}</p>
                        <p className="font-bold text-emerald-600 mt-0.5">{formatINR(p.amount)}</p>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <a
                          href={`/api/receipts/${r?.id || p.id}/pdf?download=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="sap" size="sm" className="text-xs px-2.5 py-1 flex items-center space-x-1 shadow-xs">
                            <Download className="h-3 w-3" />
                            <span>Download PDF</span>
                          </Button>
                        </a>
                        <Link href={`/accounts/receipts/${r?.id || p.id}`}>
                          <Button variant="outline" size="sm" className="text-xs px-2 py-1">
                            View
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* SAP GUI Practice Sandbox Access */}
        {sapAllocation && (
          <Card className="border-2 border-[#0A6ED1]/40 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center">
                    <Server className="h-5 w-5 text-blue-300" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>My Dedicated SAP GUI Sandbox Lab</span>
                      <span className="text-[10px] bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-semibold">
                        ACTIVE
                      </span>
                    </CardTitle>
                    <p className="text-[11px] text-blue-200 mt-0.5">{sapAllocation.system_name}</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadShortcut}
                  className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs flex items-center space-x-1.5 self-start sm:self-auto"
                >
                  <Download className="h-3.5 w-3.5 text-blue-300" />
                  <span>Download .sap GUI Shortcut</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Server Host / SID</p>
                  <p className="font-mono font-bold text-slate-800 text-sm mt-0.5">{sapAllocation.sid}</p>
                  <p className="font-mono text-[10px] text-slate-500 truncate">{sapAllocation.server_host}</p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Client / Instance</p>
                  <p className="font-mono font-bold text-slate-800 text-sm mt-0.5">Client {sapAllocation.client_number}</p>
                  <p className="text-[10px] text-slate-500">Instance: {sapAllocation.instance_number}</p>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-[10px] uppercase font-bold text-blue-600">SAP User ID</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono font-bold text-blue-900 text-sm">{sapAllocation.sap_user_id}</span>
                    <button
                      onClick={() => handleCopy(sapAllocation.sap_user_id, 'portal-usr')}
                      className="text-blue-500 hover:text-blue-700 p-1"
                      title="Copy User ID"
                    >
                      {copiedKey === 'portal-usr' ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-[10px] uppercase font-bold text-blue-600">SAP Password</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono font-bold text-blue-900 text-sm">{sapAllocation.sap_password}</span>
                    <button
                      onClick={() => handleCopy(sapAllocation.sap_password, 'portal-pwd')}
                      className="text-blue-500 hover:text-blue-700 p-1"
                      title="Copy Password"
                    >
                      {copiedKey === 'portal-pwd' ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 text-slate-500 text-[11px]">
                <span>
                  Access Window: <strong className="text-slate-700">{formatDate(sapAllocation.valid_from)}</strong> &rarr;{' '}
                  <strong className="text-slate-700">{formatDate(sapAllocation.valid_to)}</strong>
                </span>
                <span className="text-blue-600">
                  Tip: Download the <strong>.sap</strong> shortcut to log in directly via SAP GUI for Windows.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Academic Doubts & 1-on-1 Support Desk */}
        <Card className="border border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="h-9 w-9 rounded-lg bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center space-x-2">
                    <span>My Academic Doubts & Mentor Helpdesk</span>
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 px-2 py-0.5 rounded-full font-semibold">
                      Student Direct Support
                    </span>
                  </CardTitle>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Ask questions directly to your assigned faculty and SAP support mentors
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 self-start sm:self-auto">
                <div
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                    isRealtimeConnected
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isRealtimeConnected ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  <span>{isRealtimeConnected ? 'Live Realtime' : 'Connecting...'}</span>
                </div>

                <Button
                  variant="sap"
                  size="sm"
                  onClick={() => setIsAskModalOpen(true)}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs flex items-center space-x-1.5 shadow"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>Ask a Doubt</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {doubtsList.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                <HelpCircle className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No doubt tickets submitted yet</p>
                <p className="text-slate-400 mt-1">
                  Encountering an issue in SAP GUI, transaction configuration, or lecture concepts?
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAskModalOpen(true)}
                  className="mt-3 text-xs"
                >
                  Create Your First Doubt Ticket
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Tickets list */}
                <div className="space-y-3">
                  {doubtsList.map((d) => {
                    const isExpanded = expandedDoubtId === d.id;
                    return (
                      <div
                        key={d.id}
                        className={`border rounded-xl transition-all ${
                          isExpanded ? 'border-cyan-300 bg-cyan-50/20 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {/* Header bar */}
                        <div
                          onClick={() => setExpandedDoubtId(isExpanded ? null : d.id)}
                          className="p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-700">{d.ticket_number}</span>
                              <Badge
                                variant={
                                  d.status === 'Resolved'
                                    ? 'success'
                                    : d.status === 'In Progress'
                                    ? 'info'
                                    : d.status === 'Assigned'
                                    ? 'warning'
                                    : 'secondary'
                                }
                              >
                                {d.status}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] text-slate-600">
                                {d.category}
                              </Badge>
                              {d.sap_tcode && (
                                <span className="font-mono text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded">
                                  T-Code: {d.sap_tcode}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  d.priority === 'Urgent'
                                    ? 'bg-rose-100 text-rose-800'
                                    : d.priority === 'High'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {d.priority} Priority
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 leading-snug">{d.title}</h4>
                            <p className="text-[11px] text-slate-500">
                              Assigned Mentor: <strong className="text-slate-700">{d.assigned_to_name || 'SAP Support Desk'}</strong> · Created {formatDateTime(d.created_at)}
                            </p>
                          </div>

                          <div className="flex items-center space-x-3 text-xs text-slate-500 self-end sm:self-center">
                            <span className="flex items-center space-x-1">
                              <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                              <span>{d.messages.length} replies</span>
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </div>
                        </div>

                        {/* Thread Expanded View */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 bg-white p-4 rounded-b-xl space-y-4">
                            {/* Messages */}
                            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                              {d.messages.map((m) => {
                                const isFromStudent = m.sender_role === 'student';
                                return (
                                  <div
                                    key={m.id}
                                    className={`flex flex-col ${isFromStudent ? 'items-end' : 'items-start'}`}
                                  >
                                    <div
                                      className={`max-w-[85%] rounded-2xl p-3 text-xs space-y-1 shadow-2xs ${
                                        isFromStudent
                                          ? 'bg-blue-600 text-white rounded-br-xs'
                                          : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-xs'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-4 text-[10px] opacity-80">
                                        <span className="font-semibold">{m.sender_name}</span>
                                        <span>{formatDateTime(m.created_at)}</span>
                                      </div>
                                      <p className="leading-relaxed whitespace-pre-wrap">{m.message}</p>
                                      {m.attachment_url && (
                                        <div className={`mt-2 pt-2 border-t ${isFromStudent ? 'border-white/20' : 'border-slate-200'}`}>
                                          <a
                                            href={m.attachment_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block group overflow-hidden rounded-lg border border-slate-200/50 bg-black/10 hover:bg-black/20 transition-all p-1"
                                          >
                                            {m.attachment_url.match(/\.(jpeg|jpg|png|webp|gif)($|\?)/i) ||
                                            m.attachment_url.startsWith('data:image/') ||
                                            m.attachment_url.includes('screenshots') ? (
                                              <img
                                                src={m.attachment_url}
                                                alt="Attached Screenshot"
                                                className="max-h-48 rounded object-contain mx-auto"
                                              />
                                            ) : (
                                              <div className="flex items-center space-x-1.5 text-[11px] p-1 font-medium">
                                                <Paperclip className="h-3.5 w-3.5" />
                                                <span>View Attached File</span>
                                                <ExternalLink className="h-3 w-3" />
                                              </div>
                                            )}
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Reply Input Form */}
                            {d.status !== 'Resolved' && d.status !== 'Closed' ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleSendStudentReply(d.id);
                                }}
                                className="space-y-2 pt-2 border-t border-slate-100"
                              >
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Type your follow-up reply or query..."
                                    className="flex-1 text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                                  />
                                  <Button
                                    type="submit"
                                    variant="sap"
                                    size="sm"
                                    disabled={isReplying || (!replyText.trim() && !replyAttachmentUrl)}
                                    className="text-xs px-3 h-8 flex items-center space-x-1"
                                  >
                                    <Send className="h-3 w-3" />
                                    <span>{isReplying ? 'Sending...' : 'Reply'}</span>
                                  </Button>
                                </div>
                                <div className="flex items-center justify-between">
                                  <FileUpload
                                    bucket="screenshots"
                                    compact
                                    value={replyAttachmentUrl}
                                    onChange={(url) => setReplyAttachmentUrl(url)}
                                    onRemove={() => setReplyAttachmentUrl('')}
                                  />
                                  <span className="text-[10px] text-slate-400">
                                    Attach SAP error screenshot (PNG, JPG, max 10MB)
                                  </span>
                                </div>
                              </form>
                            ) : (
                              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                                <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                                <span>This doubt has been marked as <strong>Resolved</strong> by the mentor. If you have a new question, please open a new ticket.</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Certificate Banner if Issued */}
        {certificate && (
          <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Graduation Certificate Available!</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Your official SAP certificate <strong className="font-mono">{certificate.certificate_id}</strong> is issued and verified.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <a
                href={`/api/certificates/${certificate.certificate_id}/pdf?download=true`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1 shadow-xs">
                  <Download className="h-3.5 w-3.5" />
                  <span>Download PDF Certificate</span>
                </Button>
              </a>
              <Link href={`/certificate/verify/${certificate.certificate_id}`} target="_blank">
                <Button variant="outline" size="sm" className="text-xs bg-white text-slate-800 hover:bg-slate-50">
                  View & Verify
                </Button>
              </Link>
            </div>
          </div>
        )}
        {/* Online Payment Modal */}
        <Modal
          isOpen={isPayModalOpen}
          onClose={() => setIsPayModalOpen(false)}
          title="Student Fee Self-Service Payment"
          description="Pay your tuition installment online via UPI, Credit/Debit Card, or Net Banking."
        >
          {successReceipt ? (
            <div className="space-y-4 text-xs text-center py-4">
              <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Payment Successfully Processed!</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Your tuition installment has been recorded and credited to your ledger.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left space-y-1.5 max-w-sm mx-auto">
                <div className="flex justify-between">
                  <span className="text-slate-500">Official Receipt #:</span>
                  <span className="font-mono font-bold text-blue-600">{successReceipt.receipt_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount Paid:</span>
                  <span className="font-bold text-emerald-600">{formatINR(successReceipt.payment_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Remaining Balance:</span>
                  <span className="font-bold text-amber-700">{formatINR(successReceipt.remaining_balance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Transaction Ref:</span>
                  <span className="font-mono text-slate-700">{successReceipt.transaction_reference}</span>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <a
                  href={`/api/receipts/${successReceipt.id}/pdf?download=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1 shadow-xs">
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Official PDF</span>
                  </Button>
                </a>
                <Link href={`/accounts/receipts/${successReceipt.id}`} target="_blank">
                  <Button variant="outline" size="sm" className="text-xs">
                    View Receipt
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={() => setIsPayModalOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleOnlinePayment} className="space-y-4 text-xs">
              {/* Outstanding Summary */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-blue-600 uppercase font-bold">Total Remaining Balance</p>
                  <p className="text-base font-extrabold text-slate-900">{formatINR(outstandingAmount)}</p>
                </div>
                <span className="text-xs bg-white text-blue-800 px-2 py-1 rounded font-semibold border border-blue-200">
                  {student.admission_number}
                </span>
              </div>

              {/* Amount Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Payment Amount (₹) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(Math.min(outstandingAmount, Math.max(100, Number(e.target.value))))}
                    min={100}
                    max={outstandingAmount}
                    className="w-full text-sm font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-[#0A6ED1]"
                    required
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {[5000, 10000, outstandingAmount].map((amt) => (
                    <button
                      type="button"
                      key={amt}
                      onClick={() => setPayAmount(amt)}
                      className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
                    >
                      {amt === outstandingAmount ? `Full Balance (${formatINR(amt)})` : formatINR(amt)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Mode Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Select Payment Method *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['UPI', 'Card', 'Net Banking'] as const).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      onClick={() => setPayMode(mode)}
                      className={`p-2.5 rounded-lg border text-center transition-all ${
                        payMode === mode
                          ? 'border-[#0A6ED1] bg-blue-50 text-[#0A6ED1] font-bold shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional Mode Inputs */}
              {payMode === 'UPI' && (
                <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center space-x-2">
                    <QrCode className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-slate-800">Instant UPI Checkout</span>
                  </div>
                  <Input
                    label="Enter VPA / UPI ID"
                    placeholder="student@okaxis / phone@upi"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    required
                  />
                  <p className="text-[10px] text-slate-400">
                    Supports Google Pay, PhonePe, Paytm, BHIM, and Cred UPI.
                  </p>
                </div>
              )}

              {payMode === 'Card' && (
                <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <Input label="Card Number" placeholder="4111 2222 3333 4444" defaultValue="4111 •••• •••• 4242" required />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Expiry Date" placeholder="MM/YY" defaultValue="12/28" required />
                    <Input label="CVV" placeholder="123" defaultValue="888" type="password" required />
                  </div>
                </div>
              )}

              {payMode === 'Net Banking' && (
                <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="block text-[11px] font-semibold text-slate-600">Popular Banks</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank'].map((bank, idx) => (
                      <label key={bank} className="flex items-center space-x-2 p-2 rounded border border-slate-200 bg-white cursor-pointer">
                        <input type="radio" name="bank" defaultChecked={idx === 0} />
                        <span className="text-slate-700">{bank}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                <span className="flex items-center space-x-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>256-Bit SSL Encrypted</span>
                </span>
                <div className="flex space-x-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsPayModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="sap" size="sm" disabled={isProcessing}>
                    {isProcessing ? 'Processing Payment...' : `Pay ${formatINR(payAmount)}`}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </Modal>

        {/* Manage Resume Modal */}
        <Modal
          isOpen={isResumeModalOpen}
          onClose={() => setIsResumeModalOpen(false)}
          title="Student Placement Resume / CV"
          description="Upload your updated resume for corporate interview drives and employer vetting."
        >
          <div className="space-y-4 text-xs">
            <FileUpload
              bucket="resumes"
              entityId={student.id}
              value={studentResumeUrl}
              onChange={async (url) => {
                setStudentResumeUrl(url);
                await uploadStudentResume(student.id, url, student.user_id);
              }}
              onRemove={async () => {
                setStudentResumeUrl('');
                await uploadStudentResume(student.id, '', student.user_id);
              }}
              label="Official Student Resume (PDF or DOCX)"
              description="Your resume is automatically reviewed by Sunita Reddy (Placement Head) for corporate referrals."
            />

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1 text-purple-900">
              <p className="font-semibold text-xs">Placement Status: {student.placement_status}</p>
              <p className="text-[11px] text-purple-700">Preferred Locations: Bengaluru, Hyderabad, Pune, Mumbai</p>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button type="button" variant="sap" size="sm" onClick={() => setIsResumeModalOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>

        {/* Ask a Doubt Modal */}
        <Modal
          isOpen={isAskModalOpen}
          onClose={() => setIsAskModalOpen(false)}
          title="Submit Academic or Technical Doubt"
          description="Your ticket will be assigned directly to our SAP faculty and support mentors."
        >
          <form onSubmit={handleAskDoubtSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Doubt Title / Subject *
              </label>
              <input
                type="text"
                value={doubtTitle}
                onChange={(e) => setDoubtTitle(e.target.value)}
                placeholder="e.g. Error in T-Code FB50 during GL Posting"
                required
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-[#0A6ED1]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Category *
                </label>
                <select
                  value={doubtCategory}
                  onChange={(e) => setDoubtCategory(e.target.value as DoubtCategory)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 focus:ring-2 focus:ring-[#0A6ED1]"
                >
                  <option value="SAP Configuration">SAP Configuration</option>
                  <option value="Academic Concept">Academic Concept</option>
                  <option value="Lab / Server Error">Lab / Server Error</option>
                  <option value="Assignment Doubt">Assignment Doubt</option>
                  <option value="General Query">General Query</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  SAP T-Code (Optional)
                </label>
                <input
                  type="text"
                  value={doubtSapTcode}
                  onChange={(e) => setDoubtSapTcode(e.target.value.toUpperCase())}
                  placeholder="e.g. FB50, MIRO, OX02"
                  className="w-full text-xs font-mono uppercase bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-[#0A6ED1]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Priority *
                </label>
                <select
                  value={doubtPriority}
                  onChange={(e) => setDoubtPriority(e.target.value as DoubtPriority)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 focus:ring-2 focus:ring-[#0A6ED1]"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Detailed Description & Error Message *
              </label>
              <textarea
                value={doubtDescription}
                onChange={(e) => setDoubtDescription(e.target.value)}
                rows={4}
                placeholder="Describe what steps you performed, the exact error number (e.g. F5151), and what expected result you are trying to achieve..."
                required
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-3 text-slate-900 focus:ring-2 focus:ring-[#0A6ED1]"
              />
            </div>

            <div>
              <FileUpload
                bucket="screenshots"
                entityId={student.id}
                value={doubtAttachmentUrl}
                onChange={(url) => setDoubtAttachmentUrl(url)}
                onRemove={() => setDoubtAttachmentUrl('')}
                label="Error Screenshot / Attachment (Optional)"
                description="Upload screenshot of your SAP GUI screen, error dialog, or log (PNG, JPG, max 10MB)"
              />
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-[11px] text-blue-900">
              <span>Program: <strong>{course?.course_name}</strong></span>
              <span>Mentor Lead: <strong>Ananya Deshmukh (Support)</strong></span>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAskModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm" disabled={isSubmittingDoubt}>
                {isSubmittingDoubt ? 'Submitting...' : 'Submit Doubt Ticket'}
              </Button>
            </div>
          </form>
        </Modal>
      </main>
    </div>
  );
}
