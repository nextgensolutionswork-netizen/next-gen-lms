const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..');
const sm = JSON.parse(fs.readFileSync(path.join(srcDir, 'docs/audits/current-test-2026-10-29/source-manifest.json'), 'utf8').replace(/^\uFEFF/,''));
const targetDir = sm.scratch;

console.log('Target scratch directory:', targetDir);

const filesToSync = [
  'app/(dashboard)/crm/leads/page.tsx',
  'lib/services/crm-service.ts',
  'lib/services/admission-service.ts',
  'lib/services/payment-workflow-transaction.ts',
  'lib/services/payment-workflow-state.ts',
  'app/api/admissions/route.ts',
];

for (const file of filesToSync) {
  const src = path.join(srcDir, file);
  const dst = path.join(targetDir, file);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    console.log(`Copied ${file} -> ${dst}`);
  }
}
