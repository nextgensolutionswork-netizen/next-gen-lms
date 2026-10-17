import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import {
  evaluateQuizSubmission,
  recordQuizAttempt,
} from '@/lib/services/academics-service';
import { recordAuditLog } from '@/lib/services/audit-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    store.hydrateFromDisk();

    // 1. Session authentication
    const auth = await authenticateApiRequest(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const body = await req.json().catch(() => ({}));
    const { quiz_id, answers, started_at } = body;

    if (!quiz_id || typeof quiz_id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Valid quiz_id is required' },
        { status: 400 }
      );
    }

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Answers object is required' },
        { status: 400 }
      );
    }

    // 2. Resolve Student Record
    let student = store.students.find(
      (s) => s.user_id === user.id || s.id === user.id || s.email?.toLowerCase() === user.email?.toLowerCase()
    );

    if (!student && user.role !== 'student') {
      // In staff preview mode, match target student if passed in body or default to student 0
      student = (body.student_id ? store.students.find((s) => s.id === body.student_id) : store.students[0]) || undefined;
    }

    if (!student) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: No active student record found for this user.' },
        { status: 403 }
      );
    }

    // 3. Locate Quiz and Questions on Server
    const quiz = store.quizzes.find((q) => q.id === quiz_id);
    if (!quiz) {
      return NextResponse.json(
        { success: false, error: 'Quiz not found' },
        { status: 404 }
      );
    }

    const questions = store.quizQuestions.filter((q) => q.quiz_id === quiz_id);
    if (questions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Quiz has no configured questions' },
        { status: 400 }
      );
    }

    // 4. Server-Authoritative Grading
    const evaluation = evaluateQuizSubmission(quiz, questions, answers);
    const attempt = recordQuizAttempt(
      quiz,
      student.id,
      evaluation,
      started_at || new Date().toISOString()
    );

    store.persistSync();

    // 5. Forensic Audit Trail
    await recordAuditLog({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action: 'ASSESSMENT_QUIZ_SUBMITTED',
      module: 'ACADEMICS',
      record_id: attempt.id,
      new_value: {
        quiz_id,
        score: evaluation.score,
        total_points: evaluation.total_points,
        percentage: evaluation.percentage,
        passed: evaluation.passed,
      },
    });

    return NextResponse.json({
      success: true,
      attempt,
      evaluation,
    });
  } catch (err: any) {
    console.error('[Quiz Submit API] Grading error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Server-authoritative quiz grading failed' },
      { status: 500 }
    );
  }
}
