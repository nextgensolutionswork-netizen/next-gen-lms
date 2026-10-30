const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..');
const qaDir = 'E:\\my erp hub\\next gen lms-qa-isolated-20261027';

if (fs.existsSync(qaDir)) {
  const filesToSync = [
    'app/(dashboard)/crm/leads/page.tsx',
    'lib/services/crm-service.ts',
    'lib/services/admission-service.ts',
    'lib/services/payment-workflow-transaction.ts',
    'lib/services/payment-workflow-state.ts',
    'app/api/admissions/route.ts',
    'lib/supabase/db.ts',
    'lib/supabase/rls.ts',
    'lib/services/data-store.ts',
    'data/institute_store.json',
    'tsconfig.json',
  ];

  for (const file of filesToSync) {
    const src = path.join(srcDir, file);
    const dst = path.join(qaDir, file);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      console.log(`Synced to QA: ${file}`);
    }
  }
} else {
  console.log('QA isolated workspace not found');
}
