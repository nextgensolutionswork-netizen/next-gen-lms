import { mkdtempSync, copyFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { isProductionDatabase } from '../lib/security/database-preflight';

// Strict preflight check: Fail closed if test runner is pointing to production database
if (process.env.NEXT_PUBLIC_SUPABASE_URL && isProductionDatabase(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
  throw new Error(
    'CRITICAL PREFLIGHT GUARD: Test runner refused! NEXT_PUBLIC_SUPABASE_URL is pointing to production database (tgohtdzwehhjfahtgovq). Direct test execution against production is strictly prohibited.'
  );
}

// Persistence tests and debounced service writes must never touch the running LMS.
const testDirectory = mkdtempSync(path.join(tmpdir(), 'lms-test-storage-'));
process.env.LMS_TEST_STORAGE_DIR = testDirectory;
const source = path.join(process.cwd(), 'data', 'institute_store.json');
if (existsSync(source)) copyFileSync(source, path.join(testDirectory, 'institute_store.json'));

afterAll(async () => {
  // Allow the adapter's 200ms debounced saves to finish before removing its fixture.
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!existsSync(testDirectory)) return;
  const resolved = realpathSync(testDirectory);
  const temporaryRoot = realpathSync(tmpdir());
  if (path.dirname(resolved).toLowerCase() === temporaryRoot.toLowerCase() && path.basename(resolved).startsWith('lms-test-storage-')) rmSync(resolved, { recursive: true });
});
