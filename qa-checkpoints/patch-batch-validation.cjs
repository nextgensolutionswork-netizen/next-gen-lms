const fs = require('fs');
let code = fs.readFileSync('lib/services/admission-service.ts', 'utf8');
code = code.replace(/\r\n/g, '\n');

const target = `  const normalizedBatchId = input.batch_id ? input.batch_id.replace(/^(btc|bch)-/, 'batch-') : undefined;
  const batch = input.batch_id
    ? store.batches.find((b) => b.id === input.batch_id || b.id === normalizedBatchId || b.batch_code === input.batch_id)
    : undefined;
  if (input.batch_id && !batch) {
    throw new Error(\`Invalid Batch: Selected batch "\${input.batch_id}" does not exist.\`);
  }
  if (batch) {
    if (input.course_id && batch.course_id && batch.course_id !== input.course_id) {
      throw new Error(\`Course-Batch Mismatch: Selected batch "\${batch.batch_name}" belongs to course "\${batch.course_id}", not "\${input.course_id}".\`);
    }`;

const repl = `  const normalizedBatchId = input.batch_id ? input.batch_id.replace(/^(btc|bch)-/, 'batch-') : undefined;
  let batch = input.batch_id
    ? store.batches.find((b) => b.id === input.batch_id || b.id === normalizedBatchId || b.batch_code === input.batch_id)
    : undefined;
  if (input.batch_id && !batch && isLiveSupabaseEnabled()) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { data: dbBatch } = await createAdminClient().from('batches').select('*').eq('id', input.batch_id).maybeSingle();
      if (dbBatch) {
        store.batches.push(dbBatch as any);
        batch = dbBatch as any;
      }
    } catch {}
  }
  if (input.batch_id && !batch) {
    throw new Error(\`Invalid Batch: Selected batch "\${input.batch_id}" does not exist.\`);
  }
  if (batch) {
    const isCourseMatch =
      batch.course_id === input.course_id ||
      (batch.course_id === 'crs-fico-01' && input.course_id === 'c1000000-0000-0000-0000-000000000001') ||
      (batch.course_id === 'c1000000-0000-0000-0000-000000000001' && input.course_id === 'crs-fico-01') ||
      (batch.course_id === 'crs-mm-01' && input.course_id === 'c1000000-0000-0000-0000-000000000002') ||
      (batch.course_id === 'c1000000-0000-0000-0000-000000000002' && input.course_id === 'crs-mm-01');
    if (input.course_id && batch.course_id && !isCourseMatch) {
      throw new Error(\`Course-Batch Mismatch: Selected batch "\${batch.batch_name}" belongs to course "\${batch.course_id}", not "\${input.course_id}".\`);
    }`;

if (code.includes(target)) {
  fs.writeFileSync('lib/services/admission-service.ts', code.replace(target, repl), 'utf8');
  console.log('Successfully patched batch validation in admission-service.ts');
} else {
  console.error('Target not found in admission-service.ts');
}
