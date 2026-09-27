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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Quiz, QuizQuestion, QuizAttempt } from '@/types';
import { formatDateTime } from '@/lib/utils/formatters';

export default function AssessmentsPage() {
  const [quizzes, setQuizzes] = React.useState<Quiz[]>(store.quizzes);
  const [questions, setQuestions] = React.useState<QuizQuestion[]>(store.quizQuestions);
  const [attempts, setAttempts] = React.useState<QuizAttempt[]>(store.quizAttempts);
  const [isAddModal, setIsAddModal] = React.useState(false);

  // New Quiz state
  const [title, setTitle] = React.useState('');
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || '');
  const [desc, setDesc] = React.useState('');
  const [duration, setDuration] = React.useState(45);
  const [passPct, setPassPct] = React.useState(70);

  const handleCreateQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    const course = store.courses.find((c) => c.id === courseId);
    const newQuiz: Quiz = {
      id: `quiz-${Date.now()}`,
      course_id: courseId,
      course_name: course?.course_name,
      title,
      description: desc,
      duration_minutes: duration,
      pass_percentage: passPct,
      attempts_allowed: 2,
      randomize_questions: true,
      show_answers_after: true,
      status: 'Published',
      questions_count: 2,
      created_at: new Date().toISOString(),
    };
    store.quizzes.unshift(newQuiz);
    setQuizzes([...store.quizzes]);
    setIsAddModal(false);
    setTitle('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Assessments & Certification Exams</h1>
          <p className="text-xs text-slate-500 mt-1">
            Build MCQ and True/False assessments with automated instant grading and pass/fail thresholds.
          </p>
        </div>
        <Button
          variant="sap"
          size="sm"
          onClick={() => setIsAddModal(true)}
          className="text-xs flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>New Assessment</span>
        </Button>
      </div>

      {/* Quizzes List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quizzes.map((q) => (
          <Card key={q.id}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{q.title}</h3>
                  <p className="text-xs text-[#0A6ED1] font-semibold mt-0.5">{q.course_name}</p>
                </div>
                <Badge variant="success">{q.status}</Badge>
              </div>

              <p className="text-xs text-slate-600">{q.description}</p>

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
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Attempts</p>
                  <p className="font-bold text-slate-800">{q.attempts_allowed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Questions Preview for Selected Quiz */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Exam Questions & Automated Objective Answers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">
                  Q{idx + 1}. {q.question_text}
                </span>
                <Badge variant="outline">{q.points} Points</Badge>
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
                    {opt.is_correct && <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />}
                  </div>
                ))}
              </div>

              {q.explanation && (
                <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-100">
                  Explanation: {q.explanation}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Student Attempt History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Student Exam Attempt History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
              <tr>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Exam Title</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Percentage</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Completed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attempts.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800">{att.student_name}</td>
                  <td className="px-4 py-3 text-slate-700">{att.quiz_title}</td>
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
        </CardContent>
      </Card>

      {/* New Quiz Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Create New SAP Assessment Quiz"
        description="Configure questions, passing score, and auto-evaluation rules."
      >
        <form onSubmit={handleCreateQuiz} className="space-y-4 text-xs">
          <Input
            label="Quiz Title *"
            placeholder="e.g. SAP FICO Module 2 Accounts Payable Assessment"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

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

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duration (Minutes)"
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
            <Input
              label="Passing Score (%)"
              type="number"
              value={passPct}
              onChange={(e) => setPassPct(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Instructions for students..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Assessment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
