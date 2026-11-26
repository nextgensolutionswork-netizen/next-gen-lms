/**
 * Shared Course & Batch Display Formatting Utility (TASK-09)
 *
 * Provides deterministic, authoritative, and deduplicated formatting for
 * courses, training categories, training modes, and batches across all LMS/CRM modules.
 */

import type { Course, Batch } from '@/types';

export type TrainingCategory = 'Normal Training' | 'Personal Training';
export type NormalizedTrainingMode = 'Online' | 'Classroom' | 'Hybrid' | 'Offline';

export interface CourseDisplayInput {
  id?: string | null;
  course_id?: string | null;
  course_name?: string | null;
  course_code?: string | null;
  training_category?: string | null;
  price?: number | null;
}

export interface BatchDisplayInput {
  id?: string | null;
  batch_id?: string | null;
  batch_name?: string | null;
  batch_code?: string | null;
  course_id?: string | null;
  course_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  days?: string[] | null;
  training_mode?: string | null;
  status?: string | null;
  current_enrolled?: number | null;
  maximum_capacity?: number | null;
}

export interface FormattedCourse {
  /** The clean primary course title without redundant trailing training type, e.g. "SAP FICO" */
  baseCourseName: string;
  /** The exact authoritative course name as stored in master data, e.g. "SAP FICO PERSONAL TRAINING" */
  authoritativeCourseName: string;
  /** Course code, e.g. "SAP FICO 101" */
  courseCode?: string;
  /** Preserved training type if identified or explicitly provided */
  trainingType?: TrainingCategory;
  /** True if this is 1:1 Personal Training */
  isPersonalTraining: boolean;
  /** True if this is Normal cohort Training */
  isNormalTraining: boolean;
  /** Whether course information is valid or missing */
  isAvailable: boolean;
  /** Formatted display badge/subtitle text */
  trainingTypeBadge?: string;
}

export interface FormattedBatch {
  /** Clean batch display title without redundant course prefix, e.g. "Morning Fast-Track Batch" */
  displayName: string;
  /** Authoritative batch name as stored */
  authoritativeBatchName: string;
  /** Batch code, e.g. "B-FICO-2601" */
  batchCode?: string;
  /** Timing period classification: "Morning" | "Afternoon" | "Evening" | "Weekend" | undefined */
  timingPeriod?: string;
  /** Human-readable timing window, e.g. "08:00 - 10:00" */
  timeWindow?: string;
  /** Normalized mode: "Online" | "Classroom" | "Hybrid" | "Offline" */
  trainingMode?: NormalizedTrainingMode;
  /** Combined timing & mode label, e.g. "Morning · Online" or "Schedule unavailable" */
  timingAndModeLabel: string;
  /** Schedule status label */
  scheduleLabel: string;
  /** Mode label or accurate unavailable indication */
  modeLabel: string;
  /** Whether a batch is genuinely assigned */
  isAssigned: boolean;
  /** Formatted seat availability */
  seatAvailability?: string;
}

export interface CombinedCourseBatchDisplay {
  course: FormattedCourse;
  batch: FormattedBatch;
  /** One-line compact representation, e.g. "SAP FICO (Personal Training) [Morning · Online]" */
  compactLabel: string;
  /** Short inline label, e.g. "SAP FICO [Morning · Online]" */
  shortLabel: string;
}

/**
 * Normalizes training mode presentation without altering stored values.
 * Strictly avoids classifying missing mode as "Online".
 */
export function formatTrainingMode(mode?: string | null): NormalizedTrainingMode | undefined {
  if (!mode || typeof mode !== 'string') return undefined;
  const trimmed = mode.trim().toLowerCase();
  if (trimmed === 'online' || trimmed === 'online live') return 'Online';
  if (trimmed === 'classroom' || trimmed === 'classroom lab') return 'Classroom';
  if (trimmed === 'hybrid') return 'Hybrid';
  if (trimmed === 'offline') return 'Offline';
  return undefined;
}

/**
 * Detects if a course string or category specifies Personal or Normal training.
 */
export function detectTrainingCategory(
  courseName?: string | null,
  explicitCategory?: string | null
): TrainingCategory | undefined {
  if (explicitCategory) {
    const trimmed = explicitCategory.trim().toLowerCase();
    if (trimmed.includes('personal')) return 'Personal Training';
    if (trimmed.includes('normal')) return 'Normal Training';
  }
  if (courseName) {
    const upper = courseName.toUpperCase();
    if (upper.includes('PERSONAL TRAINING') || upper.includes('PERSONAL (1:1)') || upper.includes('1-ON-1')) {
      return 'Personal Training';
    }
    if (upper.includes('NORMAL TRAINING') || upper.includes('NORMAL BATCH')) {
      return 'Normal Training';
    }
  }
  return undefined;
}

/**
 * Extracts the base course name by removing redundant training category suffixes
 * while preserving the authoritative course name.
 */
export function extractBaseCourseName(rawName?: string | null): string {
  if (!rawName || !rawName.trim()) return 'Course unavailable';
  const clean = rawName.trim();
  // Strip trailing "PERSONAL TRAINING" or "NORMAL TRAINING" if present as a suffix
  const stripped = clean
    .replace(/\s+-\s+PERSONAL TRAINING$/i, '')
    .replace(/\s+PERSONAL TRAINING$/i, '')
    .replace(/\s+-\s+NORMAL TRAINING$/i, '')
    .replace(/\s+NORMAL TRAINING$/i, '')
    .trim();
  return stripped || clean;
}

/**
 * Formats course presentation ensuring training category is never duplicated.
 */
export function formatCourseDisplay(input?: CourseDisplayInput | Course | null): FormattedCourse {
  const courseInput = input as (CourseDisplayInput & { id?: string }) | undefined | null;
  const courseId = courseInput?.course_id || courseInput?.id;
  const rawName = courseInput?.course_name?.trim() || '';

  if (!courseInput || (!rawName && !courseId)) {
    return {
      baseCourseName: 'Course unavailable',
      authoritativeCourseName: 'Course unavailable',
      isPersonalTraining: false,
      isNormalTraining: false,
      isAvailable: false,
    };
  }

  const authoritativeCourseName = rawName || 'Course unavailable';
  const isAvailable = Boolean(rawName && rawName !== 'Course unavailable');
  const trainingCategory = courseInput && 'training_category' in courseInput ? courseInput.training_category : undefined;
  const trainingType = detectTrainingCategory(rawName, trainingCategory);
  const baseCourseName = extractBaseCourseName(rawName);
  const courseCode = courseInput.course_code?.trim() || undefined;

  const isPersonalTraining = trainingType === 'Personal Training';
  const isNormalTraining = trainingType === 'Normal Training';

  let trainingTypeBadge: string | undefined;
  if (isPersonalTraining) {
    trainingTypeBadge = 'Personal Training';
  } else if (isNormalTraining) {
    trainingTypeBadge = 'Normal Training';
  }

  return {
    baseCourseName,
    authoritativeCourseName,
    courseCode,
    trainingType,
    isPersonalTraining,
    isNormalTraining,
    isAvailable,
    trainingTypeBadge,
  };
}

/**
 * Determines timing period from days and start_time.
 */
export function resolveBatchTimingPeriod(
  days?: string[] | null,
  startTime?: string | null,
  batchName?: string | null
): 'Weekend' | 'Morning' | 'Afternoon' | 'Evening' | undefined {
  if (batchName && /weekend/i.test(batchName)) return 'Weekend';
  if (days && days.some((d) => /sat|sun/i.test(d))) return 'Weekend';

  if (!startTime) return undefined;
  const match = startTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;

  const hour = parseInt(match[1], 10);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

/**
 * Formats batch timing and training mode display without fabricating values.
 */
export function formatBatchDisplay(
  input?: BatchDisplayInput | Batch | null,
  courseContextName?: string | null
): FormattedBatch {
  const batchInput = input as (BatchDisplayInput & { name?: string }) | undefined | null;
  const batchId = batchInput?.batch_id || batchInput?.id;
  const authoritativeBatchName = batchInput?.batch_name?.trim() || batchInput?.name?.trim() || '';

  if (!batchInput || (!batchId && !authoritativeBatchName)) {
    return {
      displayName: 'Batch not assigned',
      authoritativeBatchName: '',
      isAssigned: false,
      timingAndModeLabel: 'Schedule unavailable',
      scheduleLabel: 'Schedule unavailable',
      modeLabel: 'Mode unavailable',
    };
  }

  // Deduplicate course prefix from batch name if it repeats the course title
  let displayName = authoritativeBatchName;
  if (courseContextName && courseContextName.trim()) {
    const courseTrimmed = courseContextName.trim();
    const baseCourse = extractBaseCourseName(courseTrimmed);
    const prefixes = [courseTrimmed, baseCourse];

    for (const prefix of prefixes) {
      if (prefix && displayName.toLowerCase().startsWith(prefix.toLowerCase())) {
        const afterPrefix = displayName.slice(prefix.length).trim();
        const cleaned = afterPrefix.replace(/^[-–—:]\s*/, '').trim();
        if (cleaned.length > 2) {
          displayName = cleaned;
          break;
        }
      }
    }
  }

  const batchCode = batchInput.batch_code?.trim() || undefined;
  const trainingMode = formatTrainingMode(batchInput.training_mode);
  const timingPeriod = resolveBatchTimingPeriod(batchInput.days, batchInput.start_time, authoritativeBatchName);

  let timeWindow: string | undefined;
  if (batchInput.start_time && batchInput.end_time) {
    timeWindow = `${batchInput.start_time} - ${batchInput.end_time}`;
  } else if (batchInput.start_time) {
    timeWindow = batchInput.start_time;
  }

  const scheduleLabel = timingPeriod
    ? (timeWindow ? `${timingPeriod} (${timeWindow})` : timingPeriod)
    : (timeWindow || 'Schedule unavailable');

  const modeLabel = trainingMode || 'Mode unavailable';

  let timingAndModeLabel: string;
  if (timingPeriod && trainingMode) {
    timingAndModeLabel = `${timingPeriod} · ${trainingMode}`;
  } else if (timingPeriod) {
    timingAndModeLabel = timingPeriod;
  } else if (trainingMode) {
    timingAndModeLabel = trainingMode;
  } else {
    timingAndModeLabel = 'Schedule unavailable';
  }

  let seatAvailability: string | undefined;
  if (typeof batchInput.maximum_capacity === 'number') {
    const enrolled = batchInput.current_enrolled ?? 0;
    seatAvailability = `${enrolled}/${batchInput.maximum_capacity} seats`;
  }

  return {
    displayName,
    authoritativeBatchName,
    batchCode,
    timingPeriod,
    timeWindow,
    trainingMode,
    timingAndModeLabel,
    scheduleLabel,
    modeLabel,
    isAssigned: true,
    seatAvailability,
  };
}

/**
 * Combines course and batch into standard structured display with compact and short representations.
 */
export function formatCourseBatchCombined(
  courseInput?: CourseDisplayInput | Course | null,
  batchInput?: BatchDisplayInput | Batch | null
): CombinedCourseBatchDisplay {
  const course = formatCourseDisplay(courseInput);
  const batch = formatBatchDisplay(batchInput, course.baseCourseName);

  // Build short label: e.g. "SAP FICO [Morning · Online]" or "SAP FICO [Batch not assigned]"
  const timingOrBatch = batch.isAssigned
    ? (batch.timingAndModeLabel !== 'Schedule unavailable' ? batch.timingAndModeLabel : batch.displayName)
    : 'Batch not assigned';
  const shortLabel = `${course.baseCourseName} [${timingOrBatch}]`;

  // Build compact label including training type if distinct
  const typePart = course.trainingTypeBadge ? ` (${course.trainingTypeBadge})` : '';
  const compactLabel = `${course.baseCourseName}${typePart} [${timingOrBatch}]`;

  return {
    course,
    batch,
    compactLabel,
    shortLabel,
  };
}

/**
 * Formats dropdown option labels for Course select controls.
 * Ensures courses with similar names are disambiguated with course codes.
 */
export function formatCourseOptionLabel(course: Course): string {
  if (!course) return '';
  const priceStr = typeof course.price === 'number'
    ? ` (₹${course.price.toLocaleString('en-IN')})`
    : '';
  const codeStr = course.course_code ? ` [${course.course_code}]` : '';
  return `${course.course_name}${codeStr}${priceStr}`;
}

/**
 * Formats dropdown option labels for Batch select controls.
 * Deduplicates course name and clearly indicates timing, mode, and seat capacity.
 */
export function formatBatchOptionLabel(batch: Batch, courseName?: string | null): string {
  if (!batch) return '';
  const formatted = formatBatchDisplay(batch, courseName);
  const codeStr = batch.batch_code ? `[${batch.batch_code}] ` : '';
  const timingStr = formatted.timeWindow ? ` (${formatted.timeWindow})` : '';
  const modeStr = formatted.trainingMode ? ` · ${formatted.trainingMode}` : '';
  const seatsStr = formatted.seatAvailability ? ` [${formatted.seatAvailability}]` : '';
  const cap = batch.maximum_capacity ?? 25;
  const isFull = (batch.current_enrolled || 0) >= cap;
  const fullStr = isFull ? ' - FULL (No Seats)' : '';

  return `${codeStr}${formatted.displayName}${timingStr}${modeStr}${seatsStr}${fullStr}`;
}
