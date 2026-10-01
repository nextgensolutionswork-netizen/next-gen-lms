'use client';

import * as React from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  Award,
  HelpCircle,
  RotateCcw,
  X,
  FileText,
  Check,
} from 'lucide-react';
import { Quiz, QuizQuestion, QuizAttempt } from '@/types';
import {
  evaluateQuizSubmission,
  recordQuizAttempt,
  QuizEvaluationResult,
} from '@/lib/services/academics-service';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface QuizRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: Quiz;
  questions: QuizQuestion[];
  studentId: string;
  courseId: string;
  onQuizCompleted: () => void;
}

export function QuizRunnerModal({
  isOpen,
  onClose,
  quiz,
  questions = [],
  studentId,
  courseId,
  onQuizCompleted,
}: QuizRunnerModalProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [userAnswers, setUserAnswers] = React.useState<Record<string, string>>({});
  const [visitedQuestions, setVisitedQuestions] = React.useState<Set<number>>(new Set([0]));
  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const [evaluation, setEvaluation] = React.useState<QuizEvaluationResult | null>(null);
  const [attempt, setAttempt] = React.useState<QuizAttempt | null>(null);
  const [startTime, setStartTime] = React.useState<number>(Date.now());
  const [timeLeft, setTimeLeft] = React.useState<number>(1800); // 30 mins fallback
  const [showConfirmSubmit, setShowConfirmSubmit] = React.useState(false);

  // Time limit calculation in minutes
  const timeLimitMinutes = React.useMemo(() => {
    return quiz.time_limit_minutes ?? quiz.duration_minutes ?? 30;
  }, [quiz]);

  const passingPercentage = React.useMemo(() => {
    return quiz.passing_percentage ?? quiz.pass_percentage ?? 70;
  }, [quiz]);

  // Reset state when modal opens or quiz changes
  React.useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setUserAnswers({});
      setVisitedQuestions(new Set([0]));
      setIsSubmitted(false);
      setEvaluation(null);
      setAttempt(null);
      setShowConfirmSubmit(false);
      setStartTime(Date.now());
      setTimeLeft(timeLimitMinutes * 60);
    }
  }, [isOpen, quiz?.id, timeLimitMinutes]);

  // Countdown timer effect
  React.useEffect(() => {
    if (!isOpen || isSubmitted || questions.length === 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isSubmitted, questions.length]);

  // Auto-record visit when currentIndex changes
  React.useEffect(() => {
    setVisitedQuestions((prev) => new Set([...Array.from(prev), currentIndex]));
  }, [currentIndex]);

  if (!isOpen) return null;

  const currentQuestion = questions[currentIndex];

  const handleSelectOption = (questionId: string, optionId: string) => {
    if (isSubmitted) return;
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  };

  const handleFinalSubmit = () => {
    const evalResult = evaluateQuizSubmission(quiz, questions, userAnswers);
    const recordedAttempt = recordQuizAttempt(
      quiz,
      studentId,
      evalResult,
      new Date(startTime).toISOString()
    );

    setEvaluation(evalResult);
    setAttempt(recordedAttempt);
    setIsSubmitted(true);
    setShowConfirmSubmit(false);
    onQuizCompleted();
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const answeredCount = Object.keys(userAnswers).length;
  const isTimeCritical = timeLeft < 120 && timeLeft > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 sm:px-6 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white shrink-0">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="h-9 w-9 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center shrink-0">
              <Award className="h-5 w-5 text-blue-300" />
            </div>
            <div className="truncate">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-900/60 px-2 py-0.5 rounded border border-blue-400/30">
                  Assessment
                </span>
                <span className="text-xs text-slate-300">Passing: {passingPercentage}%</span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white truncate mt-0.5">
                {quiz.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {/* Live Countdown Timer */}
            {!isSubmitted && questions.length > 0 && (
              <div
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-colors ${
                  isTimeCritical
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                    : 'bg-slate-800/80 border-slate-700 text-blue-200'
                }`}
              >
                <Clock className={`h-3.5 w-3.5 ${isTimeCritical ? 'text-rose-400' : 'text-blue-400'}`} />
                <span>{formatTimer(timeLeft)}</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close Quiz"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Empty State if No Questions */}
        {questions.length === 0 ? (
          <div className="p-8 text-center my-auto">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">No Questions Available</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              There are no questions configured for this assessment yet. Please check back later.
            </p>
            <Button variant="outline" size="sm" onClick={onClose} className="mt-4 text-xs">
              Close
            </Button>
          </div>
        ) : !isSubmitted ? (
          /* ACTIVE ASSESSMENT RUNNER MODE */
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Navigation Pills Bar */}
            <div className="px-5 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600">
                  Question <strong className="text-slate-900">{currentIndex + 1}</strong> of{' '}
                  <strong className="text-slate-900">{questions.length}</strong>
                </span>
                <span className="text-[11px] text-slate-500">
                  Answered: <strong className="text-emerald-700">{answeredCount}</strong> /{' '}
                  {questions.length}
                </span>
              </div>

              {/* Navigation Pills */}
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {questions.map((q, idx) => {
                  const isCurrent = currentIndex === idx;
                  const isAnswered = Boolean(userAnswers[q.id]);
                  const isVisited = visitedQuestions.has(idx);

                  let pillStyle =
                    'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-100';

                  if (isAnswered) {
                    pillStyle =
                      'bg-emerald-600 text-white border-emerald-600 font-bold hover:bg-emerald-700';
                  } else if (isVisited) {
                    pillStyle =
                      'bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300 font-medium';
                  }

                  if (isCurrent) {
                    pillStyle =
                      'ring-2 ring-blue-600 ring-offset-1 border-blue-600 bg-blue-600 text-white font-black shadow-xs';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-7 w-7 text-xs rounded-lg border transition-all flex items-center justify-center ${pillStyle}`}
                      title={`Question ${idx + 1}: ${
                        isAnswered ? 'Answered' : isVisited ? 'Visited' : 'Unvisited'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Question Body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1">
              {currentQuestion && (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Question {currentIndex + 1}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-2 leading-snug">
                        {currentQuestion.question_text}
                      </h3>
                    </div>
                    <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {currentQuestion.points ?? 1} {currentQuestion.points === 1 ? 'pt' : 'pts'}
                    </span>
                  </div>

                  {/* Options (A, B, C, D) with selectable radio buttons */}
                  <div className="space-y-2.5 pt-2">
                    {Array.isArray(currentQuestion.options) &&
                      currentQuestion.options.map((opt: any, optIdx: number) => {
                        const optLetter = String.fromCharCode(65 + optIdx);
                        const optId =
                          typeof opt === 'string'
                            ? opt
                            : opt?.id || opt?.text || optLetter;
                        const optText = typeof opt === 'string' ? opt : opt?.text;
                        const isSelected = userAnswers[currentQuestion.id] === optId;

                        return (
                          <label
                            key={optId}
                            onClick={() => handleSelectOption(currentQuestion.id, optId)}
                            className={`flex items-center space-x-3.5 p-3.5 sm:p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-50/70 border-blue-500 shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`question-${currentQuestion.id}`}
                              value={optId}
                              checked={isSelected}
                              onChange={() => handleSelectOption(currentQuestion.id, optId)}
                              className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                            />
                            <span
                              className={`h-6 w-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {optLetter}
                            </span>
                            <span
                              className={`text-xs sm:text-sm leading-relaxed ${
                                isSelected ? 'font-semibold text-blue-950' : 'text-slate-800'
                              }`}
                            >
                              {optText}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Submission Confirmation Prompt */}
            {showConfirmSubmit && (
              <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    You have answered <strong>{answeredCount}</strong> of{' '}
                    <strong>{questions.length}</strong> questions. Submit assessment now?
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowConfirmSubmit(false)}
                    className="text-xs py-1 h-8"
                  >
                    Keep Answering
                  </Button>
                  <Button
                    variant="sap"
                    size="sm"
                    onClick={handleFinalSubmit}
                    className="text-xs py-1 h-8 bg-emerald-600 hover:bg-emerald-700"
                  >
                    Confirm & Submit
                  </Button>
                </div>
              </div>
            )}

            {/* Footer Navigation Controls */}
            <div className="px-5 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
                disabled={currentIndex === 0}
                className="text-xs flex items-center space-x-1"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </Button>

              <div className="flex items-center space-x-2">
                {currentIndex < questions.length - 1 ? (
                  <Button
                    variant="sap"
                    size="sm"
                    onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1))}
                    className="text-xs flex items-center space-x-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="sap"
                    size="sm"
                    onClick={() => {
                      if (answeredCount < questions.length) {
                        setShowConfirmSubmit(true);
                      } else {
                        handleFinalSubmit();
                      }
                    }}
                    className="text-xs flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Submit Assessment</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* COMPLETION SUMMARY CARD & REVIEW OF CORRECT ANSWERS */
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {evaluation && (
              <>
                {/* Score & Result Card */}
                <div
                  className={`p-6 rounded-2xl border-2 text-center flex flex-col items-center ${
                    evaluation.passed
                      ? 'bg-gradient-to-b from-emerald-50 to-emerald-100/50 border-emerald-300'
                      : 'bg-gradient-to-b from-rose-50 to-rose-100/50 border-rose-300'
                  }`}
                >
                  <div
                    className={`h-16 w-16 rounded-full flex items-center justify-center mb-3 shadow-md ${
                      evaluation.passed
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {evaluation.passed ? (
                      <CheckCircle2 className="h-9 w-9" />
                    ) : (
                      <XCircle className="h-9 w-9" />
                    )}
                  </div>

                  <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                    {evaluation.passed ? 'Assessment Passed!' : 'Assessment Not Passed'}
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-md">
                    {evaluation.passed
                      ? `Great job! You scored above the passing threshold of ${evaluation.passing_percentage}%.`
                      : `You scored below the passing benchmark of ${evaluation.passing_percentage}%. Review the explanations below and try again.`}
                  </p>

                  {/* Summary Metric Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-lg mt-5">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Score</span>
                      <p className="text-lg font-black text-blue-600 mt-0.5">
                        {evaluation.percentage}%
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Points</span>
                      <p className="text-lg font-black text-slate-800 mt-0.5">
                        {evaluation.score} / {evaluation.total_points}
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Passing</span>
                      <p className="text-lg font-black text-slate-800 mt-0.5">
                        {evaluation.passing_percentage}%
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Status</span>
                      <div className="mt-1">
                        <Badge variant={evaluation.passed ? 'success' : 'destructive'}>
                          {evaluation.passed ? 'Passed' : 'Failed'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Review of Correct Answers with Explanations */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <span>Review Answers & Explanations</span>
                    </h4>
                    <span className="text-xs text-slate-500">
                      {evaluation.questionResults.filter((r) => r.isCorrect).length} of{' '}
                      {questions.length} Correct
                    </span>
                  </div>

                  <div className="space-y-4">
                    {evaluation.questionResults.map((result, idx) => {
                      const question = questions.find((q) => q.id === result.questionId);
                      const options = Array.isArray(question?.options) ? question.options : [];

                      return (
                        <div
                          key={result.questionId}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            result.isCorrect
                              ? 'border-emerald-200 bg-emerald-50/20'
                              : 'border-rose-200 bg-rose-50/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start space-x-2.5">
                              <span
                                className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                                  result.isCorrect
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-rose-600 text-white'
                                }`}
                              >
                                {result.isCorrect ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <X className="h-3.5 w-3.5" />
                                )}
                              </span>
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Question {idx + 1}
                                </span>
                                <h5 className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5">
                                  {result.questionText}
                                </h5>
                              </div>
                            </div>
                            <span
                              className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded ${
                                result.isCorrect
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {result.pointsEarned} / {result.pointsPossible} pts
                            </span>
                          </div>

                          {/* Options Breakdown */}
                          <div className="mt-3 space-y-1.5 pl-8">
                            {options.map((opt: any, optIdx: number) => {
                              const optLetter = String.fromCharCode(65 + optIdx);
                              const optId =
                                typeof opt === 'string' ? opt : opt?.id || opt?.text || optLetter;
                              const optText = typeof opt === 'string' ? opt : opt?.text;
                              const isSelected = result.selectedOptionId === optId;
                              const isCorrectOpt =
                                (result.correctOptionId &&
                                  (optId === result.correctOptionId ||
                                    optLetter.toUpperCase() ===
                                      result.correctOptionId.toUpperCase())) ||
                                (typeof opt === 'object' && opt?.is_correct);

                              let rowStyle =
                                'bg-white border-slate-200 text-slate-700';
                              if (isCorrectOpt) {
                                rowStyle =
                                  'bg-emerald-100/70 border-emerald-400 text-emerald-950 font-semibold';
                              } else if (isSelected && !result.isCorrect) {
                                rowStyle =
                                  'bg-rose-100/70 border-rose-400 text-rose-950 line-through';
                              }

                              return (
                                <div
                                  key={optId}
                                  className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${rowStyle}`}
                                >
                                  <div className="flex items-center space-x-2">
                                    <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-white/70 border border-slate-200">
                                      {optLetter}
                                    </span>
                                    <span>{optText}</span>
                                  </div>
                                  <div className="flex items-center space-x-1.5 text-[10px] font-bold">
                                    {isSelected && (
                                      <span
                                        className={`px-1.5 py-0.5 rounded ${
                                          result.isCorrect
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-rose-600 text-white'
                                        }`}
                                      >
                                        Your Choice
                                      </span>
                                    )}
                                    {isCorrectOpt && (
                                      <span className="bg-emerald-700 text-white px-1.5 py-0.5 rounded flex items-center space-x-0.5">
                                        <Check className="h-3 w-3" />
                                        <span>Correct Answer</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Explanation Box */}
                          {result.explanation && (
                            <div className="mt-3 ml-8 p-3 rounded-lg bg-blue-50/80 border border-blue-200 text-xs text-blue-950 flex items-start space-x-2">
                              <HelpCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                              <div className="leading-relaxed">
                                <strong className="font-bold text-blue-900">Explanation: </strong>
                                <span>{result.explanation}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Completion Actions */}
                <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentIndex(0);
                      setUserAnswers({});
                      setVisitedQuestions(new Set([0]));
                      setIsSubmitted(false);
                      setEvaluation(null);
                      setAttempt(null);
                      setStartTime(Date.now());
                      setTimeLeft(timeLimitMinutes * 60);
                    }}
                    className="text-xs flex items-center space-x-1.5 w-full sm:w-auto"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Retake Assessment</span>
                  </Button>

                  <Button
                    variant="sap"
                    size="sm"
                    onClick={onClose}
                    className="text-xs px-5 w-full sm:w-auto"
                  >
                    <span>Done & Close</span>
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
