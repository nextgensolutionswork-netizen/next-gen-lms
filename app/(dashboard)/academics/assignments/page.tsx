'use client';

import * as React from 'react';
import {
  FileText,
  Plus,
  Calendar,
  Clock,
  Download,
  Paperclip,
  ExternalLink,
  Edit3,
  Trash2,
  Send,
  CheckCircle2,
  AlertCircle,
  Filter,
  Check,
  Archive,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FileUpload } from '@/components/ui/file-upload';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { Assignment, AssignmentSubmission } from '@/types';
import {
  createAssignment,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  gradeAssignmentSubmission,
} from '@/lib/services/academics-service';
import { canAccessCourse } from '@/lib/auth/rbac';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';
import { exportAssignmentSubmissionsZip, downloadZip, ZipFileInput } from '@/lib/utils/zip-export';

export default function AssignmentsPage() {
  const { user, role, hasPermission } = useAuth();
  const [assignments, setAssignments] = React.useState<Assignment[]>(store.assignments);
  const [submissions, setSubmissions] = React.useState<AssignmentSubmission[]>(store.submissions);

  const isStudent = role === 'student';
  const isTrainer = role === 'trainer';
  const canCreate = hasPermission('assignments:write') || role === 'trainer' || role === 'admin' || role === 'super_admin';
  const canGrade = hasPermission('assignments:grade') || role === 'trainer' || role === 'admin' || role === 'super_admin';

  // Identify current student profile if user is student
  const currentStudent = React.useMemo(() => {
    if (!isStudent) return null;
    return store.students.find((s) => s.user_id === user?.id || s.email === user?.email) || store.students[0];
  }, [isStudent, user]);

  // Filter assignments accessible to this user
  const visibleAssignments = React.useMemo(() => {
    if (isStudent && currentStudent) {
      return assignments.filter(
        (a) => a.batch_id === currentStudent.batch_id || a.course_id === currentStudent.course_id
      );
    }
    if (isTrainer) {
      return assignments.filter((a) => canAccessCourse(user, a.course_id) || a.created_by === user?.id);
    }
    return assignments;
  }, [assignments, isStudent, isTrainer, currentStudent, user]);

  // Filter submissions
  const visibleSubmissions = React.useMemo(() => {
    if (isStudent) {
      return submissions.filter((s) => s.student_id === currentStudent?.id);
    }
    if (isTrainer) {
      const allowedAsgIds = new Set(visibleAssignments.map((a) => a.id));
      return submissions.filter((s) => allowedAsgIds.has(s.assignment_id));
    }
    return submissions;
  }, [submissions, isStudent, isTrainer, currentStudent, visibleAssignments]);

  // Modals state
  const [isAddModal, setIsAddModal] = React.useState(false);
  const [isEditModal, setIsEditModal] = React.useState(false);
  const [isSubmitModal, setIsSubmitModal] = React.useState(false);
  const [activeAssignment, setActiveAssignment] = React.useState<Assignment | null>(null);
  const [selectedSub, setSelectedSub] = React.useState<AssignmentSubmission | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Assignment form state
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || '');
  const [batchId, setBatchId] = React.useState(store.batches[0]?.id || '');
  const [dueDate, setDueDate] = React.useState('2026-03-30T23:59');
  const [maxMarks, setMaxMarks] = React.useState(100);
  const [assignmentFileUrl, setAssignmentFileUrl] = React.useState('');

  // Keep courseId and batchId synced when store data hydrates
  React.useEffect(() => {
    if (!courseId && store.courses.length > 0) {
      setCourseId(store.courses[0].id);
    }
  }, [courseId]);

  React.useEffect(() => {
    if (!batchId && store.batches.length > 0) {
      setBatchId(store.batches[0].id);
    }
  }, [batchId]);

  // Edit Assignment form state
  const [editTitle, setEditTitle] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editDueDate, setEditDueDate] = React.useState('');
  const [editMaxMarks, setEditMaxMarks] = React.useState(100);
  const [editFileUrl, setEditFileUrl] = React.useState('');

  // Student Submission form state
  const [submitStudentId, setSubmitStudentId] = React.useState('');
  const [submissionText, setSubmissionText] = React.useState('');
  const [submissionFileUrl, setSubmissionFileUrl] = React.useState('');

  // Grading form state
  const [gradeScore, setGradeScore] = React.useState(90);
  const [feedback, setFeedback] = React.useState('');

  const refreshList = () => {
    setAssignments([...store.assignments]);
    setSubmissions([...store.submissions]);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      setStatusMessage({ type: 'error', text: 'You do not have permission to publish assignments.' });
      return;
    }
    if (!title.trim()) {
      setStatusMessage({ type: 'error', text: 'Assignment title is required.' });
      return;
    }
    if (!description.trim()) {
      setStatusMessage({ type: 'error', text: 'Problem description is required.' });
      return;
    }
    if (!courseId) {
      setStatusMessage({ type: 'error', text: 'Please select a valid course before creating an assignment.' });
      return;
    }
    if (!batchId) {
      setStatusMessage({ type: 'error', text: 'Please select a target batch before creating an assignment.' });
      return;
    }
    if (!dueDate) {
      setStatusMessage({ type: 'error', text: 'Submission due date is required.' });
      return;
    }
    if (!maxMarks || maxMarks <= 0) {
      setStatusMessage({ type: 'error', text: 'Maximum marks must be greater than zero.' });
      return;
    }

    try {
      await createAssignment({
        title: title.trim(),
        description: description.trim(),
        course_id: courseId,
        batch_id: batchId,
        due_date: dueDate,
        maximum_marks: Number(maxMarks) || 100,
        attachment_url: assignmentFileUrl || undefined,
        created_by:
          user?.id ||
          store.batches.find((b) => b.id === batchId)?.trainer_id ||
          store.users.find((u) => u.role === 'trainer')?.id ||
          'usr-trainer',
      });
      setIsAddModal(false);
      setTitle('');
      setDescription('');
      setAssignmentFileUrl('');
      setStatusMessage({ type: 'success', text: `Assignment "${title}" published successfully.` });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to create assignment' });
    }
  };

  const openEditAssignment = (asg: Assignment) => {
    setActiveAssignment(asg);
    setEditTitle(asg.title);
    setEditDescription(asg.description || '');
    setEditDueDate(asg.due_date);
    setEditMaxMarks(asg.maximum_marks);
    setEditFileUrl(asg.attachment_url || '');
    setIsEditModal(true);
  };

  const handleUpdateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignment) return;
    try {
      await updateAssignment(activeAssignment.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        due_date: editDueDate,
        maximum_marks: Number(editMaxMarks) || 100,
        attachment_url: editFileUrl || undefined,
      });
      setIsEditModal(false);
      setStatusMessage({ type: 'success', text: `Assignment "${editTitle}" updated.` });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to update assignment' });
    }
  };

  const handleDeleteAssignment = async (asg: Assignment) => {
    if (!window.confirm(`Are you sure you want to delete assignment "${asg.title}" and its submissions?`)) {
      return;
    }
    try {
      await deleteAssignment(asg.id);
      setStatusMessage({ type: 'success', text: `Assignment "${asg.title}" deleted.` });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete assignment' });
    }
  };

  const openSubmitModal = (asg: Assignment) => {
    setActiveAssignment(asg);
    const targetStudentId = isStudent
      ? currentStudent?.id
      : (store.students.find((s) => s.batch_id === asg.batch_id)?.id || store.students[0]?.id || '');
    setSubmitStudentId(targetStudentId || '');

    const existing = submissions.find(
      (s) => s.assignment_id === asg.id && s.student_id === targetStudentId
    );
    if (existing) {
      setSubmissionText(existing.submission_text || '');
      setSubmissionFileUrl(existing.attachment_url || '');
    } else {
      setSubmissionText('');
      setSubmissionFileUrl('');
    }
    setIsSubmitModal(true);
  };

  const handleSubmitSolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignment) return;

    const targetStudent = isStudent
      ? currentStudent
      : store.students.find((s) => s.id === submitStudentId);

    if (!targetStudent) {
      setStatusMessage({
        type: 'error',
        text: isStudent
          ? 'No active student profile linked to this account. Please contact your administrator.'
          : 'Please select a valid student to submit on behalf of.',
      });
      return;
    }

    if (!submissionText.trim() && !submissionFileUrl.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Please provide either solution notes/log or attach a solution file.',
      });
      return;
    }

    try {
      await submitAssignment(activeAssignment.id, targetStudent.id, submissionText.trim(), submissionFileUrl || undefined);
      setIsSubmitModal(false);
      setSubmissionText('');
      setSubmissionFileUrl('');
      setStatusMessage({
        type: 'success',
        text: `Solution for "${activeAssignment.title}" submitted successfully for ${targetStudent.full_name}!`,
      });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Submission failed' });
    }
  };

  const handleGradeSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !canGrade) return;

    const asg = getSubAssignment(selectedSub.assignment_id);
    const maxMarksVal = asg?.maximum_marks ?? 100;
    if (gradeScore < 0 || gradeScore > maxMarksVal) {
      setStatusMessage({
        type: 'error',
        text: `Marks obtained (${gradeScore}) must be between 0 and maximum marks (${maxMarksVal}).`,
      });
      return;
    }

    try {
      const graderId =
        user?.id ||
        store.users.find((u) => u.role === 'trainer')?.id ||
        store.users.find((u) => u.role === 'admin')?.id ||
        'usr-trainer';
      await gradeAssignmentSubmission(selectedSub.id, gradeScore, feedback, graderId);
      setSelectedSub(null);
      setFeedback('');
      setStatusMessage({ type: 'success', text: `Grade (${gradeScore}/${maxMarksVal}) saved for student "${selectedSub.student_name}".` });
      refreshList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Grading failed' });
    }
  };

  const handleDownloadAllSubmissionsZip = () => {
    if (visibleSubmissions.length === 0) return;
    const files: ZipFileInput[] = [];

    let summary = `=======================================================\n`;
    summary += `STUDENT SUBMISSION EVALUATION QUEUE BATCH EXPORT\n`;
    summary += `=======================================================\n`;
    summary += `Total Submissions Exported: ${visibleSubmissions.length}\n`;
    summary += `Export Timestamp: ${formatDateTime(new Date().toISOString())}\n\n`;

    visibleSubmissions.forEach((s, idx) => {
      const asg = getSubAssignment(s.assignment_id);
      const asgTitle = asg?.title || 'Assignment';
      const studentSafe = (s.student_name || `Student_${s.student_id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const asgFolder = asgTitle.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
      const scoreStr = s.marks_obtained !== undefined ? `${s.marks_obtained}/${asg?.maximum_marks || 100}` : 'Pending';

      summary += `${idx + 1}. [${asgTitle}] ${s.student_name || s.student_id} | Status: ${s.status} | Score: ${scoreStr}\n`;

      let doc = `=======================================================\n`;
      doc += `STUDENT HOMEWORK SUBMISSION DETAILS\n`;
      doc += `=======================================================\n`;
      doc += `Assignment: ${asgTitle}\n`;
      doc += `Course: ${asg?.course_name || 'N/A'}\n`;
      doc += `Batch: ${asg?.batch_name || 'N/A'}\n`;
      doc += `Student Name: ${s.student_name || 'Unknown'}\n`;
      doc += `Student ID: ${s.student_id}\n`;
      doc += `Submitted At: ${formatDateTime(s.submitted_at)}\n`;
      doc += `Status: ${s.status}\n`;
      doc += `Marks: ${scoreStr}\n`;
      doc += `Evaluated By: ${s.graded_by || 'Pending Evaluation'}\n`;
      if (s.graded_at) doc += `Evaluated At: ${formatDateTime(s.graded_at)}\n`;
      doc += `Feedback:\n${s.feedback || 'No feedback comments recorded.'}\n\n`;
      doc += `-------------------------------------------------------\n`;
      doc += `SOLUTION TEXT / TRANSACTION LOG:\n`;
      doc += `-------------------------------------------------------\n`;
      doc += `${s.submission_text || 'No text submitted.'}\n\n`;
      if (s.attachment_url) {
        doc += `-------------------------------------------------------\n`;
        doc += `ATTACHMENT LINK / BLUEPRINT:\n`;
        doc += `${s.attachment_url}\n`;
      }

      files.push({
        name: `${asgFolder}/${studentSafe}_${s.id}.txt`,
        data: doc,
      });
    });

    files.unshift({
      name: 'EVALUATION_QUEUE_SUMMARY.txt',
      data: summary,
    });

    downloadZip('evaluation_queue_submissions.zip', files);
  };

  const getSubAssignment = (assignmentId: string): Assignment | undefined => {
    return assignments.find((a) => a.id === assignmentId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isStudent ? 'My Course Assignments' : 'Assignments & Evaluation Desk'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isStudent
              ? 'Review hands-on lab problems, submit your solution blueprints, and track faculty feedback.'
              : 'Publish hands-on SAP configuration challenges, evaluate student solution blueprints, and provide faculty feedback.'}
          </p>
        </div>
        {canCreate && (
          <Button
            variant="sap"
            size="sm"
            onClick={() => setIsAddModal(true)}
            className="text-xs flex items-center space-x-1"
          >
            <Plus className="h-4 w-4" />
            <span>New Assignment</span>
          </Button>
        )}
      </div>

      {isTrainer && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center space-x-2">
          <Filter className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            <strong>Faculty Evaluation Mode:</strong> Showing assignments and submissions across your assigned modules.
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
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600 text-xs ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Published Assignments Cards */}
      {visibleAssignments.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <FileText className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-700 text-sm">No assignments posted yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {isStudent
              ? 'Your instructor has not published any assignments for your enrolled course/batch.'
              : 'Publish your first hands-on SAP configuration task for your batches.'}
          </p>
          {canCreate && (
            <Button variant="sap" size="sm" onClick={() => setIsAddModal(true)} className="mt-4 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> Create Assignment
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleAssignments.map((asg) => {
            const studentSub = isStudent
              ? submissions.find((s) => s.assignment_id === asg.id && s.student_id === currentStudent?.id)
              : null;
            const subCount = submissions.filter((s) => s.assignment_id === asg.id).length;

            return (
              <Card key={asg.id} className="flex flex-col justify-between hover:border-[#0A6ED1] transition-all">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{asg.title}</h3>
                      <p className="text-xs text-blue-600 font-semibold mt-0.5">
                        {asg.course_name} {asg.batch_name ? `• ${asg.batch_name}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline">{asg.maximum_marks} Marks</Badge>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">{asg.description}</p>

                  {asg.attachment_url && (
                    <div className="pt-1">
                      <a
                        href={asg.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 text-[11px] text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded font-medium border border-blue-100"
                      >
                        <Paperclip className="h-3 w-3 text-blue-500" />
                        <span>Reference Blueprint / Material</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span className="flex items-center space-x-1">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>Due: {formatDate(asg.due_date)}</span>
                    </span>
                    {!isStudent && (
                      <span className="font-bold text-slate-800">{subCount} Submissions</span>
                    )}
                    {isStudent && (
                      <Badge variant={studentSub?.status === 'Graded' ? 'success' : studentSub ? 'warning' : 'outline'}>
                        {studentSub ? studentSub.status : 'Not Submitted'}
                      </Badge>
                    )}
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div>
                      {!isStudent && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={subCount === 0}
                          onClick={() => {
                            const asgSubs = submissions.filter((s) => s.assignment_id === asg.id);
                            exportAssignmentSubmissionsZip(asg, asgSubs);
                          }}
                          className="text-[11px] h-7 text-blue-700 bg-blue-50/60 border-blue-200 hover:bg-blue-100 disabled:opacity-50 flex items-center space-x-1"
                          title={subCount > 0 ? "Download all submissions for this assignment as a ZIP" : "No submissions to download"}
                        >
                          <Archive className="h-3 w-3 text-blue-600" />
                          <span>Submissions ZIP ({subCount})</span>
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center space-x-1">
                      {isStudent && (
                        <Button
                          variant={studentSub ? 'outline' : 'sap'}
                          size="sm"
                          onClick={() => openSubmitModal(asg)}
                          className="text-xs h-7 flex items-center space-x-1"
                        >
                          <Send className="h-3 w-3" />
                          <span>{studentSub ? 'Update Submission' : 'Submit Solution'}</span>
                        </Button>
                      )}

                      {!isStudent && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openSubmitModal(asg)}
                          className="text-xs h-7 text-indigo-700 bg-indigo-50/60 border-indigo-200 hover:bg-indigo-100 flex items-center space-x-1"
                          title="Submit or upload homework solution on behalf of an enrolled student"
                        >
                          <Send className="h-3 w-3 text-indigo-600" />
                          <span>Submit on Behalf</span>
                        </Button>
                      )}

                      {canCreate && (
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditAssignment(asg)}
                            className="text-xs h-7 text-slate-600 hover:text-slate-900"
                          >
                            <Edit3 className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteAssignment(asg)}
                            className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            title="Delete Assignment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Submissions Evaluation Queue or Student Feedback List */}
      <Card>
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-sm">
            {isStudent ? 'My Submissions & Faculty Evaluation' : 'Student Submission Evaluation Queue'}
          </CardTitle>
          {!isStudent && visibleSubmissions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadAllSubmissionsZip}
              className="text-xs h-7 text-blue-700 bg-blue-50/50 border-blue-200 hover:bg-blue-100 flex items-center space-x-1.5 self-start sm:self-auto"
              title="Download all listed submissions as a ZIP archive"
            >
              <Archive className="h-3.5 w-3.5 text-blue-600" />
              <span>Download All Submissions ZIP ({visibleSubmissions.length})</span>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {visibleSubmissions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <CheckCircle2 className="h-6 w-6 text-slate-400" />
              </div>
              <h4 className="font-semibold text-slate-700 text-sm">
                {isStudent ? 'No Submissions Recorded Yet' : 'Evaluation Queue Empty'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {isStudent
                  ? 'You have not submitted solutions for any active assignments. Select an assignment above and click "Submit Solution".'
                  : 'No student homework submissions have been submitted for review across your batches.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    {!isStudent && <th className="px-4 py-3">Student Name</th>}
                    <th className="px-4 py-3">Assignment</th>
                    <th className="px-4 py-3">Submission Details</th>
                    <th className="px-4 py-3">Submitted At</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Faculty Feedback</th>
                    {canGrade && <th className="px-4 py-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleSubmissions.map((sub) => {
                    const asg = getSubAssignment(sub.assignment_id);
                    const maxMarksVal = asg?.maximum_marks || 100;

                    return (
                      <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                        {!isStudent && <td className="px-4 py-3 font-semibold text-slate-800">{sub.student_name}</td>}
                        <td className="px-4 py-3 font-medium text-slate-900">{asg?.title || 'Assignment'}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-[220px]">
                          <p className="truncate">{sub.submission_text || 'Document attached'}</p>
                          {sub.attachment_url && (
                            <a
                              href={sub.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline mt-1 font-medium"
                            >
                              <Paperclip className="h-3 w-3 text-blue-500" />
                              <span>View Homework File</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDateTime(sub.submitted_at)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={sub.status === 'Graded' ? 'success' : 'warning'}>{sub.status}</Badge>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {sub.marks_obtained !== undefined ? `${sub.marks_obtained} / ${maxMarksVal}` : 'Pending'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 italic max-w-[180px] truncate">
                          {sub.feedback || '—'}
                        </td>
                        {canGrade && (
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="sap"
                              size="sm"
                              onClick={() => {
                                setSelectedSub(sub);
                                const currentAsg = getSubAssignment(sub.assignment_id);
                                const max = currentAsg?.maximum_marks ?? 100;
                                setGradeScore(sub.marks_obtained !== undefined ? sub.marks_obtained : Math.round(max * 0.8));
                                setFeedback(sub.feedback || '');
                              }}
                              className="text-xs px-2.5 py-1"
                            >
                              {sub.status === 'Graded' ? 'Re-Grade' : 'Grade'}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
          {store.courses.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>No courses available. Please create a course first before publishing assignments.</span>
            </div>
          )}
          {store.batches.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>No batches available. Please create a batch first before publishing assignments.</span>
            </div>
          )}

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
                required
              >
                <option value="">-- Select Course --</option>
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
                required
              >
                <option value="">-- Select Batch --</option>
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
              label="Maximum Marks *"
              type="number"
              min={1}
              max={1000}
              value={maxMarks}
              onChange={(e) => setMaxMarks(Number(e.target.value))}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Problem Description & Deliverables *
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

          <FileUpload
            bucket="assignments"
            value={assignmentFileUrl}
            onChange={(url) => setAssignmentFileUrl(url || '')}
            label="Assignment Specification / Blueprint Document (PDF, ZIP, DOCX, XLSX)"
          />

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sap"
              size="sm"
              disabled={store.courses.length === 0 || store.batches.length === 0}
            >
              Publish Assignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Assignment Modal */}
      <Modal
        isOpen={isEditModal}
        onClose={() => setIsEditModal(false)}
        title={`Edit Assignment: ${activeAssignment?.title || ''}`}
        description="Update guidelines, due dates, or maximum marks."
      >
        <form onSubmit={handleUpdateAssignment} className="space-y-4 text-xs">
          <Input
            label="Assignment Title *"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Submission Due Date *"
              type="datetime-local"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              required
            />
            <Input
              label="Maximum Marks *"
              type="number"
              min={1}
              max={1000}
              value={editMaxMarks}
              onChange={(e) => setEditMaxMarks(Number(e.target.value))}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Problem Description & Deliverables
            </label>
            <textarea
              rows={4}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              required
            />
          </div>

          <FileUpload
            bucket="assignments"
            value={editFileUrl}
            onChange={(url) => setEditFileUrl(url || '')}
            label="Reference Blueprint / Document (PDF, ZIP, DOCX, XLSX)"
          />

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

      {/* Student Submit Solution Modal */}
      <Modal
        isOpen={isSubmitModal}
        onClose={() => setIsSubmitModal(false)}
        title={isStudent ? `Submit Solution: ${activeAssignment?.title || ''}` : `Submit Solution on Behalf: ${activeAssignment?.title || ''}`}
        description={`Max Marks: ${activeAssignment?.maximum_marks || 100} • Due: ${activeAssignment ? formatDate(activeAssignment.due_date) : ''}`}
      >
        <form onSubmit={handleSubmitSolution} className="space-y-4 text-xs">
          {isStudent ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-700">Student Profile: </span>
                <span className="font-bold text-slate-900">{currentStudent?.full_name || user?.full_name || 'Logged-in Student'}</span>
                {currentStudent?.student_code && (
                  <span className="text-slate-500 font-mono ml-1.5">({currentStudent.student_code})</span>
                )}
              </div>
              <Badge variant="outline">{currentStudent?.batch_name || 'Enrolled Batch'}</Badge>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Select Student (Batch: {activeAssignment?.batch_name || 'All'}) *
              </label>
              <select
                value={submitStudentId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSubmitStudentId(newId);
                  const existing = submissions.find(
                    (s) => s.assignment_id === activeAssignment?.id && s.student_id === newId
                  );
                  if (existing) {
                    setSubmissionText(existing.submission_text || '');
                    setSubmissionFileUrl(existing.attachment_url || '');
                  } else {
                    setSubmissionText('');
                    setSubmissionFileUrl('');
                  }
                }}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                required
              >
                <option value="">-- Select Enrolled Student --</option>
                {(
                  store.students.filter((s) => !activeAssignment?.batch_id || s.batch_id === activeAssignment.batch_id).length > 0
                    ? store.students.filter((s) => !activeAssignment?.batch_id || s.batch_id === activeAssignment.batch_id)
                    : store.students
                ).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.student_code || s.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Solution Notes / Transaction Log Details
            </label>
            <textarea
              rows={4}
              value={submissionText}
              onChange={(e) => setSubmissionText(e.target.value)}
              placeholder="Detail your configuration steps, company code settings, or test execution summary..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Provide solution description or attach homework file below.
            </p>
          </div>

          <FileUpload
            bucket="assignments"
            value={submissionFileUrl}
            onChange={(url) => setSubmissionFileUrl(url || '')}
            label="Attach Homework Solution Blueprint / Screenshot ZIP"
          />

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsSubmitModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sap"
              size="sm"
              disabled={!isStudent && !submitStudentId}
              className="flex items-center space-x-1"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isStudent ? 'Submit Solution' : 'Submit on Behalf'}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Grade Submission Modal */}
      {selectedSub && (() => {
        const currentAsg = getSubAssignment(selectedSub.assignment_id);
        const currentMaxMarks = currentAsg?.maximum_marks ?? 100;

        return (
          <Modal
            isOpen={!!selectedSub}
            onClose={() => setSelectedSub(null)}
            title={`Grade Submission: ${selectedSub.student_name}`}
            description={`Assignment: ${currentAsg?.title || 'Task'} • Maximum Marks: ${currentMaxMarks}`}
          >
            <form onSubmit={handleGradeSubmission} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div>
                  <p className="font-bold text-slate-700">Student Solution Text:</p>
                  <p className="text-slate-800 mt-0.5">{selectedSub.submission_text || 'No description text provided.'}</p>
                </div>

                {selectedSub.attachment_url && (
                  <div className="pt-2 border-t border-slate-200">
                    <p className="font-bold text-slate-700 mb-1.5">Submitted Homework Document:</p>
                    <a
                      href={selectedSub.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Download className="h-3.5 w-3.5 text-blue-600" />
                      <span>Download / Open Homework File</span>
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </a>
                  </div>
                )}
              </div>

              <div>
                <Input
                  label={`Marks Obtained (out of ${currentMaxMarks}) *`}
                  type="number"
                  min={0}
                  max={currentMaxMarks}
                  value={gradeScore}
                  onChange={(e) => setGradeScore(Number(e.target.value))}
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Marks must be between 0 and {currentMaxMarks}.
                </p>
              </div>

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
        );
      })()}
    </div>
  );
}
