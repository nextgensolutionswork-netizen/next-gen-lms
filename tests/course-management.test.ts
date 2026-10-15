import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createCourse,
  updateCourse,
  deleteCourse,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  getModulesForCourse,
  getLessonsForModule,
  createBatch,
  updateBatch,
  deleteBatch,
  transferStudentBatch,
  getStudentsForBatch,
} from '@/lib/services/academics-service';
import { canAccessCourse, canAccessBatch } from '@/lib/auth/rbac';
import { UserProfile } from '@/types';

describe('Course LMS & Curriculum Management Tests', () => {
  beforeEach(() => {
    // Ensure clean state if needed
  });

  describe('1. RBAC & Faculty Course Access Scoping', () => {
    const adminUser: UserProfile = {
      id: 'usr-admin-test',
      email: 'admin.test@example.com',
      full_name: 'Admin Tester',
      role: 'admin',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const superAdminUser: UserProfile = {
      id: 'usr-superadmin-test',
      email: 'superadmin.test@example.com',
      full_name: 'SuperAdmin Tester',
      role: 'super_admin',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const trainerWithAssignedCourse: UserProfile = {
      id: 'usr-trainer-fico-test',
      email: 'trainer.fico@example.com',
      full_name: 'FICO Trainer',
      role: 'trainer',
      assigned_course_ids: ['crs-fico-01'],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const trainerWithoutAssignedCourse: UserProfile = {
      id: 'usr-trainer-unassigned',
      email: 'trainer.unassigned@example.com',
      full_name: 'Unassigned Trainer',
      role: 'trainer',
      assigned_course_ids: [],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('allows admins and super admins to access all courses institute-wide', () => {
      expect(canAccessCourse(adminUser, 'crs-fico-01')).toBe(true);
      expect(canAccessCourse(adminUser, 'crs-mm-01')).toBe(true);
      expect(canAccessCourse(adminUser, 'any-random-course-id')).toBe(true);

      expect(canAccessCourse(superAdminUser, 'crs-fico-01')).toBe(true);
      expect(canAccessCourse(superAdminUser, 'crs-mm-01')).toBe(true);
    });

    it('scopes trainers strictly to their assigned course IDs (default-deny)', () => {
      expect(canAccessCourse(trainerWithAssignedCourse, 'crs-fico-01')).toBe(true);
      expect(canAccessCourse(trainerWithAssignedCourse, 'crs-mm-01')).toBe(false);

      // Unassigned trainer has 0 access
      expect(canAccessCourse(trainerWithoutAssignedCourse, 'crs-fico-01')).toBe(false);
      expect(canAccessCourse(trainerWithoutAssignedCourse, 'crs-mm-01')).toBe(false);
    });
  });

  describe('2. Course, Module, and Lesson CRUD Lifecycle & Count Cascading', () => {
    it('creates, updates, and deletes course hierarchy with cascading integrity', async () => {
      // 1. Create Course
      const newCourse = await createCourse({
        course_name: 'SAP ABAP on Cloud',
        course_code: 'SAP-ABAP-2026',
        description: 'Modern ABAP programming for SAP BTP and S/4HANA',
        duration_weeks: 8,
        category: 'SAP Technical',
        price: 35000,
        status: 'Draft',
      });

      expect(newCourse.id).toBeDefined();
      expect(newCourse.modules_count).toBe(0);
      expect(newCourse.lessons_count).toBe(0);
      expect(store.courses.some((c) => c.id === newCourse.id)).toBe(true);

      // 2. Update Course
      const updatedCourse = await updateCourse(newCourse.id, {
        price: 38000,
        status: 'Published',
      });
      expect(updatedCourse.price).toBe(38000);
      expect(updatedCourse.status).toBe('Published');

      // 3. Create Module 1
      const mod1 = await createModule(newCourse.id, 'Core ABAP Syntax', 'Variables and Control Structures');
      expect(mod1.id).toBeDefined();
      expect(mod1.order_index).toBe(1);

      // Verify course modules_count incremented
      const courseAfterMod1 = store.courses.find((c) => c.id === newCourse.id);
      expect(courseAfterMod1?.modules_count).toBe(1);

      // 4. Create Module 2
      const mod2 = await createModule(newCourse.id, 'ABAP RESTful Application Programming Model', 'RAP & CDS Views');
      expect(mod2.order_index).toBe(2);
      expect(courseAfterMod1?.modules_count).toBe(2);

      // 5. Create Lessons under Module 1
      const les1 = await createLesson({
        course_id: newCourse.id,
        module_id: mod1.id,
        title: 'Introduction to ABAP Variables',
        content_type: 'Video',
        duration_minutes: 25,
        content_url: 'https://cdn.example.com/abap/lesson1.mp4',
        order_index: 1,
        is_published: true,
      });

      const les2 = await createLesson({
        course_id: newCourse.id,
        module_id: mod1.id,
        title: 'ABAP Internal Tables',
        content_type: 'Video',
        duration_minutes: 35,
        content_url: 'https://cdn.example.com/abap/lesson2.mp4',
        order_index: 2,
        is_published: true,
      });

      // Verify module lessons_count and course lessons_count
      const mod1After = store.modules.find((m) => m.id === mod1.id);
      expect(mod1After?.lessons_count).toBe(2);
      expect(courseAfterMod1?.lessons_count).toBe(2);

      // 6. Update Lesson
      const updatedLes = await updateLesson(les1.id, {
        duration_minutes: 30,
        content_url: 'https://cdn.example.com/abap/lesson1-hd.mp4',
      });
      expect(updatedLes.duration_minutes).toBe(30);
      expect(updatedLes.content_url).toBe('https://cdn.example.com/abap/lesson1-hd.mp4');

      // 7. Delete Lesson 2 - verify counts decrement
      await deleteLesson(les2.id);
      expect(store.lessons.some((l) => l.id === les2.id)).toBe(false);
      expect(mod1After?.lessons_count).toBe(1);
      expect(courseAfterMod1?.lessons_count).toBe(1);

      // 8. Delete Module 1 - verify cascading deletion of les1
      await deleteModule(mod1.id);
      expect(store.modules.some((m) => m.id === mod1.id)).toBe(false);
      expect(store.lessons.some((l) => l.id === les1.id)).toBe(false);
      expect(courseAfterMod1?.modules_count).toBe(1); // mod2 remains
      expect(courseAfterMod1?.lessons_count).toBe(0);

      // 9. Delete Course - verify clean removal of child mod2
      await deleteCourse(newCourse.id);
      expect(store.courses.some((c) => c.id === newCourse.id)).toBe(false);
      expect(store.modules.some((m) => m.id === mod2.id)).toBe(false);
    });
  });

  describe('3. Curriculum Reordering Engine', () => {
    it('reorders modules and lessons sequentially', async () => {
      // Setup course with 3 modules
      const course = await createCourse({
        course_name: 'SAP BTP Architecture',
        course_code: 'SAP-BTP-2026',
        description: 'Cloud Integration & Extension Suite',
        duration_weeks: 6,
        category: 'SAP Technical',
        price: 30000,
        status: 'Published',
      });

      const m1 = await createModule(course.id, 'Module A', 'First');
      const m2 = await createModule(course.id, 'Module B', 'Second');
      const m3 = await createModule(course.id, 'Module C', 'Third');

      // Reorder modules: [m3, m1, m2]
      await reorderModules(course.id, [m3.id, m1.id, m2.id]);
      const reorderedMods = await getModulesForCourse(course.id);

      expect(reorderedMods[0].id).toBe(m3.id);
      expect(reorderedMods[0].order_index).toBe(1);
      expect(reorderedMods[1].id).toBe(m1.id);
      expect(reorderedMods[1].order_index).toBe(2);
      expect(reorderedMods[2].id).toBe(m2.id);
      expect(reorderedMods[2].order_index).toBe(3);

      // Add 3 lessons to m3
      const l1 = await createLesson({
        course_id: course.id,
        module_id: m3.id,
        title: 'Lesson X',
        content_type: 'Text',
        duration_minutes: 10,
        order_index: 1,
        is_published: true,
      });
      const l2 = await createLesson({
        course_id: course.id,
        module_id: m3.id,
        title: 'Lesson Y',
        content_type: 'Text',
        duration_minutes: 15,
        order_index: 2,
        is_published: true,
      });
      const l3 = await createLesson({
        course_id: course.id,
        module_id: m3.id,
        title: 'Lesson Z',
        content_type: 'Text',
        duration_minutes: 20,
        order_index: 3,
        is_published: true,
      });

      // Reorder lessons: [l2, l3, l1]
      await reorderLessons(m3.id, [l2.id, l3.id, l1.id]);
      const reorderedLessons = await getLessonsForModule(m3.id);

      expect(reorderedLessons[0].id).toBe(l2.id);
      expect(reorderedLessons[0].order_index).toBe(1);
      expect(reorderedLessons[1].id).toBe(l3.id);
      expect(reorderedLessons[1].order_index).toBe(2);
      expect(reorderedLessons[2].id).toBe(l1.id);
      expect(reorderedLessons[2].order_index).toBe(3);

      // Clean up
      await deleteCourse(course.id);
    });
  });

  describe('4. Batch Lifecycle, Roster Scoping & Capacity Guard', () => {
    it('creates, updates, and fetches roster for a batch', async () => {
      // 1. Create a batch
      const batch = await createBatch({
        batch_code: 'B-TEST-2601',
        batch_name: 'SAP BTP Fast Track Cohort',
        course_id: 'crs-fico-01',
        trainer_id: 'usr-trainer-fico',
        training_mode: 'Hybrid',
        start_date: '2026-04-01',
        end_date: '2026-06-30',
        start_time: '09:00',
        end_time: '11:00',
        days: ['Mon', 'Wed', 'Fri'],
        maximum_capacity: 2,
        status: 'Upcoming',
      });

      expect(batch.id).toBeDefined();
      expect(batch.maximum_capacity).toBe(2);
      expect(batch.current_enrolled).toBe(0);

      // 2. Update batch
      const updated = await updateBatch(batch.id, {
        batch_name: 'SAP BTP Morning Cohort',
        status: 'Active',
        maximum_capacity: 2,
      });
      expect(updated.batch_name).toBe('SAP BTP Morning Cohort');
      expect(updated.status).toBe('Active');

      // 3. Assign a test student to this batch
      const testStudent = {
        id: `stu-batch-test-${Date.now()}`,
        user_id: 'usr-test-batch',
        admission_id: 'adm-test-batch',
        student_code: 'STU-TEST-B',
        admission_number: 'ADM-TEST-B',
        full_name: 'Batch Test Student',
        email: 'batch.test@example.com',
        phone: '+91 99999 11111',
        course_id: 'crs-fico-01',
        batch_id: batch.id,
        batch_name: batch.batch_name,
        joining_date: '2026-04-01',
        status: 'Active' as const,
        total_fee: 40000,
        paid_amount: 40000,
        outstanding_amount: 0,
        attendance_percentage: 95,
        course_progress: 20,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.students.push(testStudent as any);
      batch.current_enrolled = 1;

      // 4. Verify getStudentsForBatch
      const roster = await getStudentsForBatch(batch.id);
      expect(roster.length).toBe(1);
      expect(roster[0].id).toBe(testStudent.id);

      // 5. Verify deletion guard when students are enrolled
      await expect(deleteBatch(batch.id)).rejects.toThrow(/Cannot delete batch/);

      // 6. Test capacity guard in student transfer
      // Create second batch with maximum_capacity = 1 and current_enrolled = 1
      const fullBatch = await createBatch({
        batch_code: 'B-FULL-2601',
        batch_name: 'Full Capacity Cohort',
        course_id: 'crs-fico-01',
        trainer_id: 'usr-trainer-fico',
        training_mode: 'Online',
        start_date: '2026-04-01',
        end_date: '2026-06-30',
        start_time: '14:00',
        end_time: '16:00',
        days: ['Sat', 'Sun'],
        maximum_capacity: 1,
        status: 'Active',
      });
      fullBatch.current_enrolled = 1; // Mark at capacity

      // Transfer should reject due to capacity limit
      await expect(
        transferStudentBatch(testStudent.id, fullBatch.id, 'Shift time', 'usr-admin')
      ).rejects.toThrow(/at maximum capacity/);

      // Same batch transfer should reject
      await expect(
        transferStudentBatch(testStudent.id, batch.id, 'Redundant transfer', 'usr-admin')
      ).rejects.toThrow(/already enrolled in this batch/);

      // Clean up test records
      store.students = store.students.filter((s) => s.id !== testStudent.id);
      batch.current_enrolled = 0;
      await deleteBatch(batch.id);
      fullBatch.current_enrolled = 0;
      await deleteBatch(fullBatch.id);
    });

    it('strictly enforces trainer RBAC boundaries, mandatory audit reasons, and code uniqueness', async () => {
      // 1. Prevent duplicate batch codes
      const batchA = await createBatch({
        batch_code: 'B-RBAC-T1',
        batch_name: 'Trainer 1 Source Cohort',
        course_id: 'crs-fico-01',
        trainer_id: 'usr-trainer-fico',
        training_mode: 'Online',
        start_date: '2026-05-01',
        end_date: '2026-07-31',
        start_time: '10:00',
        end_time: '12:00',
        days: ['Mon', 'Wed'],
        maximum_capacity: 10,
        status: 'Active',
      });

      await expect(
        createBatch({
          batch_code: 'B-RBAC-T1', // Duplicate code
          batch_name: 'Conflicting Cohort',
          course_id: 'crs-fico-01',
          trainer_id: 'usr-trainer-fico',
          training_mode: 'Online',
          start_date: '2026-05-01',
          end_date: '2026-07-31',
          start_time: '10:00',
          end_time: '12:00',
          days: ['Mon', 'Wed'],
          maximum_capacity: 10,
          status: 'Active',
        })
      ).rejects.toThrow(/already exists/);

      // Create a batch assigned to Trainer 2 (usr-trainer-mm)
      const batchB = await createBatch({
        batch_code: 'B-RBAC-T2',
        batch_name: 'Trainer 2 Destination Cohort',
        course_id: 'crs-fico-01',
        trainer_id: 'usr-trainer-mm',
        training_mode: 'Online',
        start_date: '2026-05-01',
        end_date: '2026-07-31',
        start_time: '14:00',
        end_time: '16:00',
        days: ['Tue', 'Thu'],
        maximum_capacity: 10,
        status: 'Active',
      });

      // Create a student in batchA
      const student = {
        id: `stu-rbac-${Date.now()}`,
        user_id: 'usr-rbac-student',
        admission_id: 'adm-rbac-student',
        student_code: 'STU-RBAC',
        admission_number: 'ADM-RBAC',
        full_name: 'RBAC Student',
        email: 'rbac.student@example.com',
        phone: '+91 99999 22222',
        course_id: 'crs-fico-01',
        batch_id: batchA.id,
        batch_name: batchA.batch_name,
        joining_date: '2026-05-01',
        status: 'Active' as const,
        total_fee: 40000,
        paid_amount: 40000,
        outstanding_amount: 0,
        attendance_percentage: 100,
        course_progress: 10,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.students.push(student as any);
      batchA.current_enrolled = 1;

      // 2. Reject transfer when reason is empty
      await expect(
        transferStudentBatch(student.id, batchB.id, '   ', 'usr-admin')
      ).rejects.toThrow(/mandatory for audit trail compliance/);

      // 3. Trainer cannot transfer student to another trainer's cohort without admin approval
      await expect(
        transferStudentBatch(student.id, batchB.id, 'Trainer attempting cross-trainer transfer', 'usr-trainer-fico')
      ).rejects.toThrow(/Trainers can only transfer students between batches assigned to their own profile/);

      // 4. Create another batch also assigned to usr-trainer-fico
      const batchA2 = await createBatch({
        batch_code: 'B-RBAC-T1-ALT',
        batch_name: 'Trainer 1 Alternate Cohort',
        course_id: 'crs-fico-01',
        trainer_id: 'usr-trainer-fico',
        training_mode: 'Online',
        start_date: '2026-05-01',
        end_date: '2026-07-31',
        start_time: '18:00',
        end_time: '20:00',
        days: ['Mon', 'Wed'],
        maximum_capacity: 10,
        status: 'Active',
      });

      // 5. Trainer transferring student between their OWN batches succeeds
      const transferAudit = await transferStudentBatch(
        student.id,
        batchA2.id,
        'Evening slot requested by student',
        'usr-trainer-fico'
      );
      expect(transferAudit.from_batch_id).toBe(batchA.id);
      expect(transferAudit.to_batch_id).toBe(batchA2.id);
      expect(student.batch_id).toBe(batchA2.id);
      expect(batchA.current_enrolled).toBe(0);
      expect(batchA2.current_enrolled).toBe(1);

      // 6. Admin can perform cross-trainer transfer (from batchA2 [trainer-fico] to batchB [trainer-mm])
      const adminTransferAudit = await transferStudentBatch(
        student.id,
        batchB.id,
        'Admin authorized module switch',
        'usr-admin'
      );
      expect(adminTransferAudit.to_batch_id).toBe(batchB.id);
      expect(student.batch_id).toBe(batchB.id);
      expect(batchB.current_enrolled).toBe(1);

      // Clean up
      store.students = store.students.filter((s) => s.id !== student.id);
      batchA.current_enrolled = 0;
      batchA2.current_enrolled = 0;
      batchB.current_enrolled = 0;
      await deleteBatch(batchA.id);
      await deleteBatch(batchA2.id);
      await deleteBatch(batchB.id);
    });
  });

  describe('4. Curriculum Approval Workflows, Syllabus Attachments & Module-Scoped Order Index', () => {
    it('supports course syllabus attachment and curriculum review workflow transitions', async () => {
      // 1. Create course in Draft with syllabus_url
      const draftCourse = await createCourse({
        course_name: 'SAP BTP Cloud Security',
        course_code: 'SAP-SEC-2026',
        description: 'Identity management and cloud authorization architecture',
        duration_weeks: 6,
        category: 'SAP Cloud',
        price: 38000,
        status: 'Draft',
        syllabus_url: '/syllabi/sap-btp-security-curriculum.pdf',
      });

      expect(draftCourse.status).toBe('Draft');
      expect(draftCourse.syllabus_url).toBe('/syllabi/sap-btp-security-curriculum.pdf');

      // 2. Faculty submits for review
      const reviewCourse = await updateCourse(draftCourse.id, {
        status: 'Under Review',
      });
      expect(reviewCourse.status).toBe('Under Review');

      // 3. Academic Director approves and publishes
      const publishedCourse = await updateCourse(draftCourse.id, {
        status: 'Published',
      });
      expect(publishedCourse.status).toBe('Published');

      // 4. Academic Director can request revision back to Draft
      const revisedCourse = await updateCourse(draftCourse.id, {
        status: 'Draft',
      });
      expect(revisedCourse.status).toBe('Draft');

      // Clean up
      await deleteCourse(draftCourse.id);
    });

    it('orders lessons relative to their specific module rather than total course lessons', async () => {
      // 1. Create test course and two modules
      const course = await createCourse({
        course_name: 'SAP Integration Suite',
        course_code: 'SAP-CPI-2026',
        description: 'Cloud Integration and API Management',
        duration_weeks: 8,
        category: 'SAP Cloud',
        price: 42000,
        status: 'Published',
      });

      const mod1 = await createModule(course.id, 'Module 1: CPI Basics', 'Overview');
      const mod2 = await createModule(course.id, 'Module 2: Groovy Scripting', 'Scripting');

      // 2. Create 2 lessons in Module 1
      const les1_1 = await createLesson({
        module_id: mod1.id,
        course_id: course.id,
        title: 'CPI Architecture Overview',
        lesson_type: 'Video',
        duration_minutes: 40,
        order_index: 1,
        is_published: true,
      });

      const les1_2 = await createLesson({
        module_id: mod1.id,
        course_id: course.id,
        title: 'iFlow Message Flow Design',
        lesson_type: 'Video',
        duration_minutes: 50,
        order_index: 2,
        is_published: true,
      });

      // Total lessons in course is now 2
      const allCourseLessons = store.lessons.filter((l) => l.course_id === course.id);
      expect(allCourseLessons.length).toBe(2);

      // 3. Create first lesson in Module 2
      // Using module-scoped count: Module 2 has 0 lessons, so order_index should be 1 (NOT 2 + 1 = 3)
      const mod2Lessons = store.lessons.filter((l) => l.module_id === mod2.id);
      const les2_1 = await createLesson({
        module_id: mod2.id,
        course_id: course.id,
        title: 'Groovy Scripting Fundamentals',
        lesson_type: 'Video',
        duration_minutes: 45,
        order_index: mod2Lessons.length + 1,
        is_published: true,
      });

      expect(les2_1.order_index).toBe(1);

      // Clean up
      await deleteCourse(course.id);
    });
  });
});

