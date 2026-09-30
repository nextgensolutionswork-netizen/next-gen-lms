import { store } from './data-store';
import {
  Course,
  CourseModule,
  Lesson,
  LessonProgress,
  Batch,
  BatchTransferAudit,
  ClassSession,
  AttendanceRecord,
  Assignment,
  AssignmentSubmission,
  Quiz,
  QuizQuestion,
  QuizAttempt,
} from '@/types';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';

// --- Courses, Modules & Lessons ---
export async function getCourses(): Promise<Course[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        store.courses = data as Course[];
        return data as Course[];
      }
    } catch (err) {
      console.warn('Supabase courses query error, fallback to local persistent store:', err);
    }
  }
  return [...store.courses];
}

export async function getCourseById(id: string): Promise<Course | undefined> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as Course;
      }
    } catch (err) {
      console.warn('Supabase getCourseById error, checking local store:', err);
    }
  }
  return store.courses.find((c) => c.id === id);
}

export async function createCourse(data: Omit<Course, 'id' | 'created_at' | 'updated_at'>): Promise<Course> {
  const newCourse: Course = {
    ...data,
    id: `crs-${Date.now()}`,
    modules_count: 0,
    lessons_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.courses.unshift(newCourse);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('courses').insert({
        id: newCourse.id,
        course_name: newCourse.course_name,
        course_code: newCourse.course_code,
        description: newCourse.description,
        duration_weeks: newCourse.duration_weeks,
        category: newCourse.category,
        trainer_id: newCourse.trainer_id,
        thumbnail_url: newCourse.thumbnail_url,
        price: newCourse.price,
        status: newCourse.status,
        created_at: newCourse.created_at,
        updated_at: newCourse.updated_at,
      });
    } catch (err) {
      console.warn('Supabase createCourse direct query warning, preserved locally:', err);
    }
  }

  return newCourse;
}

export async function getModulesForCourse(courseId: string): Promise<CourseModule[]> {
  return store.modules
    .filter((m) => m.course_id === courseId)
    .sort((a, b) => a.order_index - b.order_index);
}

export async function createModule(courseId: string, title: string, description?: string): Promise<CourseModule> {
  const existing = store.modules.filter((m) => m.course_id === courseId);
  const newModule: CourseModule = {
    id: `mod-${Date.now()}`,
    course_id: courseId,
    title,
    description,
    order_index: existing.length + 1,
    lessons_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.modules.push(newModule);

  const course = store.courses.find((c) => c.id === courseId);
  if (course) {
    course.modules_count = (course.modules_count || 0) + 1;
  }
  return newModule;
}

export async function getLessonsForModule(moduleId: string): Promise<Lesson[]> {
  return store.lessons
    .filter((l) => l.module_id === moduleId)
    .sort((a, b) => a.order_index - b.order_index);
}

export async function createLesson(data: Omit<Lesson, 'id' | 'created_at' | 'updated_at'>): Promise<Lesson> {
  const newLesson: Lesson = {
    ...data,
    id: `les-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.lessons.push(newLesson);

  const mod = store.modules.find((m) => m.id === data.module_id);
  if (mod) mod.lessons_count = (mod.lessons_count || 0) + 1;

  const course = store.courses.find((c) => c.id === data.course_id);
  if (course) course.lessons_count = (course.lessons_count || 0) + 1;

  return newLesson;
}

// --- Video LMS Progress Tracking ---
export async function getStudentCourseProgress(studentId: string, courseId: string) {
  const publishedLessons = store.lessons.filter(
    (l) => l.course_id === courseId && l.is_published
  );
  if (publishedLessons.length === 0) return { overallProgress: 0, completedLessons: 0, totalLessons: 0 };

  const progressRecords = store.lessonProgress.filter(
    (p) => p.student_id === studentId && p.course_id === courseId
  );

  const completedCount = progressRecords.filter((p) => p.is_completed).length;
  const overallPercentage = Math.round((completedCount / publishedLessons.length) * 100);

  // Update in student profile as well
  const student = store.students.find((s) => s.id === studentId);
  if (student && student.course_id === courseId) {
    student.course_progress = overallPercentage;
  }

  return {
    overallProgress: overallPercentage,
    completedLessons: completedCount,
    totalLessons: publishedLessons.length,
    records: progressRecords,
  };
}

export async function updateVideoProgress(
  studentId: string,
  lessonId: string,
  courseId: string,
  lastWatchedSeconds: number,
  videoTotalSeconds: number
): Promise<LessonProgress> {
  let record = store.lessonProgress.find(
    (p) => p.student_id === studentId && p.lesson_id === lessonId
  );

  const completed_percentage = Math.min(100, Math.round((lastWatchedSeconds / (videoTotalSeconds || 1)) * 100));
  const is_completed = completed_percentage >= 90;

  if (record) {
    record.last_watched_seconds = lastWatchedSeconds;
    record.video_total_seconds = videoTotalSeconds;
    record.completed_percentage = completed_percentage;
    if (is_completed && !record.is_completed) {
      record.is_completed = true;
      record.completion_date = new Date().toISOString();
    }
    record.updated_at = new Date().toISOString();
  } else {
    record = {
      id: `lp-${Date.now()}`,
      student_id: studentId,
      course_id: courseId,
      lesson_id: lessonId,
      last_watched_seconds: lastWatchedSeconds,
      video_total_seconds: videoTotalSeconds,
      completed_percentage,
      is_completed,
      completion_date: is_completed ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    };
    store.lessonProgress.push(record);
  }

  // Recalculate overall course progress
  await getStudentCourseProgress(studentId, courseId);

  return record;
}

// --- Batches & Student Transfer ---
export async function getBatches(): Promise<Batch[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        store.batches = data as Batch[];
        return data as Batch[];
      }
    } catch (err) {
      console.warn('Supabase batches query error, fallback to local persistent store:', err);
    }
  }
  return [...store.batches];
}

export async function createBatch(data: Omit<Batch, 'id' | 'current_enrolled' | 'created_at' | 'updated_at'>): Promise<Batch> {
  const course = store.courses.find((c) => c.id === data.course_id);
  const trainer = store.users.find((u) => u.id === data.trainer_id);

  const newBatch: Batch = {
    ...data,
    id: `batch-${Date.now()}`,
    course_name: course?.course_name,
    trainer_name: trainer?.full_name,
    current_enrolled: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.batches.unshift(newBatch);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('batches').insert({
        id: newBatch.id,
        batch_code: newBatch.batch_code,
        batch_name: newBatch.batch_name,
        course_id: newBatch.course_id,
        trainer_id: newBatch.trainer_id,
        training_mode: newBatch.training_mode,
        start_date: newBatch.start_date,
        end_date: newBatch.end_date,
        start_time: newBatch.start_time,
        end_time: newBatch.end_time,
        days: newBatch.days,
        maximum_capacity: newBatch.maximum_capacity,
        status: newBatch.status,
        created_at: newBatch.created_at,
        updated_at: newBatch.updated_at,
      });
    } catch (err) {
      console.warn('Supabase createBatch direct query warning, preserved locally:', err);
    }
  }

  return newBatch;
}

export async function transferStudentBatch(
  studentId: string,
  toBatchId: string,
  reason: string,
  transferredByUserId: string
): Promise<BatchTransferAudit> {
  const student = store.students.find((s) => s.id === studentId);
  if (!student) throw new Error('Student not found');

  const fromBatch = store.batches.find((b) => b.id === student.batch_id);
  const toBatch = store.batches.find((b) => b.id === toBatchId);
  if (!toBatch) throw new Error('Target batch not found');

  const actor = store.users.find((u) => u.id === transferredByUserId);

  const auditEntry: BatchTransferAudit = {
    id: `bta-${Date.now()}`,
    student_id: student.id,
    student_name: student.full_name,
    from_batch_id: fromBatch?.id || 'none',
    from_batch_name: fromBatch?.batch_name || 'Unassigned',
    to_batch_id: toBatch.id,
    to_batch_name: toBatch.batch_name,
    reason,
    transferred_by: actor?.full_name || 'Admin',
    transferred_at: new Date().toISOString(),
  };

  store.batchTransferAudits.unshift(auditEntry);

  // Update batch student counts
  if (fromBatch && fromBatch.current_enrolled > 0) {
    fromBatch.current_enrolled -= 1;
  }
  toBatch.current_enrolled += 1;

  // Update student batch
  student.batch_id = toBatch.id;
  student.batch_name = toBatch.batch_name;
  student.updated_at = new Date().toISOString();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('batch_transfer_audits').insert({
        id: auditEntry.id,
        student_id: auditEntry.student_id,
        from_batch_id: fromBatch?.id,
        to_batch_id: toBatch.id,
        reason,
        transferred_by: transferredByUserId,
        transferred_at: auditEntry.transferred_at,
      });
      await supabase.from('students').update({
        batch_id: toBatch.id,
        updated_at: student.updated_at,
      }).eq('id', student.id);
    } catch (err) {
      console.warn('Supabase batch transfer direct query warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: transferredByUserId,
    user_name: actor?.full_name || 'Admin',
    user_role: actor?.role || 'admin',
    action: 'STUDENT_BATCH_TRANSFERRED',
    module: 'BATCHES',
    record_id: student.id,
    old_value: { batch: fromBatch?.batch_name },
    new_value: { batch: toBatch.batch_name, reason },
  });

  return auditEntry;
}

// --- Class Schedule & Attendance ---
export async function getClassSessions(batchId?: string): Promise<ClassSession[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      let query = supabase.from('class_sessions').select('*').order('session_date', { ascending: true });
      if (batchId) {
        query = query.eq('batch_id', batchId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data as ClassSession[];
      }
    } catch (err) {
      console.warn('Supabase class_sessions query error, falling back to local persistent store:', err);
    }
  }

  let list = [...store.classSessions];
  if (batchId) {
    list = list.filter((s) => s.batch_id === batchId);
  }
  return list.sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());
}

export async function createClassSession(data: Omit<ClassSession, 'id' | 'created_at'>): Promise<ClassSession> {
  const course = store.courses.find((c) => c.id === data.course_id);
  const batch = store.batches.find((b) => b.id === data.batch_id);
  const trainer = store.users.find((u) => u.id === data.trainer_id);

  const session: ClassSession = {
    ...data,
    id: `sess-${Date.now()}`,
    course_name: course?.course_name,
    batch_name: batch?.batch_name,
    trainer_name: trainer?.full_name,
    created_at: new Date().toISOString(),
  };

  store.classSessions.push(session);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('class_sessions').insert({
        id: session.id,
        course_id: session.course_id,
        batch_id: session.batch_id,
        trainer_id: session.trainer_id,
        topic: session.topic,
        session_date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time,
        mode: session.mode,
        meeting_link: session.meeting_link,
        classroom: session.classroom,
        notes: session.notes,
        status: session.status,
        created_at: session.created_at,
      });
    } catch (err) {
      console.warn('Supabase createClassSession direct query warning, preserved locally:', err);
    }
  }

  return session;
}

export async function markAttendance(
  sessionId: string,
  records: { student_id: string; status: 'Present' | 'Absent' | 'Late' | 'Excused'; notes?: string }[],
  markedByUserId: string
): Promise<AttendanceRecord[]> {
  const session = store.classSessions.find((s) => s.id === sessionId);
  if (!session) throw new Error('Session not found');

  const marker = store.users.find((u) => u.id === markedByUserId);
  const updatedRecords: AttendanceRecord[] = [];

  for (const r of records) {
    const student = store.students.find((s) => s.id === r.student_id);
    let existing = store.attendanceRecords.find(
      (a) => a.session_id === sessionId && a.student_id === r.student_id
    );

    if (existing) {
      existing.status = r.status;
      existing.notes = r.notes;
      existing.marked_by = markedByUserId;
      existing.marked_by_name = marker?.full_name;
      existing.marked_at = new Date().toISOString();
      updatedRecords.push(existing);
    } else {
      const newRecord: AttendanceRecord = {
        id: `att-${Date.now()}-${r.student_id}`,
        student_id: r.student_id,
        student_name: student?.full_name,
        batch_id: session.batch_id,
        session_id: session.id,
        attendance_date: session.session_date,
        status: r.status,
        notes: r.notes,
        marked_by: markedByUserId,
        marked_by_name: marker?.full_name,
        marked_at: new Date().toISOString(),
      };
      store.attendanceRecords.push(newRecord);
      updatedRecords.push(newRecord);
    }

    // Recalculate student attendance percentage
    const studentAttendance = store.attendanceRecords.filter((a) => a.student_id === r.student_id);
    const presentCount = studentAttendance.filter((a) => a.status === 'Present' || a.status === 'Late').length;
    if (student) {
      student.attendance_percentage = Math.round((presentCount / studentAttendance.length) * 100);
    }
  }

  session.status = 'Completed';
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('attendance_records').upsert(
        updatedRecords.map((r) => ({
          id: r.id,
          student_id: r.student_id,
          batch_id: r.batch_id,
          session_id: r.session_id,
          attendance_date: r.attendance_date,
          status: r.status,
          notes: r.notes,
          marked_by: r.marked_by,
          marked_at: r.marked_at,
        }))
      );
    } catch (err) {
      console.warn('Supabase markAttendance direct query warning, preserved locally:', err);
    }
  }

  return updatedRecords;
}

// --- Assignments ---
export async function getAssignments(batchId?: string): Promise<Assignment[]> {
  if (batchId) {
    return store.assignments.filter((a) => a.batch_id === batchId);
  }
  return [...store.assignments];
}

export async function createAssignment(data: Omit<Assignment, 'id' | 'submissions_count' | 'created_at'>): Promise<Assignment> {
  const course = store.courses.find((c) => c.id === data.course_id);
  const batch = store.batches.find((b) => b.id === data.batch_id);

  const asg: Assignment = {
    ...data,
    id: `asg-${Date.now()}`,
    course_name: course?.course_name,
    batch_name: batch?.batch_name,
    submissions_count: 0,
    created_at: new Date().toISOString(),
  };

  store.assignments.unshift(asg);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('assignments').insert({
        id: asg.id,
        course_id: asg.course_id,
        batch_id: asg.batch_id,
        title: asg.title,
        description: asg.description,
        due_date: asg.due_date,
        maximum_marks: asg.maximum_marks,
        attachment_url: asg.attachment_url,
        created_by: asg.created_by,
        created_at: asg.created_at,
      });
    } catch (err) {
      console.warn('Supabase createAssignment warning:', err);
    }
  }

  return asg;
}

export async function submitAssignment(
  assignmentId: string,
  studentId: string,
  submissionText: string,
  attachmentUrl?: string
): Promise<AssignmentSubmission> {
  const student = store.students.find((s) => s.id === studentId);
  const asg = store.assignments.find((a) => a.id === assignmentId);
  if (!asg) throw new Error('Assignment not found');

  let sub = store.submissions.find(
    (s) => s.assignment_id === assignmentId && s.student_id === studentId
  );

  if (sub) {
    sub.submission_text = submissionText;
    sub.attachment_url = attachmentUrl;
    sub.submitted_at = new Date().toISOString();
    sub.status = 'Submitted';
  } else {
    sub = {
      id: `sub-${Date.now()}`,
      assignment_id: assignmentId,
      student_id: studentId,
      student_name: student?.full_name,
      submission_text: submissionText,
      attachment_url: attachmentUrl,
      submitted_at: new Date().toISOString(),
      status: 'Submitted',
    };
    store.submissions.push(sub);
    asg.submissions_count = (asg.submissions_count || 0) + 1;
  }

  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('assignment_submissions').upsert({
        id: sub.id,
        assignment_id: sub.assignment_id,
        student_id: sub.student_id,
        submission_text: sub.submission_text,
        attachment_url: sub.attachment_url,
        submitted_at: sub.submitted_at,
        status: sub.status,
      });
    } catch (err) {
      console.warn('Supabase submitAssignment warning:', err);
    }
  }

  return sub;
}

export async function gradeAssignmentSubmission(
  submissionId: string,
  marks: number,
  feedback: string,
  gradedByUserId: string
): Promise<AssignmentSubmission> {
  const sub = store.submissions.find((s) => s.id === submissionId);
  if (!sub) throw new Error('Submission not found');

  const grader = store.users.find((u) => u.id === gradedByUserId);

  sub.marks_obtained = marks;
  sub.feedback = feedback;
  sub.graded_by = grader?.full_name;
  sub.graded_at = new Date().toISOString();
  sub.status = 'Graded';
  store.persist();

  return sub;
}

// --- Quizzes & Automatic Objective Grading ---
export async function getQuizzes(courseId?: string): Promise<Quiz[]> {
  if (courseId) return store.quizzes.filter((q) => q.course_id === courseId);
  return [...store.quizzes];
}

export async function getQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
  return store.quizQuestions.filter((q) => q.quiz_id === quizId);
}

export async function submitQuizAnswers(
  quizId: string,
  studentId: string,
  userAnswers: Record<string, string> // questionId -> optionId
): Promise<QuizAttempt> {
  const quiz = store.quizzes.find((q) => q.id === quizId);
  if (!quiz) throw new Error('Quiz not found');

  const student = store.students.find((s) => s.id === studentId);
  const questions = store.quizQuestions.filter((q) => q.quiz_id === quizId);

  let earnedPoints = 0;
  let totalPoints = 0;

  for (const q of questions) {
    totalPoints += q.points;
    const selectedOptionId = userAnswers[q.id];
    const correctOption = q.options.find((opt) => opt.is_correct);

    if (selectedOptionId && correctOption && selectedOptionId === correctOption.id) {
      earnedPoints += q.points;
    }
  }

  const percentage = Math.round((earnedPoints / (totalPoints || 1)) * 100);
  const passed = percentage >= quiz.pass_percentage;

  const attempt: QuizAttempt = {
    id: `qa-${Date.now()}`,
    quiz_id: quizId,
    quiz_title: quiz.title,
    student_id: studentId,
    student_name: student?.full_name,
    score: earnedPoints,
    total_points: totalPoints,
    percentage,
    passed,
    started_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    completed_at: new Date().toISOString(),
    status: 'Completed',
  };

  store.quizAttempts.push(attempt);
  return attempt;
}
