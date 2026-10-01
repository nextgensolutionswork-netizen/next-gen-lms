import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateQuizSubmission,
  recordQuizAttempt,
  submitQuizAnswers,
  isLessonUnlocked,
} from '@/lib/services/academics-service';
import { store } from '@/lib/services/data-store';
import { Quiz, QuizQuestion, LessonProgress, Lesson } from '@/types';

describe('Portal Assessments & Prerequisite Locking System', () => {
  const mockQuiz: Quiz = {
    id: 'quiz-test-01',
    course_id: 'crs-fico-01',
    title: 'SAP FICO General Ledger & ACDOCA Mastery Assessment',
    description: 'Comprehensive assessment on Universal Journal architecture, document splitting, and chart of accounts.',
    duration_minutes: 30,
    time_limit_minutes: 30,
    pass_percentage: 75,
    passing_percentage: 75,
    attempts_allowed: 3,
    randomize_questions: false,
    show_answers_after: true,
    status: 'Published',
    created_at: new Date().toISOString(),
  };

  const mockQuestions: QuizQuestion[] = [
    {
      id: 'q-01',
      quiz_id: 'quiz-test-01',
      question_text: 'Which table in SAP S/4HANA stores Universal Journal line items?',
      question_type: 'MCQ',
      points: 25,
      order_index: 1,
      options: [
        { id: 'opt-a', text: 'BSEG', is_correct: false },
        { id: 'opt-b', text: 'BKPF', is_correct: false },
        { id: 'opt-c', text: 'ACDOCA', is_correct: true },
        { id: 'opt-d', text: 'BSIS', is_correct: false },
      ],
      correct_option: 'opt-c',
      explanation: 'ACDOCA holds both FI and CO line items in a unified single source of truth.',
    },
    {
      id: 'q-02',
      quiz_id: 'quiz-test-01',
      question_text: 'Document Splitting ensures balanced financial statements across which dimension?',
      question_type: 'MCQ',
      points: 25,
      order_index: 2,
      options: [
        { id: 'opt-2a', text: 'Profit Center / Segment', is_correct: true },
        { id: 'opt-2b', text: 'Personnel Number', is_correct: false },
        { id: 'opt-2c', text: 'Purchasing Group', is_correct: false },
        { id: 'opt-2d', text: 'Shipping Point', is_correct: false },
      ],
      correct_option: 'opt-2a',
      explanation: 'Document Splitting creates split line items to provide zero-balance balance sheets by profit center or segment.',
    },
    {
      id: 'q-03',
      quiz_id: 'quiz-test-01',
      question_text: 'In SAP S/4HANA, transaction BP replaces customer and vendor master creation.',
      question_type: 'TrueFalse',
      points: 25,
      order_index: 3,
      options: [
        { id: 'opt-3a', text: 'True', is_correct: true },
        { id: 'opt-3b', text: 'False', is_correct: false },
      ],
      correct_option: 'A',
      explanation: 'Business Partner (BP) is mandatory for customer and supplier master records in S/4HANA.',
    },
    {
      id: 'q-04',
      quiz_id: 'quiz-test-01',
      question_text: 'Which ledger is designated as the standard Leading Ledger in SAP General Ledger accounting?',
      question_type: 'MCQ',
      points: 25,
      order_index: 4,
      options: [
        { id: 'opt-4a', text: '0L', is_correct: true },
        { id: 'opt-4b', text: '2L', is_correct: false },
        { id: 'opt-4c', text: 'NL', is_correct: false },
        { id: 'opt-4d', text: 'X1', is_correct: false },
      ],
      correct_option: '0L',
      explanation: 'Ledger 0L is the default leading ledger integrated with all subsidiary ledgers.',
    },
  ];

  const mockLessons: { id: string }[] = [
    { id: 'les-01' },
    { id: 'les-02' },
    { id: 'les-03' },
    { id: 'les-04' },
  ];

  beforeEach(() => {
    // Reset any temporary test attempts or progress
    store.quizAttempts = store.quizAttempts.filter((qa) => !qa.quiz_id.startsWith('quiz-test'));
    store.lessonProgress = store.lessonProgress.filter((lp) => !lp.student_id.startsWith('stu-test'));
  });

  describe('1. Quiz Scoring & Pass/Fail Evaluation', () => {
    it('calculates 100% score and marks passed when all answers match correct_option', () => {
      const answers: Record<string, string> = {
        'q-01': 'opt-c',
        'q-02': 'opt-2a',
        'q-03': 'A',
        'q-04': 'opt-4a',
      };

      const result = evaluateQuizSubmission(mockQuiz, mockQuestions, answers);

      expect(result.score).toBe(100);
      expect(result.total_points).toBe(100);
      expect(result.percentage).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.passing_percentage).toBe(75);
      expect(result.questionResults).toHaveLength(4);
      expect(result.questionResults.every((r) => r.isCorrect)).toBe(true);
      expect(result.questionResults[0].explanation).toContain('ACDOCA');
    });

    it('determines passing status exactly at passing threshold (75%)', () => {
      // 3 correct answers out of 4 (75 points out of 100 = 75%)
      const answers: Record<string, string> = {
        'q-01': 'opt-c',  // Correct (25 pts)
        'q-02': 'opt-2a', // Correct (25 pts)
        'q-03': 'A',      // Correct (25 pts)
        'q-04': 'opt-4b', // Incorrect (0 pts)
      };

      const result = evaluateQuizSubmission(mockQuiz, mockQuestions, answers);

      expect(result.score).toBe(75);
      expect(result.total_points).toBe(100);
      expect(result.percentage).toBe(75);
      expect(result.passed).toBe(true);
    });

    it('marks assessment failed when score falls strictly below passing threshold (< 75%)', () => {
      // 2 correct answers out of 4 (50 points out of 100 = 50%)
      const answers: Record<string, string> = {
        'q-01': 'opt-c',  // Correct (25 pts)
        'q-02': 'opt-2b', // Incorrect (0 pts)
        'q-03': 'opt-3b', // Incorrect (0 pts)
        'q-04': 'opt-4a', // Correct (25 pts)
      };

      const result = evaluateQuizSubmission(mockQuiz, mockQuestions, answers);

      expect(result.score).toBe(50);
      expect(result.total_points).toBe(100);
      expect(result.percentage).toBe(50);
      expect(result.passed).toBe(false);
      expect(result.questionResults.filter((r) => r.isCorrect)).toHaveLength(2);
      expect(result.questionResults.filter((r) => !r.isCorrect)).toHaveLength(2);
    });

    it('evaluates 0% score when no answers are provided or all answers are incorrect', () => {
      const emptyAnswers: Record<string, string> = {};
      const result = evaluateQuizSubmission(mockQuiz, mockQuestions, emptyAnswers);

      expect(result.score).toBe(0);
      expect(result.total_points).toBe(100);
      expect(result.percentage).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.questionResults.every((r) => !r.isCorrect)).toBe(true);
    });

    it('handles questions with custom unequal point weights', () => {
      const unequalQuestions: QuizQuestion[] = [
        {
          id: 'uq-1',
          quiz_id: 'quiz-unequal',
          question_text: 'Question 1 (10 pts)',
          question_type: 'MCQ',
          points: 10,
          order_index: 1,
          options: [{ id: 'opt-1', text: 'Ans 1', is_correct: true }],
          correct_option: 'opt-1',
        },
        {
          id: 'uq-2',
          quiz_id: 'quiz-unequal',
          question_text: 'Question 2 (40 pts)',
          question_type: 'MCQ',
          points: 40,
          order_index: 2,
          options: [{ id: 'opt-2', text: 'Ans 2', is_correct: true }],
          correct_option: 'opt-2',
        },
      ];

      const customQuiz: Quiz = {
        ...mockQuiz,
        id: 'quiz-unequal',
        passing_percentage: 80,
      };

      // Getting Question 2 correct (40 pts) out of 50 = 80% => PASS
      const result1 = evaluateQuizSubmission(customQuiz, unequalQuestions, { 'uq-2': 'opt-2' });
      expect(result1.score).toBe(40);
      expect(result1.total_points).toBe(50);
      expect(result1.percentage).toBe(80);
      expect(result1.passed).toBe(true);

      // Getting only Question 1 correct (10 pts) out of 50 = 20% => FAIL
      const result2 = evaluateQuizSubmission(customQuiz, unequalQuestions, { 'uq-1': 'opt-1' });
      expect(result2.score).toBe(10);
      expect(result2.percentage).toBe(20);
      expect(result2.passed).toBe(false);
    });
  });

  describe('2. Quiz Attempt Recording & Persistence', () => {
    it('records a quiz attempt in store.quizAttempts with full audit details', () => {
      const studentId = 'stu-01';
      const answers: Record<string, string> = {
        'q-01': 'opt-c',
        'q-02': 'opt-2a',
        'q-03': 'A',
        'q-04': 'opt-4a',
      };

      const evaluation = evaluateQuizSubmission(mockQuiz, mockQuestions, answers);
      const attempt = recordQuizAttempt(mockQuiz, studentId, evaluation);

      expect(attempt.id).toBeDefined();
      expect(attempt.quiz_id).toBe(mockQuiz.id);
      expect(attempt.quiz_title).toBe(mockQuiz.title);
      expect(attempt.student_id).toBe(studentId);
      expect(attempt.score).toBe(100);
      expect(attempt.total_points).toBe(100);
      expect(attempt.percentage).toBe(100);
      expect(attempt.passed).toBe(true);
      expect(attempt.status).toBe('Completed');
      expect(attempt.completed_at).toBeDefined();

      // Verify presence in store
      const stored = store.quizAttempts.find((qa) => qa.id === attempt.id);
      expect(stored).toBeDefined();
      expect(stored?.percentage).toBe(100);
    });

    it('submits quiz answers and records attempt via academics service', async () => {
      // Register mock quiz & questions in store for service call
      store.quizzes.push(mockQuiz);
      store.quizQuestions.push(...mockQuestions);

      const attempt = await submitQuizAnswers(mockQuiz.id, 'stu-01', {
        'q-01': 'opt-c',
        'q-02': 'opt-2a',
        'q-03': 'A',
      });

      expect(attempt.quiz_id).toBe(mockQuiz.id);
      expect(attempt.score).toBe(75);
      expect(attempt.passed).toBe(true);

      // Clean up mock quiz from store
      store.quizzes = store.quizzes.filter((q) => q.id !== mockQuiz.id);
      store.quizQuestions = store.quizQuestions.filter((qq) => qq.quiz_id !== mockQuiz.id);
    });
  });

  describe('3. Sequential Lesson Prerequisite Locking Logic', () => {
    const studentId = 'stu-test-sequential';

    it('ensures Lesson 1 (index 0) is ALWAYS unlocked regardless of progress records', () => {
      // Empty progress list
      const emptyProgress: LessonProgress[] = [];
      const isL1Unlocked = isLessonUnlocked(0, mockLessons, studentId, emptyProgress);
      expect(isL1Unlocked).toBe(true);

      // Even with 0% progress on other lessons
      const progressWithZero: LessonProgress[] = [
        {
          id: 'prog-01',
          student_id: studentId,
          course_id: 'crs-fico-01',
          lesson_id: 'les-01',
          last_watched_seconds: 0,
          video_total_seconds: 2700,
          completed_percentage: 0,
          is_completed: false,
          updated_at: new Date().toISOString(),
        },
      ];
      expect(isLessonUnlocked(0, mockLessons, studentId, progressWithZero)).toBe(true);
    });

    it('unlocks Lesson 2 when Lesson 1 is completed with is_completed === true', () => {
      const progress: LessonProgress[] = [
        {
          id: 'prog-01',
          student_id: studentId,
          course_id: 'crs-fico-01',
          lesson_id: 'les-01',
          last_watched_seconds: 2700,
          video_total_seconds: 2700,
          completed_percentage: 100,
          is_completed: true,
          updated_at: new Date().toISOString(),
        },
      ];

      const isL2Unlocked = isLessonUnlocked(1, mockLessons, studentId, progress);
      expect(isL2Unlocked).toBe(true);
    });

    it('unlocks Lesson 2 when Lesson 1 completed_percentage is >= 90% (benchmark reached)', () => {
      // Completed percentage exactly 90%
      const progress90: LessonProgress[] = [
        {
          id: 'prog-01',
          student_id: studentId,
          course_id: 'crs-fico-01',
          lesson_id: 'les-01',
          last_watched_seconds: 2430,
          video_total_seconds: 2700,
          completed_percentage: 90,
          is_completed: false, // flag might not be set yet, but percentage >= 90
          updated_at: new Date().toISOString(),
        },
      ];

      expect(isLessonUnlocked(1, mockLessons, studentId, progress90)).toBe(true);

      // Completed percentage 95%
      const progress95: LessonProgress[] = [
        {
          id: 'prog-01',
          student_id: studentId,
          course_id: 'crs-fico-01',
          lesson_id: 'les-01',
          last_watched_seconds: 2565,
          video_total_seconds: 2700,
          completed_percentage: 95,
          is_completed: false,
          updated_at: new Date().toISOString(),
        },
      ];

      expect(isLessonUnlocked(1, mockLessons, studentId, progress95)).toBe(true);
    });

    it('locks Lesson 2 when Lesson 1 completed_percentage is < 90% (89% or lower)', () => {
      // 89% completion
      const progress89: LessonProgress[] = [
        {
          id: 'prog-01',
          student_id: studentId,
          course_id: 'crs-fico-01',
          lesson_id: 'les-01',
          last_watched_seconds: 2400,
          video_total_seconds: 2700,
          completed_percentage: 89,
          is_completed: false,
          updated_at: new Date().toISOString(),
        },
      ];

      expect(isLessonUnlocked(1, mockLessons, studentId, progress89)).toBe(false);

      // 45% completion
      const progress45: LessonProgress[] = [
        {
          id: 'prog-01',
          student_id: studentId,
          course_id: 'crs-fico-01',
          lesson_id: 'les-01',
          last_watched_seconds: 1200,
          video_total_seconds: 2700,
          completed_percentage: 45,
          is_completed: false,
          updated_at: new Date().toISOString(),
        },
      ];

      expect(isLessonUnlocked(1, mockLessons, studentId, progress45)).toBe(false);
    });

    it('locks Lesson 2 when NO progress record exists for Lesson 1', () => {
      const emptyProgress: LessonProgress[] = [];
      expect(isLessonUnlocked(1, mockLessons, studentId, emptyProgress)).toBe(false);
    });

    it('enforces sequential chaining across multiple lessons (L1 -> L2 -> L3 -> L4)', () => {
      const progressList: LessonProgress[] = [
        // Lesson 1 is completed (100%)
        {
          id: 'p-01',
          student_id: studentId,
          course_id: 'crs-fico-01',
          lesson_id: 'les-01',
          last_watched_seconds: 2700,
          video_total_seconds: 2700,
          completed_percentage: 100,
          is_completed: true,
          updated_at: new Date().toISOString(),
        },
        // Lesson 2 is partially watched (60% < 90%)
        {
          id: 'p-02',
          student_id: studentId,
          course_id: 'crs-fico-01',
          lesson_id: 'les-02',
          last_watched_seconds: 1600,
          video_total_seconds: 2700,
          completed_percentage: 60,
          is_completed: false,
          updated_at: new Date().toISOString(),
        },
      ];

      // Lesson 1 is unlocked (index 0)
      expect(isLessonUnlocked(0, mockLessons, studentId, progressList)).toBe(true);

      // Lesson 2 is unlocked (Lesson 1 is 100%)
      expect(isLessonUnlocked(1, mockLessons, studentId, progressList)).toBe(true);

      // Lesson 3 is LOCKED (Lesson 2 is only 60%, below 90% benchmark)
      expect(isLessonUnlocked(2, mockLessons, studentId, progressList)).toBe(false);

      // Lesson 4 is also LOCKED
      expect(isLessonUnlocked(3, mockLessons, studentId, progressList)).toBe(false);

      // Once Lesson 2 is completed to 92%:
      progressList[1].completed_percentage = 92;
      expect(isLessonUnlocked(2, mockLessons, studentId, progressList)).toBe(true);
      // But Lesson 4 remains locked until Lesson 3 completes:
      expect(isLessonUnlocked(3, mockLessons, studentId, progressList)).toBe(false);
    });

    it('maintains strict student isolation in prerequisite evaluation', () => {
      const studentA = 'stu-alice';
      const studentB = 'stu-bob';

      // Alice completed Lesson 1
      const progressList: LessonProgress[] = [
        {
          id: 'p-alice-01',
          student_id: studentA,
          course_id: 'crs-fico-01',
          lesson_id: 'les-01',
          last_watched_seconds: 2700,
          video_total_seconds: 2700,
          completed_percentage: 100,
          is_completed: true,
          updated_at: new Date().toISOString(),
        },
      ];

      // Alice can access Lesson 2
      expect(isLessonUnlocked(1, mockLessons, studentA, progressList)).toBe(true);

      // Bob has NOT completed Lesson 1; Lesson 2 must be LOCKED for Bob
      expect(isLessonUnlocked(1, mockLessons, studentB, progressList)).toBe(false);
    });
  });
});
