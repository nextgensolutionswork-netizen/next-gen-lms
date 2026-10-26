import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const output = path.join(root, 'docs/audits/browser-fix-2026-10-26');
const storage = path.join(root, 'staging-runtime/browser-fix-synthetic');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(storage, { recursive: true });
const env = { ...process.env };
// Do not inherit production integrations from .env.local in this isolated UI fixture.
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const key = line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1];
  if (key) env[key] = '';
}
Object.assign(env, {
  NODE_ENV: 'development', NEXT_DIST_DIR: '.next-audit', NEXT_PUBLIC_APP_ENV: 'staging',
  NEXT_PUBLIC_SUPABASE_URL: 'https://mock-sap-lms.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mockAnonKey', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mockAnonKey',
  SUPABASE_SERVICE_ROLE_KEY: 'mockServiceRoleKey', LMS_TEST_STORAGE_DIR: storage,
});
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', '3001'], {
  cwd: root, env, detached: true, windowsHide: true,
  stdio: ['ignore', fs.openSync(path.join(output, 'server.log'), 'a'), fs.openSync(path.join(output, 'server-error.log'), 'a')],
});
child.unref();
fs.writeFileSync(path.join(output, 'local-isolation.json'), JSON.stringify({ pid: child.pid, base: 'http://localhost:3001', mode: 'isolated local synthetic adapter; NOT verified Supabase staging', storage, distDir: '.next-audit', remoteDatabaseEnabled: false }, null, 2));
console.log(`Isolated synthetic UI server started on port 3001 (PID ${child.pid}).`);
