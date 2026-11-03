// Audit harness: copies current working source without production data or env files.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = process.cwd();
const out = path.join(root, 'docs/audits/crm-e2e-2026-11-03');
const runtime = path.join(root, '.audit-build-check/crm-e2e-20261103');
fs.mkdirSync(runtime, { recursive: true });
for (const dir of ['app', 'components', 'lib', 'types', 'utils', 'public', 'tests']) if (fs.existsSync(path.join(root, dir))) fs.cpSync(path.join(root, dir), path.join(runtime, dir), { recursive: true });
for (const file of ['package.json', 'package-lock.json', 'next.config.mjs', 'next-env.d.ts', 'tsconfig.json', 'tailwind.config.ts', 'postcss.config.mjs', 'middleware.ts', '.eslintrc.json', 'vitest.config.ts']) fs.copyFileSync(path.join(root, file), path.join(runtime, file));
if (!fs.existsSync(path.join(runtime, 'node_modules'))) fs.symlinkSync(path.join(root, 'node_modules'), path.join(runtime, 'node_modules'), 'junction');
const env = { ...process.env };
for (const file of fs.readdirSync(root).filter(n => n.startsWith('.env') && fs.statSync(path.join(root,n)).isFile())) {
  for (const line of fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/)) { const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]; if (key) env[key] = ''; }
}
for (const key of Object.keys(env)) if (/SUPABASE|RESEND|SMTP|DATABASE_URL|SENDGRID|RAZORPAY|STRIPE/.test(key)) env[key] = '';
Object.assign(env, { NODE_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'staging', NEXT_PUBLIC_SUPABASE_URL: 'https://mock-sap-lms.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mockAnonKey', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mockAnonKey', SUPABASE_SERVICE_ROLE_KEY: 'mockServiceRoleKey', LMS_TEST_STORAGE_DIR: path.join(runtime, 'synthetic-data'), AUTH_COOKIE_SECRET: 'isolated-crm-audit-only-not-a-production-secret', NEXT_TELEMETRY_DISABLED: '1' });
fs.mkdirSync(env.LMS_TEST_STORAGE_DIR, { recursive: true });
fs.writeFileSync(path.join(out, 'isolation.json'), JSON.stringify({ runtime, storage: env.LMS_TEST_STORAGE_DIR, base: 'http://localhost:3017', remoteDatabaseEnabled: false, source: 'current working tree; no env files or production data copied' }, null, 2));
function run(name, args) {
  const log = fs.openSync(path.join(out, name+'.log'), 'w');
  const started = Date.now();
  const result = cp.spawnSync(process.execPath, args, { cwd: runtime, env, stdio: ['ignore',log,log] });
  fs.writeFileSync(path.join(out, name+'-exit.json'), JSON.stringify({ exitCode: result.status, elapsedSeconds: (Date.now()-started)/1000 }));
  return result.status;
}
run('typecheck', ['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']);
run('lint', ['node_modules/next/dist/bin/next','lint']);
const build = run('build', ['node_modules/next/dist/bin/next','build']);
const log = fs.openSync(path.join(out,'server.log'), 'a');
const child = cp.spawn(process.execPath, ['node_modules/next/dist/bin/next',build === 0 ? 'start' : 'dev','-p','3017','-H','127.0.0.1'], { cwd: runtime, env: { ...env, NODE_ENV: build === 0 ? 'production' : 'development' }, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
child.unref(); fs.writeFileSync(path.join(out,'server-pid.json'), JSON.stringify({ pid: child.pid, buildPassed: build === 0 }));
