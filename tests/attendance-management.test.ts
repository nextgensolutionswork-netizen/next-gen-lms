import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  markAttendance,
  getOrCreateClassSessionForDate,
  createBatch,
  deleteBatch,
} from '@/lib/services/academics-service';
import { AttendanceStatus } from '@/types';

describe('Attendance Registers & Multi-Date Isolation Tests', () => {
  const testBatchId = 'batch-att-test-01';
  const student1Id = 'stu-att-01';
  const student2Id = 'stu-att-02';

  beforeEach(() => {
    // Clean state
    store.attendanceRecords = store.attendanceRecords.filter(
      (a) => a.batch_id !== testBatchId
    );
    store.classSessions = store.classSessions.filter(
      (cs) => cs.batch_id !== testBatchId
    );
  });

  it('correctly creates dynamic class sessions for specific dates', async () => {
    const sessionDate = '2026-04-10';
    const session = await getOrCreateClassSessionForDate(
      testBatchId,
      sessionDate,
      'usr-trainer-fico'
    );

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.session_date).toBe(sessionDate);
    expect(session.batch_id).toBe(testBatchId);

    // Calling again for the same date returns the existing session
    const sameSession = await getOrCreateClassSessionForDate(
      testBatchId,
      sessionDate,
      'usr-trainer-fico'
    );
    expect(sameSession.id).toBe(session.id);
  });

  it('strictly isolates attendance records by date and student without historical cross-date contamination', async () => {
    const date1 = '2026-04-10';
    const date2 = '2026-04-11';

    const sessionDay1 = await getOrCreateClassSessionForDate(
      testBatchId,
      date1,
      'usr-trainer-fico'
    );
    const sessionDay2 = await getOrCreateClassSessionForDate(
      testBatchId,
      date2,
      'usr-trainer-fico'
    );

    // Day 1: Student 1 Present, Student 2 Absent
    await markAttendance(
      sessionDay1.id,
      [
        { student_id: student1Id, status: 'Present' },
        { student_id: student2Id, status: 'Absent' },
      ],
      'usr-trainer-fico',
      date1
    );

    // Day 2: Student 1 Absent, Student 2 Present
    await markAttendance(
      sessionDay2.id,
      [
        { student_id: student1Id, status: 'Absent' },
        { student_id: student2Id, status: 'Present' },
      ],
      'usr-trainer-fico',
      date2
    );

    // Verify Day 1 records in store
    const day1Student1 = store.attendanceRecords.find(
      (a) =>
        a.student_id === student1Id &&
        a.attendance_date === date1 &&
        a.batch_id === testBatchId
    );
    const day1Student2 = store.attendanceRecords.find(
      (a) =>
        a.student_id === student2Id &&
        a.attendance_date === date1 &&
        a.batch_id === testBatchId
    );

    expect(day1Student1?.status).toBe('Present');
    expect(day1Student2?.status).toBe('Absent');

    // Verify Day 2 records in store
    const day2Student1 = store.attendanceRecords.find(
      (a) =>
        a.student_id === student1Id &&
        a.attendance_date === date2 &&
        a.batch_id === testBatchId
    );
    const day2Student2 = store.attendanceRecords.find(
      (a) =>
        a.student_id === student2Id &&
        a.attendance_date === date2 &&
        a.batch_id === testBatchId
    );

    expect(day2Student1?.status).toBe('Absent');
    expect(day2Student2?.status).toBe('Present');

    // Total records for this batch should be exactly 4 (2 students x 2 dates)
    const allBatchRecords = store.attendanceRecords.filter(
      (a) => a.batch_id === testBatchId
    );
    expect(allBatchRecords.length).toBe(4);
  });

  it('updates existing record when re-marking attendance for the exact same date and student', async () => {
    const sessionDate = '2026-04-12';
    const session = await getOrCreateClassSessionForDate(
      testBatchId,
      sessionDate,
      'usr-trainer-fico'
    );

    // Initially mark Absent
    await markAttendance(
      session.id,
      [{ student_id: student1Id, status: 'Absent' }],
      'usr-trainer-fico',
      sessionDate
    );

    let rec = store.attendanceRecords.find(
      (a) =>
        a.student_id === student1Id &&
        a.attendance_date === sessionDate &&
        a.batch_id === testBatchId
    );
    expect(rec?.status).toBe('Absent');

    // Correct to Late with notes
    await markAttendance(
      session.id,
      [{ student_id: student1Id, status: 'Late', notes: 'Joined 15 mins late due to connectivity' }],
      'usr-trainer-fico',
      sessionDate
    );

    rec = store.attendanceRecords.find(
      (a) =>
        a.student_id === student1Id &&
        a.attendance_date === sessionDate &&
        a.batch_id === testBatchId
    );
    expect(rec?.status).toBe('Late');
    expect(rec?.notes).toContain('connectivity');

    // Should not create a duplicate row for the same date and student
    const count = store.attendanceRecords.filter(
      (a) =>
        a.student_id === student1Id &&
        a.attendance_date === sessionDate &&
        a.batch_id === testBatchId
    ).length;
    expect(count).toBe(1);
  });
});
