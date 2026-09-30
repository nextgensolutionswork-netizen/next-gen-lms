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
  UserCheck,
  Paperclip,
  ExternalLink,
  ImageIcon,
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

export default function SupportDeskPage() {
  const [doubts, setDoubts] = React.useState<StudentDoubt[]>(store.doubts);
  const [selectedDoubt, setSelectedDoubt] = React.useState<StudentDoubt | null>(store.doubts[0] || null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('All');
  const [assignedFilter, setAssignedFilter] = React.useState<'All' | 'Mine' | 'Unassigned'>('All');
  const [replyText, setReplyText] = React.useState('');
  const [replyAttachmentUrl, setReplyAttachmentUrl] = React.useState('');
  const [isResolving, setIsResolving] = React.useState(false);
  const [resolutionNotes, setResolutionNotes] = React.useState('');
  const [isSubmittingReply, setIsSubmittingReply] = React.useState(false);

  // Active current staff (Support Lead)
  const currentStaff = store.users.find((u) => u.role === 'support') || store.users[0];

  const refreshList = async () => {
    let list = await getDoubts();
    if (statusFilter !== 'All') {
      list = list.filter((d) => d.status === statusFilter);
    }
    if (assignedFilter === 'Mine') {
      list = list.filter((d) => d.assigned_to_id === currentStaff.id);
    } else if (assignedFilter === 'Unassigned') {
      list = list.filter((d) => !d.assigned_to_id);
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
    }
  };

  React.useEffect(() => {
    refreshList();
  }, [statusFilter, assignedFilter, search]);

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
      await replyToDoubt(
        selectedDoubt.id,
        replyText.trim() || 'Attachment shared:',
        currentStaff.id,
        currentStaff.role,
        `${currentStaff.full_name} (${currentStaff.role === 'support' ? 'Support Mentor' : 'Faculty'})`,
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
    try {
      await resolveDoubt(selectedDoubt.id, currentStaff.id, resolutionNotes);
      setIsResolving(false);
      setResolutionNotes('');
      await refreshList();
    } catch (err: any) {
      alert(err.message || 'Error resolving doubt');
    }
  };

  const handleSelfAssign = async (doubtId: string) => {
    await assignDoubt(doubtId, currentStaff.id, currentStaff.id);
    await refreshList();
  };

  const openCount = doubts.filter((d) => d.status === 'Open' || d.status === 'Assigned').length;
  const inProgressCount = doubts.filter((d) => d.status === 'In Progress').length;
  const resolvedCount = doubts.filter((d) => d.status === 'Resolved').length;

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
            <span className="text-slate-600">Active Mentor:</span>
            <strong className="text-slate-900">{currentStaff.full_name}</strong>
          </div>
        </div>
      </div>

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

              <div className="flex items-center justify-between text-xs gap-1">
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

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700"
                >
                  <option value="All">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="Assigned">Assigned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Tickets List */}
          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
            {doubts.map((doubt) => {
              const isSelected = selectedDoubt?.id === doubt.id;
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
                    <span className="font-mono font-bold text-blue-600 text-[11px]">
                      {doubt.ticket_number}
                    </span>
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
              <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-400">
                No support tickets found matching criteria.
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
                    {!selectedDoubt.assigned_to_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelfAssign(selectedDoubt.id)}
                        className="text-xs py-1 px-2.5 h-7 text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Assign to Me
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-snug">{selectedDoubt.title}</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pt-2 border-t border-slate-200/60 text-[11px]">
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
                {selectedDoubt.messages.map((msg) => {
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
