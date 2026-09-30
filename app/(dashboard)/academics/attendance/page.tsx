'use client';

import * as React from 'react';
import {
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  HelpCircle,
  Save,
  Download,
  Filter,
  Video,
  Radio,
  RefreshCw,
  BellRing,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { AttendanceStatus, AttendanceSource, AttendanceRecord, MeetingParticipantLog } from '@/types';
import { markAttendance } from '@/lib/services/academics-service';
import { formatDate, exportToCSV } from '@/lib/utils/formatters';
import { subscribeRealtimeTopic } from '@/lib/services/realtime-service';

export default function AttendancePage() {
  const [selectedBatchId, setSelectedBatchId] = React.useState(store.batches[0]?.id || '');
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [attendanceMap, setAttendanceMap] = React.useState<Record<string, AttendanceStatus>>({});
  const [recordsMap, setRecordsMap] = React.useState<Record<string, AttendanceRecord | undefined>>({});
  const [savedSuccess, setSavedSuccess] = React.useState(false);

  // Sync Meeting Modal state
  const [isSyncModalOpen, setIsSyncModalOpen] = React.useState(false);
  const [syncProvider, setSyncProvider] = React.useState<'Zoom' | 'Google Meet'>('Zoom');
  const [syncMeetingId, setSyncMeetingId] = React.useState('');
  const [syncDuration, setSyncDuration] = React.useState(90);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<{
    recordsCount: number;
    alertsDispatched: number;
    message: string;
  } | null>(null);

  // Meeting logs viewer state
  const [showLogsDrawer, setShowLogsDrawer] = React.useState(false);
  const [recentLogs, setRecentLogs] = React.useState<MeetingParticipantLog[]>([]);

  const batch = store.batches.find((b) => b.id === selectedBatchId);
  const students = store.students.filter((s) => s.batch_id === selectedBatchId);
  const sessions = store.classSessions.filter((cs) => cs.batch_id === selectedBatchId);

  // Load / refresh attendance records
  const refreshRecords = React.useCallback(() => {
    const aMap: Record<string, AttendanceStatus> = {};
    const rMap: Record<string, AttendanceRecord | undefined> = {};

    for (const s of students) {
      const rec = store.attendanceRecords.find(
        (a) => a.student_id === s.id && (a.attendance_date === selectedDate || a.batch_id === selectedBatchId)
      );
      aMap[s.id] = rec ? rec.status : 'Present';
      rMap[s.id] = rec;
    }
    setAttendanceMap(aMap);
    setRecordsMap(rMap);
    setRecentLogs([...store.meetingLogs]);
  }, [selectedBatchId, selectedDate, students]);

  React.useEffect(() => {
    refreshRecords();
    setSavedSuccess(false);
  }, [refreshRecords]);

  // Real-time listener for live automated webhook updates
  React.useEffect(() => {
    const unsubscribe = subscribeRealtimeTopic('attendance', () => {
      refreshRecords();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 5000);
    });

    return () => {
      unsubscribe();
    };
  }, [refreshRecords]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendanceMap((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSaveAttendance = async () => {
    const session = store.classSessions.find((cs) => cs.batch_id === selectedBatchId) || store.classSessions[0];
    const records = students.map((s) => ({
      student_id: s.id,
      status: attendanceMap[s.id] || 'Present',
    }));

    await markAttendance(session?.id || 'sess-01', records, 'usr-trainer-fico');
    setSavedSuccess(true);
    refreshRecords();
  };

  const handleExportAttendance = () => {
    const rows = store.attendanceRecords.map((r) => ({
      Student: r.student_name,
      Date: r.attendance_date,
      Status: r.status,
      Source: r.source || 'Manual',
      DurationMinutes: r.duration_minutes || 0,
      MeetingId: r.meeting_id || 'N/A',
      MarkedBy: r.marked_by_name,
    }));
    exportToCSV('attendance_register_report', rows);
  };

  const handleTriggerMeetingSync = async () => {
    if (!syncMeetingId) return;
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/attendance/sync-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: syncMeetingId,
          provider: syncProvider,
          totalDurationMinutes: Number(syncDuration),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSyncResult({
          recordsCount: data.data.synced_records_count,
          alertsDispatched: data.data.alerts_dispatched,
          message: `Successfully synchronized ${data.data.synced_records_count} student records from ${syncProvider}!`,
        });
        refreshRecords();
      } else {
        setSyncResult({
          recordsCount: 0,
          alertsDispatched: 0,
          message: data.error || 'Failed to sync meeting attendance',
        });
      }
    } catch (err: any) {
      setSyncResult({
        recordsCount: 0,
        alertsDispatched: 0,
        message: err.message || 'Network error executing sync',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Attendance Registers & Automated Tracking</h1>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] flex items-center space-x-1">
              <Radio className="h-3 w-3 text-emerald-600 animate-pulse" />
              <span>Webhooks Live</span>
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automated Zoom & Google Meet webhook duration logging, duration thresholds (70% Present, 40% Late), and multi-channel student alerts.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const defaultSession = sessions.find((s) => s.meeting_id) || store.classSessions[0];
              setSyncMeetingId(defaultSession?.meeting_id || 'xyz-fico-sap');
              setSyncProvider((defaultSession?.meeting_provider as any) || 'Google Meet');
              setIsSyncModalOpen(true);
            }}
            className="text-xs flex items-center space-x-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            <Video className="h-3.5 w-3.5" />
            <span>Sync Live Meeting</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLogsDrawer(!showLogsDrawer)}
            className="text-xs flex items-center space-x-1"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>{showLogsDrawer ? 'Hide Webhook Logs' : 'View Webhook Logs'}</span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportAttendance} className="text-xs flex items-center space-x-1">
            <Download className="h-3.5 w-3.5" />
            <span>Export Register</span>
          </Button>

          <Button variant="sap" size="sm" onClick={handleSaveAttendance} className="text-xs flex items-center space-x-1">
            <Save className="h-4 w-4" />
            <span>Save Attendance</span>
          </Button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span>Attendance register updated and synced across LMS & multi-channel notification engine!</span>
          </div>
          <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
            Atomic Sync
          </Badge>
        </div>
      )}

      {/* Filter & Batch Selection Card */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Batch</label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 font-semibold"
              >
                {store.batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_name} ({b.start_time} - {b.end_time})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Session Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800"
              />
            </div>

            {batch && (
              <div className="hidden md:block pl-2 border-l border-slate-200">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Class Mode</span>
                <span className="text-xs font-semibold text-slate-700">{batch.training_mode}</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium">Quick Mark:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const map: Record<string, AttendanceStatus> = {};
                students.forEach((s) => (map[s.id] = 'Present'));
                setAttendanceMap(map);
              }}
              className="text-xs py-1 px-2.5 text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
            >
              Mark All Present
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const map: Record<string, AttendanceStatus> = {};
                students.forEach((s) => (map[s.id] = 'Absent'));
                setAttendanceMap(map);
              }}
              className="text-xs py-1 px-2.5 text-red-700 bg-red-50 border-red-200 hover:bg-red-100"
            >
              Mark All Absent
            </Button>
          </div>
        </div>
      </Card>

      {/* Collapsible Webhook Logs Stream Drawer */}
      {showLogsDrawer && (
        <Card className="border-blue-200 bg-blue-50/20">
          <CardHeader className="py-3 px-4 border-b border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Radio className="h-4 w-4 text-blue-600 animate-pulse" />
                <CardTitle className="text-xs font-bold text-slate-800">
                  Live Meeting Webhook Stream (Zoom & Google Meet)
                </CardTitle>
              </div>
              <span className="text-[11px] text-slate-500">
                {recentLogs.length} total event segment(s) captured
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentLogs.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No webhook segments captured yet. Trigger "Sync Live Meeting" or simulate a webhook event.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                {recentLogs.map((log) => (
                  <div key={log.id} className="p-3 text-xs flex items-center justify-between hover:bg-white transition-colors">
                    <div className="flex items-center space-x-3">
                      <Badge
                        variant="outline"
                        className={
                          log.provider === 'Zoom'
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }
                      >
                        {log.provider}
                      </Badge>
                      <div>
                        <span className="font-semibold text-slate-800">{log.participant_name}</span>
                        <span className="text-slate-400 ml-1.5">({log.participant_email})</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Meeting: <span className="font-mono text-slate-600">{log.meeting_id}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-700">
                        {log.duration_seconds > 0
                          ? `${Math.round(log.duration_seconds / 60)} min(s) (${log.duration_seconds}s)`
                          : log.leave_time
                          ? 'Ended'
                          : 'In Session'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {log.join_time ? formatDate(log.join_time) : 'N/A'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Attendance Marking Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Student Code</th>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Overall Attendance</th>
                  <th className="px-4 py-3">Webhook Source</th>
                  <th className="px-4 py-3">Meeting Duration</th>
                  <th className="px-4 py-3">Session Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((stu) => {
                  const currentStatus = attendanceMap[stu.id] || 'Present';
                  const record = recordsMap[stu.id];
                  const source = record?.source || 'Manual';
                  const duration = record?.duration_minutes;

                  return (
                    <tr key={stu.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-blue-600">{stu.student_code}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{stu.full_name}</div>
                        <div className="text-[10px] text-slate-400">{stu.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`font-bold ${
                              stu.attendance_percentage >= 80
                                ? 'text-emerald-600'
                                : 'text-amber-600'
                            }`}
                          >
                            {stu.attendance_percentage}%
                          </span>
                          {stu.attendance_percentage < 80 && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200">
                              Below Cert 80%
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {source === 'Zoom' ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center space-x-1 w-fit">
                            <Video className="h-3 w-3" />
                            <span>Zoom</span>
                          </Badge>
                        ) : source === 'Google Meet' ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center space-x-1 w-fit">
                            <Video className="h-3 w-3" />
                            <span>Google Meet</span>
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 w-fit">
                            Manual
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {duration !== undefined ? (
                          <div>
                            <span className="font-semibold text-slate-700">{duration} min(s)</span>
                            {record?.notes && (
                              <div className="text-[10px] text-slate-400 truncate max-w-xs" title={record.notes}>
                                {record.notes}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 space-x-1">
                          {(['Present', 'Absent', 'Late', 'Excused'] as AttendanceStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(stu.id, st)}
                              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                                currentStatus === st
                                  ? st === 'Present'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : st === 'Absent'
                                    ? 'bg-red-600 text-white shadow-xs'
                                    : st === 'Late'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Sync Live Meeting Modal */}
      <Modal
        isOpen={isSyncModalOpen}
        onClose={() => {
          setIsSyncModalOpen(false);
          setSyncResult(null);
        }}
        title="Automated Meeting Attendance Synchronization"
        description="Sync meeting participant duration logs from Zoom or Google Meet webhooks into batch attendance registers."
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Meeting Provider
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSyncProvider('Zoom')}
                className={`p-3 border rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition-colors ${
                  syncProvider === 'Zoom'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Video className="h-4 w-4 text-blue-600" />
                <span>Zoom Video Webhook</span>
              </button>

              <button
                type="button"
                onClick={() => setSyncProvider('Google Meet')}
                className={`p-3 border rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition-colors ${
                  syncProvider === 'Google Meet'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Video className="h-4 w-4 text-emerald-600" />
                <span>Google Meet Webhook</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Meeting ID / Room Code
            </label>
            <input
              type="text"
              value={syncMeetingId}
              onChange={(e) => setSyncMeetingId(e.target.value)}
              placeholder="e.g. 9876543210 or xyz-fico-sap"
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Corresponds to class session's meeting ID or meeting link.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Total Session Duration (Minutes)
            </label>
            <input
              type="number"
              value={syncDuration}
              onChange={(e) => setSyncDuration(Number(e.target.value))}
              min={15}
              max={300}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Duration benchmark: Students attending &ge; 70% duration are marked Present; 40-69% are marked Late; &lt; 40% are marked Absent.
            </p>
          </div>

          {syncResult && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold ${
                syncResult.recordsCount > 0
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'
              }`}
            >
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span>{syncResult.message}</span>
              </div>
              {syncResult.alertsDispatched > 0 && (
                <div className="flex items-center space-x-1.5 mt-1 text-slate-600 text-[11px]">
                  <BellRing className="h-3.5 w-3.5 text-amber-600" />
                  <span>{syncResult.alertsDispatched} student(s) notified via WhatsApp & Email for missed or late session.</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsSyncModalOpen(false);
                setSyncResult(null);
              }}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="sap"
              size="sm"
              onClick={handleTriggerMeetingSync}
              disabled={isSyncing || !syncMeetingId}
              className="text-xs flex items-center space-x-1.5"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Syncing Webhooks...</span>
                </>
              ) : (
                <>
                  <Video className="h-3.5 w-3.5" />
                  <span>Run Webhook Sync</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
