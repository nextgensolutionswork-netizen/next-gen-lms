import { describe, it, expect } from 'vitest';
import {
  formatTrainingMode,
  detectTrainingCategory,
  extractBaseCourseName,
  formatCourseDisplay,
  resolveBatchTimingPeriod,
  formatBatchDisplay,
  formatCourseBatchCombined,
  formatCourseOptionLabel,
  formatBatchOptionLabel,
  type CourseDisplayInput,
  type BatchDisplayInput,
} from '@/lib/utils/course-batch-display';
import { filterAdmissions } from '@/lib/services/admissions-loading-state';
import type { Course, Batch } from '@/types';

describe('TASK-09: Course & Batch Display Formatting & Master Data Consistency', () => {
  // --- Training Mode Normalization ---
  describe('CBF-001 - CBF-003: Training Mode Formatting', () => {
    it('CBF-001: formats standard training modes accurately without altering valid values', () => {
      expect(formatTrainingMode('online')).toBe('Online');
      expect(formatTrainingMode('Online Live')).toBe('Online');
      expect(formatTrainingMode('classroom')).toBe('Classroom');
      expect(formatTrainingMode('Classroom Lab')).toBe('Classroom');
      expect(formatTrainingMode('hybrid')).toBe('Hybrid');
      expect(formatTrainingMode('offline')).toBe('Offline');
    });

    it('CBF-002: returns undefined for missing or invalid mode without defaulting to "Online"', () => {
      expect(formatTrainingMode(null)).toBeUndefined();
      expect(formatTrainingMode(undefined)).toBeUndefined();
      expect(formatTrainingMode('')).toBeUndefined();
      expect(formatTrainingMode('unknown_mode')).toBeUndefined();
    });

    it('CBF-003: batch formatter surfaces "Mode unavailable" when training mode is omitted', () => {
      const batch: BatchDisplayInput = {
        batch_id: 'b-001',
        batch_name: 'Cohort Alpha',
        training_mode: null,
      };
      const formatted = formatBatchDisplay(batch);
      expect(formatted.modeLabel).toBe('Mode unavailable');
      expect(formatted.trainingMode).toBeUndefined();
    });
  });

  // --- Training Category Detection & Base Course Extraction ---
  describe('CBF-004 - CBF-007: Course Category & Base Name Extraction', () => {
    it('CBF-004: detects Personal Training from course name or explicit category', () => {
      expect(detectTrainingCategory('SAP FICO PERSONAL TRAINING')).toBe('Personal Training');
      expect(detectTrainingCategory('Full Stack Personal (1:1)')).toBe('Personal Training');
      expect(detectTrainingCategory('Java Mentorship 1-on-1')).toBe('Personal Training');
      expect(detectTrainingCategory('Any Course', 'Personal Training')).toBe('Personal Training');
      expect(detectTrainingCategory('Any Course', 'personal')).toBe('Personal Training');
    });

    it('CBF-005: detects Normal Training from course name or explicit category', () => {
      expect(detectTrainingCategory('SAP FICO NORMAL TRAINING')).toBe('Normal Training');
      expect(detectTrainingCategory('SAP MM Normal Batch')).toBe('Normal Training');
      expect(detectTrainingCategory('Python Masterclass', 'Normal Training')).toBe('Normal Training');
    });

    it('CBF-006: extracts clean base course name by stripping redundant trailing category', () => {
      expect(extractBaseCourseName('SAP FICO - PERSONAL TRAINING')).toBe('SAP FICO');
      expect(extractBaseCourseName('SAP FICO PERSONAL TRAINING')).toBe('SAP FICO');
      expect(extractBaseCourseName('SAP MM - NORMAL TRAINING')).toBe('SAP MM');
      expect(extractBaseCourseName('SAP MM NORMAL TRAINING')).toBe('SAP MM');
      expect(extractBaseCourseName('Python Data Science')).toBe('Python Data Science');
    });

    it('CBF-007: handles empty or whitespace-only raw names truthfully with "Course unavailable"', () => {
      expect(extractBaseCourseName('')).toBe('Course unavailable');
      expect(extractBaseCourseName('   ')).toBe('Course unavailable');
      expect(extractBaseCourseName(null)).toBe('Course unavailable');
      expect(extractBaseCourseName(undefined)).toBe('Course unavailable');
    });
  });

  // --- Course Display Formatting ---
  describe('CBF-008 - CBF-011: Course Display Formatting', () => {
    it('CBF-008: formats course display and preserves authoritative name while extracting base name', () => {
      const input: CourseDisplayInput = {
        id: 'c-101',
        course_name: 'SAP FICO PERSONAL TRAINING',
        course_code: 'SAP-FICO-101',
      };
      const formatted = formatCourseDisplay(input);
      expect(formatted.baseCourseName).toBe('SAP FICO');
      expect(formatted.authoritativeCourseName).toBe('SAP FICO PERSONAL TRAINING');
      expect(formatted.courseCode).toBe('SAP-FICO-101');
      expect(formatted.isPersonalTraining).toBe(true);
      expect(formatted.isNormalTraining).toBe(false);
      expect(formatted.trainingTypeBadge).toBe('Personal Training');
      expect(formatted.isAvailable).toBe(true);
    });

    it('CBF-009: correctly formats Normal Training courses without duplicate badge text', () => {
      const input: CourseDisplayInput = {
        id: 'c-102',
        course_name: 'SAP MM NORMAL TRAINING',
        course_code: 'SAP-MM-102',
      };
      const formatted = formatCourseDisplay(input);
      expect(formatted.baseCourseName).toBe('SAP MM');
      expect(formatted.isNormalTraining).toBe(true);
      expect(formatted.trainingTypeBadge).toBe('Normal Training');
    });

    it('CBF-010: handles missing course inputs with honest fallbacks without fabricating defaults', () => {
      const formattedEmpty = formatCourseDisplay(null);
      expect(formattedEmpty.baseCourseName).toBe('Course unavailable');
      expect(formattedEmpty.authoritativeCourseName).toBe('Course unavailable');
      expect(formattedEmpty.isAvailable).toBe(false);
      expect(formattedEmpty.trainingTypeBadge).toBeUndefined();

      const formattedBlank = formatCourseDisplay({ course_name: '' });
      expect(formattedBlank.baseCourseName).toBe('Course unavailable');
      expect(formattedBlank.isAvailable).toBe(false);
    });

    it('CBF-011: preserves custom or untyped courses gracefully without falsifying badges', () => {
      const input: CourseDisplayInput = {
        id: 'c-custom',
        course_name: 'Executive Leadership Seminar',
      };
      const formatted = formatCourseDisplay(input);
      expect(formatted.baseCourseName).toBe('Executive Leadership Seminar');
      expect(formatted.authoritativeCourseName).toBe('Executive Leadership Seminar');
      expect(formatted.isPersonalTraining).toBe(false);
      expect(formatted.isNormalTraining).toBe(false);
      expect(formatted.trainingTypeBadge).toBeUndefined();
    });
  });

  // --- Batch Timing & Display Formatting ---
  describe('CBF-012 - CBF-016: Batch Display Formatting & Deduplication', () => {
    it('CBF-012: deduplicates redundant course name from batch title', () => {
      const batch: BatchDisplayInput = {
        batch_id: 'b-01',
        batch_name: 'SAP FICO Morning Fast-Track Batch',
        training_mode: 'Online',
        start_time: '08:00',
        end_time: '10:00',
      };
      const formatted = formatBatchDisplay(batch, 'SAP FICO PERSONAL TRAINING');
      expect(formatted.displayName).toBe('Morning Fast-Track Batch');
      expect(formatted.authoritativeBatchName).toBe('SAP FICO Morning Fast-Track Batch');
    });

    it('CBF-013: handles batch names without course prefixes without mangling', () => {
      const batch: BatchDisplayInput = {
        batch_id: 'b-02',
        batch_name: 'Weekend Fast-Track Cohort',
        training_mode: 'Classroom',
      };
      const formatted = formatBatchDisplay(batch, 'SAP MM');
      expect(formatted.displayName).toBe('Weekend Fast-Track Cohort');
      expect(formatted.authoritativeBatchName).toBe('Weekend Fast-Track Cohort');
    });

    it('CBF-014: resolves batch timing period accurately from start_time and days', () => {
      expect(resolveBatchTimingPeriod(['Mon', 'Wed'], '09:00')).toBe('Morning');
      expect(resolveBatchTimingPeriod(['Tue', 'Thu'], '14:00')).toBe('Afternoon');
      expect(resolveBatchTimingPeriod(['Mon', 'Fri'], '18:30')).toBe('Evening');
      expect(resolveBatchTimingPeriod(['Sat', 'Sun'], '10:00')).toBe('Weekend');
      expect(resolveBatchTimingPeriod(null, null, 'Weekend Batch Alpha')).toBe('Weekend');
    });

    it('CBF-015: combines timing period and mode into structured label', () => {
      const batch: BatchDisplayInput = {
        batch_id: 'b-03',
        batch_name: 'Morning Batch',
        training_mode: 'Online',
        start_time: '09:00',
        end_time: '11:00',
        days: ['Mon', 'Wed', 'Fri'],
      };
      const formatted = formatBatchDisplay(batch);
      expect(formatted.timingAndModeLabel).toBe('Morning · Online');
      expect(formatted.scheduleLabel).toBe('Morning (09:00 - 11:00)');
      expect(formatted.timeWindow).toBe('09:00 - 11:00');
    });

    it('CBF-016: returns truthful "Batch not assigned" when batch is absent or unassigned', () => {
      const formatted = formatBatchDisplay(null);
      expect(formatted.displayName).toBe('Batch not assigned');
      expect(formatted.isAssigned).toBe(false);
      expect(formatted.timingAndModeLabel).toBe('Schedule unavailable');
      expect(formatted.modeLabel).toBe('Mode unavailable');

      const formattedUnassigned = formatBatchDisplay({ batch_name: '' });
      expect(formattedUnassigned.displayName).toBe('Batch not assigned');
      expect(formattedUnassigned.isAssigned).toBe(false);
    });
  });

  // --- Combined Course and Batch Display ---
  describe('CBF-017 - CBF-019: Combined Display Formatting', () => {
    it('CBF-017: generates clean compact and short representations for assigned batches', () => {
      const course: CourseDisplayInput = {
        course_name: 'SAP FICO PERSONAL TRAINING',
        course_code: 'SAP-101',
      };
      const batch: BatchDisplayInput = {
        batch_name: 'SAP FICO Morning Batch',
        training_mode: 'Online',
        start_time: '08:00',
        days: ['Mon', 'Tue'],
      };
      const combined = formatCourseBatchCombined(course, batch);
      expect(combined.compactLabel).toBe('SAP FICO (Personal Training) [Morning · Online]');
      expect(combined.shortLabel).toBe('SAP FICO [Morning · Online]');
    });

    it('CBF-018: generates honest compact and short representations when batch is unassigned', () => {
      const course: CourseDisplayInput = {
        course_name: 'SAP SD NORMAL TRAINING',
      };
      const combined = formatCourseBatchCombined(course, null);
      expect(combined.compactLabel).toBe('SAP SD (Normal Training) [Batch not assigned]');
      expect(combined.shortLabel).toBe('SAP SD [Batch not assigned]');
    });

    it('CBF-019: handles completely missing course and batch data gracefully', () => {
      const combined = formatCourseBatchCombined(null, null);
      expect(combined.compactLabel).toBe('Course unavailable [Batch not assigned]');
      expect(combined.shortLabel).toBe('Course unavailable [Batch not assigned]');
    });
  });

  // --- Dropdown Option Formatting ---
  describe('CBF-020 - CBF-022: Option Label Formatting for Controls', () => {
    it('CBF-020: formats course select options with disambiguating code and formatted fee', () => {
      const course: Course = {
        id: 'c-fico',
        course_name: 'SAP FICO PERSONAL TRAINING',
        course_code: 'FICO-001',
        description: 'Financial accounting',
        duration_weeks: 12,
        category: 'SAP Functional',
        price: 45000,
        status: 'Published',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const label = formatCourseOptionLabel(course);
      expect(label).toContain('SAP FICO PERSONAL TRAINING');
      expect(label).toContain('[FICO-001]');
      expect(label).toContain('(₹45,000)');
    });

    it('CBF-021: formats batch select options with deduplicated name, timing, mode, and seats', () => {
      const batch: Batch = {
        id: 'b-01',
        batch_code: 'B-FICO-01',
        batch_name: 'SAP FICO Fast-Track Batch',
        course_id: 'c-fico',
        trainer_id: 't-01',
        training_mode: 'Online',
        start_date: '2026-03-01',
        end_date: '2026-05-01',
        start_time: '10:00',
        end_time: '12:00',
        days: ['Mon', 'Wed'],
        maximum_capacity: 20,
        current_enrolled: 15,
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const label = formatBatchOptionLabel(batch, 'SAP FICO PERSONAL TRAINING');
      expect(label).toContain('[B-FICO-01]');
      expect(label).toContain('Fast-Track Batch');
      expect(label).not.toContain('SAP FICO Fast-Track Batch');
      expect(label).toContain('(10:00 - 12:00)');
      expect(label).toContain('· Online');
      expect(label).toContain('[15/20 seats]');
    });

    it('CBF-022: marks full batches distinctly in option label', () => {
      const fullBatch: Batch = {
        id: 'b-full',
        batch_code: 'B-FULL-01',
        batch_name: 'Cohort Full',
        course_id: 'c-fico',
        trainer_id: 't-01',
        training_mode: 'Classroom',
        start_date: '2026-03-01',
        end_date: '2026-05-01',
        start_time: '14:00',
        end_time: '16:00',
        days: ['Mon'],
        maximum_capacity: 10,
        current_enrolled: 10,
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const label = formatBatchOptionLabel(fullBatch, 'Course');
      expect(label).toContain('FULL (No Seats)');
    });
  });

  // --- Admissions Search and Filter Integration ---
  describe('CBF-023 - CBF-025: Search, Filter & Tenant Integrity', () => {
    const mockAdmissions: any[] = [
      {
        id: 'adm-001',
        admission_number: 'ADM-2026-001',
        student_id: 'stu-001',
        student_name: 'Aarav Sharma',
        course_id: 'c-01',
        course_name: 'SAP FICO PERSONAL TRAINING',
        batch_id: 'b-01',
        batch_name: 'SAP FICO Morning Batch',
        enrollment_date: '2026-02-15',
        total_fees: 45000,
        paid_amount: 45000,
        balance_amount: 0,
        payment_status: 'Paid',
        status: 'Approved',
        created_at: '2026-02-15T10:00:00Z',
      },
      {
        id: 'adm-002',
        admission_number: 'ADM-2026-002',
        student_id: 'stu-002',
        student_name: 'Zara Khan',
        course_id: 'c-02',
        course_name: 'Python Masterclass',
        batch_id: null,
        batch_name: null,
        enrollment_date: '2026-02-16',
        total_fees: 30000,
        paid_amount: 15000,
        balance_amount: 15000,
        payment_status: 'Partial',
        status: 'Approved',
        created_at: '2026-02-16T11:00:00Z',
      },
    ];

    it('CBF-023: filters admissions accurately by course name', () => {
      const results = filterAdmissions(mockAdmissions as any, { search: 'SAP FICO', statusFilter: 'All' });
      expect(results.length).toBe(1);
      expect(results[0].student_name).toBe('Aarav Sharma');
    });

    it('CBF-024: filters admissions accurately by batch name', () => {
      const results = filterAdmissions(mockAdmissions as any, { search: 'Morning Batch', statusFilter: 'All' });
      expect(results.length).toBe(1);
      expect(results[0].student_name).toBe('Aarav Sharma');
    });

    it('CBF-025: returns empty set for non-matching queries without errors or state corruption', () => {
      const results = filterAdmissions(mockAdmissions as any, { search: 'NonExistentCourse', statusFilter: 'All' });
      expect(results.length).toBe(0);
    });
  });
});
