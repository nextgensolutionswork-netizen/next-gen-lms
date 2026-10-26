import { describe, expect, it } from 'vitest';
import { courseBucket, paymentCourseBucket, UNASSIGNED_COURSE, formatDashboardPercentage } from '../lib/utils/dashboard-metrics';

describe('dashboard course reconciliation', () => {
  const courses = new Set(['a', 'b', 'c', 'd']);
  it('preserves the payment course after a student transfers', () => {
    expect(paymentCourseBucket({ course_id: 'a', student_id: 's' }, courses, [], [{ id: 's', course_id: 'b' }])).toBe('a');
  });
  it('uses the fee account before the current student course for general payments', () => {
    expect(paymentCourseBucket({ course_id: 'crs-general', fee_account_id: 'f', student_id: 's' }, courses,
      [{ id: 'f', course_id: 'a' }], [{ id: 's', course_id: 'b' }])).toBe('a');
  });
  it('keeps unknown historical course IDs visible without silently reassigning them', () => {
    expect(paymentCourseBucket({ course_id: 'deleted', student_id: 's' }, courses, [], [{ id: 's', course_id: 'a' }])).toBe(UNASSIGNED_COURSE);
    expect(courseBucket(undefined, courses)).toBe(UNASSIGNED_COURSE);
  });
  it('reconciles a 60000 gap as two visible transactions and two roster records', () => {
    const payments = [
      ...Array.from({ length: 12 }, (_, i) => ({ student_id: `s${i}`, course_id: [...courses][i % 4], amount: i === 0 ? 42000 : 20000 })),
      { student_id: 'x', course_id: 'unknown', amount: 30000 },
      { student_id: 'y', course_id: '', amount: 30000 },
    ];
    const buckets = [...courses, UNASSIGNED_COURSE].map((id) => payments.filter((p) => paymentCourseBucket(p, courses, [], []) === id));
    expect(buckets.flat()).toHaveLength(14);
    expect(buckets.flat().reduce((sum, p) => sum + p.amount, 0)).toBe(322000);
    expect(buckets[4]).toHaveLength(2);
    expect(buckets[4].reduce((sum, p) => sum + p.amount, 0)).toBe(60000);
    const students = [...Array.from({ length: 11 }, () => ({ course_id: 'a' })), { course_id: '' }, { course_id: 'unknown' }];
    expect(students.filter((s) => courseBucket(s.course_id, courses) === UNASSIGNED_COURSE)).toHaveLength(2);
  });
});

it('shows percentage precision and distinguishes no data from zero success', () => {
  expect(formatDashboardPercentage(1, 3)).toBe('33.3%');
  expect(formatDashboardPercentage(0, 3)).toBe('0.0%');
  expect(formatDashboardPercentage(0, 0)).toBe('N/A');
});
