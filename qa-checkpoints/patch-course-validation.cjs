const fs = require('fs');
let code = fs.readFileSync('lib/services/admission-service.ts', 'utf8');
code = code.replace(/\r\n/g, '\n');

const target = `  // Validate Course
  const course = store.courses.find((c) => c.id === input.course_id);
  if (!course) {
    throw new Error(\`Invalid Course: Selected course "\${input.course_id}" does not exist.\`);
  }`;

const repl = `  // Validate Course
  let course = store.courses.find((c) => c.id === input.course_id);
  if (!course && isLiveSupabaseEnabled()) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { data: dbCourse } = await createAdminClient().from('courses').select('*').eq('id', input.course_id).maybeSingle();
      if (dbCourse) {
        store.courses.push(dbCourse as any);
        course = dbCourse as any;
      }
    } catch {}
  }
  if (!course) {
    throw new Error(\`Invalid Course: Selected course "\${input.course_id}" does not exist.\`);
  }`;

if (code.includes(target)) {
  fs.writeFileSync('lib/services/admission-service.ts', code.replace(target, repl), 'utf8');
  console.log('Successfully patched course validation in admission-service.ts');
} else {
  console.error('Target not found in admission-service.ts');
}
