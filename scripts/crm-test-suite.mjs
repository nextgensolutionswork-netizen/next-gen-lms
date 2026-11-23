import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('tests').filter(name => /\.test\.tsx?$/.test(name)
  && /^(crm-|lead-|admission|counsellor-|.*payment|rls-|auth-|trainer-role|placement-role|support-faculty-role|student-role|bulk-import|database-persistence|dashboard-)/.test(name));
mkdirSync('evidence/crm-ownership', { recursive: true });
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2', '--minWorkers=1',
  '--reporter=default', '--reporter=json', '--outputFile=evidence/crm-ownership/tests.json', ...files.map(f => `tests/${f}`)], {
  env: process.env, windowsHide: true, stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
