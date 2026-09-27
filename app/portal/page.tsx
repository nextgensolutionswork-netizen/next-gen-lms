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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { store } from '@/lib/services/data-store';
import { updateVideoProgress, getStudentCourseProgress } from '@/lib/services/academics-service';
import { getAllocationForStudent, generateSapGuiShortcutContent } from '@/lib/services/sap-lab-service';
import { recordPaymentAtomic } from '@/lib/services/finance-service';
import { formatINR, formatDate, formatDateTime } from '@/lib/utils/formatters';

export default function StudentPortalPage() {
  const student = store.students[0]; // Active student Amit Gupta
  const course = store.courses.find((c) => c.id === student.course_id);
  const modules = store.modules.filter((m) => m.course_id === student.course_id);
  const lessons = store.lessons.filter((l) => l.course_id === student.course_id && l.is_published);
  const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id);
  const payments = store.payments.filter((p) => p.student_id === student.id);
  const assignments = store.assignments.filter((a) => a.course_id === student.course_id);
  const submissions = store.submissions.filter((s) => s.student_id === student.id);
  const certificate = store.certificates.find((c) => c.student_id === student.id);
  const sessions = store.classSessions.filter((cs) => cs.course_id === student.course_id);

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

  const handleOnlinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeAccount || payAmount <= 0) return;
    setIsProcessing(true);
    try {
      const txRef = `UPI-ONLINE-${Date.now().toString().slice(-6)}`;
      const result = await recordPaymentAtomic(
        {
          student_id: student.id,
          course_id: student.course_id,
          fee_account_id: feeAccount.id,
          amount: Math.min(payAmount, outstandingAmount),
          payment_date: new Date().toISOString().slice(0, 10),
          payment_mode: payMode === 'Card' ? 'Card' : payMode === 'Net Banking' ? 'Bank Transfer' : 'UPI',
          transaction_reference: txRef,
          notes: `Online installment collection via student portal (${payMode})`,
        },
        'usr-student-01'
      );
      setOutstandingAmount(result.updatedFeeAccount.outstanding_amount);
      setPaidAmount(result.updatedFeeAccount.paid_amount);
      setPaymentsList([...store.payments.filter((p) => p.student_id === student.id)]);
      setSuccessReceipt(result.receipt);
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
            <Link href="/dashboard" className="text-slate-400 hover:text-white mr-2">
              <ArrowLeft className="h-4 w-4" />
            </Link>
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
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="text-xs bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700">
                Staff Admin Panel
              </Button>
            </Link>
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

          <Card className="p-4 border-l-4 border-l-purple-600">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Placement Status</p>
            <h3 className="text-xl font-bold text-purple-900 mt-1">{student.placement_status}</h3>
            <p className="text-[11px] text-purple-600 font-medium">Mock Interview Cleared</p>
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
                      <Link href={`/accounts/receipts/${r?.id || p.id}`}>
                        <Button variant="outline" size="sm" className="text-xs px-2.5 py-1">
                          Download PDF
                        </Button>
                      </Link>
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
            <Link href={`/certificate/verify/${certificate.certificate_id}`} target="_blank">
              <Button variant="sap" size="sm" className="text-xs">
                View & Verify Certificate
              </Button>
            </Link>
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

              <div className="flex justify-center space-x-3 pt-2">
                <Link href={`/accounts/receipts/${successReceipt.id}`} target="_blank">
                  <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1">
                    <Download className="h-3.5 w-3.5" />
                    <span>View / Print Official Receipt</span>
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
      </main>
    </div>
  );
}
