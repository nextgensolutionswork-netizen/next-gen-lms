'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  MapPin,
  Plus,
  ExternalLink,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Filter,
  UserCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { ClassSession } from '@/types';
import {
  createClassSession,
  updateClassSession,
  deleteClassSession,
} from '@/lib/services/academics-service';
import { canAccessBatch } from '@/lib/auth/rbac';
import { formatDate } from '@/lib/utils/formatters';

export default function SchedulePage() {
  const { user, role, hasPermission } = useAuth();
  const [sessions, setSessions] = React.useState<ClassSession[]>(store.classSessions);
  const [view, setView] = React.useState<'day' | 'week' | 'month' | 'all'>('month');
  const [selectedBatchFilter, setSelectedBatchFilter] = React.useState<string>('all');
  const [selectedReferenceDate, setSelectedReferenceDate] = React.useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const thisMonthPrefix = today.slice(0, 7);
    const hasThisMonth = store.classSessions.some((s) => s.session_date.startsWith(thisMonthPrefix));
    if (hasThisMonth) return today;
    if (store.classSessions.length > 0) {
      return store.classSessions[0].session_date;
    }
    return today;
  });

  const isStudent = role === 'student';
  const isTrainer = role === 'trainer';
  const canSchedule = hasPermission('schedule:write') || role === 'trainer' || role === 'admin' || role === 'super_admin';

  // Identify current student profile
  const currentStudent = React.useMemo(() => {
    if (!isStudent) return null;
    return store.students.find((s) => s.user_id === user?.id || s.email === user?.email) || null;
  }, [isStudent, user]);

  // Batches accessible to the current user for scheduling and filtering
  const accessibleBatches = React.useMemo(() => {
    if (isTrainer) {
      return store.batches.filter((b) => canAccessBatch(user, b.id) || b.trainer_id === user?.id);
    }
    return store.batches;
  }, [isTrainer, user]);

  // Filter sessions by user role and selected batch
  const userScopedSessions = React.useMemo(() => {
    let scoped = sessions;
    if (isStudent) {
      if (!currentStudent || !currentStudent.batch_id) return [];
      scoped = sessions.filter((s) => s.batch_id === currentStudent.batch_id);
    } else if (isTrainer) {
      scoped = sessions.filter((s) => canAccessBatch(user, s.batch_id) || s.trainer_id === user?.id);
    }

    if (selectedBatchFilter !== 'all') {
      scoped = scoped.filter((s) => s.batch_id === selectedBatchFilter);
    }
    return scoped;
  }, [sessions, isStudent, isTrainer, currentStudent, user, selectedBatchFilter]);

  // Timezone-safe date utility helpers
  const parseYMD = React.useCallback((dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return { year: y, month: m, day: d };
  }, []);

  const formatYMD = React.useCallback((dateObj: Date): string => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Compute active date range human-readable label
  const currentRangeLabel = React.useMemo(() => {
    if (view === 'all') {
      return 'All Scheduled Timetables';
    }

    const { year, month, day } = parseYMD(selectedReferenceDate);
    const refDate = new Date(year, month - 1, day, 12, 0, 0);

    if (view === 'day') {
      return refDate.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }

    if (view === 'week') {
      const dayOfWeek = refDate.getDay();
      const diffToMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(refDate);
      monday.setDate(refDate.getDate() - diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const monStr = monday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const sunStr = sunday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${monStr} – ${sunStr}`;
    }

    // Default month
    return refDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, [view, selectedReferenceDate, parseYMD]);

  // Date navigation handlers
  const handlePrevDate = () => {
    const { year, month, day } = parseYMD(selectedReferenceDate);
    const d = new Date(year, month - 1, day, 12, 0, 0);
    if (view === 'day') {
      d.setDate(d.getDate() - 1);
    } else if (view === 'week') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    setSelectedReferenceDate(formatYMD(d));
  };

  const handleNextDate = () => {
    const { year, month, day } = parseYMD(selectedReferenceDate);
    const d = new Date(year, month - 1, day, 12, 0, 0);
    if (view === 'day') {
      d.setDate(d.getDate() + 1);
    } else if (view === 'week') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    setSelectedReferenceDate(formatYMD(d));
  };

  const handleToday = () => {
    setSelectedReferenceDate(formatYMD(new Date()));
  };

  // Apply Day / Week / Month / All View Filter and sort chronologically
  const filteredSessions = React.useMemo(() => {
    const { year, month, day } = parseYMD(selectedReferenceDate);
    const refDate = new Date(year, month - 1, day, 12, 0, 0);

    let list: ClassSession[] = [];

    if (view === 'all') {
      list = [...userScopedSessions];
    } else if (view === 'day') {
      list = userScopedSessions.filter((s) => s.session_date === selectedReferenceDate);
    } else if (view === 'week') {
      const dayOfWeek = refDate.getDay();
      const diffToMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(refDate);
      monday.setDate(refDate.getDate() - diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const mondayStr = formatYMD(monday);
      const sundayStr = formatYMD(sunday);

      list = userScopedSessions.filter(
        (s) => s.session_date >= mondayStr && s.session_date <= sundayStr
      );
    } else {
      // Month view
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
      list = userScopedSessions.filter((s) => s.session_date.startsWith(monthPrefix));
    }

    return list.slice().sort((a, b) => {
      const cmp = a.session_date.localeCompare(b.session_date);
      if (cmp !== 0) return cmp;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });
  }, [userScopedSessions, view, selectedReferenceDate, parseYMD, formatYMD]);

  // Modals state
  const [isAddModal, setIsAddModal] = React.useState(false);
  const [isEditModal, setIsEditModal] = React.useState(false);
  const [activeSession, setActiveSession] = React.useState<ClassSession | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Session form state
  const [batchId, setBatchId] = React.useState(accessibleBatches[0]?.id || store.batches[0]?.id || '');
  const [topic, setTopic] = React.useState('');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = React.useState('08:00');
  const [endTime, setEndTime] = React.useState('10:00');
  const [mode, setMode] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [provider, setProvider] = React.useState<'Zoom' | 'Google Meet' | 'Manual'>('Zoom');
  const [meetingId, setMeetingId] = React.useState('');
  const [meetingLink, setMeetingLink] = React.useState('');
  const [classroom, setClassroom] = React.useState('Lab 2 (SAP Enterprise Server Lab)');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  // Synchronize batch selection with accessible batches
  React.useEffect(() => {
    if (accessibleBatches.length > 0 && !accessibleBatches.some((b) => b.id === batchId)) {
      setBatchId(accessibleBatches[0].id);
    }
  }, [accessibleBatches, batchId]);

  // Edit Session form state
  const [editTopic, setEditTopic] = React.useState('');
  const [editDate, setEditDate] = React.useState('');
  const [editStartTime, setEditStartTime] = React.useState('');
  const [editEndTime, setEditEndTime] = React.useState('');
  const [editMode, setEditMode] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [editClassroom, setEditClassroom] = React.useState('');
  const [editMeetingLink, setEditMeetingLink] = React.useState('');
  const [editStatus, setEditStatus] = React.useState<'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled'>('Scheduled');

  const refreshList = () => {
    setSessions([...store.classSessions]);
  };

  const handleGenerateConference = async (chosenProvider: 'Zoom' | 'Google Meet') => {
    if (!topic.trim()) {
      setValidationError('Please enter a session topic first before generating conference details.');
      return;
    }
    setValidationError(null);
    setIsGenerating(true);
    try {
      const res = await fetch('/api/conference/create-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          sessionDate: date,
          startTime,
          endTime,
          provider: chosenProvider,
        }),
      });
      const data = await res.json();
      if (data.success && data.meeting) {
        setMeetingLink(data.meeting.meetingLink);
        setMeetingId(data.meeting.meetingId);
      }
    } catch (err) {
      console.error('Failed to generate conference link:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !canSchedule) return;
    const batch = store.batches.find((b) => b.id === batchId);
    if (!batch) {
      setValidationError('Please select a valid batch.');
      return;
    }
    if (isTrainer && !accessibleBatches.some((b) => b.id === batchId)) {
      setValidationError('Unauthorized: Trainers may only schedule sessions for their assigned batches.');
      return;
    }
    try {
      const courseId = batch.course_id || (store.courses.length > 0 ? store.courses[0].id : '');
      const trainerId =
        batch.trainer_id ||
        (user?.role === 'trainer' ? user.id : undefined) ||
        store.users.find((u) => u.role === 'trainer')?.id ||
        user?.id ||
        '';

      await createClassSession({
        course_id: courseId,
        batch_id: batchId,
        trainer_id: trainerId,
        topic: topic.trim(),
        session_date: date,
        start_time: startTime,
        end_time: endTime,
        mode,
        meeting_link: meetingLink.trim() || undefined,
        meeting_id: meetingId.trim() || undefined,
        meeting_provider: provider === 'Manual' ? undefined : provider,
        classroom: classroom.trim() || undefined,
        status: 'Scheduled',
      });
      setIsAddModal(false);
      setTopic('');
      setMeetingLink('');
      setMeetingId('');
      setValidationError(null);
      setStatusMessage({ type: 'success', text: `Session "${topic}" scheduled successfully.` });
      refreshList();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to schedule session');
    }
  };

  const openEditSession = (sess: ClassSession) => {
    setActiveSession(sess);
    setEditTopic(sess.topic);
    setEditDate(sess.session_date);
    setEditStartTime(sess.start_time);
    setEditEndTime(sess.end_time);
    setEditMode(sess.mode);
    setEditClassroom(sess.classroom || '');
    setEditMeetingLink(sess.meeting_link || '');
    setEditStatus(sess.status as any);
    setIsEditModal(true);
  };

  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    try {
      await updateClassSession(activeSession.id, {
        topic: editTopic.trim(),
        session_date: editDate,
        start_time: editStartTime,
        end_time: editEndTime,
        mode: editMode,
        classroom: editClassroom.trim() || undefined,
        meeting_link: editMeetingLink.trim() || undefined,
        status: editStatus,
      });
      setIsEditModal(false);
      setStatusMessage({ type: 'success', text: `Session "${editTopic}" updated.` });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to update session' });
    }
  };

  const handleDeleteSession = async (sess: ClassSession) => {
    if (!window.confirm(`Are you sure you want to delete session "${sess.topic}" on ${sess.session_date}?`)) {
      return;
    }
    try {
      await deleteClassSession(sess.id);
      setStatusMessage({ type: 'success', text: `Session "${sess.topic}" deleted.` });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete session' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isStudent ? 'My Class Timetable' : 'Class Schedule & Timetable'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isStudent
              ? 'View scheduled lecture times, lab sessions, and 1-click live conference join links.'
              : 'Lecture sessions, live video classroom links, lab room allocations, and faculty timetables.'}
          </p>
        </div>
        {canSchedule && (
          <Button
            variant="sap"
            size="sm"
            onClick={() => {
              setDate(selectedReferenceDate);
              setIsAddModal(true);
            }}
            className="text-xs flex items-center space-x-1"
          >
            <Plus className="h-4 w-4" />
            <span>Schedule Session</span>
          </Button>
        )}
      </div>

      {/* Timetable Navigation & View Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        {/* Date Stepper Controls */}
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrevDate}
            className="h-8 px-2.5 text-xs text-slate-700 hover:text-slate-900"
            title={`Previous ${view}`}
          >
            <ChevronLeft className="h-4 w-4 mr-0.5" />
            <span>Prev</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="h-8 px-3 text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNextDate}
            className="h-8 px-2.5 text-xs text-slate-700 hover:text-slate-900"
            title={`Next ${view}`}
          >
            <span>Next</span>
            <ChevronRight className="h-4 w-4 ml-0.5" />
          </Button>
          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
          <span className="text-xs font-bold text-slate-800 ml-1">
            {currentRangeLabel}
          </span>
        </div>

        {/* View Switcher and Direct Date Jump */}
        <div className="flex flex-wrap items-center gap-2.5 max-w-full">
          <Badge variant="secondary" className="text-xs">
            {filteredSessions.length} {filteredSessions.length === 1 ? 'session' : 'sessions'}
          </Badge>

          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView('day')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                view === 'day'
                  ? 'bg-white text-[#0A6ED1] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setView('week')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                view === 'week'
                  ? 'bg-white text-[#0A6ED1] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setView('month')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                view === 'month'
                  ? 'bg-white text-[#0A6ED1] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setView('all')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                view === 'all'
                  ? 'bg-white text-[#0A6ED1] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
          </div>

          <select
            value={selectedBatchFilter}
            onChange={(e) => setSelectedBatchFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-medium"
            title="Filter by Batch"
          >
            <option value="all">All Batches</option>
            {accessibleBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batch_name}
              </option>
            ))}
          </select>

          {view !== 'all' && (
            <input
              type="date"
              value={selectedReferenceDate}
              onChange={(e) => setSelectedReferenceDate(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-medium"
              title="Jump to date"
            />
          )}
        </div>
      </div>

      {isTrainer && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center space-x-2">
          <Filter className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            <strong>Trainer Scope:</strong> Viewing classes assigned to your faculty profile.
          </span>
        </div>
      )}

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 max-w-full">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600 text-xs ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Student Profile Unassigned Notices */}
      {isStudent && !currentStudent && (
        <Card className="p-8 text-center border-dashed border-amber-200 bg-amber-50/50">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
          <h3 className="font-semibold text-slate-800 text-sm">Student Enrollment Profile Not Linked</h3>
          <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
            No enrolled student profile is associated with your account ({user?.email}). Please contact your academic advisor or institute administrator.
          </p>
        </Card>
      )}

      {isStudent && currentStudent && !currentStudent.batch_id && (
        <Card className="p-8 text-center border-dashed border-blue-200 bg-blue-50/50">
          <CalendarIcon className="h-10 w-10 text-blue-500 mx-auto mb-2" />
          <h3 className="font-semibold text-slate-800 text-sm">Cohort Assignment Pending</h3>
          <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
            You are currently not enrolled in an active class batch. Once your batch is scheduled, your daily lecture timetable will display here automatically.
          </p>
        </Card>
      )}

      {/* Sessions Grid */}
      {filteredSessions.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <CalendarIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-700 text-sm">No sessions scheduled for this {view}</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {isStudent
              ? 'You have no classes scheduled during this time window.'
              : 'Schedule lecture sessions or lab workshops for your batches.'}
          </p>
          {canSchedule && (
            <Button
              variant="sap"
              size="sm"
              onClick={() => {
                setDate(selectedReferenceDate);
                setIsAddModal(true);
              }}
              className="mt-4 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Schedule Session
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map((sess) => (
            <Card key={sess.id} className="hover:border-[#0A6ED1] transition-all flex flex-col justify-between">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="outline" className="text-[10px] mb-1">{sess.mode}</Badge>
                    <h3 className="font-bold text-slate-900 text-sm">{sess.topic}</h3>
                    <p className="text-xs text-[#0A6ED1] font-semibold mt-0.5">{sess.batch_name}</p>
                  </div>
                  <Badge
                    variant={
                      sess.status === 'Completed'
                        ? 'success'
                        : sess.status === 'Cancelled'
                        ? 'destructive'
                        : sess.status === 'In Progress'
                        ? 'warning'
                        : 'secondary'
                    }
                  >
                    {sess.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="flex items-center space-x-1.5">
                    <CalendarIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{formatDate(sess.session_date)}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{sess.start_time} - {sess.end_time}</span>
                  </div>
                </div>

                <div className="flex flex-col space-y-1.5 text-xs text-slate-600">
                  {sess.classroom && (
                    <div className="flex items-center space-x-1.5 text-slate-700">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Location: {sess.classroom}</span>
                    </div>
                  )}
                  {sess.meeting_link && (
                    <div className="flex items-center justify-between bg-blue-50/70 p-2 rounded-lg border border-blue-100 text-slate-700">
                      <div className="flex items-center space-x-1.5 truncate pr-2">
                        <Video className="h-3.5 w-3.5 text-[#0A6ED1] shrink-0" />
                        <span className="font-semibold text-[11px] text-slate-900">
                          {sess.meeting_provider || (sess.meeting_link.includes('zoom') ? 'Zoom Live' : 'Google Meet')}
                        </span>
                        {sess.meeting_id && (
                          <span className="text-[10px] font-mono text-slate-500">({sess.meeting_id})</span>
                        )}
                      </div>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded shrink-0">
                        Webhook Auto-Tracked
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500">Trainer: <strong>{sess.trainer_name}</strong></span>
                    {canSchedule && (() => {
                      const sessionAtt = store.attendanceRecords.filter(
                        (a) => a.session_id === sess.id || (a.batch_id === sess.batch_id && a.attendance_date === sess.session_date)
                      );
                      const present = sessionAtt.filter((a) => a.status === 'Present').length;
                      const total = sessionAtt.length;
                      const rate = total > 0 ? Math.round((present / total) * 100) : null;
                      return rate !== null ? (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${rate >= 75 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                          Attendance: {present}/{total} ({rate}%)
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic bg-slate-100 px-2 py-0.5 rounded">
                          Attendance: Not Marked
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {canSchedule && (
                      <Link
                        href={`/academics/attendance?batch=${sess.batch_id}&date=${sess.session_date}`}
                        className="inline-flex items-center space-x-1 text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-2 py-1 rounded text-xs transition-colors"
                        title="Open Attendance Register for this session"
                      >
                        <UserCheck className="h-3 w-3" />
                        <span>Register</span>
                      </Link>
                    )}

                    {sess.meeting_link && (
                      <a href={sess.meeting_link} target="_blank" rel="noreferrer">
                        <Button variant="sap" size="sm" className="text-xs px-2.5 py-1 flex items-center space-x-1 h-7">
                          <span>Join Live</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    )}

                    {canSchedule && (
                      <div className="flex flex-wrap items-center gap-1 max-w-full">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditSession(sess)}
                          className="text-xs h-7 text-slate-600 hover:text-slate-900"
                        >
                          <Edit3 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteSession(sess)}
                          className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Schedule Session Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Schedule Class Session"
        description="Add a live session or lab workshop to the timetable."
      >
        <form onSubmit={handleCreateSession} className="space-y-4 text-xs">
          {validationError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
              {validationError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Batch *
            </label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
            >
              {accessibleBatches.length === 0 ? (
                <option value="" disabled>No batches available for scheduling</option>
              ) : (
                accessibleBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_name} ({b.batch_code})
                  </option>
                ))
              )}
            </select>
          </div>

          <Input
            label="Class Topic / Agenda *"
            placeholder="e.g. Asset Accounting & Depreciation Run Configuration"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Date *"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <Input
              label="Start Time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <Input
              label="End Time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Class Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Hybrid">Hybrid</option>
                <option value="Online">Online Live</option>
                <option value="Classroom">Classroom Lab</option>
              </select>
            </div>
            <Input
              label="Lab / Room"
              placeholder="e.g. Lab 2"
              value={classroom}
              onChange={(e) => setClassroom(e.target.value)}
            />
          </div>

          {/* Automated Conference Integration Options */}
          {(mode === 'Online' || mode === 'Hybrid') && (
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
                  <Video className="h-3.5 w-3.5 text-[#0A6ED1]" />
                  <span>Automated Conference Integration</span>
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100 font-bold px-2 py-0.5 rounded-full">
                  Webhook Auto-Sync
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProvider('Zoom');
                    handleGenerateConference('Zoom');
                  }}
                  disabled={isGenerating}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    provider === 'Zoom'
                      ? 'bg-white border-[#0A6ED1] shadow-xs font-bold text-[#0A6ED1]'
                      : 'bg-white/50 border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                >
                  Zoom
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProvider('Google Meet');
                    handleGenerateConference('Google Meet');
                  }}
                  disabled={isGenerating}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    provider === 'Google Meet'
                      ? 'bg-white border-emerald-600 shadow-xs font-bold text-emerald-700'
                      : 'bg-white/50 border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                >
                  Google Meet
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('Manual')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    provider === 'Manual'
                      ? 'bg-white border-slate-700 shadow-xs font-bold text-slate-800'
                      : 'bg-white/50 border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                >
                  Manual URL
                </button>
              </div>

              <Input
                label="Conference Join URL"
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Schedule Session
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Session Modal */}
      <Modal
        isOpen={isEditModal}
        onClose={() => setIsEditModal(false)}
        title={`Edit Session: ${activeSession?.topic || ''}`}
        description="Update class schedule, meeting URL, room, and status."
      >
        <form onSubmit={handleUpdateSession} className="space-y-4 text-xs">
          <Input
            label="Class Topic / Agenda *"
            value={editTopic}
            onChange={(e) => setEditTopic(e.target.value)}
            required
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Date *"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              required
            />
            <Input
              label="Start Time"
              type="time"
              value={editStartTime}
              onChange={(e) => setEditStartTime(e.target.value)}
            />
            <Input
              label="End Time"
              type="time"
              value={editEndTime}
              onChange={(e) => setEditEndTime(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Class Mode
              </label>
              <select
                value={editMode}
                onChange={(e) => setEditMode(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Hybrid">Hybrid</option>
                <option value="Online">Online Live</option>
                <option value="Classroom">Classroom Lab</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Status
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Scheduled">Scheduled</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Lab / Room"
              value={editClassroom}
              onChange={(e) => setEditClassroom(e.target.value)}
            />
            <Input
              label="Conference Join URL"
              value={editMeetingLink}
              onChange={(e) => setEditMeetingLink(e.target.value)}
            />
          </div>

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
    </div>
  );
}
