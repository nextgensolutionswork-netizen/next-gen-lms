import { describe, it, expect } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createAssignment,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  gradeAssignmentSubmission,
} from '@/lib/services/academics-service';
import { generateZipBlob, ZipFileInput } from '@/lib/utils/zip-export';

describe('Homework & Assignments Desk - Comprehensive Test Suite', () => {
  it('creates assignment with custom maximum marks (e.g. 50 marks)', async () => {
    const asg = await createAssignment({
      title: 'SAP FICO Automatic Payment Program Test',
      description: 'Configure FBZP paying company code and bank determinators',
      course_id: store.courses[0]?.id || 'crs-fico-01',
      batch_id: store.batches[0]?.id || 'batch-01',
      due_date: '2026-10-31T23:59',
      maximum_marks: 50,
      created_by: 'usr-trainer',
    });

    expect(asg).toBeDefined();
    expect(asg.id).toBeDefined();
    expect(asg.maximum_marks).toBe(50);
    expect(store.assignments.some((a) => a.id === asg.id)).toBe(true);
  });

  it('updates an assignment details including title and maximum marks', async () => {
    const asg = await createAssignment({
      title: 'Original Title',
      description: 'Original description',
      course_id: store.courses[0]?.id || 'crs-fico-01',
      batch_id: store.batches[0]?.id || 'batch-01',
      due_date: '2026-10-31T23:59',
      maximum_marks: 25,
      created_by: 'usr-trainer',
    });

    const updated = await updateAssignment(asg.id, {
      title: 'Updated Title',
      maximum_marks: 30,
    });

    expect(updated.title).toBe('Updated Title');
    expect(updated.maximum_marks).toBe(30);

    const fromStore = store.assignments.find((a) => a.id === asg.id);
    expect(fromStore?.title).toBe('Updated Title');
    expect(fromStore?.maximum_marks).toBe(30);
  });

  it('submits student homework and tracks submission in store', async () => {
    const student = store.students[0];
    const targetBatchId = student.batch_id || store.batches[0]?.id || 'batch-fico-01';
    const asg = await createAssignment({
      title: 'OB52 Posting Periods Exercise',
      description: 'Configure and test OB52 intervals',
      course_id: store.courses[0]?.id || 'crs-fico-01',
      batch_id: targetBatchId,
      due_date: '2026-10-31T23:59',
      maximum_marks: 20,
      created_by: 'usr-trainer',
    });

    const sub = await submitAssignment(
      asg.id,
      student.id,
      'Configured period 1-12 with + and account types A, D, K, M, S.',
      'https://example.com/homework/ob52.zip'
    );

    expect(sub).toBeDefined();
    expect(sub.assignment_id).toBe(asg.id);
    expect(sub.student_id).toBe(student.id);
    expect(sub.status).toBe('Submitted');
    expect(sub.attachment_url).toBe('https://example.com/homework/ob52.zip');
  });

  it('rejects grade score when it exceeds assignment maximum marks or is negative', async () => {
    const student = store.students[0];
    const targetBatchId = student.batch_id || store.batches[0]?.id || 'batch-fico-01';
    const asg = await createAssignment({
      title: 'Small Quiz Assignment',
      description: 'Quick check',
      course_id: store.courses[0]?.id || 'crs-fico-01',
      batch_id: targetBatchId,
      due_date: '2026-10-31T23:59',
      maximum_marks: 25,
      created_by: 'usr-trainer',
    });

    const sub = await submitAssignment(
      asg.id,
      student.id,
      'Quiz solution text'
    );

    // Over maximum marks (50 > 25)
    await expect(
      gradeAssignmentSubmission(sub.id, 50, 'Too high', 'usr-trainer')
    ).rejects.toThrow(/must be between 0 and maximum marks \(25\)/);

    // Negative marks (-5 < 0)
    await expect(
      gradeAssignmentSubmission(sub.id, -5, 'Negative', 'usr-trainer')
    ).rejects.toThrow(/must be between 0 and maximum marks \(25\)/);
  });

  it('accepts valid score within [0, maximum_marks] and marks submission as Graded', async () => {
    const student = store.students[0];
    const targetBatchId = student.batch_id || store.batches[0]?.id || 'batch-fico-01';
    const asg = await createAssignment({
      title: 'Final Blueprint Submission',
      description: 'Full ERP blueprint',
      course_id: store.courses[0]?.id || 'crs-fico-01',
      batch_id: targetBatchId,
      due_date: '2026-10-31T23:59',
      maximum_marks: 40,
      created_by: 'usr-trainer',
    });

    const sub = await submitAssignment(
      asg.id,
      student.id,
      'Full ERP blueprint configuration document'
    );

    const graded = await gradeAssignmentSubmission(
      sub.id,
      36,
      'Outstanding configuration and test execution screenshots.',
      'usr-trainer'
    );

    expect(graded.status).toBe('Graded');
    expect(graded.marks_obtained).toBe(36);
    expect(graded.feedback).toContain('Outstanding');
    expect(graded.graded_at).toBeDefined();
  });

  it('deletes assignment and cascades deletion of its submissions', async () => {
    const student = store.students[0];
    const targetBatchId = student.batch_id || store.batches[0]?.id || 'batch-fico-01';
    const asg = await createAssignment({
      title: 'Temporary Exercise',
      description: 'Will be deleted',
      course_id: store.courses[0]?.id || 'crs-fico-01',
      batch_id: targetBatchId,
      due_date: '2026-10-31T23:59',
      maximum_marks: 10,
      created_by: 'usr-trainer',
    });

    const sub = await submitAssignment(asg.id, student.id, 'Temporary solution');
    expect(store.submissions.some((s) => s.id === sub.id)).toBe(true);

    const deleted = await deleteAssignment(asg.id);
    expect(deleted).toBe(true);
    expect(store.assignments.some((a) => a.id === asg.id)).toBe(false);
    expect(store.submissions.some((s) => s.assignment_id === asg.id)).toBe(false);
  });

  it('generates a valid binary ZIP blob containing submission files and summary', () => {
    const testFiles: ZipFileInput[] = [
      { name: 'README.txt', data: 'Assignment submissions export' },
      { name: 'student_1/solution.txt', data: 'Step 1: OBY6\nStep 2: FBZP' },
      { name: 'student_2/solution.txt', data: 'Configuration completed successfully.' },
    ];

    const blob = generateZipBlob(testFiles);
    expect(blob).toBeDefined();
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(100);
  });

  it('rejects createAssignment when title, course_id, or batch_id are missing or invalid', async () => {
    // Missing title
    await expect(
      createAssignment({
        title: '   ',
        description: 'No title test',
        course_id: store.courses[0]?.id || 'crs-fico-01',
        batch_id: store.batches[0]?.id || 'batch-01',
        due_date: '2026-10-31T23:59',
        maximum_marks: 100,
        created_by: 'usr-trainer',
      })
    ).rejects.toThrow(/title is required/i);

    // Missing course_id
    await expect(
      createAssignment({
        title: 'Valid Title',
        description: 'Missing course test',
        course_id: '',
        batch_id: store.batches[0]?.id || 'batch-01',
        due_date: '2026-10-31T23:59',
        maximum_marks: 100,
        created_by: 'usr-trainer',
      })
    ).rejects.toThrow(/course is required/i);

    // Non-existent course_id
    await expect(
      createAssignment({
        title: 'Valid Title',
        description: 'Non-existent course test',
        course_id: 'crs-nonexistent-999',
        batch_id: store.batches[0]?.id || 'batch-01',
        due_date: '2026-10-31T23:59',
        maximum_marks: 100,
        created_by: 'usr-trainer',
      })
    ).rejects.toThrow(/course not found/i);

    // Missing batch_id
    await expect(
      createAssignment({
        title: 'Valid Title',
        description: 'Missing batch test',
        course_id: store.courses[0]?.id || 'crs-fico-01',
        batch_id: '',
        due_date: '2026-10-31T23:59',
        maximum_marks: 100,
        created_by: 'usr-trainer',
      })
    ).rejects.toThrow(/batch is required/i);

    // Non-existent batch_id
    await expect(
      createAssignment({
        title: 'Valid Title',
        description: 'Non-existent batch test',
        course_id: store.courses[0]?.id || 'crs-fico-01',
        batch_id: 'batch-nonexistent-999',
        due_date: '2026-10-31T23:59',
        maximum_marks: 100,
        created_by: 'usr-trainer',
      })
    ).rejects.toThrow(/batch not found/i);
  });
});
