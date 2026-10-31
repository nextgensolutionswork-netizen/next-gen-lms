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
  Student,
} from '@/types';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';

// --- Courses, Modules & Lessons ---
export async function getCourses(): Promise<Course[]> {
  if (!isLiveSupabaseEnabled()) return [...store.courses];
  try {
    const { data, error } = await createClient().from('courses').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Missing catalog response.');
    store.courses = data as Course[];
    return [...store.courses];
  } catch (error) {
    throw new Error('Unable to load course catalog: ' + (error instanceof Error ? error.message : 'Database request failed.'));
  }
}

export async function getCourseById(id: string): Promise<Course | undefined> {
  if (!isLiveSupabaseEnabled()) return store.courses.find((course) => course.id === id);
  try {
    const { data, error } = await createClient().from('courses').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Course | undefined || undefined;
  } catch (error) {
    throw new Error('Unable to load course: ' + (error instanceof Error ? error.message : 'Database request failed.'));
  }
}

export async function createCourse(data: Omit<Course, 'id' | 'created_at' | 'updated_at'>): Promise<Course> {
  const newCourse: Course = {
    ...data,
    id: `crs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
        syllabus_url: newCourse.syllabus_url,
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

export async function updateCourse(
  courseId: string,
  data: Partial<Omit<Course, 'id' | 'created_at'>>
): Promise<Course> {
  const course = store.courses.find((c) => c.id === courseId);
  if (!course) throw new Error(`Course not found: ${courseId}`);

  Object.assign(course, data, { updated_at: new Date().toISOString() });
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('courses')
        .update({
          course_name: course.course_name,
          course_code: course.course_code,
          description: course.description,
          duration_weeks: course.duration_weeks,
          category: course.category,
          trainer_id: course.trainer_id,
          thumbnail_url: course.thumbnail_url,
          syllabus_url: course.syllabus_url,
          price: course.price,
          status: course.status,
          updated_at: course.updated_at,
        })
        .eq('id', courseId);
    } catch (err) {
      console.warn('Supabase updateCourse direct query warning, preserved locally:', err);
    }
  }
  return course;
}

export async function deleteCourse(courseId: string): Promise<boolean> {
  const index = store.courses.findIndex((c) => c.id === courseId);
  if (index === -1) return false;

  store.courses.splice(index, 1);
  // Clean up associated modules and lessons
  store.modules = store.modules.filter((m) => m.course_id !== courseId);
  store.lessons = store.lessons.filter((l) => l.course_id !== courseId);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('courses').delete().eq('id', courseId);
    } catch (err) {
      console.warn('Supabase deleteCourse direct query warning, preserved locally:', err);
    }
  }
  return true;
}

export async function getModulesForCourse(courseId: string): Promise<CourseModule[]> {
  return store.modules
    .filter((m) => m.course_id === courseId)
    .sort((a, b) => a.order_index - b.order_index);
}

export async function createModule(courseId: string, title: string, description?: string): Promise<CourseModule> {
  const existing = store.modules.filter((m) => m.course_id === courseId);
  const newModule: CourseModule = {
    id: `mod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

export async function updateModule(
  moduleId: string,
  data: { title?: string; description?: string }
): Promise<CourseModule> {
  const mod = store.modules.find((m) => m.id === moduleId);
  if (!mod) throw new Error(`Module not found: ${moduleId}`);

  if (data.title !== undefined) mod.title = data.title;
  if (data.description !== undefined) mod.description = data.description;
  mod.updated_at = new Date().toISOString();
  store.persist();
  return mod;
}

export async function deleteModule(moduleId: string): Promise<boolean> {
  const index = store.modules.findIndex((m) => m.id === moduleId);
  if (index === -1) return false;

  const mod = store.modules[index];
  store.modules.splice(index, 1);
  const deletedLessonsCount = store.lessons.filter((l) => l.module_id === moduleId).length;
  store.lessons = store.lessons.filter((l) => l.module_id !== moduleId);

  const course = store.courses.find((c) => c.id === mod.course_id);
  if (course) {
    course.modules_count = Math.max(0, (course.modules_count || 1) - 1);
    course.lessons_count = Math.max(0, (course.lessons_count || deletedLessonsCount) - deletedLessonsCount);
  }
  store.persist();
  return true;
}

export async function reorderModules(courseId: string, moduleIds: string[]): Promise<CourseModule[]> {
  moduleIds.forEach((id, index) => {
    const mod = store.modules.find((m) => m.id === id && m.course_id === courseId);
    if (mod) {
      mod.order_index = index + 1;
      mod.updated_at = new Date().toISOString();
    }
  });
  store.persist();
  return store.modules.filter((m) => m.course_id === courseId).sort((a, b) => a.order_index - b.order_index);
}

export async function getLessonsForModule(moduleId: string): Promise<Lesson[]> {
  return store.lessons
    .filter((l) => l.module_id === moduleId)
    .sort((a, b) => a.order_index - b.order_index);
}

export async function createLesson(data: Omit<Lesson, 'id' | 'created_at' | 'updated_at'>): Promise<Lesson> {
  const newLesson: Lesson = {
    ...data,
    id: `les-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

export async function updateLesson(
  lessonId: string,
  data: Partial<Omit<Lesson, 'id' | 'created_at'>>
): Promise<Lesson> {
  const les = store.lessons.find((l) => l.id === lessonId);
  if (!les) throw new Error(`Lesson not found: ${lessonId}`);

  Object.assign(les, data, { updated_at: new Date().toISOString() });
  store.persist();
  return les;
}

export async function deleteLesson(lessonId: string): Promise<boolean> {
  const index = store.lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) return false;

  const les = store.lessons[index];
  store.lessons.splice(index, 1);

  const mod = store.modules.find((m) => m.id === les.module_id);
  if (mod) mod.lessons_count = Math.max(0, (mod.lessons_count || 1) - 1);

  const course = store.courses.find((c) => c.id === les.course_id);
  if (course) course.lessons_count = Math.max(0, (course.lessons_count || 1) - 1);

  store.persist();
  return true;
}

export async function reorderLessons(moduleId: string, lessonIds: string[]): Promise<Lesson[]> {
  lessonIds.forEach((id, index) => {
    const lesson = store.lessons.find((l) => l.id === id && l.module_id === moduleId);
    if (lesson) {
      lesson.order_index = index + 1;
      lesson.updated_at = new Date().toISOString();
    }
  });
  store.persist();
  return store.lessons.filter((l) => l.module_id === moduleId).sort((a, b) => a.order_index - b.order_index);
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
  if (!data.batch_code?.trim()) {
    throw new Error('Batch code is required.');
  }
  if (!data.batch_name?.trim()) {
    throw new Error('Batch name is required.');
  }
  if (!data.course_id) {
    throw new Error('Course is required to create a batch.');
  }
  const course = store.courses.find((c) => c.id === data.course_id);
  if (!course) {
    throw new Error(`Course not found: ${data.course_id}`);
  }
  if (store.batches.some((b) => b.batch_code.trim().toLowerCase() === data.batch_code.trim().toLowerCase())) {
    throw new Error(`Batch code "${data.batch_code.trim()}" already exists.`);
  }
  const trainer = store.users.find((u) => u.id === data.trainer_id);

  const newBatch: Batch = {
    ...data,
    batch_code: data.batch_code.trim(),
    batch_name: data.batch_name.trim(),
    id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    course_name: course.course_name,
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

export async function updateBatch(
  batchId: string,
  data: Partial<Omit<Batch, 'id' | 'created_at'>>
): Promise<Batch> {
  const batch = store.batches.find((b) => b.id === batchId);
  if (!batch) throw new Error(`Batch not found: ${batchId}`);

  if (data.course_id && data.course_id !== batch.course_id) {
    const course = store.courses.find((c) => c.id === data.course_id);
    if (course) batch.course_name = course.course_name;
  }
  if (data.trainer_id && data.trainer_id !== batch.trainer_id) {
    const trainer = store.users.find((u) => u.id === data.trainer_id);
    if (trainer) batch.trainer_name = trainer.full_name;
  }

  Object.assign(batch, data, { updated_at: new Date().toISOString() });
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('batches')
        .update({
          batch_name: batch.batch_name,
          training_mode: batch.training_mode,
          trainer_id: batch.trainer_id,
          start_date: batch.start_date,
          end_date: batch.end_date,
          start_time: batch.start_time,
          end_time: batch.end_time,
          days: batch.days,
          maximum_capacity: batch.maximum_capacity,
          status: batch.status,
          updated_at: batch.updated_at,
        })
        .eq('id', batchId);
    } catch (err) {
      console.warn('Supabase updateBatch direct query warning, preserved locally:', err);
    }
  }
  return batch;
}

export async function deleteBatch(batchId: string): Promise<boolean> {
  const index = store.batches.findIndex((b) => b.id === batchId);
  if (index === -1) return false;

  const enrolledStudents = store.students.filter((s) => s.batch_id === batchId);
  if (enrolledStudents.length > 0) {
    throw new Error(`Cannot delete batch: ${enrolledStudents.length} student(s) currently enrolled. Transfer students first.`);
  }

  store.batches.splice(index, 1);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('batches').delete().eq('id', batchId);
    } catch (err) {
      console.warn('Supabase deleteBatch direct query warning, preserved locally:', err);
    }
  }
  return true;
}

export async function getStudentsForBatch(batchId: string): Promise<Student[]> {
  return store.students.filter((s) => s.batch_id === batchId);
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

  if (student.batch_id === toBatchId) {
    throw new Error('Student is already enrolled in this batch.');
  }

  // Capacity Validation: Prevent batch over-subscription
  const maxCapacity =
    typeof toBatch.maximum_capacity === 'number' && toBatch.maximum_capacity > 0
      ? toBatch.maximum_capacity
      : 30;
  if (toBatch.current_enrolled >= maxCapacity) {
    throw new Error(
      `Target batch "${toBatch.batch_name}" is at maximum capacity (${toBatch.current_enrolled}/${maxCapacity} students). Cannot transfer student.`
    );
  }

  if (toBatch.status === 'Completed' || toBatch.status === 'Cancelled') {
    throw new Error(`Cannot transfer student to a ${toBatch.status.toLowerCase()} batch.`);
  }

  if (!reason || !reason.trim()) {
    throw new Error('Transfer reason is mandatory for audit trail compliance.');
  }

  if (!transferredByUserId) {
    throw new Error('Transferred by user ID is required.');
  }

  const actor = store.users.find((u) => u.id === transferredByUserId);
  if (!actor) {
    throw new Error('Transferring user profile not found.');
  }

  // RBAC Enforcement: Students cannot initiate transfers
  if (actor.role === 'student') {
    throw new Error('Unauthorized: Students cannot initiate batch transfers.');
  }

  // Trainers can only transfer students between batches assigned to their own profile.
  // Cross-trainer transfers require administrator authorization.
  if (actor.role === 'trainer') {
    const isTrainerSource = fromBatch ? fromBatch.trainer_id === actor.id : true;
    const isTrainerTarget = toBatch.trainer_id === actor.id;

    if (!isTrainerSource || !isTrainerTarget) {
      throw new Error(
        'Unauthorized: Trainers can only transfer students between batches assigned to their own profile. Cross-trainer batch transfers require administrator authorization.'
      );
    }
  }

  const auditEntry: BatchTransferAudit = {
    id: `bta-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    student_id: student.id,
    student_name: student.full_name,
    from_batch_id: fromBatch?.id || 'none',
    from_batch_name: fromBatch?.batch_name || 'Unassigned',
    to_batch_id: toBatch.id,
    to_batch_name: toBatch.batch_name,
    reason: reason.trim(),
    transferred_by: actor.full_name || 'Staff',
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

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().toLowerCase();

  const isPm = cleaned.includes('pm');
  const isAm = cleaned.includes('am');
  const withoutMeridiem = cleaned.replace(/[ap]m/g, '').trim();

  const [hStr, mStr] = withoutMeridiem.split(':');
  let hours = parseInt(hStr || '0', 10);
  const minutes = parseInt(mStr || '0', 10);

  if (isPm && hours < 12) hours += 12;
  if (isAm && hours === 12) hours = 0;

  return hours * 60 + (isNaN(minutes) ? 0 : minutes);
}

function checkTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const s1 = parseTimeToMinutes(start1);
  const e1 = parseTimeToMinutes(end1);
  const s2 = parseTimeToMinutes(start2);
  const e2 = parseTimeToMinutes(end2);
  return s1 < e2 && s2 < e1;
}

export async function createClassSession(
  data: Omit<ClassSession, 'id' | 'created_at' | 'course_id' | 'trainer_id'> & {
    course_id?: string;
    trainer_id?: string;
  }
): Promise<ClassSession> {
  if (!data.topic?.trim()) {
    throw new Error('Session topic is required.');
  }
  if (!data.session_date?.trim()) {
    throw new Error('Session date is required.');
  }
  if (!data.batch_id?.trim()) {
    throw new Error('Batch is required for class session.');
  }

  const batch = store.batches.find((b) => b.id === data.batch_id);
  const batchName = batch?.batch_name || data.batch_name || data.batch_id;
  const courseId = data.course_id || batch?.course_id || (store.courses[0]?.id || '');
  const course = store.courses.find((c) => c.id === courseId);
  const trainerId = data.trainer_id || batch?.trainer_id || '';
  const trainer = store.users.find((u) => u.id === trainerId);

  const startTime = (data.start_time || '09:00').trim();
  const endTime = (data.end_time || '11:00').trim();

  const startMins = parseTimeToMinutes(startTime);
  const endMins = parseTimeToMinutes(endTime);

  if (startMins >= endMins) {
    throw new Error(`Session start time (${startTime}) must be earlier than end time (${endTime}).`);
  }

  const targetDate = data.session_date.trim();
  const targetClassroom = data.classroom?.trim().toLowerCase();

  // Faculty, Classroom, and Batch conflict checking
  for (const existing of store.classSessions) {
    if (existing.session_date !== targetDate || existing.status === 'Cancelled') {
      continue;
    }

    if (checkTimeOverlap(startTime, endTime, existing.start_time, existing.end_time)) {
      const existingTrainerId =
        existing.trainer_id ||
        store.batches.find((b) => b.id === existing.batch_id)?.trainer_id;
      const isSameTrainer =
        (trainerId && existingTrainerId && existingTrainerId === trainerId) ||
        (trainer?.full_name &&
          existing.trainer_name &&
          trainer.full_name.trim().toLowerCase() === existing.trainer_name.trim().toLowerCase());

      if (isSameTrainer) {
        throw new Error(
          `Faculty conflict: Trainer "${trainer?.full_name || trainerId}" is already scheduled for session "${existing.topic}" (${existing.start_time} - ${existing.end_time}) on ${targetDate}.`
        );
      }

      const existingClassroom = existing.classroom?.trim().toLowerCase();
      if (targetClassroom && existingClassroom && targetClassroom === existingClassroom) {
        throw new Error(
          `Classroom conflict: Location "${data.classroom}" is already booked for session "${existing.topic}" (${existing.start_time} - ${existing.end_time}) on ${targetDate}.`
        );
      }

      if (existing.batch_id === data.batch_id) {
        throw new Error(
          `Batch conflict: Batch "${batchName}" already has session "${existing.topic}" scheduled (${existing.start_time} - ${existing.end_time}) on ${targetDate}.`
        );
      }
    }
  }

  const session: ClassSession = {
    ...data,
    course_id: courseId,
    trainer_id: trainerId,
    start_time: startTime,
    end_time: endTime,
    id: `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    course_name: course?.course_name,
    batch_name: batchName,
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

  await recordAuditLog({
    user_id: trainerId || 'staff',
    user_name: trainer?.full_name || 'Faculty',
    user_role: 'trainer',
    action: 'CLASS_SESSION_CREATED',
    module: 'ACADEMICS',
    record_id: session.id,
    new_value: { topic: session.topic, batch: batchName, date: session.session_date },
  });

  return session;
}

export async function getOrCreateClassSessionForDate(
  batchId?: string,
  sessionDate?: string,
  trainerUserId?: string
): Promise<ClassSession> {
  const resolvedDate = sessionDate || new Date().toISOString().slice(0, 10);
  const resolvedBatchId = batchId?.trim() || store.batches[0]?.id || 'batch-fico-01';

  let session = store.classSessions.find(
    (cs) => cs.batch_id === resolvedBatchId && cs.session_date === resolvedDate
  );
  if (!session) {
    const batch = store.batches.find((b) => b.id === resolvedBatchId);
    const resolvedTrainerId =
      trainerUserId ||
      batch?.trainer_id ||
      store.users.find((u) => u.role === 'trainer')?.id ||
      store.users.find((u) => u.role === 'admin')?.id ||
      'usr-trainer';
    const fallbackCourseId =
      batch?.course_id ||
      (store.courses.length > 0 ? store.courses[0].id : '');

    session = await createClassSession({
      batch_id: resolvedBatchId,
      course_id: fallbackCourseId,
      trainer_id: resolvedTrainerId,
      topic: `${batch?.batch_name || 'SAP'} Regular Session`,
      session_date: resolvedDate,
      start_time: batch?.start_time || '09:00',
      end_time: batch?.end_time || '11:00',
      mode: batch?.training_mode || 'Hybrid',
      status: 'Scheduled',
    });
  }
  return session;
}

export async function updateClassSession(
  sessionId: string,
  data: Partial<Omit<ClassSession, 'id' | 'created_at'>>
): Promise<ClassSession> {
  const session = store.classSessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Class session not found: ${sessionId}`);

  const updatedDate = data.session_date ? data.session_date.trim() : session.session_date;
  const updatedStart = data.start_time ? data.start_time.trim() : session.start_time;
  const updatedEnd = data.end_time ? data.end_time.trim() : session.end_time;
  const updatedTrainerId = data.trainer_id !== undefined ? data.trainer_id : session.trainer_id;
  const updatedClassroom = (data.classroom !== undefined ? data.classroom : session.classroom)?.trim().toLowerCase();
  const updatedBatchId = data.batch_id || session.batch_id;

  const startMins = parseTimeToMinutes(updatedStart);
  const endMins = parseTimeToMinutes(updatedEnd);

  if (startMins >= endMins) {
    throw new Error(`Session start time (${updatedStart}) must be earlier than end time (${updatedEnd}).`);
  }

  // Conflict checks against other active sessions
  for (const existing of store.classSessions) {
    if (existing.id === sessionId || existing.session_date !== updatedDate || existing.status === 'Cancelled') {
      continue;
    }

    if (checkTimeOverlap(updatedStart, updatedEnd, existing.start_time, existing.end_time)) {
      const existingTrainerId =
        existing.trainer_id ||
        store.batches.find((b) => b.id === existing.batch_id)?.trainer_id;
      const trainer = updatedTrainerId ? store.users.find((u) => u.id === updatedTrainerId) : undefined;
      const isSameTrainer =
        (updatedTrainerId && existingTrainerId && existingTrainerId === updatedTrainerId) ||
        (trainer?.full_name &&
          existing.trainer_name &&
          trainer.full_name.trim().toLowerCase() === existing.trainer_name.trim().toLowerCase());

      if (isSameTrainer) {
        throw new Error(
          `Faculty conflict: Trainer "${trainer?.full_name || updatedTrainerId}" is already scheduled for session "${existing.topic}" (${existing.start_time} - ${existing.end_time}) on ${updatedDate}.`
        );
      }

      const existingClassroom = existing.classroom?.trim().toLowerCase();
      if (updatedClassroom && existingClassroom && updatedClassroom === existingClassroom) {
        throw new Error(
          `Classroom conflict: Location "${data.classroom || session.classroom}" is already booked for session "${existing.topic}" (${existing.start_time} - ${existing.end_time}) on ${updatedDate}.`
        );
      }

      if (existing.batch_id === updatedBatchId) {
        const batch = store.batches.find((b) => b.id === updatedBatchId);
        throw new Error(
          `Batch conflict: Batch "${batch?.batch_name || updatedBatchId}" already has session "${existing.topic}" scheduled (${existing.start_time} - ${existing.end_time}) on ${updatedDate}.`
        );
      }
    }
  }

  const oldVal = { ...session };
  Object.assign(session, data);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('class_sessions').update(data).eq('id', sessionId);
    } catch (err) {
      console.warn('Supabase updateClassSession warning:', err);
    }
  }

  await recordAuditLog({
    user_id: session.trainer_id || 'staff',
    user_name: session.trainer_name || 'Faculty',
    user_role: 'trainer',
    action: 'CLASS_SESSION_UPDATED',
    module: 'ACADEMICS',
    record_id: session.id,
    old_value: oldVal,
    new_value: session,
  });

  return session;
}

export async function deleteClassSession(sessionId: string): Promise<boolean> {
  const index = store.classSessions.findIndex((s) => s.id === sessionId);
  if (index === -1) return false;

  const [removed] = store.classSessions.splice(index, 1);
  store.attendanceRecords = store.attendanceRecords.filter((a) => a.session_id !== sessionId);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('class_sessions').delete().eq('id', sessionId);
    } catch (err) {
      console.warn('Supabase deleteClassSession warning:', err);
    }
  }

  await recordAuditLog({
    user_id: removed.trainer_id || 'staff',
    user_name: removed.trainer_name || 'Faculty',
    user_role: 'trainer',
    action: 'CLASS_SESSION_DELETED',
    module: 'ACADEMICS',
    record_id: sessionId,
    old_value: removed,
  });

  return true;
}

export async function markAttendance(
  sessionId: string,
  records: { student_id: string; status: 'Present' | 'Absent' | 'Late' | 'Excused'; notes?: string }[],
  markedByUserId: string,
  sessionDateOverride?: string
): Promise<AttendanceRecord[]> {
  let session = store.classSessions.find((s) => s.id === sessionId);
  if (!session) {
    // Defensive session resolution: check if session exists by student batch or create fallback session
    const firstStudentId = records[0]?.student_id;
    const student = store.students.find((s) => s.id === firstStudentId);
    const targetBatchId = student?.batch_id || store.batches[0]?.id;

    if (targetBatchId) {
      const fallbackBatch = store.batches.find((b) => b.id === targetBatchId);
      const effectiveDate = sessionDateOverride || new Date().toISOString().slice(0, 10);
      session = await createClassSession({
        batch_id: targetBatchId,
        course_id: fallbackBatch?.course_id || (store.courses.length > 0 ? store.courses[0].id : ''),
        trainer_id:
          markedByUserId ||
          fallbackBatch?.trainer_id ||
          store.users.find((u) => u.role === 'trainer')?.id ||
          store.users.find((u) => u.role === 'admin')?.id ||
          '',
        topic: `${fallbackBatch?.batch_name || 'SAP'} Regular Session`,
        session_date: effectiveDate,
        start_time: fallbackBatch?.start_time || '09:00',
        end_time: fallbackBatch?.end_time || '11:00',
        mode: fallbackBatch?.training_mode || 'Hybrid',
        status: 'Scheduled',
      });
      if (sessionId && sessionId !== session.id) {
        session.id = sessionId;
      }
    }
  }

  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const marker = store.users.find((u) => u.id === markedByUserId);
  const updatedRecords: AttendanceRecord[] = [];
  const effectiveDate = sessionDateOverride || session.session_date;

  for (const r of records) {
    const student = store.students.find((s) => s.id === r.student_id);
    let existing = store.attendanceRecords.find(
      (a) => a.student_id === r.student_id && a.attendance_date === effectiveDate && a.batch_id === session.batch_id
    );

    if (existing) {
      existing.session_id = sessionId;
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
        attendance_date: effectiveDate,
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
  if (!data.title?.trim()) {
    throw new Error('Assignment title is required.');
  }
  if (!data.course_id) {
    throw new Error('Course is required to create an assignment.');
  }
  if (!data.batch_id) {
    throw new Error('Batch is required to create an assignment.');
  }
  const course = store.courses.find((c) => c.id === data.course_id);
  if (!course) {
    throw new Error(`Course not found: ${data.course_id}`);
  }
  const batch = store.batches.find((b) => b.id === data.batch_id);
  if (!batch) {
    throw new Error(`Batch not found: ${data.batch_id}`);
  }
  const maxMarks = typeof data.maximum_marks === 'number' && data.maximum_marks > 0 ? data.maximum_marks : 100;

  const asg: Assignment = {
    ...data,
    maximum_marks: maxMarks,
    id: `asg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    course_name: course.course_name,
    batch_name: batch.batch_name,
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

export async function updateAssignment(
  assignmentId: string,
  data: Partial<Omit<Assignment, 'id' | 'created_at'>>
): Promise<Assignment> {
  const asg = store.assignments.find((a) => a.id === assignmentId);
  if (!asg) throw new Error(`Assignment not found: ${assignmentId}`);

  Object.assign(asg, data);
  store.persist();
  return asg;
}

export async function deleteAssignment(assignmentId: string): Promise<boolean> {
  const index = store.assignments.findIndex((a) => a.id === assignmentId);
  if (index === -1) return false;

  store.assignments.splice(index, 1);
  store.submissions = store.submissions.filter((s) => s.assignment_id !== assignmentId);
  store.persist();
  return true;
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
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

  const asg = store.assignments.find((a) => a.id === sub.assignment_id);
  const maxAllowed = asg?.maximum_marks ?? 100;
  if (marks < 0 || marks > maxAllowed) {
    throw new Error(`Marks obtained (${marks}) must be between 0 and maximum marks (${maxAllowed}).`);
  }

  const grader = store.users.find((u) => u.id === gradedByUserId);

  sub.marks_obtained = marks;
  sub.feedback = feedback;
  sub.graded_by = grader?.full_name || 'Faculty Evaluator';
  sub.graded_at = new Date().toISOString();
  sub.status = 'Graded';
  store.persist();

  return sub;
}

// --- Lesson Prerequisite Locking Validation ---
/**
 * Determines whether a lesson at `lessonIndex` in the syllabus is unlocked for a student.
 * Sequential Prerequisite Rules:
 * - Lesson 1 (index 0) is always unlocked.
 * - For Lesson i (i > 0), it is unlocked if Lesson i - 1 is completed
 *   (store.lessonProgress has is_completed === true or completed_percentage >= 90).
 * - Otherwise locked.
 */
export function isLessonUnlocked(
  lessonIndex: number,
  lessonsList: { id: string }[],
  studentId: string,
  progressList: LessonProgress[] = store.lessonProgress
): boolean {
  if (lessonIndex <= 0) return true;
  const prevLesson = lessonsList[lessonIndex - 1];
  if (!prevLesson) return false;

  const prevProgress = progressList.find(
    (lp) => lp.student_id === studentId && lp.lesson_id === prevLesson.id
  );
  if (!prevProgress) return false;

  return Boolean(
    prevProgress.is_completed === true ||
    (typeof prevProgress.completed_percentage === 'number' && prevProgress.completed_percentage >= 90)
  );
}

// --- Quizzes & Automatic Objective Grading ---
export async function getQuizzes(courseId?: string): Promise<Quiz[]> {
  if (courseId) return store.quizzes.filter((q) => q.course_id === courseId);
  return [...store.quizzes];
}

export async function getQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
  return store.quizQuestions.filter((q) => q.quiz_id === quizId);
}

export async function createQuiz(data: Omit<Quiz, 'id' | 'questions_count' | 'created_at'>): Promise<Quiz> {
  if (!data.title?.trim()) {
    throw new Error('Quiz title is required.');
  }
  if (!data.course_id) {
    throw new Error('Course is required to create an assessment.');
  }
  const course = store.courses.find((c) => c.id === data.course_id);
  if (!course) {
    throw new Error(`Course not found: ${data.course_id}`);
  }
  const duration = typeof data.duration_minutes === 'number' && data.duration_minutes > 0 ? data.duration_minutes : 45;
  const passPct = typeof data.pass_percentage === 'number' && data.pass_percentage > 0 && data.pass_percentage <= 100 ? data.pass_percentage : 70;

  const newQuiz: Quiz = {
    description: data.description || '',
    attempts_allowed: data.attempts_allowed || 1,
    randomize_questions: data.randomize_questions ?? false,
    show_answers_after: data.show_answers_after ?? true,
    status: data.status || 'Draft',
    ...data,
    duration_minutes: duration,
    pass_percentage: passPct,
    id: `quiz-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    course_name: course.course_name,
    questions_count: 0,
    created_at: new Date().toISOString(),
  };
  store.quizzes.unshift(newQuiz);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('quizzes').insert({
        id: newQuiz.id,
        course_id: newQuiz.course_id,
        title: newQuiz.title,
        description: newQuiz.description,
        duration_minutes: newQuiz.duration_minutes,
        pass_percentage: newQuiz.pass_percentage,
        attempts_allowed: newQuiz.attempts_allowed,
        randomize_questions: newQuiz.randomize_questions,
        show_answers_after: newQuiz.show_answers_after,
        status: newQuiz.status,
        created_at: newQuiz.created_at,
      });
    } catch (err) {
      console.warn('Supabase createQuiz warning:', err);
    }
  }

  return newQuiz;
}

export async function updateQuiz(
  quizId: string,
  data: Partial<Omit<Quiz, 'id' | 'created_at'>>
): Promise<Quiz> {
  const quiz = store.quizzes.find((q) => q.id === quizId);
  if (!quiz) throw new Error(`Quiz not found: ${quizId}`);
  Object.assign(quiz, data);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('quizzes').update(data).eq('id', quizId);
    } catch (err) {
      console.warn('Supabase updateQuiz warning:', err);
    }
  }

  return quiz;
}

export async function deleteQuiz(quizId: string): Promise<boolean> {
  const index = store.quizzes.findIndex((q) => q.id === quizId);
  if (index === -1) return false;
  store.quizzes.splice(index, 1);
  store.quizQuestions = store.quizQuestions.filter((q) => q.quiz_id !== quizId);
  store.quizAttempts = store.quizAttempts.filter((a) => a.quiz_id !== quizId);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('quizzes').delete().eq('id', quizId);
      await supabase.from('quiz_questions').delete().eq('quiz_id', quizId);
    } catch (err) {
      console.warn('Supabase deleteQuiz warning:', err);
    }
  }

  return true;
}

export async function createQuizQuestion(
  quizId: string,
  questionText: string,
  options: { id: string; text: string; is_correct: boolean }[],
  points: number = 1,
  explanation?: string
): Promise<QuizQuestion> {
  const quiz = store.quizzes.find((q) => q.id === quizId);
  if (!quiz) throw new Error(`Quiz not found: ${quizId}`);
  if (!questionText?.trim()) {
    throw new Error('Question text is required.');
  }
  if (!options || options.length === 0) {
    throw new Error('At least one option is required for an assessment question.');
  }
  const hasCorrect = options.some((opt) => Boolean(opt.is_correct));
  if (!hasCorrect) {
    throw new Error('At least one option must be marked as correct.');
  }

  const newQuestion: QuizQuestion = {
    id: `qq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    quiz_id: quizId,
    question_text: questionText.trim(),
    question_type: 'MCQ',
    points: typeof points === 'number' && points > 0 ? points : 1,
    order_index: (quiz.questions_count || 0) + 1,
    options,
    explanation: explanation?.trim() || undefined,
    created_at: new Date().toISOString(),
  };

  store.quizQuestions.push(newQuestion);
  quiz.questions_count = (quiz.questions_count || 0) + 1;
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('quiz_questions').insert({
        id: newQuestion.id,
        quiz_id: newQuestion.quiz_id,
        question_text: newQuestion.question_text,
        question_type: newQuestion.question_type,
        points: newQuestion.points,
        options: newQuestion.options,
        explanation: newQuestion.explanation,
        created_at: newQuestion.created_at,
      });
    } catch (err) {
      console.warn('Supabase createQuizQuestion warning:', err);
    }
  }

  return newQuestion;
}

export async function updateQuizQuestion(
  questionId: string,
  data: Partial<Omit<QuizQuestion, 'id' | 'quiz_id' | 'created_at'>>
): Promise<QuizQuestion> {
  const question = store.quizQuestions.find((q) => q.id === questionId);
  if (!question) throw new Error(`Quiz question not found: ${questionId}`);

  Object.assign(question, data);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('quiz_questions').update(data).eq('id', questionId);
    } catch (err) {
      console.warn('Supabase updateQuizQuestion warning:', err);
    }
  }

  return question;
}

export async function deleteQuizQuestion(questionId: string): Promise<boolean> {
  const index = store.quizQuestions.findIndex((q) => q.id === questionId);
  if (index === -1) return false;

  const [removed] = store.quizQuestions.splice(index, 1);
  const quiz = store.quizzes.find((qz) => qz.id === removed.quiz_id);
  if (quiz && quiz.questions_count) {
    quiz.questions_count = Math.max(0, quiz.questions_count - 1);
  }
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('quiz_questions').delete().eq('id', questionId);
    } catch (err) {
      console.warn('Supabase deleteQuizQuestion warning:', err);
    }
  }

  return true;
}

export interface QuizQuestionResult {
  questionId: string;
  questionText: string;
  selectedOptionId?: string;
  correctOptionId?: string;
  correctOptionText?: string;
  isCorrect: boolean;
  pointsEarned: number;
  pointsPossible: number;
  explanation?: string;
}

export interface QuizEvaluationResult {
  score: number;
  total_points: number;
  percentage: number;
  passed: boolean;
  passing_percentage: number;
  questionResults: QuizQuestionResult[];
}

/**
 * Pure evaluation function for Quiz submissions.
 * Supports comparing answers against:
 * - `q.correct_option` (option ID, option letter 'A'/'B'..., or option text)
 * - `opt.is_correct` in the options array
 * Supports both `quiz.passing_percentage` and `quiz.pass_percentage`.
 */
export function evaluateQuizSubmission(
  quiz: Quiz,
  questions: QuizQuestion[],
  answers: Record<string, string> // questionId -> selectedOptionId / letter / value
): QuizEvaluationResult {
  let earnedPoints = 0;
  let totalPoints = 0;

  const questionResults: QuizQuestionResult[] = questions.map((q) => {
    const qPoints = q.points !== undefined && q.points !== null ? q.points : 1;
    totalPoints += qPoints;
    const selected = answers[q.id];

    const options = Array.isArray(q.options) ? q.options : [];

    let correctId: string | undefined = undefined;
    let correctText: string | undefined = undefined;

    // 1. Check explicit `q.correct_option`
    if ((q as any).correct_option !== undefined && (q as any).correct_option !== null) {
      const explicit = String((q as any).correct_option).trim();
      correctId = explicit;

      // Find match in options
      const match = options.find((opt: any, optIdx: number) => {
        const oId = typeof opt === 'string' ? opt : opt?.id;
        const oLetter = String.fromCharCode(65 + optIdx);
        const oText = typeof opt === 'string' ? opt : opt?.text;
        return (
          oId === explicit ||
          oLetter.toUpperCase() === explicit.toUpperCase() ||
          (oText && oText.trim().toLowerCase() === explicit.trim().toLowerCase())
        );
      });

      if (match) {
        correctId = typeof match === 'string' ? match : match.id;
        correctText = typeof match === 'string' ? match : match.text;
      }
    }

    // 2. Check options with is_correct
    if (!correctId) {
      const match = options.find((opt: any) => typeof opt === 'object' && Boolean(opt?.is_correct));
      if (match) {
        correctId = match.id;
        correctText = match.text;
      }
    }

    // Check correctness
    let isCorrect = false;
    if (selected !== undefined && selected !== null && selected !== '') {
      const selStr = String(selected).trim();

      if (correctId && (selStr === correctId || selStr.toLowerCase() === String(correctId).toLowerCase())) {
        isCorrect = true;
      } else {
        const selectedOpt = options.find((opt: any, optIdx: number) => {
          const oId = typeof opt === 'string' ? opt : opt?.id;
          const oLetter = String.fromCharCode(65 + optIdx);
          return oId === selStr || oLetter.toUpperCase() === selStr.toUpperCase();
        });

        if (selectedOpt) {
          if (typeof selectedOpt === 'object' && selectedOpt?.is_correct) {
            isCorrect = true;
          } else if ((q as any).correct_option) {
            const exp = String((q as any).correct_option).trim().toLowerCase();
            const oId = typeof selectedOpt === 'string' ? selectedOpt : selectedOpt?.id;
            const oText = typeof selectedOpt === 'string' ? selectedOpt : selectedOpt?.text;
            const oIdx = options.indexOf(selectedOpt);
            const oLetter = String.fromCharCode(65 + oIdx).toLowerCase();

            if (
              (oId && String(oId).toLowerCase() === exp) ||
              (oText && String(oText).toLowerCase() === exp) ||
              oLetter === exp
            ) {
              isCorrect = true;
            }
          }
        }
      }
    }

    const pointsEarned = isCorrect ? qPoints : 0;
    earnedPoints += pointsEarned;

    return {
      questionId: q.id,
      questionText: q.question_text,
      selectedOptionId: selected,
      correctOptionId: correctId,
      correctOptionText: correctText,
      isCorrect,
      pointsEarned,
      pointsPossible: qPoints,
      explanation: q.explanation,
    };
  });

  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passingPercentage = (quiz as any).passing_percentage ?? quiz.pass_percentage ?? 70;
  const passed = percentage >= passingPercentage;

  return {
    score: earnedPoints,
    total_points: totalPoints,
    percentage,
    passed,
    passing_percentage: passingPercentage,
    questionResults,
  };
}

/**
 * Records a completed QuizAttempt into `store.quizAttempts` and triggers persistence.
 */
export function recordQuizAttempt(
  quiz: Quiz,
  studentId: string,
  evaluation: QuizEvaluationResult,
  startedAt?: string
): QuizAttempt {
  const student = store.students.find((s) => s.id === studentId);
  const attempt: QuizAttempt = {
    id: `qa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    quiz_id: quiz.id,
    quiz_title: quiz.title,
    student_id: studentId,
    student_name: student?.full_name || 'Student',
    score: evaluation.score,
    total_points: evaluation.total_points,
    percentage: evaluation.percentage,
    passed: evaluation.passed,
    started_at: startedAt || new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    completed_at: new Date().toISOString(),
    status: 'Completed',
    question_results: evaluation.questionResults,
  };

  if (evaluation.passed && student) {
    if ((student.course_progress || 0) < 100) {
      student.course_progress = Math.min(100, Math.round((student.course_progress || 0) + 15));
      student.updated_at = new Date().toISOString();
    }
  }

  store.quizAttempts.unshift(attempt);
  try {
    store.persist();
  } catch (err) {
    // persistent storage catch
  }

  return attempt;
}

export async function submitQuizAnswers(
  quizId: string,
  studentId: string,
  userAnswers: Record<string, string> // questionId -> optionId
): Promise<QuizAttempt> {
  const quiz = store.quizzes.find((q) => q.id === quizId);
  if (!quiz) throw new Error('Quiz not found');

  const questions = store.quizQuestions.filter((q) => q.quiz_id === quizId);
  const evaluation = evaluateQuizSubmission(quiz, questions, userAnswers);
  const attempt = recordQuizAttempt(quiz, studentId, evaluation);

  return attempt;
}
