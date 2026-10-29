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
  Edit3,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { Batch, BatchTransferAudit, Student } from '@/types';
import {
  createBatch,
  updateBatch,
  deleteBatch,
  transferStudentBatch,
  getStudentsForBatch,
} from '@/lib/services/academics-service';
import { canAccessBatch } from '@/lib/auth/rbac';
import { formatDate } from '@/lib/utils/formatters';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function BatchesPage() {
  const { user, role, hasPermission } = useAuth();
  const [batches, setBatches] = React.useState<Batch[]>(store.batches);
  const [transferAudits, setTransferAudits] = React.useState<BatchTransferAudit[]>(store.batchTransferAudits);

  // Modals
  const [isAddModal, setIsAddModal] = React.useState(false);
  const [isEditModal, setIsEditModal] = React.useState(false);
  const [isTransferModal, setIsTransferModal] = React.useState(false);
  const [isRosterModal, setIsRosterModal] = React.useState(false);

  // Selected batch for editing or viewing roster
  const [activeBatch, setActiveBatch] = React.useState<Batch | null>(null);
  const [rosterStudents, setRosterStudents] = React.useState<Student[]>([]);
  const [statusMessage, setStatusMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // RBAC rules
  const canCreate = hasPermission('batches:write') || role === 'admin' || role === 'super_admin';
  const canTransfer = hasPermission('batches:transfer') || role === 'admin' || role === 'super_admin' || role === 'trainer';
  const isTrainer = role === 'trainer';

  // Filter batches visible to current user
  const visibleBatches = React.useMemo(() => {
    return batches.filter((b) => canAccessBatch(user, b.id) || b.trainer_id === user?.id);
  }, [batches, user]);

  // New Batch form state
  const [batchCode, setBatchCode] = React.useState('');
  const [batchName, setBatchName] = React.useState('');
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || '');
  const [trainerId, setTrainerId] = React.useState(
    store.users.find((u) => u.role === 'trainer')?.id || user?.id || ''
  );
  const [trainingMode, setTrainingMode] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [startDate, setStartDate] = React.useState('2026-03-15');
  const [endDate, setEndDate] = React.useState('2026-06-15');
  const [startTime, setStartTime] = React.useState('08:00');
  const [endTime, setEndTime] = React.useState('10:00');
  const [capacity, setCapacity] = React.useState(30);
  const [selectedDays, setSelectedDays] = React.useState<string[]>(['Mon', 'Wed', 'Fri']);

  // Sync courseId & trainerId if store arrays change or load asynchronously
  React.useEffect(() => {
    if (!courseId && store.courses.length > 0) {
      setCourseId(store.courses[0].id);
    }
  }, [courseId]);

  React.useEffect(() => {
    if (!trainerId) {
      const defaultTrainer = store.users.find((u) => u.role === 'trainer')?.id || user?.id || '';
      if (defaultTrainer) setTrainerId(defaultTrainer);
    }
  }, [trainerId, user?.id]);

  // Edit Batch form state
  const [editBatchName, setEditBatchName] = React.useState('');
  const [editTrainerId, setEditTrainerId] = React.useState('');
  const [editMode, setEditMode] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [editStartDate, setEditStartDate] = React.useState('');
  const [editEndDate, setEditEndDate] = React.useState('');
  const [editStartTime, setEditStartTime] = React.useState('');
  const [editEndTime, setEditEndTime] = React.useState('');
  const [editCapacity, setEditCapacity] = React.useState(30);
  const [editStatus, setEditStatus] = React.useState<'Upcoming' | 'Active' | 'Completed' | 'On Hold' | 'Cancelled'>('Active');
  const [editDays, setEditDays] = React.useState<string[]>([]);

  // Transfer Student form state
  const [studentId, setStudentId] = React.useState(store.students[0]?.id || '');
  const [targetBatchId, setTargetBatchId] = React.useState('');
  const [transferReason, setTransferReason] = React.useState('');
  const [transferError, setTransferError] = React.useState<string | null>(null);

  const refreshList = () => {
    setBatches([...store.batches]);
    setTransferAudits([...store.batchTransferAudits]);
  };

  // Transferable students: if trainer, restrict to students in cohorts assigned to this trainer
  const transferableStudents = React.useMemo(() => {
    if (isTrainer) {
      const myBatchIds = new Set(batches.filter((b) => b.trainer_id === user?.id).map((b) => b.id));
      return store.students.filter((s) => s.batch_id && myBatchIds.has(s.batch_id));
    }
    return store.students;
  }, [batches, isTrainer, user?.id]);

  // Find currently selected student in transfer modal to exclude their current batch
  const selectedStudent = React.useMemo(() => {
    return transferableStudents.find((s) => s.id === studentId) || store.students.find((s) => s.id === studentId);
  }, [transferableStudents, studentId]);

  // Destination batches: exclude the student's current batch, and restrict to trainer cohorts if trainer
  const destinationBatches = React.useMemo(() => {
    let list = batches.filter((b) => b.id !== selectedStudent?.batch_id);
    if (isTrainer) {
      list = list.filter((b) => b.trainer_id === user?.id);
    }
    return list;
  }, [batches, selectedStudent, isTrainer, user?.id]);

  // Synchronize student selection with available transferable students
  React.useEffect(() => {
    if (transferableStudents.length > 0) {
      if (!studentId || !transferableStudents.some((s) => s.id === studentId)) {
        setStudentId(transferableStudents[0].id);
      }
    } else {
      setStudentId('');
    }
  }, [transferableStudents, studentId]);

  // Whenever student selection or destinationBatches change, set default destination batch
  React.useEffect(() => {
    if (destinationBatches.length > 0) {
      if (!targetBatchId || !destinationBatches.some((b) => b.id === targetBatchId)) {
        setTargetBatchId(destinationBatches[0].id);
      }
    } else {
      setTargetBatchId('');
    }
  }, [destinationBatches, targetBatchId]);

  const toggleDaySelection = (day: string, current: string[], setter: (val: string[]) => void) => {
    if (current.includes(day)) {
      setter(current.filter((d) => d !== day));
    } else {
      setter([...current, day]);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      setStatusMessage({ type: 'error', text: 'You do not have permission to create batches.' });
      return;
    }
    if (!batchName.trim() || !batchCode.trim()) {
      setStatusMessage({ type: 'error', text: 'Batch Code and Batch Name are mandatory.' });
      return;
    }
    if (!courseId) {
      setStatusMessage({ type: 'error', text: 'Please select a course for this batch.' });
      return;
    }
    try {
      await createBatch({
        batch_code: batchCode.trim(),
        batch_name: batchName.trim(),
        course_id: courseId,
        trainer_id: trainerId,
        training_mode: trainingMode,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        days: selectedDays.length > 0 ? selectedDays : ['Mon', 'Wed', 'Fri'],
        maximum_capacity: Number(capacity) || 30,
        status: 'Upcoming',
      });
      setIsAddModal(false);
      setBatchCode('');
      setBatchName('');
      setStatusMessage({ type: 'success', text: `Batch "${batchName}" created successfully.` });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to create batch.' });
    }
  };

  const openEditModal = (batch: Batch) => {
    setActiveBatch(batch);
    setEditBatchName(batch.batch_name);
    setEditTrainerId(batch.trainer_id || '');
    setEditMode(batch.training_mode);
    setEditStartDate(batch.start_date);
    setEditEndDate(batch.end_date);
    setEditStartTime(batch.start_time);
    setEditEndTime(batch.end_time);
    setEditCapacity(batch.maximum_capacity);
    setEditStatus(batch.status as any);
    setEditDays(batch.days || []);
    setIsEditModal(true);
  };

  const handleUpdateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBatch) return;
    try {
      await updateBatch(activeBatch.id, {
        batch_name: editBatchName.trim(),
        trainer_id: editTrainerId,
        training_mode: editMode,
        start_date: editStartDate,
        end_date: editEndDate,
        start_time: editStartTime,
        end_time: editEndTime,
        maximum_capacity: Number(editCapacity),
        status: editStatus,
        days: editDays.length > 0 ? editDays : ['Mon', 'Wed', 'Fri'],
      });
      setIsEditModal(false);
      setStatusMessage({ type: 'success', text: `Batch "${editBatchName}" updated successfully.` });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to update batch' });
    }
  };

  const handleDeleteBatch = async (batch: Batch) => {
    if (batch.current_enrolled > 0) {
      alert(`Cannot delete "${batch.batch_name}": ${batch.current_enrolled} students are enrolled. Transfer students first.`);
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete batch "${batch.batch_name}"?`)) {
      return;
    }
    try {
      await deleteBatch(batch.id);
      setStatusMessage({ type: 'success', text: `Batch "${batch.batch_name}" deleted.` });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete batch' });
    }
  };

  const openRoster = async (batch: Batch) => {
    setActiveBatch(batch);
    const students = await getStudentsForBatch(batch.id);
    setRosterStudents(students);
    setIsRosterModal(true);
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canTransfer) {
      setTransferError('Unauthorized: You do not have permissions to transfer students.');
      return;
    }
    if (!studentId || !targetBatchId || !transferReason.trim()) {
      setTransferError('Please select a student, destination cohort, and provide a mandatory transfer reason.');
      return;
    }
    if (!user?.id) {
      setTransferError('You must be signed in to perform a student batch transfer.');
      return;
    }
    try {
      setTransferError(null);
      await transferStudentBatch(studentId, targetBatchId, transferReason.trim(), user.id);
      setIsTransferModal(false);
      setTransferReason('');
      setStatusMessage({ type: 'success', text: 'Student batch transfer executed and logged in audit trail.' });
      refreshList();
    } catch (err: any) {
      setTransferError(err?.message || 'Transfer failed');
    }
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
          {canTransfer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTransferError(null);
                setIsTransferModal(true);
              }}
              className="text-xs flex items-center space-x-1"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              <span>Transfer Student</span>
            </Button>
          )}
          {canCreate && (
            <Button
              variant="sap"
              size="sm"
              onClick={() => setIsAddModal(true)}
              className="text-xs flex items-center space-x-1"
            >
              <Plus className="h-4 w-4" />
              <span>New Batch</span>
            </Button>
          )}
        </div>
      </div>

      {isTrainer && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center space-x-2">
          <Filter className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            <strong>Trainer Scope Active:</strong> Displaying only your assigned cohorts ({visibleBatches.length} batch{visibleBatches.length === 1 ? '' : 'es'}).
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
          <div className="flex items-center space-x-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Batch Cards Grid */}
      {visibleBatches.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <GraduationCap className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-700 text-sm">No batches available</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {isTrainer
              ? 'You do not have any active batches assigned to your profile yet.'
              : 'Create a new batch schedule to begin enrolling students into cohorts.'}
          </p>
          {canCreate && (
            <Button
              variant="sap"
              size="sm"
              onClick={() => setIsAddModal(true)}
              className="mt-4 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Create First Batch
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleBatches.map((b) => (
            <Card
              key={b.id}
              onClick={() => openRoster(b)}
              className="hover:border-[#0A6ED1] hover:shadow-md transition-all flex flex-col justify-between cursor-pointer group"
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded group-hover:bg-blue-200 transition-colors"
                        title="Batch cohort code"
                      >
                        {b.batch_code}
                      </span>
                      {b.days && b.days.length > 0 && (
                        <span className="text-[10px] text-slate-500 font-medium">
                          {b.days.join(', ')}
                        </span>
                      )}
                    </div>
                    <h3
                      className="font-bold text-slate-900 text-sm mt-1 group-hover:text-[#0A6ED1] transition-colors"
                      title="Click card to view enrolled student roster"
                    >
                      {b.batch_name}
                    </h3>
                    <p className="text-xs text-slate-500">{b.course_name}</p>
                  </div>
                  <Badge
                    variant={
                      b.status === 'Active'
                        ? 'success'
                        : b.status === 'Completed'
                        ? 'secondary'
                        : b.status === 'Upcoming'
                        ? 'warning'
                        : 'outline'
                    }
                  >
                    {b.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 group-hover:border-blue-100 transition-colors">
                  <div className="flex items-center space-x-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{b.start_time} - {b.end_time}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{formatDate(b.start_date)} - {formatDate(b.end_date)}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 col-span-2">
                    <GraduationCap className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>Trainer: <strong className="text-slate-800">{b.trainer_name || 'Unassigned'}</strong></span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-500">Mode: <strong>{b.training_mode}</strong></span>
                  <span className={`font-semibold ${b.current_enrolled >= b.maximum_capacity ? 'text-amber-700' : 'text-slate-800'}`}>
                    Enrolled: {b.current_enrolled} / {b.maximum_capacity} students
                  </span>
                </div>

                {/* Batch Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRoster(b);
                    }}
                    className="text-xs flex items-center space-x-1 h-7 text-slate-700 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>Roster ({b.current_enrolled})</span>
                  </Button>

                  {canCreate && (
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(b);
                        }}
                        className="text-xs h-7 text-slate-600 hover:text-slate-900"
                      >
                        <Edit3 className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBatch(b);
                        }}
                        disabled={b.current_enrolled > 0}
                        title={b.current_enrolled > 0 ? 'Cannot delete batch with enrolled students' : 'Delete Batch'}
                        className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Audit History of Student Transfers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center space-x-2">
            <History className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm">Batch Transfer Audit Trail</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {transferAudits.length} Records
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {transferAudits.length === 0 ? (
            <p className="p-4 text-xs text-slate-400 italic">No student transfers recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
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
                  {transferAudits.map((aud) => (
                    <tr key={aud.id} className="hover:bg-slate-50/50">
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Roster Modal */}
      <Modal
        isOpen={isRosterModal}
        onClose={() => setIsRosterModal(false)}
        title={`Batch Roster: ${activeBatch?.batch_name || ''}`}
        description={`Current Enrollment: ${rosterStudents.length} / ${activeBatch?.maximum_capacity || 0} students`}
      >
        <div className="space-y-4">
          {rosterStudents.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-6 text-center">
              No students are currently enrolled in this batch.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-2.5">Student</th>
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5">Phone</th>
                    <th className="p-2.5">Attendance</th>
                    <th className="p-2.5">Fee Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rosterStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-semibold text-slate-800">{s.full_name}</td>
                      <td className="p-2.5 font-mono text-[11px] text-slate-600">{s.student_code}</td>
                      <td className="p-2.5 text-slate-600">{s.phone}</td>
                      <td className="p-2.5">
                        <span className={`font-semibold ${s.attendance_percentage >= 80 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {s.attendance_percentage}%
                        </span>
                      </td>
                      <td className="p-2.5">
                        <Badge variant={s.outstanding_amount === 0 ? 'success' : 'outline'}>
                          {s.outstanding_amount === 0 ? 'Paid' : `Due ₹${s.outstanding_amount.toLocaleString()}`}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setIsRosterModal(false)} className="text-xs">
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Batch Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Schedule New SAP Batch"
        description="Configure class timing, days, mode, and student capacity."
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
              {store.courses.length === 0 ? (
                <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium">
                  No courses found. Please create a course first.
                </div>
              ) : (
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                  required
                >
                  <option value="" disabled>Select a course</option>
                  {store.courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.course_name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Trainer *
              </label>
              {store.users.filter((u) => u.role === 'trainer').length === 0 ? (
                <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium">
                  No trainers found in system.
                </div>
              ) : (
                <select
                  value={trainerId}
                  onChange={(e) => setTrainerId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                  required
                >
                  <option value="" disabled>Select a trainer</option>
                  {store.users.filter((u) => u.role === 'trainer').map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Training Mode *
              </label>
              <select
                value={trainingMode}
                onChange={(e) => setTrainingMode(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Hybrid">Hybrid</option>
                <option value="Online">Online</option>
                <option value="Classroom">Classroom</option>
              </select>
            </div>
            <Input
              label="Capacity (Students) *"
              type="number"
              min={1}
              max={100}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              required
            />
          </div>

          {/* Days of the Week Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Class Days *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const isSelected = selectedDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDaySelection(day, selectedDays, setSelectedDays)}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
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

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Time *"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
            <Input
              label="End Time *"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sap"
              size="sm"
              disabled={store.courses.length === 0 || !courseId || !batchCode.trim() || !batchName.trim()}
            >
              Create Batch
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Batch Modal */}
      <Modal
        isOpen={isEditModal}
        onClose={() => setIsEditModal(false)}
        title={`Edit Batch: ${activeBatch?.batch_code || ''}`}
        description="Update batch schedule, mode, trainer assignment, and status."
      >
        <form onSubmit={handleUpdateBatch} className="space-y-4 text-xs">
          <div>
            <Input
              label="Batch Name *"
              value={editBatchName}
              onChange={(e) => setEditBatchName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Trainer *
              </label>
              <select
                value={editTrainerId}
                onChange={(e) => setEditTrainerId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                required
              >
                {store.users.filter((u) => u.role === 'trainer').map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Status *
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Upcoming">Upcoming</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Training Mode *
              </label>
              <select
                value={editMode}
                onChange={(e) => setEditMode(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Hybrid">Hybrid</option>
                <option value="Online">Online</option>
                <option value="Classroom">Classroom</option>
              </select>
            </div>
            <Input
              label="Maximum Capacity *"
              type="number"
              min={activeBatch?.current_enrolled || 1}
              max={100}
              value={editCapacity}
              onChange={(e) => setEditCapacity(Number(e.target.value))}
              required
            />
          </div>

          {/* Days Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Class Days
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const isSelected = editDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDaySelection(day, editDays, setEditDays)}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date *"
              type="date"
              value={editStartDate}
              onChange={(e) => setEditStartDate(e.target.value)}
              required
            />
            <Input
              label="End Date *"
              type="date"
              value={editEndDate}
              onChange={(e) => setEditEndDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Time *"
              type="time"
              value={editStartTime}
              onChange={(e) => setEditStartTime(e.target.value)}
              required
            />
            <Input
              label="End Time *"
              type="time"
              value={editEndTime}
              onChange={(e) => setEditEndTime(e.target.value)}
              required
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

      {/* Student Transfer Modal with Reason Audit */}
      <Modal
        isOpen={isTransferModal}
        onClose={() => setIsTransferModal(false)}
        title="Transfer Student Between Batches"
        description="Transfers the student with an immutable audit trail and capacity validation."
      >
        <form onSubmit={handleTransfer} className="space-y-4 text-xs">
          {transferError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
              {transferError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Student *
            </label>
            {transferableStudents.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
                {isTrainer
                  ? 'No students enrolled in your assigned cohorts are eligible for transfer.'
                  : 'No enrolled students available to transfer.'}
              </p>
            ) : (
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                {transferableStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.student_code} - Current Batch: {s.batch_name || 'Unassigned'})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Destination Batch *
            </label>
            {destinationBatches.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
                {isTrainer
                  ? 'No alternative cohorts assigned to your profile. Cross-trainer batch transfers require administrator authorization.'
                  : 'No alternative batches available to transfer this student to.'}
              </p>
            ) : (
              <select
                value={targetBatchId}
                onChange={(e) => setTargetBatchId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                {destinationBatches.map((b) => {
                  const isFull = b.maximum_capacity && b.current_enrolled >= b.maximum_capacity;
                  return (
                    <option key={b.id} value={b.id} disabled={Boolean(isFull)}>
                      {b.batch_name} ({b.start_time} - {b.end_time}, {b.current_enrolled}/{b.maximum_capacity}) {isFull ? '[AT CAPACITY]' : ''}
                    </option>
                  );
                })}
              </select>
            )}
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
            <Button
              type="submit"
              variant="sap"
              size="sm"
              disabled={transferableStudents.length === 0 || destinationBatches.length === 0 || !studentId || !targetBatchId}
            >
              Execute Transfer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Batch Student Roster Modal */}
      <Modal
        isOpen={isRosterModal}
        onClose={() => setIsRosterModal(false)}
        title={activeBatch ? `Batch Student Roster: ${activeBatch.batch_name}` : 'Batch Student Roster'}
        description={
          activeBatch
            ? `Cohort: ${activeBatch.batch_code} | Trainer: ${activeBatch.trainer_name || 'Unassigned'} | Mode: ${activeBatch.training_mode}`
            : 'Enrolled students for this cohort'
        }
      >
        <div className="space-y-4 text-xs">
          {/* Header Stats Bar */}
          {activeBatch && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Enrolled Trainees</p>
                <p className="text-sm font-bold text-slate-800">
                  {rosterStudents.length} / {activeBatch.maximum_capacity}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Schedule</p>
                <p className="text-sm font-bold text-slate-800">
                  {activeBatch.start_time} - {activeBatch.end_time}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Batch Status</p>
                <span className="inline-block mt-0.5">
                  <Badge
                    variant={activeBatch.status === 'Active' ? 'success' : 'outline'}
                    className="text-[10px]"
                  >
                    {activeBatch.status}
                  </Badge>
                </span>
              </div>
            </div>
          )}

          {rosterStudents.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 border border-slate-200 rounded-xl text-slate-400">
              <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">No students currently enrolled</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Transfer students to this cohort or enroll students from admissions.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="px-3 py-2.5">Student</th>
                    <th className="px-3 py-2.5">Admission #</th>
                    <th className="px-3 py-2.5">Attendance</th>
                    <th className="px-3 py-2.5">Fee Status</th>
                    <th className="px-3 py-2.5 text-right">Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rosterStudents.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="font-bold text-slate-900">{st.full_name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{st.student_code}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-blue-600 font-medium">{st.admission_number}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`font-semibold ${
                            st.attendance_percentage >= 80 ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        >
                          {st.attendance_percentage}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {st.outstanding_amount === 0 ? (
                          <Badge variant="success" className="text-[10px]">
                            Cleared
                          </Badge>
                        ) : (
                          <span className="text-amber-700 font-medium">
                            Due ₹{st.outstanding_amount?.toLocaleString('en-IN')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          href={`/students/${st.id}`}
                          className="text-[#0A6ED1] hover:underline font-semibold text-[11px]"
                        >
                          View 360 &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            {canTransfer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsRosterModal(false);
                  setIsTransferModal(true);
                }}
                className="text-xs flex items-center space-x-1"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>Transfer Student</span>
              </Button>
            )}
            <Button
              variant="sap"
              size="sm"
              onClick={() => setIsRosterModal(false)}
              className="ml-auto text-xs"
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
