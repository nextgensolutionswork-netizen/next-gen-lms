'use client';

import * as React from 'react';
import {
  HelpCircle,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  MessageSquare,
  Send,
  User,
  AlertCircle,
  Tag,
  Check,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Paperclip,
  ExternalLink,
  ImageIcon,
  BookOpen,
  Sparkles,
  GraduationCap,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FileUpload } from '@/components/ui/file-upload';
import { store } from '@/lib/services/data-store';
import { useRealtime } from '@/lib/hooks/use-realtime';
import {
  getDoubts,
  replyToDoubt,
  resolveDoubt,
  assignDoubt,
} from '@/lib/services/doubt-service';
import { StudentDoubt, DoubtStatus, DoubtPriority, DoubtCategory } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';
import { useAuth } from '@/components/providers/auth-provider';

export default function SupportDeskPage() {
  const { user, role, hasPermission } = useAuth();
  const [doubts, setDoubts] = React.useState<StudentDoubt[]>(store.doubts || []);
  const [selectedDoubt, setSelectedDoubt] = React.useState<StudentDoubt | null>((store.doubts && store.doubts[0]) || null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('All');
  const [assignedFilter, setAssignedFilter] = React.useState<'All' | 'Mine' | 'Unassigned'>('All');
  const [batchFilter, setBatchFilter] = React.useState<string>(role === 'trainer' ? 'My Batches' : 'All');
  const [replyText, setReplyText] = React.useState('');
  const [replyAttachmentUrl, setReplyAttachmentUrl] = React.useState('');
  const [isResolving, setIsResolving] = React.useState(false);
  const [resolutionNotes, setResolutionNotes] = React.useState('');
  const [isSubmittingReply, setIsSubmittingReply] = React.useState(false);

  // Auto-switch to My Batches when viewing as trainer
  React.useEffect(() => {
    if (role === 'trainer') {
      setBatchFilter('My Batches');
    }
  }, [role]);

  // Active current staff (Support Lead / Authenticated Staff)
  const activeUser = React.useMemo(() => {
    if (user) return user;
    return (
      (store.users || []).find((u) => u.role === 'support') ||
      store.users?.[0] || {
        id: 'usr-support-01',
        full_name: 'Support Lead',
        role: 'support' as const,
      }
    );
  }, [user]);

  const canRespond =
    hasPermission('doubts:resolve') ||
    hasPermission('doubts:write') ||
    role === 'support' ||
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'trainer';

  // Trainer batch & student context scoping
  const trainerBatches = React.useMemo(() => {
    if (role !== 'trainer') return store.batches || [];
    const userFullName = user?.full_name?.toLowerCase().trim();
    const userEmail = user?.email?.toLowerCase().trim();
    const userId = user?.id;

    // Canonical trainer user lookup (handles demo switches and faculty accounts)
    const trainerUser =
      (store.users || []).find((u) => u.role === 'trainer' && (u.id === userId || (userEmail && u.email?.toLowerCase() === userEmail))) ||
      (role === 'trainer' && (!userId || !userId.startsWith('usr-trainer')) ? (store.users || []).find((u) => u.role === 'trainer') : null);

    return (store.batches || []).filter((b) => {
      if (userId && (b.trainer_id === userId || b.trainer_id === `usr-trainer-${userId}`)) return true;
      if (trainerUser && (b.trainer_id === trainerUser.id || b.trainer_id === trainerUser.email)) return true;
      if (userEmail && (b.trainer_id === userEmail || b.trainer_id?.toLowerCase() === userEmail)) return true;
      if (userFullName && b.trainer_name) {
        const bTrainer = b.trainer_name.toLowerCase().trim();
        if (bTrainer.includes(userFullName) || userFullName.includes(bTrainer)) return true;
      }
      if (trainerUser?.full_name && b.trainer_name) {
        const bTrainer = b.trainer_name.toLowerCase().trim();
        const tName = trainerUser.full_name.toLowerCase().trim();
        if (bTrainer.includes(tName) || tName.includes(bTrainer)) return true;
      }
      const assignedCourses = user?.assigned_course_ids || trainerUser?.assigned_course_ids;
      if (assignedCourses && assignedCourses.length > 0 && assignedCourses.includes(b.course_id)) {
        return true;
      }
      return false;
    });
  }, [role, user]);

  const trainerBatchIds = React.useMemo(() => {
    return new Set(trainerBatches.map((b) => b.id));
  }, [trainerBatches]);

  const trainerStudentIds = React.useMemo(() => {
    if (role !== 'trainer') return new Set<string>();
    const studentIds = new Set<string>();
    (store.students || []).forEach((s) => {
      if (s.batch_id && trainerBatchIds.has(s.batch_id)) studentIds.add(s.id);
      if (user?.id && s.trainer_id === user.id) studentIds.add(s.id);
      if (user?.full_name && s.trainer_name?.toLowerCase().includes(user.full_name.toLowerCase())) studentIds.add(s.id);
    });
    return studentIds;
  }, [role, user, trainerBatchIds]);

  const myBatchDoubtsCount = React.useMemo(() => {
    return (store.doubts || []).filter((d) => {
      if (d.batch_id && trainerBatchIds.has(d.batch_id)) return true;
      if (d.student_id && trainerStudentIds.has(d.student_id)) return true;
      const student = (store.students || []).find((s) => s.id === d.student_id);
      if (student?.batch_id && trainerBatchIds.has(student.batch_id)) return true;
      if (user?.assigned_course_ids && user.assigned_course_ids.includes(d.course_id)) return true;
      return false;
    }).length;
  }, [trainerBatchIds, trainerStudentIds, user]);

  const refreshList = async () => {
    let list = await getDoubts();
    if (statusFilter !== 'All') {
      list = list.filter((d) => d.status === statusFilter);
    }
    if (assignedFilter === 'Mine') {
      const myId = user?.id || activeUser.id;
      list = list.filter(
        (d) =>
          d.assigned_to_id === myId ||
          (user?.email && d.assigned_to_id === user.email) ||
          (user?.full_name && d.assigned_to_name?.toLowerCase() === user.full_name.toLowerCase())
      );
    } else if (assignedFilter === 'Unassigned') {
      list = list.filter((d) => !d.assigned_to_id);
    }

    if (batchFilter === 'My Batches') {
      list = list.filter((d) => {
        if (d.batch_id && trainerBatchIds.has(d.batch_id)) return true;
        if (d.student_id && trainerStudentIds.has(d.student_id)) return true;
        const student = (store.students || []).find((s) => s.id === d.student_id);
        if (student?.batch_id && trainerBatchIds.has(student.batch_id)) return true;
        if (user?.assigned_course_ids && user.assigned_course_ids.includes(d.course_id)) return true;
        return false;
      });
    } else if (batchFilter !== 'All') {
      list = list.filter((d) => {
        if (d.batch_id === batchFilter) return true;
        const student = (store.students || []).find((s) => s.id === d.student_id);
        return student?.batch_id === batchFilter;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.ticket_number.toLowerCase().includes(q) ||
          d.student_name.toLowerCase().includes(q) ||
          (d.sap_tcode && d.sap_tcode.toLowerCase().includes(q))
      );
    }
    setDoubts(list);

    if (selectedDoubt) {
      const updated = list.find((d) => d.id === selectedDoubt.id);
      if (updated) setSelectedDoubt(updated);
      else setSelectedDoubt(list[0] || null);
    } else if (list.length > 0) {
      setSelectedDoubt(list[0]);
    }
  };

  React.useEffect(() => {
    refreshList();
  }, [statusFilter, assignedFilter, batchFilter, search, role, trainerBatchIds, trainerStudentIds]);

  // Real-Time WebSocket / SSE Subscription
  const { isConnected } = useRealtime({
    topics: ['doubts', selectedDoubt ? `doubt:${selectedDoubt.id}` : ''],
    onEvent: (event) => {
      if (event.event === 'doubt_reply') {
        const { doubtId, message, status } = event.payload;
        setSelectedDoubt((prev) => {
          if (prev && prev.id === doubtId) {
            const exists = prev.messages.some((m) => m.id === message.id);
            if (!exists) {
              return {
                ...prev,
                status: status || prev.status,
                messages: [...prev.messages, message],
              };
            }
          }
          return prev;
        });

        setDoubts((prevList) =>
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
      } else if (event.event === 'doubt_created') {
        const newTicket: StudentDoubt = event.payload;
        setDoubts((prev) => {
          if (prev.some((d) => d.id === newTicket.id)) return prev;
          return [newTicket, ...prev];
        });
      } else if (event.event === 'doubt_resolved') {
        const { doubtId } = event.payload;
        setSelectedDoubt((prev) => (prev && prev.id === doubtId ? { ...prev, status: 'Resolved' } : prev));
        setDoubts((prev) => prev.map((d) => (d.id === doubtId ? { ...d, status: 'Resolved' } : d)));
      } else if (event.event === 'doubt_assigned') {
        const { doubtId, assignedToId, assignedToName } = event.payload;
        setSelectedDoubt((prev) =>
          prev && prev.id === doubtId
            ? { ...prev, assigned_to_id: assignedToId, assigned_to_name: assignedToName, status: 'Assigned' }
            : prev
        );
        setDoubts((prev) =>
          prev.map((d) =>
            d.id === doubtId
              ? { ...d, assigned_to_id: assignedToId, assigned_to_name: assignedToName, status: 'Assigned' }
              : d
          )
        );
      }
    },
  });

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoubt || (!replyText.trim() && !replyAttachmentUrl)) return;
    setIsSubmittingReply(true);
    try {
      const senderUserId = user?.id || activeUser.id;
      const senderRole = user?.role || activeUser.role;
      const roleLabel =
        senderRole === 'trainer'
          ? 'Faculty Trainer'
          : senderRole === 'admin'
          ? 'Academic Director'
          : senderRole === 'super_admin'
          ? 'Super Admin'
          : 'Support Mentor';
      const senderDisplayName = `${user?.full_name || activeUser.full_name} (${roleLabel})`;

      await replyToDoubt(
        selectedDoubt.id,
        replyText.trim() || 'Attachment shared:',
        senderUserId,
        senderRole,
        senderDisplayName,
        replyAttachmentUrl || undefined
      );
      setReplyText('');
      setReplyAttachmentUrl('');
      await refreshList();
    } catch (err: any) {
      alert(err.message || 'Error posting reply');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedDoubt) return;
    if (!resolutionNotes.trim()) {
      alert('Please provide resolution notes explaining how the issue was solved.');
      return;
    }
    try {
      await resolveDoubt(selectedDoubt.id, user?.id || activeUser.id, resolutionNotes.trim());
      setIsResolving(false);
      setResolutionNotes('');
      await refreshList();
    } catch (err: any) {
      alert(err.message || 'Error resolving doubt');
    }
  };

  const handleSelfAssign = async (doubtId: string) => {
    const assignId = user?.id || activeUser.id;
    await assignDoubt(doubtId, assignId, assignId);
    await refreshList();
  };

  const openCount = doubts.filter((d) => d.status === 'Open' || d.status === 'Assigned').length;
  const inProgressCount = doubts.filter((d) => d.status === 'In Progress').length;
  const resolvedCount = doubts.filter((d) => d.status === 'Resolved').length;
  const canAccess =
    hasPermission('doubts:read') ||
    hasPermission('support:reply') ||
    ['super_admin', 'admin', 'support', 'trainer'].includes(role || '');

  if (!canAccess) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500">
          You do not have administrative or faculty permissions to access the Academic & Technical Support Desk.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-[#0A6ED1] text-white flex items-center justify-center">
              <HelpCircle className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Academic & Technical Support Desk</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Resolve student queries, configuration roadblocks, SAP error messages, and lab server issues.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              isConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{isConnected ? 'Realtime Connected' : 'Connecting Stream...'}</span>
          </div>

          <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-xs">
            <UserCheck className="h-4 w-4 text-[#0A6ED1]" />
            <span className="text-slate-600">Active Staff:</span>
            <strong className="text-slate-900">
              {activeUser.full_name} ({activeUser.role.replace('_', ' ')})
            </strong>
          </div>
        </div>
      </div>

      {/* Role Scoping Notice for Trainers */}
      {role === 'trainer' && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-[#0A6ED1] text-white flex items-center justify-center shrink-0 shadow-xs">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm text-slate-900">Faculty Trainer Context</h3>
                <Badge variant="info" className="text-[10px]">Trainer Scoped</Badge>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Assigned Batches:{' '}
                <strong className="text-slate-800">
                  {trainerBatches.length > 0
                    ? trainerBatches.map((b) => b.batch_name || b.name).join(', ')
                    : 'No active batches currently assigned'}
                </strong>
                {trainerBatches.length > 0 && ` (${myBatchDoubtsCount} student tickets)`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            <Button
              type="button"
              size="sm"
              variant={batchFilter === 'My Batches' ? 'sap' : 'outline'}
              onClick={() => setBatchFilter('My Batches')}
              className="text-xs h-8 flex items-center space-x-1.5"
            >
              <span>⭐ My Batches</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${batchFilter === 'My Batches' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {myBatchDoubtsCount}
              </span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={batchFilter === 'All' ? 'secondary' : 'outline'}
              onClick={() => setBatchFilter('All')}
              className="text-xs h-8 flex items-center space-x-1.5"
            >
              <span>🌐 All Institute Doubts</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-200 text-slate-700">
                {store.doubts?.length || 0}
              </span>
            </Button>
          </div>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-600">
          <p className="text-[10px] uppercase font-bold text-slate-400">Total Tickets</p>
          <h3 className="text-xl font-bold text-slate-900 mt-0.5">{doubts.length}</h3>
          <p className="text-[11px] text-slate-500">Student queries</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <p className="text-[10px] uppercase font-bold text-slate-400">Pending Response</p>
          <h3 className="text-xl font-bold text-amber-700 mt-0.5">{openCount}</h3>
          <p className="text-[11px] text-amber-600 font-medium">Open / Assigned</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-600">
          <p className="text-[10px] uppercase font-bold text-slate-400">In Progress</p>
          <h3 className="text-xl font-bold text-purple-700 mt-0.5">{inProgressCount}</h3>
          <p className="text-[11px] text-slate-500">Under investigation</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-600">
          <p className="text-[10px] uppercase font-bold text-slate-400">Resolved</p>
          <h3 className="text-xl font-bold text-emerald-700 mt-0.5">{resolvedCount}</h3>
          <p className="text-[11px] text-emerald-600 font-medium">Successfully solved</p>
        </Card>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Tickets Queue (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <Card className="p-3">
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student, ticket #, or T-Code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between text-xs gap-1.5">
                <div className="flex space-x-1">
                  {(['All', 'Mine', 'Unassigned'] as const).map((asg) => (
                    <button
                      key={asg}
                      onClick={() => setAssignedFilter(asg)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                        assignedFilter === asg
                          ? 'bg-[#0A6ED1] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {asg}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-1">
                  <select
                    value={batchFilter}
                    onChange={(e) => setBatchFilter(e.target.value)}
                    className="text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-700 max-w-[140px] truncate"
                    title="Filter by Batch"
                  >
                    {role === 'trainer' && <option value="My Batches">⭐ My Batches ({myBatchDoubtsCount})</option>}
                    <option value="All">All Batches ({store.doubts?.length || 0})</option>
                    {(role === 'trainer' ? trainerBatches : store.batches || []).map((b) => {
                      const count = (store.doubts || []).filter((d) => {
                        if (d.batch_id === b.id) return true;
                        const student = (store.students || []).find((s) => s.id === d.student_id);
                        return student?.batch_id === b.id;
                      }).length;
                      return (
                        <option key={b.id} value={b.id}>
                          {b.batch_name || b.name} ({count})
                        </option>
                      );
                    })}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-700"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Open">Open</option>
                    <option value="Assigned">Assigned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          {/* Tickets List */}
          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
            {doubts.map((doubt) => {
              const isSelected = selectedDoubt?.id === doubt.id;
              const doubtBatchName =
                doubt.batch_name ||
                store.batches.find(
                  (b) =>
                    b.id ===
                    (doubt.batch_id ||
                      store.students.find((s) => s.id === doubt.student_id)?.batch_id)
                )?.batch_name;

              const isMyBatchStudent = Boolean(
                role === 'trainer' &&
                  ((doubt.batch_id && trainerBatchIds.has(doubt.batch_id)) ||
                    (doubt.student_id && trainerStudentIds.has(doubt.student_id)) ||
                    trainerBatchIds.has(store.students.find((s) => s.id === doubt.student_id)?.batch_id || ''))
              );

              return (
                <div
                  key={doubt.id}
                  onClick={() => setSelectedDoubt(doubt)}
                  className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/70 border-[#0A6ED1] shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-mono font-bold text-blue-600 text-[11px]">
                        {doubt.ticket_number}
                      </span>
                      {isMyBatchStudent && (
                        <span className="bg-blue-100 text-[#0A6ED1] font-semibold text-[9px] px-1.5 py-0.5 rounded flex items-center space-x-0.5">
                          <span>⭐</span>
                          <span>My Batch</span>
                        </span>
                      )}
                    </div>
                    <Badge
                      variant={
                        doubt.status === 'Resolved'
                          ? 'success'
                          : doubt.status === 'In Progress'
                          ? 'info'
                          : doubt.status === 'Assigned'
                          ? 'warning'
                          : 'default'
                      }
                      className="text-[10px] px-1.5 py-0"
                    >
                      {doubt.status}
                    </Badge>
                  </div>

                  <h4 className="font-bold text-slate-900 mt-1 line-clamp-1">{doubt.title}</h4>
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{doubt.description}</p>

                  <div className="flex flex-wrap items-center justify-between gap-1 pt-2.5 mt-2 border-t border-slate-100 text-[10px]">
                    <div className="flex items-center space-x-1.5 text-slate-600">
                      <User className="h-3 w-3 text-slate-400" />
                      <span className="font-medium">{doubt.student_name}</span>
                      {doubtBatchName && (
                        <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-mono truncate max-w-[100px]">
                          {doubtBatchName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {doubt.sap_tcode && (
                        <span className="font-mono bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold text-[9px]">
                          T-Code: {doubt.sap_tcode}
                        </span>
                      )}
                      <span className="text-slate-400">{formatDate(doubt.updated_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {doubts.length === 0 && (
              <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-500 space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="font-semibold text-slate-800">
                  {batchFilter === 'My Batches'
                    ? 'No open doubt tickets from your assigned batches.'
                    : 'No support tickets found matching criteria.'}
                </p>
                {batchFilter === 'My Batches' && (
                  <p className="text-slate-400 text-[11px]">
                    All students in your batches are on track.{' '}
                    <button
                      type="button"
                      onClick={() => setBatchFilter('All')}
                      className="text-[#0A6ED1] underline font-semibold hover:text-blue-700"
                    >
                      View all institute tickets
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ticket Conversation Thread (7 cols) */}
        <div className="lg:col-span-7">
          {selectedDoubt ? (
            <Card className="shadow-md border-slate-200 overflow-hidden">
              {/* Ticket Detail Header */}
              <CardHeader className="bg-slate-50 border-b border-slate-200 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-[#0A6ED1] text-xs">
                      {selectedDoubt.ticket_number}
                    </span>
                    <Badge variant={selectedDoubt.status === 'Resolved' ? 'success' : 'warning'}>
                      {selectedDoubt.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {selectedDoubt.category}
                    </Badge>
                  </div>

                  {canRespond && (
                    <div className="flex items-center space-x-2">
                      {selectedDoubt.status !== 'Resolved' && (
                        <Button
                          variant="sap"
                          size="sm"
                          onClick={() => setIsResolving(true)}
                          className="text-xs py-1 px-2.5 h-7 flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Mark Resolved</span>
                        </Button>
                      )}
                      {role === 'trainer' && selectedDoubt.assigned_to_id !== (user?.id || activeUser.id) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelfAssign(selectedDoubt.id)}
                          className="text-xs py-1 px-2.5 h-7 text-blue-600 border-blue-200 hover:bg-blue-50 flex items-center space-x-1"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Claim as Batch Trainer</span>
                        </Button>
                      ) : !selectedDoubt.assigned_to_id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelfAssign(selectedDoubt.id)}
                          className="text-xs py-1 px-2.5 h-7 text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          Assign to Me
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-snug">{selectedDoubt.title}</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 pt-2 border-t border-slate-200/60 text-[11px]">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Trainee</p>
                      <p className="font-semibold text-slate-800">{selectedDoubt.student_name}</p>
                      <p className="text-[10px] text-slate-400">{selectedDoubt.admission_number}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Enrolled Course</p>
                      <p className="font-semibold text-slate-800 truncate">{selectedDoubt.course_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Assigned Batch</p>
                      <p className="font-semibold text-slate-800 truncate">
                        {selectedDoubt.batch_name ||
                          store.batches.find(
                            (b) =>
                              b.id ===
                              (selectedDoubt.batch_id ||
                                store.students.find((s) => s.id === selectedDoubt.student_id)?.batch_id)
                          )?.batch_name ||
                          'Self-Paced'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">SAP T-Code</p>
                      <p className="font-mono font-bold text-purple-700">{selectedDoubt.sap_tcode || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Assigned Mentor</p>
                      <p className="font-semibold text-[#0A6ED1]">{selectedDoubt.assigned_to_name || 'Unassigned'}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>

              {/* Thread Messages */}
              <CardContent className="p-4 space-y-4 max-h-[420px] overflow-y-auto bg-slate-50/40">
                {(selectedDoubt.messages || []).map((msg) => {
                  const isStaff = msg.sender_role !== 'student';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center space-x-1.5 mb-1 text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700">{msg.sender_name}</span>
                        <span>•</span>
                        <span>{formatDateTime(msg.created_at)}</span>
                      </div>
                      <div
                        className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed shadow-xs ${
                          isStaff
                            ? 'bg-[#0A6ED1] text-white rounded-tr-xs'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                        {msg.attachment_url && (
                          <div className={`mt-2 pt-2 border-t ${isStaff ? 'border-white/20' : 'border-slate-200'}`}>
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className="block group overflow-hidden rounded-lg border border-slate-200/50 bg-black/5 hover:bg-black/10 transition-all p-1"
                            >
                              {msg.attachment_url.match(/\.(jpeg|jpg|png|webp|gif)($|\?)/i) ||
                              msg.attachment_url.startsWith('data:image/') ||
                              msg.attachment_url.includes('doubt-attachments') ||
                              msg.attachment_url.includes('screenshots') ? (
                                <img
                                  src={msg.attachment_url}
                                  alt="Attachment Screenshot"
                                  className="max-h-48 rounded object-contain mx-auto"
                                />
                              ) : (
                                <div className="flex items-center space-x-1.5 text-[11px] p-1 text-blue-600 font-medium">
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
              </CardContent>

              {/* Reply Box */}
              {canRespond && (
                <div className="p-3 bg-white border-t border-slate-200">
                  <form onSubmit={handleSendReply} className="space-y-2">
                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type technical advice, configuration steps, or resolution instructions..."
                        className="flex-1 text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                      />
                      <Button
                        type="submit"
                        variant="sap"
                        size="sm"
                        disabled={isSubmittingReply || (!replyText.trim() && !replyAttachmentUrl)}
                        className="self-end text-xs flex items-center space-x-1 px-3 py-2"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Reply</span>
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <FileUpload
                        bucket="doubt-attachments"
                        compact
                        value={replyAttachmentUrl}
                        onChange={(url) => setReplyAttachmentUrl(url)}
                        onRemove={() => setReplyAttachmentUrl('')}
                      />
                      <span className="text-[10px] text-slate-400">
                        Attach solution screenshot or SAP configuration reference (PNG, JPG, PDF)
                      </span>
                    </div>
                  </form>
                </div>
              )}
            </Card>
          ) : (
            <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center text-xs text-slate-400">
              Select a support ticket from the list to view thread details.
            </div>
          )}
        </div>
      </div>

      {/* Resolve Modal */}
      <Modal
        isOpen={isResolving}
        onClose={() => setIsResolving(false)}
        title="Resolve Student Doubt Ticket"
        description={`Provide closing resolution notes for ticket ${selectedDoubt?.ticket_number}.`}
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Resolution Summary / Closing Advice *
            </label>
            <textarea
              rows={3}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="e.g. Issue resolved after configuring global parameters in OBY6 and opening posting period in OB52."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1]"
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setIsResolving(false)}>
              Cancel
            </Button>
            <Button variant="sap" size="sm" onClick={handleResolve} className="bg-emerald-600 hover:bg-emerald-700">
              Confirm Resolution
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
