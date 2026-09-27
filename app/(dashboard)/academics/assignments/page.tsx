'use client';

import * as React from 'react';
import {
  FileText,
  Plus,
  Calendar,
  CheckCircle,
  Clock,
  UserCheck,
  MessageSquare,
  Award,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Assignment, AssignmentSubmission } from '@/types';
import { createAssignment, gradeAssignmentSubmission } from '@/lib/services/academics-service';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';

export default function AssignmentsPage() {
  const [assignments, setAssignments] = React.useState<Assignment[]>(store.assignments);
  const [submissions, setSubmissions] = React.useState<AssignmentSubmission[]>(store.submissions);
  const [isAddModal, setIsAddModal] = React.useState(false);
  const [selectedSub, setSelectedSub] = React.useState<AssignmentSubmission | null>(null);

  // New Assignment form state
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || '');
  const [batchId, setBatchId] = React.useState(store.batches[0]?.id || '');
  const [dueDate, setDueDate] = React.useState('2026-03-15T23:59');
  const [maxMarks, setMaxMarks] = React.useState(100);

  // Grading form state
  const [gradeScore, setGradeScore] = React.useState(90);
  const [feedback, setFeedback] = React.useState('');

  const refreshList = () => {
    setAssignments([...store.assignments]);
    setSubmissions([...store.submissions]);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) return;
    await createAssignment({
      title,
      description,
      course_id: courseId,
      batch_id: batchId,
      due_date: dueDate,
      maximum_marks: maxMarks,
      created_by: 'usr-trainer-fico',
    });
    setIsAddModal(false);
    setTitle('');
    setDescription('');
    refreshList();
  };

  const handleGradeSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;
    await gradeAssignmentSubmission(selectedSub.id, gradeScore, feedback, 'usr-trainer-fico');
    setSelectedSub(null);
    setFeedback('');
    refreshList();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Assignments & Evaluation Desk</h1>
          <p className="text-xs text-slate-500 mt-1">
            Publish hands-on SAP configuration challenges, evaluate student solution blueprints, and provide faculty feedback.
          </p>
        </div>
        <Button
          variant="sap"
          size="sm"
          onClick={() => setIsAddModal(true)}
          className="text-xs flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>New Assignment</span>
        </Button>
      </div>

      {/* Published Assignments Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assignments.map((asg) => (
          <Card key={asg.id}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{asg.title}</h3>
                  <p className="text-xs text-blue-600 font-semibold mt-0.5">{asg.course_name}</p>
                </div>
                <Badge variant="outline">{asg.maximum_marks} Marks</Badge>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{asg.description}</p>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span className="flex items-center space-x-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Due: {formatDate(asg.due_date)}</span>
                </span>
                <span className="font-bold text-slate-800">
                  {submissions.filter((s) => s.assignment_id === asg.id).length} Submissions
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Submissions Evaluation Queue */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Student Submission Evaluation Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Submission Details</th>
                  <th className="px-4 py-3">Submitted At</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Feedback</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{sub.student_name}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate">{sub.submission_text}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(sub.submitted_at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={sub.status === 'Graded' ? 'success' : 'warning'}>{sub.status}</Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {sub.marks_obtained !== undefined ? `${sub.marks_obtained} / 100` : 'Pending'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 italic max-w-[180px] truncate">
                      {sub.feedback || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="sap"
                        size="sm"
                        onClick={() => {
                          setSelectedSub(sub);
                          setGradeScore(sub.marks_obtained || 90);
                          setFeedback(sub.feedback || '');
                        }}
                        className="text-xs px-2.5 py-1"
                      >
                        {sub.status === 'Graded' ? 'Re-Grade' : 'Grade'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Assignment Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Create New Assignment"
        description="Assign SAP hands-on problem statements to batches."
      >
        <form onSubmit={handleCreateAssignment} className="space-y-4 text-xs">
          <Input
            label="Assignment Title *"
            placeholder="e.g. End-to-End Automatic Payment Program (F110) Configuration"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

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
                Target Batch *
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Submission Due Date *"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
            <Input
              label="Maximum Marks"
              type="number"
              value={maxMarks}
              onChange={(e) => setMaxMarks(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Problem Description & Deliverables
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="State the requirement, test data, and expected screenshot deliverables..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Publish Assignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Grade Submission Modal */}
      {selectedSub && (
        <Modal
          isOpen={!!selectedSub}
          onClose={() => setSelectedSub(null)}
          title={`Grade Submission: ${selectedSub.student_name}`}
          description="Evaluate accuracy, configuration quality, and assign marks."
        >
          <form onSubmit={handleGradeSubmission} className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <p className="font-bold text-slate-700">Student Solution Text:</p>
              <p className="text-slate-800">{selectedSub.submission_text}</p>
            </div>

            <Input
              label="Marks Obtained (out of 100) *"
              type="number"
              min={0}
              max={100}
              value={gradeScore}
              onChange={(e) => setGradeScore(Number(e.target.value))}
              required
            />

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Trainer Feedback Comments *
              </label>
              <textarea
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Give constructive feedback on configuration logic, transaction steps..."
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSub(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm">
                Submit Grade & Feedback
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
