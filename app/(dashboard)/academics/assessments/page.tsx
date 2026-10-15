'use client';

import * as React from 'react';
import {
  HelpCircle,
  Plus,
  Clock,
  CheckCircle,
  Award,
  BarChart,
  FileCheck,
  Edit3,
  Trash2,
  PlayCircle,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  ListPlus,
  Filter,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { Quiz, QuizQuestion, QuizAttempt } from '@/types';
import {
  createQuiz,
  updateQuiz,
  deleteQuiz,
  createQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  getQuizQuestions,
  submitQuizAnswers,
  QuizEvaluationResult,
} from '@/lib/services/academics-service';
import { canAccessCourse } from '@/lib/auth/rbac';
import { formatDateTime } from '@/lib/utils/formatters';

export default function AssessmentsPage() {
  const { user, role, hasPermission } = useAuth();
  const [quizzes, setQuizzes] = React.useState<Quiz[]>(store.quizzes);
  const [quizQuestions, setQuizQuestions] = React.useState<QuizQuestion[]>(store.quizQuestions);
  const [attempts, setAttempts] = React.useState<QuizAttempt[]>(store.quizAttempts);

  const isStudent = role === 'student';
  const isTrainer = role === 'trainer';
  const canManage = hasPermission('assessments:write') || role === 'trainer' || role === 'admin' || role === 'super_admin';

  // Current student resolution
  const currentStudent = React.useMemo(() => {
    if (!isStudent) return null;
    return store.students.find((s) => s.user_id === user?.id || s.email === user?.email) || store.students[0];
  }, [isStudent, user]);

  // Filter quizzes visible to user
  const visibleQuizzes = React.useMemo(() => {
    if (isStudent && currentStudent) {
      return quizzes.filter((q) => q.course_id === currentStudent.course_id);
    }
    if (isTrainer) {
      return quizzes.filter((q) => canAccessCourse(user, q.course_id));
    }
    return quizzes;
  }, [quizzes, isStudent, isTrainer, currentStudent, user]);

  // Selected quiz for question management or taking exam
  const [selectedQuizId, setSelectedQuizId] = React.useState<string>(visibleQuizzes[0]?.id || '');
  React.useEffect(() => {
    if (visibleQuizzes.length > 0 && !visibleQuizzes.some((q) => q.id === selectedQuizId)) {
      setSelectedQuizId(visibleQuizzes[0].id);
    }
  }, [visibleQuizzes, selectedQuizId]);

  const activeQuiz = visibleQuizzes.find((q) => q.id === selectedQuizId) || visibleQuizzes[0];
  const activeQuizQuestions = React.useMemo(() => {
    return activeQuiz ? quizQuestions.filter((q) => q.quiz_id === activeQuiz.id) : [];
  }, [quizQuestions, activeQuiz]);

  // Filter attempts
  const visibleAttempts = React.useMemo(() => {
    if (isStudent && currentStudent) {
      return attempts.filter((a) => a.student_id === currentStudent.id);
    }
    if (isTrainer) {
      const allowedQuizIds = new Set(visibleQuizzes.map((q) => q.id));
      return attempts.filter((a) => allowedQuizIds.has(a.quiz_id));
    }
    return attempts;
  }, [attempts, isStudent, isTrainer, currentStudent, visibleQuizzes]);

  // Modals state
  const [isAddQuizModal, setIsAddQuizModal] = React.useState(false);
  const [isEditQuizModal, setIsEditQuizModal] = React.useState(false);
  const [isAddQuestionModal, setIsAddQuestionModal] = React.useState(false);
  const [isExamModal, setIsExamModal] = React.useState(false);
  const [examResult, setExamResult] = React.useState<QuizAttempt | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Quiz state
  const [newTitle, setNewTitle] = React.useState('');
  const [newCourseId, setNewCourseId] = React.useState(store.courses[0]?.id || '');
  const [newDesc, setNewDesc] = React.useState('');
  const [newDuration, setNewDuration] = React.useState(45);
  const [newPassPct, setNewPassPct] = React.useState(70);

  // Sync newCourseId when store.courses populates
  React.useEffect(() => {
    if (!newCourseId && store.courses.length > 0) {
      setNewCourseId(store.courses[0].id);
    }
  }, [newCourseId]);

  // Edit Quiz state
  const [editTitle, setEditTitle] = React.useState('');
  const [editDesc, setEditDesc] = React.useState('');
  const [editDuration, setEditDuration] = React.useState(45);
  const [editPassPct, setEditPassPct] = React.useState(70);

  // Add Question state
  const [questionText, setQuestionText] = React.useState('');
  const [optA, setOptA] = React.useState('');
  const [optB, setOptB] = React.useState('');
  const [optC, setOptC] = React.useState('');
  const [optD, setOptD] = React.useState('');
  const [correctChoice, setCorrectChoice] = React.useState<'A' | 'B' | 'C' | 'D'>('A');
  const [questionPoints, setQuestionPoints] = React.useState(1);
  const [explanation, setExplanation] = React.useState('');

  // Edit Question state
  const [editingQuestion, setEditingQuestion] = React.useState<QuizQuestion | null>(null);
  const [isEditQuestionModal, setIsEditQuestionModal] = React.useState(false);
  const [editQText, setEditQText] = React.useState('');
  const [editQOptA, setEditQOptA] = React.useState('');
  const [editQOptB, setEditQOptB] = React.useState('');
  const [editQOptC, setEditQOptC] = React.useState('');
  const [editQOptD, setEditQOptD] = React.useState('');
  const [editQCorrect, setEditQCorrect] = React.useState<'A' | 'B' | 'C' | 'D'>('A');
  const [editQPoints, setEditQPoints] = React.useState(1);
  const [editQExplanation, setEditQExplanation] = React.useState('');

  // Interactive Student Exam state
  const [examAnswers, setExamAnswers] = React.useState<Record<string, string>>({});
  const [examSubmitting, setExamSubmitting] = React.useState(false);

  const refreshState = () => {
    setQuizzes([...store.quizzes]);
    setQuizQuestions([...store.quizQuestions]);
    setAttempts([...store.quizAttempts]);
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) {
      setStatusMessage({ type: 'error', text: 'You do not have permission to create assessments.' });
      return;
    }
    if (!newTitle.trim()) {
      setStatusMessage({ type: 'error', text: 'Assessment title is required.' });
      return;
    }
    if (!newCourseId) {
      setStatusMessage({ type: 'error', text: 'Please select a valid course.' });
      return;
    }
    if (!newDuration || newDuration <= 0) {
      setStatusMessage({ type: 'error', text: 'Duration must be greater than zero minutes.' });
      return;
    }
    if (!newPassPct || newPassPct <= 0 || newPassPct > 100) {
      setStatusMessage({ type: 'error', text: 'Passing score percentage must be between 1 and 100.' });
      return;
    }

    try {
      await createQuiz({
        course_id: newCourseId,
        title: newTitle.trim(),
        description: newDesc.trim(),
        duration_minutes: Number(newDuration) || 45,
        pass_percentage: Number(newPassPct) || 70,
        attempts_allowed: 2,
        randomize_questions: true,
        show_answers_after: true,
        status: 'Published',
      });
      setIsAddQuizModal(false);
      setNewTitle('');
      setNewDesc('');
      setStatusMessage({ type: 'success', text: `Assessment "${newTitle}" created and persisted successfully.` });
      refreshState();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to create quiz' });
    }
  };

  const openEditQuiz = (q: Quiz) => {
    setSelectedQuizId(q.id);
    setEditTitle(q.title);
    setEditDesc(q.description || '');
    setEditDuration(q.duration_minutes);
    setEditPassPct(q.pass_percentage);
    setIsEditQuizModal(true);
  };

  const handleUpdateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuiz) return;
    try {
      await updateQuiz(activeQuiz.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        duration_minutes: Number(editDuration) || 45,
        pass_percentage: Number(editPassPct) || 70,
      });
      setIsEditQuizModal(false);
      setStatusMessage({ type: 'success', text: `Assessment "${editTitle}" updated.` });
      refreshState();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to update quiz' });
    }
  };

  const handleDeleteQuiz = async (q: Quiz) => {
    if (!window.confirm(`Are you sure you want to delete assessment "${q.title}" and all its questions?`)) {
      return;
    }
    try {
      await deleteQuiz(q.id);
      setStatusMessage({ type: 'success', text: `Assessment "${q.title}" deleted.` });
      refreshState();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete quiz' });
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuiz) return;
    if (!questionText.trim()) {
      setStatusMessage({ type: 'error', text: 'Question text is required.' });
      return;
    }
    if (!optA.trim() || !optB.trim()) {
      setStatusMessage({ type: 'error', text: 'Options A and B are required.' });
      return;
    }
    if (correctChoice === 'C' && !optC.trim()) {
      setStatusMessage({ type: 'error', text: 'Option C is marked as correct but is empty.' });
      return;
    }
    if (correctChoice === 'D' && !optD.trim()) {
      setStatusMessage({ type: 'error', text: 'Option D is marked as correct but is empty.' });
      return;
    }

    try {
      const options = [
        { id: 'opt-a', text: optA.trim(), is_correct: correctChoice === 'A' },
        { id: 'opt-b', text: optB.trim(), is_correct: correctChoice === 'B' },
      ];
      if (optC.trim()) options.push({ id: 'opt-c', text: optC.trim(), is_correct: correctChoice === 'C' });
      if (optD.trim()) options.push({ id: 'opt-d', text: optD.trim(), is_correct: correctChoice === 'D' });

      await createQuizQuestion(
        activeQuiz.id,
        questionText.trim(),
        options,
        Number(questionPoints) || 1,
        explanation.trim() || undefined
      );
      setIsAddQuestionModal(false);
      setQuestionText('');
      setOptA('');
      setOptB('');
      setOptC('');
      setOptD('');
      setQuestionPoints(1);
      setExplanation('');
      setStatusMessage({ type: 'success', text: `New question added to "${activeQuiz.title}".` });
      refreshState();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to add question' });
    }
  };

  const openEditQuestion = (q: QuizQuestion) => {
    setEditingQuestion(q);
    setEditQText(q.question_text);
    setEditQOptA(q.options[0]?.text || '');
    setEditQOptB(q.options[1]?.text || '');
    setEditQOptC(q.options[2]?.text || '');
    setEditQOptD(q.options[3]?.text || '');
    const correctIdx = q.options.findIndex((opt) => opt.is_correct);
    setEditQCorrect((['A', 'B', 'C', 'D'][correctIdx] as any) || 'A');
    setEditQPoints(q.points || 1);
    setEditQExplanation(q.explanation || '');
    setIsEditQuestionModal(true);
  };

  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    if (!editQText.trim()) {
      setStatusMessage({ type: 'error', text: 'Question text is required.' });
      return;
    }
    if (!editQOptA.trim() || !editQOptB.trim()) {
      setStatusMessage({ type: 'error', text: 'Options A and B are required.' });
      return;
    }
    if (editQCorrect === 'C' && !editQOptC.trim()) {
      setStatusMessage({ type: 'error', text: 'Option C is marked as correct but is empty.' });
      return;
    }
    if (editQCorrect === 'D' && !editQOptD.trim()) {
      setStatusMessage({ type: 'error', text: 'Option D is marked as correct but is empty.' });
      return;
    }

    try {
      const options = [
        { id: editingQuestion.options[0]?.id || 'opt-a', text: editQOptA.trim(), is_correct: editQCorrect === 'A' },
        { id: editingQuestion.options[1]?.id || 'opt-b', text: editQOptB.trim(), is_correct: editQCorrect === 'B' },
      ];
      if (editQOptC.trim()) options.push({ id: editingQuestion.options[2]?.id || 'opt-c', text: editQOptC.trim(), is_correct: editQCorrect === 'C' });
      if (editQOptD.trim()) options.push({ id: editingQuestion.options[3]?.id || 'opt-d', text: editQOptD.trim(), is_correct: editQCorrect === 'D' });

      await updateQuizQuestion(editingQuestion.id, {
        question_text: editQText.trim(),
        options,
        points: Number(editQPoints) || 1,
        explanation: editQExplanation.trim() || undefined,
      });

      setIsEditQuestionModal(false);
      setEditingQuestion(null);
      setStatusMessage({ type: 'success', text: 'Question updated successfully.' });
      refreshState();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to update question' });
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    try {
      await deleteQuizQuestion(qId);
      setStatusMessage({ type: 'success', text: 'Question removed from assessment.' });
      refreshState();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete question' });
    }
  };

  const startExam = (q: Quiz) => {
    if (isStudent && currentStudent) {
      const userAttempts = attempts.filter((a) => a.quiz_id === q.id && a.student_id === currentStudent.id);
      const maxAllowed = q.attempts_allowed || 2;
      if (userAttempts.length >= maxAllowed && !userAttempts.some((a) => a.passed)) {
        setStatusMessage({
          type: 'error',
          text: `You have reached the maximum allowed attempts (${maxAllowed}) for "${q.title}".`,
        });
        return;
      }
    }
    setSelectedQuizId(q.id);
    setExamAnswers({});
    setExamResult(null);
    setIsExamModal(true);
  };

  const handleSubmitExam = async () => {
    if (!activeQuiz) return;
    const targetStudentId = isStudent
      ? currentStudent?.id
      : (store.students[0]?.id || user?.id || 'usr-tester');
    if (!targetStudentId) {
      setStatusMessage({ type: 'error', text: 'No student profile resolved for assessment submission.' });
      return;
    }
    setExamSubmitting(true);
    try {
      const attempt = await submitQuizAnswers(activeQuiz.id, targetStudentId, examAnswers);
      setExamResult(attempt);
      refreshState();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Exam submission failed' });
    } finally {
      setExamSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Assessments & Certification Exams</h1>
          <p className="text-xs text-slate-500 mt-1">
            {isStudent
              ? 'Attempt module qualification quizzes and earn official SAP course completion benchmarks.'
              : 'Build MCQ and objective assessments with automated instant grading and pass/fail thresholds.'}
          </p>
        </div>
        {canManage && (
          <Button
            variant="sap"
            size="sm"
            onClick={() => setIsAddQuizModal(true)}
            className="text-xs flex items-center space-x-1"
          >
            <Plus className="h-4 w-4" />
            <span>New Assessment</span>
          </Button>
        )}
      </div>

      {isTrainer && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center space-x-2">
          <Filter className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            <strong>Faculty Assessment Scope:</strong> Managing quizzes and question banks for your assigned course modules.
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

      {/* Quizzes List Cards */}
      {visibleQuizzes.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <HelpCircle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-700 text-sm">No assessments available</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {isStudent
              ? 'No exams have been published for your course yet.'
              : 'Create an assessment quiz with multiple-choice questions to evaluate trainee proficiency.'}
          </p>
          {canManage && (
            <Button variant="sap" size="sm" onClick={() => setIsAddQuizModal(true)} className="mt-4 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> Create First Assessment
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleQuizzes.map((q) => {
            const studentAttempts = attempts.filter((a) => a.quiz_id === q.id && a.student_id === currentStudent?.id);
            const latestAttempt = studentAttempts[0];
            const hasPassed = studentAttempts.some((a) => a.passed);
            const isSelected = selectedQuizId === q.id;

            return (
              <Card
                key={q.id}
                className={`transition-all flex flex-col justify-between ${
                  isSelected && canManage ? 'border-2 border-[#0A6ED1] shadow-xs' : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{q.title}</h3>
                      <p className="text-xs text-[#0A6ED1] font-semibold mt-0.5">{q.course_name}</p>
                    </div>
                    <Badge variant={q.status === 'Published' ? 'success' : 'secondary'}>{q.status}</Badge>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2">{q.description}</p>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center text-xs">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Duration</p>
                      <p className="font-bold text-slate-800">{q.duration_minutes} Mins</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Pass Threshold</p>
                      <p className="font-bold text-emerald-600">{q.pass_percentage}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Questions</p>
                      <p className="font-bold text-slate-800">
                        {quizQuestions.filter((qq) => qq.quiz_id === q.id).length}
                      </p>
                    </div>
                  </div>

                  {isStudent && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <span className="text-slate-500">
                        Attempts used: <strong>{studentAttempts.length} / {q.attempts_allowed || 2}</strong>
                      </span>
                      {hasPassed ? (
                        <Badge variant="success">Passed ({latestAttempt?.percentage}%)</Badge>
                      ) : latestAttempt ? (
                        <Badge variant="destructive">Score: {latestAttempt.percentage}%</Badge>
                      ) : (
                        <Badge variant="outline">Not Attempted</Badge>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    {canManage ? (
                      <>
                        <Button
                          variant={isSelected ? 'sap' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedQuizId(q.id)}
                          className="text-xs h-7"
                        >
                          <FileCheck className="h-3.5 w-3.5 mr-1" />
                          <span>{isSelected ? 'Managing Questions' : 'Select Quiz'}</span>
                        </Button>
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startExam(q)}
                            className="text-xs h-7 text-indigo-700 bg-indigo-50/60 border-indigo-200 hover:bg-indigo-100 flex items-center space-x-1"
                            title="Preview and test this assessment"
                          >
                            <PlayCircle className="h-3 w-3 text-indigo-600" />
                            <span>Preview</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditQuiz(q)}
                            className="text-xs h-7 text-slate-600 hover:text-slate-900"
                          >
                            <Edit3 className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteQuiz(q)}
                            className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    ) : isStudent ? (
                      <Button
                        variant={hasPassed ? 'outline' : 'sap'}
                        size="sm"
                        disabled={studentAttempts.length >= (q.attempts_allowed || 2) && !hasPassed}
                        onClick={() => startExam(q)}
                        className="text-xs h-8 w-full flex items-center justify-center space-x-1.5"
                      >
                        <PlayCircle className="h-4 w-4" />
                        <span>{studentAttempts.length > 0 ? 'Retake Assessment' : 'Start Assessment'}</span>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Faculty Question Bank Manager - Only visible to Trainers and Admins */}
      {canManage && activeQuiz && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3">
            <div>
              <CardTitle className="text-sm">
                Question Bank: {activeQuiz.title}
              </CardTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {activeQuizQuestions.length} objective question{activeQuizQuestions.length === 1 ? '' : 's'} configured for this exam.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] text-slate-500 font-medium">Filter by Quiz:</span>
                <select
                  value={selectedQuizId}
                  onChange={(e) => setSelectedQuizId(e.target.value)}
                  className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-semibold max-w-[200px] truncate"
                >
                  {visibleQuizzes.map((qz) => (
                    <option key={qz.id} value={qz.id}>
                      {qz.title}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="sap"
                size="sm"
                onClick={() => setIsAddQuestionModal(true)}
                className="text-xs flex items-center space-x-1"
              >
                <ListPlus className="h-3.5 w-3.5" />
                <span>Add Question</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeQuizQuestions.length === 0 ? (
              <p className="p-4 text-xs text-slate-400 italic text-center">
                No questions added to this assessment yet. Click &quot;Add Question&quot; to configure MCQs.
              </p>
            ) : (
              activeQuizQuestions.map((q, idx) => (
                <div key={q.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      Q{idx + 1}. {q.question_text}
                    </span>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">{q.points || 1} Point{(q.points || 1) === 1 ? '' : 's'}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditQuestion(q)}
                        className="h-6 w-6 p-0 text-slate-500 hover:text-slate-800"
                        title="Edit Question"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="h-6 w-6 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        title="Delete Question"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {q.options.map((opt) => (
                      <div
                        key={opt.id}
                        className={`p-2 rounded-lg border flex items-center justify-between ${
                          opt.is_correct
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <span>{opt.text}</span>
                        {opt.is_correct && (
                          <span className="flex items-center text-[10px] text-emerald-700 font-bold space-x-1">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Correct</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {q.explanation && (
                    <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-100">
                      Faculty Explanation: {q.explanation}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Student Attempt History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {isStudent ? 'My Exam Attempt History & Scores' : 'Trainee Exam Attempts Audit Log'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {visibleAttempts.length === 0 ? (
            <p className="p-4 text-xs text-slate-400 italic">No exam attempts recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    {!isStudent && <th className="px-4 py-3">Student Name</th>}
                    <th className="px-4 py-3">Exam Title</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Percentage</th>
                    <th className="px-4 py-3">Result</th>
                    <th className="px-4 py-3">Completed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleAttempts.map((att) => (
                    <tr key={att.id} className="hover:bg-slate-50 transition-colors">
                      {!isStudent && <td className="px-4 py-3 font-semibold text-slate-800">{att.student_name}</td>}
                      <td className="px-4 py-3 text-slate-700 font-medium">{att.quiz_title}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{att.score} / {att.total_points}</td>
                      <td className="px-4 py-3 font-bold text-blue-600">{att.percentage}%</td>
                      <td className="px-4 py-3">
                        <Badge variant={att.passed ? 'success' : 'destructive'}>
                          {att.passed ? 'Passed' : 'Failed'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(att.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Interactive Exam Modal for Student */}
      {isExamModal && activeQuiz && (
        <Modal
          isOpen={isExamModal}
          onClose={() => {
            if (!examResult && !window.confirm('Are you sure you want to exit? Your exam progress will not be saved.')) {
              return;
            }
            setIsExamModal(false);
            setExamResult(null);
          }}
          title={examResult ? 'Assessment Completed' : `Exam: ${activeQuiz.title}`}
          description={
            examResult
              ? 'Review your automated instant evaluation and score breakdown.'
              : `Duration: ${activeQuiz.duration_minutes} Mins • Passing Score: ${activeQuiz.pass_percentage}%`
          }
          maxWidth="2xl"
        >
          {examResult ? (
            <div className="space-y-4 py-2">
              <div className="text-center space-y-2">
                <div
                  className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ${
                    examResult.passed ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                  }`}
                >
                  {examResult.passed ? <Award className="h-7 w-7" /> : <AlertCircle className="h-7 w-7" />}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {examResult.passed ? 'Congratulations! Assessment Cleared' : 'Assessment Threshold Not Met'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    You scored <strong>{examResult.score} out of {examResult.total_points}</strong> ({examResult.percentage}%).
                    Passing threshold is {activeQuiz.pass_percentage}%.
                  </p>
                  {examResult.passed && (
                    <div className="inline-flex items-center space-x-1.5 mt-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] px-3 py-1 rounded-full font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Benchmark Achieved • Course Progress Updated (+15%)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Detailed Question Review */}
              {examResult.question_results && examResult.question_results.length > 0 && activeQuiz.show_answers_after ? (
                <div className="mt-4 pt-3 border-t border-slate-200 text-left space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Solution & Feedback Review</h4>
                    <Badge variant="outline">Verified Faculty Key</Badge>
                  </div>
                  {examResult.question_results.map((qr: any, idx: number) => {
                    const q = activeQuizQuestions.find((qq) => qq.id === qr.questionId);
                    const chosenOpt = q?.options.find((o) => o.id === qr.selectedOptionId);
                    return (
                      <div
                        key={qr.questionId}
                        className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                          qr.isCorrect ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            Q{idx + 1}. {qr.questionText}
                          </span>
                          <Badge variant={qr.isCorrect ? 'success' : 'destructive'}>
                            {qr.pointsEarned} / {qr.pointsPossible} pts
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          <span>Your Choice: </span>
                          <strong className={qr.isCorrect ? 'text-emerald-700' : 'text-rose-700'}>
                            {chosenOpt?.text || qr.selectedOptionId || 'No answer selected'}
                          </strong>
                        </div>
                        {!qr.isCorrect && qr.correctOptionText && (
                          <div className="text-[11px] text-emerald-800 font-medium">
                            <span>Correct Answer: </span>
                            <strong>{qr.correctOptionText}</strong>
                          </div>
                        )}
                        {qr.explanation && (
                          <div className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200/60">
                            Faculty Explanation: {qr.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic text-center pt-2">
                  Faculty has configured this assessment to withhold question-by-question answer keys.
                </p>
              )}

              <div className="flex justify-center pt-3 border-t border-slate-100">
                <Button
                  variant="sap"
                  size="sm"
                  onClick={() => {
                    setIsExamModal(false);
                    setExamResult(null);
                  }}
                  className="text-xs"
                >
                  Return to Assessments
                </Button>
              </div>
            </div>
          ) : activeQuizQuestions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              This assessment does not have any questions configured yet. Please check back later.
            </div>
          ) : (
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
              {activeQuizQuestions.map((q, idx) => (
                <div key={q.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 text-xs">
                  <div className="font-bold text-slate-900 text-sm">
                    Q{idx + 1}. {q.question_text}
                  </div>

                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const isSelected = examAnswers[q.id] === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-center space-x-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-medium'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={opt.id}
                            checked={isSelected}
                            onChange={() => setExamAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span>{opt.text}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 sticky bottom-0 bg-white py-2">
                <span className="text-xs text-slate-500">
                  Answered: <strong>{Object.keys(examAnswers).length}</strong> of {activeQuizQuestions.length}
                </span>
                <Button
                  variant="sap"
                  size="sm"
                  onClick={handleSubmitExam}
                  disabled={examSubmitting}
                  className="text-xs"
                >
                  {examSubmitting ? 'Evaluating...' : 'Submit Assessment'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* New Quiz Modal */}
      <Modal
        isOpen={isAddQuizModal}
        onClose={() => setIsAddQuizModal(false)}
        title="Create New SAP Assessment Quiz"
        description="Configure questions, passing score, and auto-evaluation rules."
      >
        <form onSubmit={handleCreateQuiz} className="space-y-4 text-xs">
          {store.courses.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>No active courses found. Please create a course first before publishing assessments.</span>
            </div>
          )}

          <Input
            label="Quiz Title *"
            placeholder="e.g. SAP FICO Module 2 Accounts Payable Assessment"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Course *
            </label>
            <select
              value={newCourseId}
              onChange={(e) => setNewCourseId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              required
            >
              <option value="">-- Select Course --</option>
              {store.courses.map((c) => (
                <option key={c.id} value={c.id}>{c.course_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duration (Minutes) *"
              type="number"
              min={5}
              max={300}
              value={newDuration}
              onChange={(e) => setNewDuration(Number(e.target.value))}
              required
            />
            <Input
              label="Passing Score (%) *"
              type="number"
              min={1}
              max={100}
              value={newPassPct}
              onChange={(e) => setNewPassPct(Number(e.target.value))}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Instructions for students..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddQuizModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sap"
              size="sm"
              disabled={store.courses.length === 0 || !newCourseId}
            >
              Save Assessment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Quiz Modal */}
      <Modal
        isOpen={isEditQuizModal}
        onClose={() => setIsEditQuizModal(false)}
        title={`Edit Assessment: ${activeQuiz?.title || ''}`}
        description="Update quiz title, duration, or pass score threshold."
      >
        <form onSubmit={handleUpdateQuiz} className="space-y-4 text-xs">
          <Input
            label="Quiz Title *"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duration (Minutes) *"
              type="number"
              min={5}
              max={300}
              value={editDuration}
              onChange={(e) => setEditDuration(Number(e.target.value))}
              required
            />
            <Input
              label="Passing Score (%) *"
              type="number"
              min={1}
              max={100}
              value={editPassPct}
              onChange={(e) => setEditPassPct(Number(e.target.value))}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditQuizModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Question Modal */}
      <Modal
        isOpen={isAddQuestionModal}
        onClose={() => setIsAddQuestionModal(false)}
        title={`Add Question to: ${activeQuiz?.title || ''}`}
        description="Configure objective question statement, options, and correct answer."
      >
        <form onSubmit={handleAddQuestion} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Question Text *
            </label>
            <textarea
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="e.g. Which SAP organizational element represents an independent accounting entity?"
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Option A *"
              placeholder="Choice A text..."
              value={optA}
              onChange={(e) => setOptA(e.target.value)}
              required
            />
            <Input
              label="Option B *"
              placeholder="Choice B text..."
              value={optB}
              onChange={(e) => setOptB(e.target.value)}
              required
            />
            <Input
              label="Option C (Optional)"
              placeholder="Choice C text..."
              value={optC}
              onChange={(e) => setOptC(e.target.value)}
            />
            <Input
              label="Option D (Optional)"
              placeholder="Choice D text..."
              value={optD}
              onChange={(e) => setOptD(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Correct Choice *
              </label>
              <select
                value={correctChoice}
                onChange={(e) => setCorrectChoice(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                <option value="A">Option A</option>
                <option value="B">Option B</option>
                {optC && <option value="C">Option C</option>}
                {optD && <option value="D">Option D</option>}
              </select>
            </div>
            <Input
              label="Points / Marks"
              type="number"
              min={1}
              max={100}
              value={questionPoints}
              onChange={(e) => setQuestionPoints(Number(e.target.value))}
            />
            <Input
              label="Faculty Explanation / Reference"
              placeholder="e.g. Company code is the smallest unit for balance sheet..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddQuestionModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Question
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Question Modal */}
      <Modal
        isOpen={isEditQuestionModal}
        onClose={() => setIsEditQuestionModal(false)}
        title="Edit Assessment Question"
        description="Update question statement, choices, points, and explanation."
      >
        <form onSubmit={handleUpdateQuestion} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Question Text *
            </label>
            <textarea
              rows={3}
              value={editQText}
              onChange={(e) => setEditQText(e.target.value)}
              placeholder="Question statement..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Option A *"
              placeholder="Choice A text..."
              value={editQOptA}
              onChange={(e) => setEditQOptA(e.target.value)}
              required
            />
            <Input
              label="Option B *"
              placeholder="Choice B text..."
              value={editQOptB}
              onChange={(e) => setEditQOptB(e.target.value)}
              required
            />
            <Input
              label="Option C (Optional)"
              placeholder="Choice C text..."
              value={editQOptC}
              onChange={(e) => setEditQOptC(e.target.value)}
            />
            <Input
              label="Option D (Optional)"
              placeholder="Choice D text..."
              value={editQOptD}
              onChange={(e) => setEditQOptD(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Correct Choice *
              </label>
              <select
                value={editQCorrect}
                onChange={(e) => setEditQCorrect(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                <option value="A">Option A</option>
                <option value="B">Option B</option>
                {editQOptC && <option value="C">Option C</option>}
                {editQOptD && <option value="D">Option D</option>}
              </select>
            </div>
            <Input
              label="Points / Marks"
              type="number"
              min={1}
              max={100}
              value={editQPoints}
              onChange={(e) => setEditQPoints(Number(e.target.value))}
            />
            <Input
              label="Faculty Explanation / Reference"
              placeholder="e.g. Reference explanation..."
              value={editQExplanation}
              onChange={(e) => setEditQExplanation(e.target.value)}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditQuestionModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
