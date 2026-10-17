'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  Phone,
  User,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Search,
  Filter,
  PhoneCall,
  AlertCircle,
  CalendarDays,
  CalendarCheck,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  LayoutGrid,
  History,
  Check,
  CalendarClock,
  MessageSquare,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { Lead, LeadStage } from '@/types';
import { updateLeadStage, completeFollowup } from '@/lib/services/crm-service';
import { formatDate } from '@/lib/utils/formatters';

type UrgencyFilter = 'All' | 'Overdue' | 'Due Today' | 'Upcoming' | 'Unscheduled';
type ViewMode = 'grid' | 'timeline' | 'calendar';

export default function FollowupsPage() {
  const { user, role, hasPermission } = useAuth();
  const [allLeads, setAllLeads] = React.useState<Lead[]>(store.leads || []);
  const [search, setSearch] = React.useState('');
  const [urgencyFilter, setUrgencyFilter] = React.useState<UrgencyFilter>('All');
  const [stageFilter, setStageFilter] = React.useState<'All' | 'Follow-up' | 'Demo Scheduled'>('All');
  const [counsellorFilter, setCounsellorFilter] = React.useState<string>('All');
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid');
  const [currentMonth, setCurrentMonth] = React.useState(() => new Date());

  // Interactive Quick Log Modal state
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [newStage, setNewStage] = React.useState<LeadStage>('Follow-up');
  const [callOutcome, setCallOutcome] = React.useState<string>('Connected - Interested');
  const [callNotes, setCallNotes] = React.useState('');
  const [newFollowUpDate, setNewFollowUpDate] = React.useState('');
  const [newFollowUpTime, setNewFollowUpTime] = React.useState('11:00');
  const [markCompleteCheckbox, setMarkCompleteCheckbox] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [completingId, setCompletingId] = React.useState<string | null>(null);

  // Call History Timeline Modal
  const [historyModalLead, setHistoryModalLead] = React.useState<Lead | null>(null);
  const [quickNote, setQuickNote] = React.useState('');
  const [isAddingNote, setIsAddingNote] = React.useState(false);

  // Calendar Day Details Modal
  const [selectedCalendarDay, setSelectedCalendarDay] = React.useState<{ dateStr: string; leads: Lead[] } | null>(null);

  const todayStr = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const getUrgency = (lead: Lead): 'overdue' | 'today' | 'upcoming' | 'unscheduled' => {
    if (!lead.follow_up_date) return 'unscheduled';
    const d = lead.follow_up_date.slice(0, 10);
    if (d < todayStr) return 'overdue';
    if (d === todayStr) return 'today';
    return 'upcoming';
  };

  const refreshLeads = () => {
    setAllLeads([...(store.leads || [])]);
  };

  // Base list of leads in follow-up pipeline
  const activeFollowups = React.useMemo(() => {
    return allLeads.filter(
      (l) => l.stage === 'Follow-up' || l.stage === 'Demo Scheduled' || (l.follow_up_date && l.stage !== 'Converted' && l.stage !== 'Lost')
    );
  }, [allLeads]);

  // Aggregate KPI metrics
  const kpis = React.useMemo(() => {
    let overdue = 0;
    let today = 0;
    let upcoming = 0;
    let demos = 0;

    activeFollowups.forEach((l) => {
      const u = getUrgency(l);
      if (u === 'overdue') overdue++;
      else if (u === 'today') today++;
      else if (u === 'upcoming') upcoming++;

      if (l.stage === 'Demo Scheduled') demos++;
    });

    return {
      total: activeFollowups.length,
      overdue,
      today,
      upcoming,
      demos,
    };
  }, [activeFollowups, todayStr]);

  // Available counsellors for filtering
  const availableCounsellors = React.useMemo(() => {
    return (store.users || []).filter(
      (u) => u.role === 'counsellor' || u.role === 'admin' || u.role === 'super_admin'
    );
  }, []);

  // Filtered followups
  const filteredFollowups = React.useMemo(() => {
    return activeFollowups.filter((lead) => {
      // Stage filter
      if (stageFilter !== 'All' && lead.stage !== stageFilter) return false;

      // Urgency filter
      const urgency = getUrgency(lead);
      if (urgencyFilter === 'Overdue' && urgency !== 'overdue') return false;
      if (urgencyFilter === 'Due Today' && urgency !== 'today') return false;
      if (urgencyFilter === 'Upcoming' && urgency !== 'upcoming') return false;
      if (urgencyFilter === 'Unscheduled' && urgency !== 'unscheduled') return false;

      // Counsellor filter
      if (counsellorFilter !== 'All') {
        if (counsellorFilter === 'mine') {
          if (lead.counsellor_id !== user?.id) return false;
        } else if (lead.counsellor_id !== counsellorFilter) {
          return false;
        }
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = lead.full_name?.toLowerCase().includes(q);
        const matchesPhone = lead.phone?.includes(q);
        const matchesCourse = lead.interested_course_name?.toLowerCase().includes(q);
        const matchesCode = lead.lead_code?.toLowerCase().includes(q);
        const matchesCounsellor = lead.counsellor_name?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesCourse && !matchesCode && !matchesCounsellor) {
          return false;
        }
      }

      return true;
    });
  }, [activeFollowups, stageFilter, urgencyFilter, counsellorFilter, search, user?.id]);

  // Chronologically sorted followups for timeline view
  const chronologicalFollowups = React.useMemo(() => {
    return [...filteredFollowups].sort((a, b) => {
      const urgA = getUrgency(a);
      const urgB = getUrgency(b);
      const weight: Record<string, number> = { overdue: 1, today: 2, upcoming: 3, unscheduled: 4 };
      if (weight[urgA] !== weight[urgB]) {
        return (weight[urgA] || 5) - (weight[urgB] || 5);
      }
      const dateA = a.follow_up_date || '9999';
      const dateB = b.follow_up_date || '9999';
      return dateA.localeCompare(dateB);
    });
  }, [filteredFollowups]);

  const handleOpenLogModal = (lead: Lead) => {
    setSelectedLead(lead);
    setNewStage(lead.stage);
    setCallOutcome('Connected - Interested');
    setCallNotes('');
    setMarkCompleteCheckbox(false);
    setNewFollowUpDate(
      lead.follow_up_date
        ? lead.follow_up_date.slice(0, 10)
        : new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    );
    setNewFollowUpTime(
      lead.follow_up_date && lead.follow_up_date.includes('T')
        ? lead.follow_up_date.split('T')[1].slice(0, 5)
        : '11:00'
    );
  };

  const handleOpenRescheduleModal = (lead: Lead) => {
    handleOpenLogModal(lead);
    setNewStage('Follow-up');
    setCallOutcome('Call Back Requested');
    setMarkCompleteCheckbox(false);
  };

  const applyDatePreset = (daysToAdd: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    setNewFollowUpDate(d.toISOString().slice(0, 10));
  };

  const handleCallOutcomeChange = (outcome: string) => {
    setCallOutcome(outcome);
    if (outcome === 'Call Back Requested') {
      setNewStage('Follow-up');
      setMarkCompleteCheckbox(false);
    } else if (outcome === 'Demo Scheduled / Confirmed' || outcome === 'Demo Rescheduled') {
      setNewStage('Demo Scheduled');
      setMarkCompleteCheckbox(false);
    } else if (outcome === 'Demo Attended') {
      setNewStage('Demo Attended');
    } else if (outcome === 'Not Interested' || outcome === 'Wrong Number / Invalid') {
      setNewStage('Not Interested');
      setMarkCompleteCheckbox(true);
    } else if (outcome === 'Ringing / No Answer' || outcome === 'Switched Off / Busy') {
      setNewStage('Follow-up');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setNewFollowUpDate(tomorrow.toISOString().slice(0, 10));
    }
  };

  const handleQuickComplete = async (lead: Lead) => {
    if (!confirm(`Mark follow-up for "${lead.full_name}" as completed?`)) return;
    setCompletingId(lead.id);
    try {
      const actorId = user?.id || lead.counsellor_id || availableCounsellors[0]?.id || 'system';
      await completeFollowup(lead.id, actorId, 'Follow-up marked completed via quick action');
      refreshLeads();
      if (selectedCalendarDay) {
        setSelectedCalendarDay((prev) =>
          prev ? { ...prev, leads: prev.leads.filter((l) => l.id !== lead.id) } : null
        );
      }
    } catch (err: any) {
      alert('Error completing follow-up: ' + (err.message || 'Unknown error'));
    } finally {
      setCompletingId(null);
    }
  };

  const handleSaveFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    setIsSaving(true);
    try {
      const actorId = user?.id || selectedLead.counsellor_id || availableCounsellors[0]?.id || 'system';
      const timestamp = new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
      const entryNote = `[${timestamp} | ${callOutcome}${markCompleteCheckbox ? ' (Completed)' : ''}]: ${callNotes.trim() || 'Interaction recorded'}`;

      let targetFollowUpDate: string | null = null;
      if (!markCompleteCheckbox && (newStage === 'Follow-up' || newStage === 'Demo Scheduled')) {
        targetFollowUpDate = newFollowUpDate
          ? `${newFollowUpDate}T${newFollowUpTime || '11:00'}:00`
          : selectedLead.follow_up_date || null;
      }

      await updateLeadStage(selectedLead.id, newStage, entryNote, actorId, targetFollowUpDate);

      refreshLeads();
      setSelectedLead(null);
      if (selectedCalendarDay) {
        const updatedLeads = (store.leads || []).filter(
          (l) => l.follow_up_date && l.follow_up_date.slice(0, 10) === selectedCalendarDay.dateStr
        );
        setSelectedCalendarDay({ ...selectedCalendarDay, leads: updatedLeads });
      }
    } catch (err: any) {
      alert('Error updating follow-up: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddQuickNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyModalLead || !quickNote.trim()) return;
    setIsAddingNote(true);
    try {
      const actorId = user?.id || historyModalLead.counsellor_id || availableCounsellors[0]?.id || 'system';
      const timestamp = new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
      const entry = `[${timestamp} | Quick Note]: ${quickNote.trim()}`;

      await updateLeadStage(
        historyModalLead.id,
        historyModalLead.stage,
        entry,
        actorId,
        historyModalLead.follow_up_date
      );

      setQuickNote('');
      refreshLeads();
      const updated = (store.leads || []).find((l) => l.id === historyModalLead.id);
      if (updated) setHistoryModalLead(updated);
    } catch (err: any) {
      alert('Failed to save note: ' + (err.message || 'Unknown error'));
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDayClick = (dateStr: string, leads: Lead[]) => {
    if (leads.length > 0) {
      setSelectedCalendarDay({ dateStr, leads });
    }
  };

  // Calendar View Helpers
  const daysInMonth = React.useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const m = month === 0 ? 12 : month;
      const y = month === 0 ? year - 1 : year;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dateStr, dayNum: d, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dateStr, dayNum: d, isCurrentMonth: true });
    }

    // Next month padding
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 1 : month + 2;
      const y = month === 11 ? year + 1 : year;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dateStr, dayNum: d, isCurrentMonth: false });
    }

    return days;
  }, [currentMonth]);

  const followupsByDate = React.useMemo(() => {
    const map: Record<string, Lead[]> = {};
    filteredFollowups.forEach((l) => {
      if (l.follow_up_date) {
        const d = l.follow_up_date.slice(0, 10);
        if (!map[d]) map[d] = [];
        map[d].push(l);
      }
    });
    return map;
  }, [filteredFollowups]);

  const monthYearLabel = React.useMemo(() => {
    return currentMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [currentMonth]);

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  const canAccessCrm =
    hasPermission('crm:read') ||
    role === 'counsellor' ||
    role === 'admin' ||
    role === 'super_admin';

  if (!canAccessCrm) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          You do not have authorization to view follow-up and demo schedules. This area is restricted to Counsellors and Admissions Administration.
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

  // Parse notes history blocks helper
  const parseNotesHistory = (notes?: string) => {
    if (!notes) return [];
    const blocks = notes
      .split(/\n(?=(?:\[|\-\-\-))/)
      .map((block) => block.replace(/^---\n?/, '').trim())
      .filter(Boolean);
    return blocks.length > 0 ? blocks : [notes.trim()];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Follow-ups & Demo Calendar</h1>
          <p className="text-xs text-slate-500 mt-1">
            Prioritized outreach engine for prospect nurturing, faculty demo sessions, and admission conversions.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {/* View mode toggle: Cards, Timeline, Calendar */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Timeline</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Calendar</span>
            </button>
          </div>
          <Link href="/crm/leads">
            <Button variant="outline" size="sm" className="text-xs flex items-center space-x-1.5">
              <span>View All Leads</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3.5 bg-blue-50/50 border-blue-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Active Follow-ups</span>
            <Calendar className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-900 mt-1">{kpis.total}</p>
          <span className="text-[10px] text-blue-600">Pending candidate calls</span>
        </Card>

        <Card className={`p-3.5 ${kpis.overdue > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${kpis.overdue > 0 ? 'text-rose-700' : 'text-slate-600'}`}>
              Overdue Action
            </span>
            <AlertTriangle className={`h-4 w-4 ${kpis.overdue > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
          </div>
          <p className={`text-2xl font-bold mt-1 ${kpis.overdue > 0 ? 'text-rose-900' : 'text-slate-800'}`}>
            {kpis.overdue}
          </p>
          <span className={`text-[10px] ${kpis.overdue > 0 ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>
            Requires immediate contact
          </span>
        </Card>

        <Card className="p-3.5 bg-amber-50/60 border-amber-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Due Today</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-900 mt-1">{kpis.today}</p>
          <span className="text-[10px] text-amber-700">Scheduled for today</span>
        </Card>

        <Card className="p-3.5 bg-emerald-50/50 border-emerald-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">Demos Scheduled</span>
            <CalendarCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{kpis.demos}</p>
          <span className="text-[10px] text-emerald-700">Live faculty demos</span>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, phone, course, or lead code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Stage filter */}
            <div className="flex items-center space-x-1">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Stage:</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as any)}
                className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"
              >
                <option value="All">All Stages</option>
                <option value="Follow-up">Follow-up</option>
                <option value="Demo Scheduled">Demo Scheduled</option>
              </select>
            </div>

            {/* Counsellor filter */}
            <div className="flex items-center space-x-1">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Counsellor:</span>
              <select
                value={counsellorFilter}
                onChange={(e) => setCounsellorFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"
              >
                <option value="All">All Counsellors</option>
                {user && <option value="mine">Assigned to Me</option>}
                {availableCounsellors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Urgency Filter Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pt-1 border-t border-slate-100">
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Schedule:</span>
          {(['All', 'Due Today', 'Overdue', 'Upcoming', 'Unscheduled'] as UrgencyFilter[]).map((uf) => {
            const isActive = urgencyFilter === uf;
            return (
              <button
                key={uf}
                onClick={() => setUrgencyFilter(uf)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#0A6ED1] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {uf}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Main View Display */}
      {viewMode === 'calendar' ? (
        /* Calendar View */
        <Card className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-800">{monthYearLabel}</h2>
              <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-7 px-2">
                Today
              </Button>
            </div>
            <div className="flex items-center space-x-1">
              <Button variant="outline" size="sm" onClick={prevMonth} className="h-7 w-7 p-0 flex items-center justify-center">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={nextMonth} className="h-7 w-7 p-0 flex items-center justify-center">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="bg-slate-50 py-2 text-center text-xs font-semibold text-slate-600">
                {day}
              </div>
            ))}

            {daysInMonth.map((d, idx) => {
              const dayLeads = followupsByDate[d.dateStr] || [];
              const isToday = d.dateStr === todayStr;

              return (
                <div
                  key={idx}
                  onClick={() => dayLeads.length > 0 && handleDayClick(d.dateStr, dayLeads)}
                  className={`min-h-[110px] p-1.5 flex flex-col justify-between transition-colors ${
                    dayLeads.length > 0 ? 'cursor-pointer hover:ring-1 hover:ring-[#0A6ED1]' : ''
                  } ${
                    !d.isCurrentMonth
                      ? 'bg-slate-50/60 text-slate-400'
                      : isToday
                      ? 'bg-blue-50/40 text-slate-900 font-medium'
                      : 'bg-white text-slate-800 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold inline-flex items-center justify-center rounded-full ${
                        isToday
                          ? 'h-5 w-5 bg-[#0A6ED1] text-white'
                          : d.isCurrentMonth
                          ? 'text-slate-800'
                          : 'text-slate-400'
                      }`}
                    >
                      {d.dayNum}
                    </span>
                    {dayLeads.length > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200">
                        {dayLeads.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mt-1 overflow-y-auto max-h-[75px]">
                    {dayLeads.slice(0, 3).map((lead) => {
                      const isDemo = lead.stage === 'Demo Scheduled';
                      return (
                        <div
                          key={lead.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenLogModal(lead);
                          }}
                          className={`text-[10px] truncate rounded px-1.5 py-0.5 font-medium cursor-pointer transition-shadow hover:shadow-xs ${
                            isDemo
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                              : 'bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200'
                          }`}
                          title={`${lead.full_name} (${lead.interested_course_name || 'Program'}) - Click to log call`}
                        >
                          {lead.full_name}
                        </div>
                      );
                    })}
                    {dayLeads.length > 3 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDayClick(d.dateStr, dayLeads);
                        }}
                        className="text-[9px] text-[#0A6ED1] font-semibold pl-1 hover:underline block cursor-pointer"
                      >
                        +{dayLeads.length - 3} more (view all)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : viewMode === 'timeline' ? (
        /* Timeline View */
        filteredFollowups.length === 0 ? (
          <Card className="p-12 text-center">
            <CalendarClock className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <h3 className="font-semibold text-slate-700">No Scheduled Follow-ups Found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {search || urgencyFilter !== 'All' || stageFilter !== 'All'
                ? 'Try adjusting your filters or search terms to view follow-up entries.'
                : 'There are currently no prospective candidate follow-ups in the pipeline.'}
            </p>
            <div className="mt-4 flex items-center justify-center space-x-2">
              {(search || urgencyFilter !== 'All' || stageFilter !== 'All' || counsellorFilter !== 'All') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setUrgencyFilter('All');
                    setStageFilter('All');
                    setCounsellorFilter('All');
                  }}
                  className="text-xs"
                >
                  Reset Filters
                </Button>
              )}
              <Link href="/crm/leads">
                <Button variant="sap" size="sm" className="text-xs">
                  View All Leads
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {chronologicalFollowups.map((lead) => {
              const urgency = getUrgency(lead);
              const isOverdue = urgency === 'overdue';
              const isToday = urgency === 'today';

              return (
                <div key={lead.id} className="relative group">
                  {/* Timeline bullet */}
                  <div
                    className={`absolute -left-[27px] top-4 h-4 w-4 rounded-full border-2 bg-white flex items-center justify-center transition-transform group-hover:scale-110 ${
                      isOverdue
                        ? 'border-rose-500 bg-rose-50'
                        : isToday
                        ? 'border-amber-500 bg-amber-50'
                        : lead.stage === 'Demo Scheduled'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-[#0A6ED1] bg-blue-50'
                    }`}
                  >
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        isOverdue
                          ? 'bg-rose-500'
                          : isToday
                          ? 'bg-amber-500'
                          : lead.stage === 'Demo Scheduled'
                          ? 'bg-emerald-500'
                          : 'bg-[#0A6ED1]'
                      }`}
                    />
                  </div>

                  {/* Timeline Entry Card */}
                  <Card className="hover:border-[#0A6ED1] transition-all">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-bold text-slate-900 text-sm">{lead.full_name}</h3>
                            <span className="text-[10px] font-semibold text-slate-400">({lead.lead_code})</span>
                            <span className="text-xs font-medium text-[#0A6ED1]">
                              • {lead.interested_course_name || 'SAP Program'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center space-x-3">
                            <span>
                              Counsellor: <strong>{lead.counsellor_name || 'Unassigned'}</strong>
                            </span>
                            <span>•</span>
                            <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline font-medium">
                              {lead.phone}
                            </a>
                          </p>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          {isOverdue && (
                            <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                              Overdue
                            </Badge>
                          )}
                          {isToday && (
                            <Badge variant="warning" className="text-[10px] uppercase font-bold">
                              Due Today
                            </Badge>
                          )}
                          <Badge variant={lead.stage === 'Demo Scheduled' ? 'default' : 'secondary'}>
                            {lead.stage}
                          </Badge>
                          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
                            {lead.follow_up_date ? formatDate(lead.follow_up_date) : 'Unscheduled'}
                          </span>
                        </div>
                      </div>

                      {lead.notes && (
                        <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-100 max-h-20 overflow-y-auto whitespace-pre-line">
                          {lead.notes.split('\n---\n')[0]}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryModalLead(lead)}
                          className="text-xs text-slate-500 hover:text-slate-800 h-7 px-2"
                        >
                          <History className="h-3 w-3 mr-1" />
                          <span>History ({parseNotesHistory(lead.notes).length})</span>
                        </Button>

                        <div className="flex items-center space-x-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={completingId === lead.id}
                            onClick={() => handleQuickComplete(lead)}
                            className="text-xs h-7 px-2.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            title="Mark follow-up completed"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            <span>{completingId === lead.id ? 'Completing...' : 'Complete'}</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenRescheduleModal(lead)}
                            className="text-xs h-7 px-2.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                            title="Reschedule next outreach"
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            <span>Reschedule</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenLogModal(lead)}
                            className="text-xs h-7 px-2.5 text-blue-700 border-blue-200 hover:bg-blue-50"
                          >
                            <PhoneCall className="h-3 w-3 mr-1" />
                            <span>Log Call</span>
                          </Button>
                          <Link
                            href={`/crm/leads?leadId=${lead.id}&search=${encodeURIComponent(lead.lead_code || lead.phone || lead.full_name)}`}
                          >
                            <Button variant="sap" size="sm" className="text-xs h-7 px-2.5">
                              Manage Lead
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )
      ) : filteredFollowups.length === 0 ? (
        /* Empty State Card View */
        <Card className="p-12 text-center">
          <Calendar className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <h3 className="font-semibold text-slate-700">No Matching Follow-ups Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {search || urgencyFilter !== 'All' || stageFilter !== 'All'
              ? 'Try adjusting your filters or search terms to see prospective leads.'
              : 'There are currently no prospective leads in the active follow-up pipeline.'}
          </p>
          <div className="mt-4 flex items-center justify-center space-x-2">
            {(search || urgencyFilter !== 'All' || stageFilter !== 'All' || counsellorFilter !== 'All') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setUrgencyFilter('All');
                  setStageFilter('All');
                  setCounsellorFilter('All');
                }}
                className="text-xs"
              >
                Reset Filters
              </Button>
            )}
            <Link href="/crm/leads">
              <Button variant="sap" size="sm" className="text-xs">
                View All Leads
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        /* Cards View (Grid) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredFollowups.map((lead) => {
            const urgency = getUrgency(lead);
            const isOverdue = urgency === 'overdue';
            const isToday = urgency === 'today';

            return (
              <Card
                key={lead.id}
                className={`transition-all hover:border-[#0A6ED1] ${
                  isOverdue
                    ? 'border-l-4 border-l-rose-500'
                    : isToday
                    ? 'border-l-4 border-l-amber-500'
                    : ''
                }`}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-slate-900 text-sm">{lead.full_name}</h3>
                        <span className="text-[10px] font-semibold text-slate-400">({lead.lead_code})</span>
                      </div>
                      <p className="text-xs text-[#0A6ED1] font-semibold mt-0.5">
                        {lead.interested_course_name || 'SAP Program'}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {isOverdue && (
                        <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                          Overdue
                        </Badge>
                      )}
                      {isToday && (
                        <Badge variant="warning" className="text-[10px] uppercase font-bold">
                          Due Today
                        </Badge>
                      )}
                      <Badge variant={lead.stage === 'Demo Scheduled' ? 'default' : 'secondary'}>
                        {lead.stage}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex items-center space-x-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <a href={`tel:${lead.phone}`} className="hover:underline hover:text-blue-600 font-medium">
                        {lead.phone}
                      </a>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span className={isOverdue ? 'text-rose-600 font-semibold' : isToday ? 'text-amber-700 font-semibold' : ''}>
                        Next: {lead.follow_up_date ? formatDate(lead.follow_up_date) : 'Pending Date'}
                      </span>
                    </div>
                  </div>

                  {lead.notes && (
                    <div className="text-xs text-slate-600 italic bg-amber-50/50 p-2 rounded border border-amber-100/50 max-h-20 overflow-y-auto whitespace-pre-line">
                      &ldquo;{lead.notes.split('\n---\n')[0]}&rdquo;
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] text-slate-400">
                        Counsellor: <strong className="text-slate-600">{lead.counsellor_name || 'Unassigned'}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setHistoryModalLead(lead)}
                        className="text-[11px] text-[#0A6ED1] hover:underline flex items-center space-x-0.5"
                      >
                        <History className="h-2.5 w-2.5" />
                        <span>Logs</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={completingId === lead.id}
                        onClick={() => handleQuickComplete(lead)}
                        className="text-xs px-2 py-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 h-7"
                        title="Mark Completed"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        <span>{completingId === lead.id ? '...' : 'Done'}</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenRescheduleModal(lead)}
                        className="text-xs px-2 py-1 text-amber-700 border-amber-200 hover:bg-amber-50 h-7"
                        title="Reschedule Follow-up"
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        <span>Reschedule</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenLogModal(lead)}
                        className="text-xs px-2 py-1 text-blue-700 border-blue-200 hover:bg-blue-50 h-7"
                      >
                        <PhoneCall className="h-3 w-3 mr-1" />
                        <span>Log Call</span>
                      </Button>
                      <Link
                        href={`/crm/leads?leadId=${lead.id}&search=${encodeURIComponent(lead.lead_code || lead.phone || lead.full_name)}`}
                      >
                        <Button variant="sap" size="sm" className="text-xs px-2.5 py-1 h-7">
                          Manage Lead
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Log Call & Reschedule Modal */}
      {selectedLead && (
        <Modal
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          title={`Log Call Outcome: ${selectedLead.full_name}`}
          description={`Update pipeline stage, record counsellor notes, or reschedule follow-up date.`}
        >
          <form onSubmit={handleSaveFollowup} className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Course Interest:</span>
                <span className="text-[#0A6ED1] font-bold">{selectedLead.interested_course_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Phone Contact:</span>
                <a href={`tel:${selectedLead.phone}`} className="text-blue-600 font-semibold hover:underline">
                  {selectedLead.phone}
                </a>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200/60 items-center">
                <span className="font-semibold text-slate-700">Lead Record:</span>
                <Link
                  href={`/crm/leads?leadId=${selectedLead.id}&search=${encodeURIComponent(selectedLead.lead_code || selectedLead.phone || selectedLead.full_name)}`}
                  className="text-blue-600 font-semibold hover:underline flex items-center space-x-1"
                >
                  <span>Manage Lead Profile ({selectedLead.lead_code})</span>
                  <ExternalLink className="h-3 w-3 ml-0.5" />
                </Link>
              </div>
            </div>

            {/* Quick Completion Checkbox */}
            <div className="flex items-center space-x-2 bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200">
              <input
                type="checkbox"
                id="markComplete"
                checked={markCompleteCheckbox}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setMarkCompleteCheckbox(checked);
                  if (checked) {
                    setNewStage(selectedLead.stage === 'Demo Scheduled' ? 'Demo Attended' : 'Interested');
                  } else {
                    setNewStage('Follow-up');
                  }
                }}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="markComplete" className="text-xs font-semibold text-emerald-900 cursor-pointer">
                Mark Follow-up as Completed (No future call needed right now)
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Call Outcome *
              </label>
              <select
                value={callOutcome}
                onChange={(e) => handleCallOutcomeChange(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                <option value="Connected - Interested">Connected - Interested</option>
                <option value="Call Back Requested">Call Back Requested</option>
                <option value="Demo Scheduled / Confirmed">Demo Scheduled / Confirmed</option>
                <option value="Demo Rescheduled">Demo Rescheduled</option>
                <option value="Demo Attended">Demo Attended</option>
                <option value="Fee Issue / Negotiation">Fee Issue / Negotiation</option>
                <option value="Ringing / No Answer">Ringing / No Answer</option>
                <option value="Switched Off / Busy">Switched Off / Busy</option>
                <option value="Wrong Number / Invalid">Wrong Number / Invalid</option>
                <option value="Not Interested">Not Interested</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Pipeline Stage *
              </label>
              <select
                value={newStage}
                onChange={(e) => setNewStage(e.target.value as LeadStage)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                <option value="Follow-up">Follow-up</option>
                <option value="Demo Scheduled">Demo Scheduled</option>
                <option value="Demo Attended">Demo Attended</option>
                <option value="Interested">Interested</option>
                <option value="Converted">Converted to Admission</option>
                <option value="Not Interested">Not Interested</option>
                <option value="Lost">Lost</option>
              </select>
            </div>

            {!markCompleteCheckbox && (newStage === 'Follow-up' || newStage === 'Demo Scheduled') && (
              <div className="space-y-2 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Next Follow-up / Demo Date *
                  </label>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => applyDatePreset(1)}
                      className="px-1.5 py-0.5 text-[10px] bg-white border border-blue-200 rounded text-blue-700 hover:bg-blue-100 font-medium"
                    >
                      +1 Day (Tomorrow)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(2)}
                      className="px-1.5 py-0.5 text-[10px] bg-white border border-blue-200 rounded text-blue-700 hover:bg-blue-100 font-medium"
                    >
                      +2 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(7)}
                      className="px-1.5 py-0.5 text-[10px] bg-white border border-blue-200 rounded text-blue-700 hover:bg-blue-100 font-medium"
                    >
                      +1 Week
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Input
                      type="date"
                      value={newFollowUpDate}
                      onChange={(e) => setNewFollowUpDate(e.target.value)}
                      className="w-full text-xs bg-white"
                      required
                    />
                  </div>
                  <div>
                    <Input
                      type="time"
                      value={newFollowUpTime}
                      onChange={(e) => setNewFollowUpTime(e.target.value)}
                      className="w-full text-xs bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Discussion Notes / Next Steps
              </label>
              <textarea
                rows={3}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Candidate attended demo, requested weekend batch timings..."
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedLead(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Follow-up'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Interaction History Modal */}
      {historyModalLead && (
        <Modal
          isOpen={!!historyModalLead}
          onClose={() => setHistoryModalLead(null)}
          title={`Call & Interaction History: ${historyModalLead.full_name}`}
          description={`Full audit log of counsellor interactions and discussion notes.`}
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <span className="font-bold text-slate-800">{historyModalLead.full_name}</span>
                <span className="text-slate-400 text-[11px] ml-1.5">({historyModalLead.lead_code})</span>
                <p className="text-[#0A6ED1] font-semibold text-[11px] mt-0.5">
                  {historyModalLead.interested_course_name}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="outline">{historyModalLead.stage}</Badge>
                <Link
                  href={`/crm/leads?leadId=${historyModalLead.id}&search=${encodeURIComponent(historyModalLead.lead_code || historyModalLead.phone || historyModalLead.full_name)}`}
                >
                  <Button variant="sap" size="sm" className="text-xs h-7 px-2">
                    Manage Lead
                  </Button>
                </Link>
              </div>
            </div>

            {/* History timeline list */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {parseNotesHistory(historyModalLead.notes).length === 0 ? (
                <div className="text-center py-6 text-slate-400 italic">
                  No interaction history recorded for this candidate yet.
                </div>
              ) : (
                parseNotesHistory(historyModalLead.notes).map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Entry #{parseNotesHistory(historyModalLead.notes).length - idx}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{item}</p>
                  </div>
                ))
              )}
            </div>

            {/* Quick Note Add */}
            <form onSubmit={handleAddQuickNote} className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700">Add Quick Note</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Sent syllabus via WhatsApp..."
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                />
                <Button type="submit" variant="sap" size="sm" disabled={isAddingNote || !quickNote.trim()} className="text-xs">
                  {isAddingNote ? 'Saving...' : 'Add'}
                </Button>
              </div>
            </form>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setHistoryModalLead(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Calendar Day Details Modal */}
      {selectedCalendarDay && (
        <Modal
          isOpen={!!selectedCalendarDay}
          onClose={() => setSelectedCalendarDay(null)}
          title={`Scheduled Calls: ${formatDate(selectedCalendarDay.dateStr)}`}
          description={`${selectedCalendarDay.leads.length} candidate follow-up session(s) scheduled on this day.`}
          maxWidth="2xl"
        >
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1 text-xs">
            {selectedCalendarDay.leads.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                All scheduled follow-ups for this date have been addressed.
              </div>
            ) : (
              selectedCalendarDay.leads.map((lead) => {
                const urgency = getUrgency(lead);
                const isOverdue = urgency === 'overdue';
                const isToday = urgency === 'today';
                const timeStr = lead.follow_up_date?.includes('T')
                  ? lead.follow_up_date.split('T')[1].slice(0, 5)
                  : 'Flexible';

                return (
                  <div
                    key={lead.id}
                    className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs space-y-2 hover:border-[#0A6ED1] transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-slate-900 text-sm">{lead.full_name}</h4>
                          <span className="text-[10px] font-semibold text-slate-400">({lead.lead_code})</span>
                          <span className="text-xs font-medium text-[#0A6ED1]">
                            • {lead.interested_course_name || 'SAP Program'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center space-x-2">
                          <Phone className="h-3 w-3 text-slate-400" />
                          <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline font-semibold">
                            {lead.phone}
                          </a>
                          <span>•</span>
                          <span>Time: <strong>{timeStr}</strong></span>
                          <span>•</span>
                          <span>Counsellor: <strong>{lead.counsellor_name || 'Unassigned'}</strong></span>
                        </p>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        {isOverdue && <Badge variant="destructive">Overdue</Badge>}
                        {isToday && <Badge variant="warning">Due Today</Badge>}
                        <Badge variant={lead.stage === 'Demo Scheduled' ? 'default' : 'secondary'}>
                          {lead.stage}
                        </Badge>
                      </div>
                    </div>

                    {lead.notes && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 italic">
                        {lead.notes.split('\n---\n')[0]}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setHistoryModalLead(lead)}
                        className="text-xs h-7 px-2 text-slate-500 hover:text-slate-800"
                      >
                        <History className="h-3 w-3 mr-1" />
                        <span>History</span>
                      </Button>

                      <div className="flex items-center space-x-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={completingId === lead.id}
                          onClick={() => handleQuickComplete(lead)}
                          className="text-xs h-7 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          <span>{completingId === lead.id ? '...' : 'Done'}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenRescheduleModal(lead)}
                          className="text-xs h-7 px-2 text-amber-700 border-amber-200 hover:bg-amber-50"
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          <span>Reschedule</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenLogModal(lead)}
                          className="text-xs h-7 px-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                        >
                          <PhoneCall className="h-3 w-3 mr-1" />
                          <span>Log Call</span>
                        </Button>
                        <Link
                          href={`/crm/leads?leadId=${lead.id}&search=${encodeURIComponent(lead.lead_code || lead.phone || lead.full_name)}`}
                        >
                          <Button variant="sap" size="sm" className="text-xs h-7 px-2.5">
                            Manage Lead
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex justify-end pt-3 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setSelectedCalendarDay(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
