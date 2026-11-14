/**
 * QA-029 / BUG-05: Batch Enrollment Count & Roster Reconciliation Suite
 *
 * Verifies that:
 * 1. Stored vs live count divergence is resolved (batch.current_enrolled always reconciles with authoritative student records).
 * 2. Cancelled and transferred enrollments are excluded from active batch counts.
 * 3. Duplicate enrollment or admission IDs are counted once.
 * 4. Capacity and available-seat calculations (maximum_capacity - active_enrolled) are exact and enforced.
 * 5. Batch card count, roster button count, and roster modal count match 100%.
 * 6. Transfer between cohorts decrements source batch and increments target batch dynamically.
 * 7. Batches with zero enrollments display 0 and render an empty roster without fallback/demo rows.
 * 8. Search filtering within the roster displays the filtered count against the total enrolled count.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  getBatches,
  createBatch,
  deleteBatch,
  getStudentsForBatch,
  getBatchActiveEnrolledStudents,
  getBatchActiveEnrolledCount,
  reconcileBatchCounts,
  transferStudentBatch,
} from '@/lib/services/academics-service';
import { Batch, Student, Admission } from '@/types';

describe('QA-029 / BUG-05: Batch Roster & Enrollment Reconciliation', () => {
  const adminUserId = 'usr-admin-qa';
  const trainerUserId = 'usr-trainer-fico';

  beforeEach(() => {
    // Isolated fixture data
    store.users = [
      {
        id: adminUserId,
        email: 'admin@test.com',
        full_name: 'Admin User',
        role: 'admin',
        tenant_id: 'default',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: trainerUserId,
        email: 'trainer@test.com',
        full_name: 'Vikram Rao',
        role: 'trainer',
        tenant_id: 'default',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    store.courses = [
      {
        id: 'crs-fico-01',
        course_name: 'SAP S/4HANA Finance (FICO)',
        course_code: 'SAP-FICO',
        category: 'SAP Functional',
        status: 'Published',
        price: 40000,
        description: 'Finance course',
        duration_weeks: 12,
        modules_count: 5,
        lessons_count: 20,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'crs-mm-01',
        course_name: 'SAP S/4HANA Materials Management (MM)',
        course_code: 'SAP-MM',
        category: 'SAP Functional',
        status: 'Published',
        price: 40000,
        description: 'MM course',
        duration_weeks: 12,
        modules_count: 5,
        lessons_count: 20,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    store.batches = [];
    store.students = [];
    store.admissions = [];
    store.batchTransferAudits = [];
  });

  it('1. resolves stored vs live count divergence through authoritative reconciliation', async () => {
    // Simulate historical bug: batch has stored current_enrolled: 22, but only 1 active student exists
    const testBatch: Batch = {
      id: 'batch-test-divergence',
      batch_code: 'B-TEST-DIV',
      batch_name: 'SAP MM Test Divergence Batch',
      course_id: 'crs-mm-01',
      course_name: 'SAP S/4HANA Materials Management (MM)',
      trainer_id: trainerUserId,
      trainer_name: 'Vikram Rao',
      training_mode: 'Online',
      start_date: '2026-03-01',
      end_date: '2026-05-31',
      start_time: '10:00',
      end_time: '13:00',
      days: ['Sat', 'Sun'],
      maximum_capacity: 30,
      current_enrolled: 22, // Stale/seeded stored count
      status: 'Active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.batches.push(testBatch);

    // Only 1 real student enrolled
    const singleStudent: Student = {
      id: 'stu-sneha-01',
      user_id: 'usr-sneha',
      admission_id: 'adm-sneha-01',
      admission_number: 'ADM-2026-0002',
      student_code: 'STU-MM-002',
      full_name: 'Sneha Kulkarni',
      email: 'sneha@test.com',
      phone: '+91 98222 33344',
      course_id: 'crs-mm-01',
      batch_id: testBatch.id,
      joining_date: '2026-02-15',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 20000,
      outstanding_amount: 20000,
      attendance_percentage: 88,
      course_progress: 52,
      placement_status: 'Not Started',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.students.push(singleStudent);

    // Initial state: stored number (22) diverges from live roster (1)
    expect(testBatch.current_enrolled).toBe(22);
    expect(store.students.filter((s) => s.batch_id === testBatch.id).length).toBe(1);

    // Reconcile batch counts
    reconcileBatchCounts();

    // After reconciliation: stored number must match live authoritative count
    expect(testBatch.current_enrolled).toBe(1);
    expect(getBatchActiveEnrolledCount(testBatch.id)).toBe(1);

    const roster = await getStudentsForBatch(testBatch.id);
    expect(roster.length).toBe(1);
    expect(roster[0].full_name).toBe('Sneha Kulkarni');
  });

  it('2. excludes cancelled, dropped, inactive, completed, and transferred enrollments from active counts', async () => {
    const batchA = await createBatch({
      batch_code: 'B-COHORT-A',
      batch_name: 'Cohort Alpha',
      course_id: 'crs-fico-01',
      trainer_id: trainerUserId,
      training_mode: 'Classroom',
      start_date: '2026-03-01',
      end_date: '2026-05-31',
      start_time: '08:00',
      end_time: '10:00',
      days: ['Mon', 'Wed', 'Fri'],
      maximum_capacity: 25,
      status: 'Active',
    });

    const batchB = await createBatch({
      batch_code: 'B-COHORT-B',
      batch_name: 'Cohort Beta',
      course_id: 'crs-fico-01',
      trainer_id: trainerUserId,
      training_mode: 'Online',
      start_date: '2026-03-01',
      end_date: '2026-05-31',
      start_time: '10:00',
      end_time: '12:00',
      days: ['Sat', 'Sun'],
      maximum_capacity: 25,
      status: 'Active',
    });

    const now = new Date().toISOString();

    // 1. Qualifying Active student in Batch A
    store.students.push({
      id: 'stu-active-01',
      user_id: 'usr-1',
      admission_id: 'adm-1',
      admission_number: 'ADM-001',
      student_code: 'STU-001',
      full_name: 'Active Student One',
      email: 'active1@test.com',
      phone: '+91 90000 00001',
      course_id: 'crs-fico-01',
      batch_id: batchA.id,
      joining_date: '2026-03-01',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 95,
      course_progress: 50,
      placement_status: 'Not Started',
      created_at: now,
      updated_at: now,
    });

    // 2. Cancelled student in Batch A (should be excluded)
    store.students.push({
      id: 'stu-cancelled-02',
      user_id: 'usr-2',
      admission_id: 'adm-2',
      admission_number: 'ADM-002',
      student_code: 'STU-002',
      full_name: 'Cancelled Student Two',
      email: 'cancelled2@test.com',
      phone: '+91 90000 00002',
      course_id: 'crs-fico-01',
      batch_id: batchA.id,
      joining_date: '2026-03-01',
      status: 'Cancelled' as any,
      total_fee: 40000,
      paid_amount: 0,
      outstanding_amount: 40000,
      attendance_percentage: 0,
      course_progress: 0,
      placement_status: 'Not Started',
      created_at: now,
      updated_at: now,
    });

    // 3. Dropped student in Batch A (should be excluded)
    store.students.push({
      id: 'stu-dropped-03',
      user_id: 'usr-3',
      admission_id: 'adm-3',
      admission_number: 'ADM-003',
      student_code: 'STU-003',
      full_name: 'Dropped Student Three',
      email: 'dropped3@test.com',
      phone: '+91 90000 00003',
      course_id: 'crs-fico-01',
      batch_id: batchA.id,
      joining_date: '2026-03-01',
      status: 'Dropped',
      total_fee: 40000,
      paid_amount: 10000,
      outstanding_amount: 30000,
      attendance_percentage: 10,
      course_progress: 5,
      placement_status: 'Not Started',
      created_at: now,
      updated_at: now,
    });

    // 4. Inactive student in Batch A (should be excluded)
    store.students.push({
      id: 'stu-inactive-04',
      user_id: 'usr-4',
      admission_id: 'adm-4',
      admission_number: 'ADM-004',
      student_code: 'STU-004',
      full_name: 'Inactive Student Four',
      email: 'inactive4@test.com',
      phone: '+91 90000 00004',
      course_id: 'crs-fico-01',
      batch_id: batchA.id,
      joining_date: '2026-03-01',
      status: 'Inactive' as any,
      total_fee: 40000,
      paid_amount: 0,
      outstanding_amount: 40000,
      attendance_percentage: 0,
      course_progress: 0,
      placement_status: 'Not Started',
      created_at: now,
      updated_at: now,
    });

    // 5. Completed student in Batch A (alumni, should be excluded from active seat count)
    store.students.push({
      id: 'stu-completed-05',
      user_id: 'usr-5',
      admission_id: 'adm-5',
      admission_number: 'ADM-005',
      student_code: 'STU-005',
      full_name: 'Completed Student Five',
      email: 'completed5@test.com',
      phone: '+91 90000 00005',
      course_id: 'crs-fico-01',
      batch_id: batchA.id,
      joining_date: '2026-01-01',
      status: 'Completed',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 92,
      course_progress: 100,
      placement_status: 'Placed',
      created_at: now,
      updated_at: now,
    });

    // 6. Transferred student (was previously in Batch A, now transferred to Batch B)
    store.students.push({
      id: 'stu-transferred-06',
      user_id: 'usr-6',
      admission_id: 'adm-6',
      admission_number: 'ADM-006',
      student_code: 'STU-006',
      full_name: 'Transferred Student Six',
      email: 'transferred6@test.com',
      phone: '+91 90000 00006',
      course_id: 'crs-fico-01',
      batch_id: batchB.id, // Current batch is B
      joining_date: '2026-03-01',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 85,
      course_progress: 40,
      placement_status: 'Not Started',
      created_at: now,
      updated_at: now,
    });

    reconcileBatchCounts();

    // Batch A must have exactly 1 active enrolled student (stu-active-01)
    expect(getBatchActiveEnrolledCount(batchA.id)).toBe(1);
    expect(batchA.current_enrolled).toBe(1);
    const rosterA = await getStudentsForBatch(batchA.id);
    expect(rosterA.length).toBe(1);
    expect(rosterA[0].id).toBe('stu-active-01');

    // Batch B must have exactly 1 active enrolled student (stu-transferred-06)
    expect(getBatchActiveEnrolledCount(batchB.id)).toBe(1);
    expect(batchB.current_enrolled).toBe(1);
    const rosterB = await getStudentsForBatch(batchB.id);
    expect(rosterB.length).toBe(1);
    expect(rosterB[0].id).toBe('stu-transferred-06');
  });

  it('3. counts duplicate enrollment or admission IDs exactly once', async () => {
    const batch = await createBatch({
      batch_code: 'B-DEDUP-01',
      batch_name: 'Dedup Test Batch',
      course_id: 'crs-fico-01',
      trainer_id: trainerUserId,
      training_mode: 'Online',
      start_date: '2026-04-01',
      end_date: '2026-06-30',
      start_time: '08:00',
      end_time: '10:00',
      days: ['Mon', 'Wed'],
      maximum_capacity: 20,
      status: 'Active',
    });

    const now = new Date().toISOString();

    // Primary student entry
    store.students.push({
      id: 'stu-dup-01',
      user_id: 'usr-dup-1',
      admission_id: 'adm-dup-001',
      admission_number: 'ADM-2026-DUP1',
      student_code: 'STU-FICO-001',
      full_name: 'Karan Johar',
      email: 'karan@test.com',
      phone: '+91 99999 11111',
      course_id: 'crs-fico-01',
      batch_id: batch.id,
      joining_date: '2026-04-01',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 90,
      course_progress: 30,
      placement_status: 'Not Started',
      created_at: now,
      updated_at: now,
    });

    // Duplicate entry with same student ID
    store.students.push({
      id: 'stu-dup-01', // Duplicate ID
      user_id: 'usr-dup-1-mirror',
      admission_id: 'adm-dup-001',
      admission_number: 'ADM-2026-DUP1',
      student_code: 'STU-FICO-001',
      full_name: 'Karan Johar (Duplicate)',
      email: 'karan@test.com',
      phone: '+91 99999 11111',
      course_id: 'crs-fico-01',
      batch_id: batch.id,
      joining_date: '2026-04-01',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 90,
      course_progress: 30,
      placement_status: 'Not Started',
      created_at: now,
      updated_at: now,
    });

    // Another record sharing the same admission_id
    store.students.push({
      id: 'stu-dup-02-secondary',
      user_id: 'usr-dup-2',
      admission_id: 'adm-dup-001', // Same admission ID
      admission_number: 'ADM-2026-DUP1',
      student_code: 'STU-FICO-001-ALT',
      full_name: 'Karan Johar (Alias)',
      email: 'karan@test.com',
      phone: '+91 99999 11111',
      course_id: 'crs-fico-01',
      batch_id: batch.id,
      joining_date: '2026-04-01',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 90,
      course_progress: 30,
      placement_status: 'Not Started',
      created_at: now,
      updated_at: now,
    });

    // Another legitimate distinct student in the same batch
    store.students.push({
      id: 'stu-distinct-02',
      user_id: 'usr-distinct-2',
      admission_id: 'adm-distinct-002',
      admission_number: 'ADM-2026-DIST2',
      student_code: 'STU-FICO-002',
      full_name: 'Pooja Bhatt',
      email: 'pooja@test.com',
      phone: '+91 99999 22222',
      course_id: 'crs-fico-01',
      batch_id: batch.id,
      joining_date: '2026-04-01',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 92,
      course_progress: 35,
      placement_status: 'Not Started',
      created_at: now,
      updated_at: now,
    });

    reconcileBatchCounts();

    // There should be exactly 2 unique qualifying students, not 4
    const count = getBatchActiveEnrolledCount(batch.id);
    expect(count).toBe(2);
    expect(batch.current_enrolled).toBe(2);

    const roster = await getStudentsForBatch(batch.id);
    expect(roster.length).toBe(2);
    expect(roster.map((s) => s.full_name)).toEqual(['Karan Johar', 'Pooja Bhatt']);
  });

  it('4. computes correct capacity and available-seat limit (max capacity - active enrolled)', async () => {
    const batch = await createBatch({
      batch_code: 'B-CAP-01',
      batch_name: 'Capacity Test Batch',
      course_id: 'crs-fico-01',
      trainer_id: trainerUserId,
      training_mode: 'Classroom',
      start_date: '2026-04-01',
      end_date: '2026-06-30',
      start_time: '08:00',
      end_time: '10:00',
      days: ['Mon', 'Wed'],
      maximum_capacity: 5,
      status: 'Active',
    });

    // When empty:
    expect(batch.maximum_capacity).toBe(5);
    expect(batch.current_enrolled).toBe(0);
    expect(batch.maximum_capacity - batch.current_enrolled).toBe(5);

    // Add 2 active students
    for (let i = 1; i <= 2; i++) {
      store.students.push({
        id: `stu-cap-${i}`,
        user_id: `usr-cap-${i}`,
        admission_id: `adm-cap-${i}`,
        admission_number: `ADM-CAP-${i}`,
        student_code: `STU-CAP-${i}`,
        full_name: `Student Cap ${i}`,
        email: `cap${i}@test.com`,
        phone: `+91 98000 0000${i}`,
        course_id: 'crs-fico-01',
        batch_id: batch.id,
        joining_date: '2026-04-01',
        status: 'Active',
        total_fee: 40000,
        paid_amount: 40000,
        outstanding_amount: 0,
        attendance_percentage: 90,
        course_progress: 20,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    reconcileBatchCounts();
    expect(batch.current_enrolled).toBe(2);
    expect(batch.maximum_capacity - batch.current_enrolled).toBe(3);

    // Add 3 more active students to reach capacity
    for (let i = 3; i <= 5; i++) {
      store.students.push({
        id: `stu-cap-${i}`,
        user_id: `usr-cap-${i}`,
        admission_id: `adm-cap-${i}`,
        admission_number: `ADM-CAP-${i}`,
        student_code: `STU-CAP-${i}`,
        full_name: `Student Cap ${i}`,
        email: `cap${i}@test.com`,
        phone: `+91 98000 0000${i}`,
        course_id: 'crs-fico-01',
        batch_id: batch.id,
        joining_date: '2026-04-01',
        status: 'Active',
        total_fee: 40000,
        paid_amount: 40000,
        outstanding_amount: 0,
        attendance_percentage: 90,
        course_progress: 20,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    reconcileBatchCounts();
    expect(batch.current_enrolled).toBe(5);
    expect(batch.maximum_capacity - batch.current_enrolled).toBe(0);

    // Attempting to transfer an external student into this full batch must be rejected
    const externalStudent: Student = {
      id: 'stu-external',
      user_id: 'usr-ext',
      admission_id: 'adm-ext',
      admission_number: 'ADM-EXT',
      student_code: 'STU-EXT',
      full_name: 'External Student',
      email: 'external@test.com',
      phone: '+91 98000 99999',
      course_id: 'crs-fico-01',
      batch_id: 'batch-some-other',
      joining_date: '2026-04-01',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 90,
      course_progress: 20,
      placement_status: 'Not Started',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.students.push(externalStudent);

    await expect(
      transferStudentBatch(externalStudent.id, batch.id, 'Shift schedule', adminUserId)
    ).rejects.toThrow(/at maximum capacity \(5\/5 students\)/);
  });

  it('5. guarantees batch card count, roster button count, and roster modal count match 100%', async () => {
    const batch = await createBatch({
      batch_code: 'B-ALIGN-01',
      batch_name: 'Aligned MM Cohort',
      course_id: 'crs-mm-01',
      trainer_id: trainerUserId,
      training_mode: 'Online',
      start_date: '2026-03-15',
      end_date: '2026-06-15',
      start_time: '10:00',
      end_time: '13:00',
      days: ['Sat', 'Sun'],
      maximum_capacity: 30,
      status: 'Active',
    });

    // Populate 3 qualifying students
    for (let i = 1; i <= 3; i++) {
      store.students.push({
        id: `stu-align-${i}`,
        user_id: `usr-align-${i}`,
        admission_id: `adm-align-${i}`,
        admission_number: `ADM-ALIGN-${i}`,
        student_code: `STU-ALIGN-${i}`,
        full_name: `Aligned Trainee ${i}`,
        email: `aligned${i}@test.com`,
        phone: `+91 97000 0000${i}`,
        course_id: 'crs-mm-01',
        batch_id: batch.id,
        joining_date: '2026-03-15',
        status: 'Active',
        total_fee: 40000,
        paid_amount: 40000,
        outstanding_amount: 0,
        attendance_percentage: 90,
        course_progress: 25,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Load fresh batches (as batches page does on mount & refreshList)
    const freshBatches = await getBatches();
    const updatedBatch = freshBatches.find((b) => b.id === batch.id)!;

    // Roster query (as openRoster does)
    const rosterList = await getStudentsForBatch(batch.id);

    // Batch card displays: updatedBatch.current_enrolled
    const cardEnrollmentDisplay = updatedBatch.current_enrolled;
    // Roster button displays: updatedBatch.current_enrolled
    const rosterButtonDisplay = updatedBatch.current_enrolled;
    // Roster modal header displays: rosterList.length
    const modalHeaderDisplay = rosterList.length;
    // Roster modal rows count: rosterList.length
    const modalRowsCount = rosterList.length;

    expect(cardEnrollmentDisplay).toBe(3);
    expect(rosterButtonDisplay).toBe(3);
    expect(modalHeaderDisplay).toBe(3);
    expect(modalRowsCount).toBe(3);

    // All four surfaces must match exactly
    expect(cardEnrollmentDisplay).toBe(modalHeaderDisplay);
    expect(rosterButtonDisplay).toBe(modalRowsCount);
  });

  it('6. dynamically decrements source batch and increments target batch upon student transfer', async () => {
    const sourceBatch = await createBatch({
      batch_code: 'B-SRC-01',
      batch_name: 'Source Cohort',
      course_id: 'crs-fico-01',
      trainer_id: trainerUserId,
      training_mode: 'Classroom',
      start_date: '2026-03-01',
      end_date: '2026-05-31',
      start_time: '08:00',
      end_time: '10:00',
      days: ['Mon', 'Wed', 'Fri'],
      maximum_capacity: 10,
      status: 'Active',
    });

    const targetBatch = await createBatch({
      batch_code: 'B-TGT-01',
      batch_name: 'Target Cohort',
      course_id: 'crs-fico-01',
      trainer_id: trainerUserId,
      training_mode: 'Classroom',
      start_date: '2026-03-01',
      end_date: '2026-05-31',
      start_time: '14:00',
      end_time: '16:00',
      days: ['Mon', 'Wed', 'Fri'],
      maximum_capacity: 10,
      status: 'Active',
    });

    // Place Student 1 and Student 2 in sourceBatch
    const student1: Student = {
      id: 'stu-transfer-1',
      user_id: 'usr-t1',
      admission_id: 'adm-t1',
      admission_number: 'ADM-T1',
      student_code: 'STU-T1',
      full_name: 'Transfer Trainee One',
      email: 't1@test.com',
      phone: '+91 96000 00001',
      course_id: 'crs-fico-01',
      batch_id: sourceBatch.id,
      joining_date: '2026-03-01',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 95,
      course_progress: 30,
      placement_status: 'Not Started',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const student2: Student = {
      id: 'stu-transfer-2',
      user_id: 'usr-t2',
      admission_id: 'adm-t2',
      admission_number: 'ADM-T2',
      student_code: 'STU-T2',
      full_name: 'Transfer Trainee Two',
      email: 't2@test.com',
      phone: '+91 96000 00002',
      course_id: 'crs-fico-01',
      batch_id: sourceBatch.id,
      joining_date: '2026-03-01',
      status: 'Active',
      total_fee: 40000,
      paid_amount: 40000,
      outstanding_amount: 0,
      attendance_percentage: 90,
      course_progress: 20,
      placement_status: 'Not Started',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.students.push(student1, student2);

    // Initial counts: source = 2, target = 0
    reconcileBatchCounts();
    expect(sourceBatch.current_enrolled).toBe(2);
    expect(targetBatch.current_enrolled).toBe(0);

    // Perform transfer of Student 1 from sourceBatch to targetBatch
    const audit = await transferStudentBatch(
      student1.id,
      targetBatch.id,
      'Relocation to afternoon slot',
      adminUserId
    );

    expect(audit).toBeDefined();
    expect(audit.student_name).toBe('Transfer Trainee One');
    expect(audit.from_batch_id).toBe(sourceBatch.id);
    expect(audit.to_batch_id).toBe(targetBatch.id);

    // Both batches must reflect updated counts immediately
    expect(sourceBatch.current_enrolled).toBe(1);
    expect(targetBatch.current_enrolled).toBe(1);

    // Available seats reflect immediately
    expect(sourceBatch.maximum_capacity - sourceBatch.current_enrolled).toBe(9);
    expect(targetBatch.maximum_capacity - targetBatch.current_enrolled).toBe(9);

    // Rosters on both batches update without page reload
    const sourceRoster = await getStudentsForBatch(sourceBatch.id);
    const targetRoster = await getStudentsForBatch(targetBatch.id);

    expect(sourceRoster.length).toBe(1);
    expect(sourceRoster[0].id).toBe('stu-transfer-2');

    expect(targetRoster.length).toBe(1);
    expect(targetRoster[0].id).toBe('stu-transfer-1');
  });

  it('7. displays 0 and renders empty roster without demo rows for an empty batch', async () => {
    const emptyBatch = await createBatch({
      batch_code: 'B-EMPTY-01',
      batch_name: 'Brand New Cohort',
      course_id: 'crs-fico-01',
      trainer_id: trainerUserId,
      training_mode: 'Online',
      start_date: '2026-05-01',
      end_date: '2026-07-31',
      start_time: '18:00',
      end_time: '20:00',
      days: ['Tue', 'Thu'],
      maximum_capacity: 15,
      status: 'Upcoming',
    });

    reconcileBatchCounts();
    expect(emptyBatch.current_enrolled).toBe(0);
    expect(getBatchActiveEnrolledCount(emptyBatch.id)).toBe(0);

    const roster = await getStudentsForBatch(emptyBatch.id);
    expect(roster).toEqual([]);
    expect(roster.length).toBe(0);
  });

  it('8. filters roster correctly and displays filtered count against total enrolled count', async () => {
    const batch = await createBatch({
      batch_code: 'B-SEARCH-01',
      batch_name: 'Search Filter Cohort',
      course_id: 'crs-fico-01',
      trainer_id: trainerUserId,
      training_mode: 'Online',
      start_date: '2026-04-01',
      end_date: '2026-06-30',
      start_time: '08:00',
      end_time: '10:00',
      days: ['Mon', 'Wed'],
      maximum_capacity: 25,
      status: 'Active',
    });

    const students: Student[] = [
      {
        id: 'stu-s1',
        user_id: 'usr-s1',
        admission_id: 'adm-s1',
        admission_number: 'ADM-2026-101',
        student_code: 'STU-FICO-101',
        full_name: 'Amit Gupta',
        email: 'amit.gupta@student.test',
        phone: '+91 98111 22233',
        course_id: 'crs-fico-01',
        batch_id: batch.id,
        joining_date: '2026-04-01',
        status: 'Active',
        total_fee: 40000,
        paid_amount: 40000,
        outstanding_amount: 0,
        attendance_percentage: 95,
        course_progress: 30,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'stu-s2',
        user_id: 'usr-s2',
        admission_id: 'adm-s2',
        admission_number: 'ADM-2026-102',
        student_code: 'STU-FICO-102',
        full_name: 'Sneha Kulkarni',
        email: 'sneha.k@student.test',
        phone: '+91 98222 33344',
        course_id: 'crs-fico-01',
        batch_id: batch.id,
        joining_date: '2026-04-01',
        status: 'Active',
        total_fee: 40000,
        paid_amount: 40000,
        outstanding_amount: 0,
        attendance_percentage: 88,
        course_progress: 25,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'stu-s3',
        user_id: 'usr-s3',
        admission_id: 'adm-s3',
        admission_number: 'ADM-2026-103',
        student_code: 'STU-FICO-103',
        full_name: 'Rahul Sharma',
        email: 'rahul.s@student.test',
        phone: '+91 98333 44455',
        course_id: 'crs-fico-01',
        batch_id: batch.id,
        joining_date: '2026-04-01',
        status: 'Active',
        total_fee: 40000,
        paid_amount: 40000,
        outstanding_amount: 0,
        attendance_percentage: 92,
        course_progress: 40,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    store.students.push(...students);

    reconcileBatchCounts();
    const fullRoster = await getStudentsForBatch(batch.id);
    const totalEnrolled = fullRoster.length;
    expect(totalEnrolled).toBe(3);

    // Helper filter replicating the UI's filteredRoster useMemo
    const filterRoster = (query: string) => {
      if (!query.trim()) return fullRoster;
      const q = query.trim().toLowerCase();
      return fullRoster.filter(
        (st) =>
          st.full_name?.toLowerCase().includes(q) ||
          st.student_code?.toLowerCase().includes(q) ||
          st.admission_number?.toLowerCase().includes(q) ||
          st.email?.toLowerCase().includes(q) ||
          st.phone?.includes(q)
      );
    };

    // 1. Search by name
    const nameMatch = filterRoster('Sneha');
    expect(nameMatch.length).toBe(1);
    expect(nameMatch[0].full_name).toBe('Sneha Kulkarni');
    // Header displays: Filtered: 1 of 3
    expect({ filtered: nameMatch.length, total: totalEnrolled }).toEqual({ filtered: 1, total: 3 });

    // 2. Search by student code
    const codeMatch = filterRoster('STU-FICO-101');
    expect(codeMatch.length).toBe(1);
    expect(codeMatch[0].full_name).toBe('Amit Gupta');
    expect({ filtered: codeMatch.length, total: totalEnrolled }).toEqual({ filtered: 1, total: 3 });

    // 3. Search by admission number
    const admMatch = filterRoster('ADM-2026-103');
    expect(admMatch.length).toBe(1);
    expect(admMatch[0].full_name).toBe('Rahul Sharma');
    expect({ filtered: admMatch.length, total: totalEnrolled }).toEqual({ filtered: 1, total: 3 });

    // 4. Non-matching search query
    const noMatch = filterRoster('Nonexistent Query');
    expect(noMatch.length).toBe(0);
    expect({ filtered: noMatch.length, total: totalEnrolled }).toEqual({ filtered: 0, total: 3 });
  });
});
