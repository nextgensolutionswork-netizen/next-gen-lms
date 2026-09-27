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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { AttendanceStatus } from '@/types';
import { markAttendance } from '@/lib/services/academics-service';
import { formatDate, exportToCSV } from '@/lib/utils/formatters';

export default function AttendancePage() {
  const [selectedBatchId, setSelectedBatchId] = React.useState(store.batches[0]?.id || '');
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [attendanceMap, setAttendanceMap] = React.useState<Record<string, AttendanceStatus>>({});
  const [savedSuccess, setSavedSuccess] = React.useState(false);

  const batch = store.batches.find((b) => b.id === selectedBatchId);
  const students = store.students.filter((s) => s.batch_id === selectedBatchId);

  React.useEffect(() => {
    // Preload attendance if recorded for today
    const map: Record<string, AttendanceStatus> = {};
    for (const s of students) {
      const rec = store.attendanceRecords.find(
        (a) => a.student_id === s.id && a.attendance_date === selectedDate
      );
      map[s.id] = rec ? rec.status : 'Present';
    }
    setAttendanceMap(map);
    setSavedSuccess(false);
  }, [selectedBatchId, selectedDate]);

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
  };

  const handleExportAttendance = () => {
    const rows = store.attendanceRecords.map((r) => ({
      Student: r.student_name,
      Date: r.attendance_date,
      Status: r.status,
      MarkedBy: r.marked_by_name,
    }));
    exportToCSV('attendance_report', rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Attendance Tracking & Registers</h1>
          <p className="text-xs text-slate-500 mt-1">
            Faculty attendance marking with Present, Absent, Late, and Excused classifications.
          </p>
        </div>
        <div className="flex items-center space-x-2">
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
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <span>Attendance register successfully marked and saved into student records!</span>
        </div>
      )}

      {/* Batch & Date Selector Filter Bar */}
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
          </div>
        </div>
      </Card>

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
                  <th className="px-4 py-3">Session Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((stu) => {
                  const currentStatus = attendanceMap[stu.id] || 'Present';
                  return (
                    <tr key={stu.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-blue-600">{stu.student_code}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{stu.full_name}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-700">{stu.attendance_percentage}%</span>
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
    </div>
  );
}
