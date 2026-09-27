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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { updateVideoProgress, getStudentCourseProgress } from '@/lib/services/academics-service';
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

          <Card className="p-4 border-l-4 border-l-amber-500">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Outstanding Fee Due</p>
            <h3 className="text-xl font-bold text-amber-700 mt-1">{formatINR(student.outstanding_amount)}</h3>
            <p className="text-[11px] text-slate-500 font-medium">Paid: {formatINR(student.paid_amount)}</p>
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
                {payments.map((p) => {
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
      </main>
    </div>
  );
}
