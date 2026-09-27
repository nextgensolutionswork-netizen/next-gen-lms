'use client';

import * as React from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  MapPin,
  Plus,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { ClassSession } from '@/types';
import { createClassSession } from '@/lib/services/academics-service';
import { formatDate } from '@/lib/utils/formatters';

export default function SchedulePage() {
  const [sessions, setSessions] = React.useState<ClassSession[]>(store.classSessions);
  const [view, setView] = React.useState<'day' | 'week' | 'month'>('month');
  const [isAddModal, setIsAddModal] = React.useState(false);

  // New Session form state
  const [batchId, setBatchId] = React.useState(store.batches[0]?.id || '');
  const [topic, setTopic] = React.useState('');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = React.useState('08:00');
  const [endTime, setEndTime] = React.useState('10:00');
  const [mode, setMode] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [meetingLink, setMeetingLink] = React.useState('https://meet.google.com/live-sap-lab');
  const [classroom, setClassroom] = React.useState('Lab 2 (SAP Enterprise Server Lab)');

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !batchId) return;
    const batch = store.batches.find((b) => b.id === batchId);
    await createClassSession({
      course_id: batch?.course_id || 'crs-fico-01',
      batch_id: batchId,
      trainer_id: batch?.trainer_id || 'usr-trainer-fico',
      topic,
      session_date: date,
      start_time: startTime,
      end_time: endTime,
      mode,
      meeting_link: meetingLink,
      classroom,
      status: 'Scheduled',
    });
    setIsAddModal(false);
    setTopic('');
    setSessions([...store.classSessions]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Class Schedule & Timetable</h1>
          <p className="text-xs text-slate-500 mt-1">
            Lecture sessions, live video classroom links, lab room allocations, and faculty timetables.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {/* Day / Week / Month Toggle */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 text-xs">
            <button
              onClick={() => setView('day')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                view === 'day' ? 'bg-[#0A6ED1] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                view === 'week' ? 'bg-[#0A6ED1] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                view === 'month' ? 'bg-[#0A6ED1] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
          </div>

          <Button
            variant="sap"
            size="sm"
            onClick={() => setIsAddModal(true)}
            className="text-xs flex items-center space-x-1"
          >
            <Plus className="h-4 w-4" />
            <span>Schedule Session</span>
          </Button>
        </div>
      </div>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sessions.map((sess) => (
          <Card key={sess.id} className="hover:border-[#0A6ED1] transition-all">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="outline" className="text-[10px] mb-1">{sess.mode}</Badge>
                  <h3 className="font-bold text-slate-900 text-sm">{sess.topic}</h3>
                  <p className="text-xs text-[#0A6ED1] font-semibold mt-0.5">{sess.batch_name}</p>
                </div>
                <Badge variant={sess.status === 'Completed' ? 'success' : 'default'}>{sess.status}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div className="flex items-center space-x-1.5">
                  <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span>{formatDate(sess.session_date)}</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>{sess.start_time} - {sess.end_time}</span>
                </div>
              </div>

              <div className="flex flex-col space-y-1.5 text-xs text-slate-600">
                {sess.classroom && (
                  <div className="flex items-center space-x-1.5 text-slate-700">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    <span>Location: {sess.classroom}</span>
                  </div>
                )}
                {sess.meeting_link && (
                  <div className="flex items-center space-x-1.5 text-blue-600">
                    <Video className="h-3.5 w-3.5 text-blue-500" />
                    <a href={sess.meeting_link} target="_blank" rel="noreferrer" className="hover:underline truncate">
                      {sess.meeting_link}
                    </a>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">Trainer: {sess.trainer_name}</span>
                {sess.meeting_link && (
                  <a href={sess.meeting_link} target="_blank" rel="noreferrer">
                    <Button variant="sap" size="sm" className="text-xs px-2.5 py-1 flex items-center space-x-1">
                      <span>Join Live</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Schedule Session Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Schedule Class Session"
        description="Add a live session or lab workshop to the timetable."
      >
        <form onSubmit={handleCreateSession} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Batch *
            </label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
            >
              {store.batches.map((b) => (
                <option key={b.id} value={b.id}>{b.batch_name}</option>
              ))}
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

          <Input
            label="Google Meet / Zoom Live Link"
            placeholder="https://meet.google.com/..."
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
          />

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
    </div>
  );
}
