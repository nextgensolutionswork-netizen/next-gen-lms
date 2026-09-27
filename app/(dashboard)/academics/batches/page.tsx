'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  Users,
  Plus,
  ArrowRightLeft,
  GraduationCap,
  History,
  CheckCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Batch } from '@/types';
import { createBatch, transferStudentBatch } from '@/lib/services/academics-service';
import { formatDate } from '@/lib/utils/formatters';

export default function BatchesPage() {
  const [batches, setBatches] = React.useState<Batch[]>(store.batches);
  const [isAddModal, setIsAddModal] = React.useState(false);
  const [isTransferModal, setIsTransferModal] = React.useState(false);

  // New Batch form state
  const [batchCode, setBatchCode] = React.useState('');
  const [batchName, setBatchName] = React.useState('');
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || '');
  const [trainerId, setTrainerId] = React.useState(store.users.find((u) => u.role === 'trainer')?.id || '');
  const [trainingMode, setTrainingMode] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [startDate, setStartDate] = React.useState('2026-03-15');
  const [endDate, setEndDate] = React.useState('2026-06-15');
  const [startTime, setStartTime] = React.useState('08:00');
  const [endTime, setEndTime] = React.useState('10:00');
  const [capacity, setCapacity] = React.useState(30);

  // Transfer Student form state
  const [studentId, setStudentId] = React.useState(store.students[0]?.id || '');
  const [targetBatchId, setTargetBatchId] = React.useState(store.batches[1]?.id || store.batches[0]?.id || '');
  const [transferReason, setTransferReason] = React.useState('');

  const refreshList = () => {
    setBatches([...store.batches]);
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchName || !batchCode) return;
    await createBatch({
      batch_code: batchCode,
      batch_name: batchName,
      course_id: courseId,
      trainer_id: trainerId,
      training_mode: trainingMode,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      days: ['Mon', 'Wed', 'Fri'],
      maximum_capacity: capacity,
      status: 'Upcoming',
    });
    setIsAddModal(false);
    setBatchCode('');
    setBatchName('');
    refreshList();
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !targetBatchId || !transferReason) return;
    await transferStudentBatch(studentId, targetBatchId, transferReason, 'usr-admin');
    setIsTransferModal(false);
    setTransferReason('');
    refreshList();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">SAP Batch Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure cohort schedules, trainer allocations, student capacities, and audit-compliant batch transfers.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsTransferModal(true)}
            className="text-xs flex items-center space-x-1"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span>Transfer Student</span>
          </Button>
          <Button
            variant="sap"
            size="sm"
            onClick={() => setIsAddModal(true)}
            className="text-xs flex items-center space-x-1"
          >
            <Plus className="h-4 w-4" />
            <span>New Batch</span>
          </Button>
        </div>
      </div>

      {/* Batch Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {batches.map((b) => (
          <Card key={b.id} className="hover:border-[#0A6ED1] transition-all">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                    {b.batch_code}
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm mt-1">{b.batch_name}</h3>
                  <p className="text-xs text-slate-500">{b.course_name}</p>
                </div>
                <Badge variant={b.status === 'Active' ? 'success' : 'secondary'}>{b.status}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="flex items-center space-x-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>{b.start_time} - {b.end_time}</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>{formatDate(b.start_date)} - {formatDate(b.end_date)}</span>
                </div>
                <div className="flex items-center space-x-1.5 col-span-2">
                  <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
                  <span>Trainer: <strong className="text-slate-800">{b.trainer_name}</strong></span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Mode: <strong>{b.training_mode}</strong></span>
                <span className="font-semibold text-slate-800">
                  Enrolled: {b.current_enrolled} / {b.maximum_capacity} students
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Audit History of Student Transfers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center space-x-2">
            <History className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm">Batch Transfer Audit Trail</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {store.batchTransferAudits.length === 0 ? (
            <p className="p-4 text-xs text-slate-400 italic">No student transfers recorded yet.</p>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-2.5">Student</th>
                  <th className="px-4 py-2.5">Transferred From</th>
                  <th className="px-4 py-2.5">Transferred To</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5">Authorized By</th>
                  <th className="px-4 py-2.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {store.batchTransferAudits.map((aud) => (
                  <tr key={aud.id}>
                    <td className="px-4 py-2.5 font-bold text-slate-800">{aud.student_name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{aud.from_batch_name}</td>
                    <td className="px-4 py-2.5 text-blue-600 font-semibold">{aud.to_batch_name}</td>
                    <td className="px-4 py-2.5 text-slate-700 italic">&ldquo;{aud.reason}&rdquo;</td>
                    <td className="px-4 py-2.5 text-slate-500">{aud.transferred_by}</td>
                    <td className="px-4 py-2.5 text-slate-400">{formatDate(aud.transferred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* New Batch Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Schedule New SAP Batch"
        description="Configure class timing, mode, and student capacity."
      >
        <form onSubmit={handleCreateBatch} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Batch Code *"
              placeholder="e.g. B-FICO-2602"
              value={batchCode}
              onChange={(e) => setBatchCode(e.target.value)}
              required
            />
            <Input
              label="Batch Name *"
              placeholder="e.g. SAP FICO Evening Batch"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Course *
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                {store.courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.course_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Trainer *
              </label>
              <select
                value={trainerId}
                onChange={(e) => setTrainerId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                {store.users.filter((u) => u.role === 'trainer').map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date *"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              label="End Date *"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
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
            <Input
              label="Capacity"
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Create Batch
            </Button>
          </div>
        </form>
      </Modal>

      {/* Student Transfer Modal with Reason Audit */}
      <Modal
        isOpen={isTransferModal}
        onClose={() => setIsTransferModal(false)}
        title="Transfer Student Between Batches"
        description="Transfers the student with an immutable audit trail."
      >
        <form onSubmit={handleTransfer} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Student *
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
            >
              {store.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.student_code} - Current: {s.batch_name || 'Unassigned'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Destination Batch *
            </label>
            <select
              value={targetBatchId}
              onChange={(e) => setTargetBatchId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
            >
              {store.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_name} ({b.start_time} - {b.end_time})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Transfer Reason (Mandatory for Audit Compliance) *
            </label>
            <textarea
              rows={3}
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="e.g. Student requested weekend schedule due to office shift change..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsTransferModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Execute Transfer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
