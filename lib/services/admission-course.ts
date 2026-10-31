import type { Course } from '@/types';
import { store } from './data-store';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { visibleCourses } from '@/lib/utils/course-resolver';

export async function validateAdmissionCourse(id: string, tenant: string): Promise<Course> {
  if (!isLiveSupabaseEnabled()) {
    const course = store.courses.find((row) => row.id === id && (!(row as Course & { tenant_id?: string }).tenant_id || (row as Course & { tenant_id?: string }).tenant_id === tenant));
    if (!course) throw new Error(`Invalid Course: Selected course "${id}" does not exist.`);
    if (course.status === 'Archived') throw new Error('Invalid Course: Archived courses cannot accept new admissions.');
    return course;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Invalid Course: Select a canonical course from the current catalog.');
  }
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { data, error } = await createAdminClient().from('courses').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Unable to validate course catalog: ${error.message}`);
  if (!data || !visibleCourses([data], tenant).length) throw new Error('Invalid Course: Selected course does not exist or is unavailable.');
  if (data.status === 'Archived') throw new Error('Invalid Course: Archived courses cannot accept new admissions.');
  return data as Course;
}
