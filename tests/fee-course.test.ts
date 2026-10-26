import { expect, it } from 'vitest';
import { feeCourseName } from '@/lib/utils/fee-course';
import type { StudentFee } from '@/types';

const courses = [{ id: 'fico', course_name: 'FICO' }, { id: 'mm', course_name: 'MM' }];
const fee = (changes: Partial<StudentFee>) => ({ student_id: 'amit', ...changes } as StudentFee);

it('resolves Amit and Sneha by course ID even without saved course names', () => {
  expect(feeCourseName(fee({ course_id: 'fico' }), courses, [], [])).toBe('FICO');
  expect(feeCourseName(fee({ student_id: 'sneha', reference_type: 'Course', reference_id: 'mm' }), courses, [], [])).toBe('MM');
});

it('uses the exact linked fee account or admission', () => {
  const linked = { id: 'account', student_id: 'amit', course_id: 'fico' };
  expect(feeCourseName(fee({ fee_account_id: 'account' }), courses, [linked], [])).toBe('FICO');
  expect(feeCourseName(fee({ enrollment_id: 'account' }), courses, [], [linked])).toBe('FICO');
});

it('does not borrow a mapping from another student or tenant', () => {
  for (const linked of [
    { id: 'account', student_id: 'sneha', course_id: 'mm' },
    { id: 'account', student_id: 'amit', tenant_id: 'other', course_id: 'mm' },
  ]) expect(feeCourseName(fee({ fee_account_id: 'account' }), courses, [linked], [])).toBe('Course mapping unavailable');
});

it('preserves explicit historical mapping and does not invent General ERP', () => {
  expect(feeCourseName(fee({ course_id: 'fico', fee_account_id: 'account' }), courses,
    [{ id: 'account', student_id: 'amit', course_id: 'mm' }], [])).toBe('FICO');
  expect(feeCourseName(fee({}), courses, [], [])).toBe('Course mapping unavailable');
  expect(feeCourseName(fee({ course_id: 'archived', course_name: 'Archived course' }), courses, [], [])).toBe('Archived course');
});
