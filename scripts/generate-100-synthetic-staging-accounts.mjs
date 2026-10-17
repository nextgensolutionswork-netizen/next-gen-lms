/**
 * Next-Gen ERP LMS — Staging 100 Synthetic Accounts Generator & Verification Suite
 * Generates 100 isolated synthetic accounts across the required 7 operational roles:
 * - 70 Students
 * - 10 Trainers
 * - 8 Counsellors
 * - 4 Accounts / Finance
 * - 4 Onboarding Team
 * - 3 Operations Admin
 * - 1 Super Admin
 * Total: 100 Synthetic Users
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_COOKIE_SECRET = 'next-gen-lms-secure-auth-secret-2026';
const STAGING_TENANT = 'staging-isolated-tenant';

function createAuthSessionCookies(user) {
  const cookieVal = encodeURIComponent(JSON.stringify(user));
  const sig = crypto.createHmac('sha256', AUTH_COOKIE_SECRET).update(cookieVal).digest('hex');
  return {
    cookieHeader: `next_gen_auth_user=${cookieVal}; next_gen_auth_user_sig=${sig}`,
    cookieValue: cookieVal,
    signature: sig,
  };
}

export function generate100StagingAccounts() {
  const accounts = [];

  // 1. Super Admin (1 user)
  accounts.push({
    id: 'stage-usr-superadmin-01',
    email: 'staging.superadmin@next-gen-staging.local',
    full_name: 'Rajesh Sharma (Staging Director)',
    role: 'super_admin',
    is_active: true,
    tenant_id: STAGING_TENANT,
    phone: '+91 99000 00001',
    avatar_url: 'https://ui-avatars.com/api/?name=Staging+SuperAdmin&background=0A6ED1&color=fff',
    created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
  });

  // 2. Operations Admin (3 users)
  for (let i = 1; i <= 3; i++) {
    accounts.push({
      id: `stage-usr-admin-${String(i).padStart(2, '0')}`,
      email: `staging.admin.${i}@next-gen-staging.local`,
      full_name: `Staging Operations Admin ${i}`,
      role: 'admin',
      is_active: true,
      tenant_id: STAGING_TENANT,
      phone: `+91 99000 0001${i}`,
      avatar_url: `https://ui-avatars.com/api/?name=Admin+${i}&background=4F46E5&color=fff`,
      created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    });
  }

  // 3. Accounts / Finance Team (4 users)
  for (let i = 1; i <= 4; i++) {
    accounts.push({
      id: `stage-usr-accounts-${String(i).padStart(2, '0')}`,
      email: `staging.accounts.${i}@next-gen-staging.local`,
      full_name: `Staging Finance Officer ${i}`,
      role: 'accountant',
      is_active: true,
      tenant_id: STAGING_TENANT,
      phone: `+91 99000 0002${i}`,
      avatar_url: `https://ui-avatars.com/api/?name=Accountant+${i}&background=059669&color=fff`,
      created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    });
  }

  // 4. Onboarding Team (4 users)
  for (let i = 1; i <= 4; i++) {
    accounts.push({
      id: `stage-usr-onboarding-${String(i).padStart(2, '0')}`,
      email: `staging.onboarding.${i}@next-gen-staging.local`,
      full_name: `Staging Onboarding Specialist ${i}`,
      role: 'onboarding_team',
      is_active: true,
      tenant_id: STAGING_TENANT,
      phone: `+91 99000 0003${i}`,
      avatar_url: `https://ui-avatars.com/api/?name=Onboarding+${i}&background=10B981&color=fff`,
      created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    });
  }

  // 5. Counsellors (8 users)
  for (let i = 1; i <= 8; i++) {
    accounts.push({
      id: `stage-usr-counsellor-${String(i).padStart(2, '0')}`,
      email: `staging.counsellor.${i}@next-gen-staging.local`,
      full_name: `Staging Academic Counsellor ${i}`,
      role: 'counsellor',
      is_active: true,
      tenant_id: STAGING_TENANT,
      phone: `+91 99000 0004${i}`,
      avatar_url: `https://ui-avatars.com/api/?name=Counsellor+${i}&background=D97706&color=fff`,
      created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    });
  }

  // 6. Trainers (10 users)
  const trainerModules = ['SAP FICO', 'SAP MM', 'SAP SD', 'SAP ABAP', 'SAP PP', 'SAP QM', 'SAP BASIS', 'SAP HANA', 'SAP S/4HANA', 'SAP SuccessFactors'];
  for (let i = 1; i <= 10; i++) {
    accounts.push({
      id: `stage-usr-trainer-${String(i).padStart(2, '0')}`,
      email: `staging.trainer.${i}@next-gen-staging.local`,
      full_name: `Staging Lead Faculty ${i} (${trainerModules[i - 1]})`,
      role: 'trainer',
      is_active: true,
      tenant_id: STAGING_TENANT,
      phone: `+91 99000 0005${String(i).padStart(2, '0')}`,
      assigned_course_ids: [`crs-stage-${String(i).padStart(2, '0')}`],
      avatar_url: `https://ui-avatars.com/api/?name=Trainer+${i}&background=7C3AED&color=fff`,
      created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    });
  }

  // 7. Enrolled Students (70 users)
  for (let i = 1; i <= 70; i++) {
    const courseIndex = ((i - 1) % 4) + 1;
    const courseCodes = ['FICO', 'MM', 'SD', 'ABAP'];
    const courseId = `crs-${courseCodes[courseIndex - 1].toLowerCase()}-01`;
    const batchId = `batch-${courseCodes[courseIndex - 1].toLowerCase()}-01`;

    accounts.push({
      id: `stage-usr-student-${String(i).padStart(3, '0')}`,
      student_id: `stage-stu-${String(i).padStart(3, '0')}`,
      student_code: `STU-STAGE-${String(i).padStart(3, '0')}`,
      email: `staging.student.${i}@next-gen-staging.local`,
      full_name: `Staging Enrolled Candidate ${String(i).padStart(3, '0')}`,
      role: 'student',
      is_active: true,
      tenant_id: STAGING_TENANT,
      phone: `+91 99111 ${String(10000 + i).slice(-5)}`,
      course_id: courseId,
      course_name: `SAP S/4HANA ${courseCodes[courseIndex - 1]} Enterprise Suite`,
      batch_id: batchId,
      batch_name: `SAP ${courseCodes[courseIndex - 1]} Staging Fast-Track Batch`,
      admission_id: `stage-adm-${String(i).padStart(3, '0')}`,
      total_fee: 45000,
      paid_amount: 25000,
      outstanding_amount: 20000,
      attendance_percentage: 85 + (i % 15),
      course_progress: 40 + (i % 55),
      avatar_url: `https://ui-avatars.com/api/?name=Student+${i}&background=0D9488&color=fff`,
      created_at: new Date('2026-10-05T00:00:00Z').toISOString(),
    });
  }

  // Attach cryptographic signatures to all accounts
  return accounts.map((u) => {
    const { cookieHeader, cookieValue, signature } = createAuthSessionCookies(u);
    return {
      ...u,
      cookieHeader,
      cookieValue,
      signature,
    };
  });
}

export function exportStagingAccountsFile() {
  const users = generate100StagingAccounts();
  const summaryByRole = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  console.log('='.repeat(80));
  console.log(' NEXT GEN LMS — 100 SYNTHETIC STAGING ACCOUNTS VERIFICATION');
  console.log('='.repeat(80));
  console.log(' Role Breakdown:');
  for (const [role, count] of Object.entries(summaryByRole)) {
    console.log(`  - ${role.padEnd(25)}: ${count} users`);
  }
  console.log(`  -----------------------------------------`);
  console.log(`  Total Synthetic Users     : ${users.length}`);
  console.log(`  Isolation Tenant ID       : ${STAGING_TENANT}`);
  console.log('='.repeat(80));

  const outputPath = path.resolve(__dirname, '..', 'docs', 'staging', '100-synthetic-staging-accounts.json');
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    tenant_id: STAGING_TENANT,
    total_users: users.length,
    role_breakdown: summaryByRole,
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      is_active: u.is_active,
      tenant_id: u.tenant_id,
      phone: u.phone,
      student_code: u.student_code || null,
      batch_id: u.batch_id || null,
      course_id: u.course_id || null,
      cookieHeader: u.cookieHeader,
    })),
  }, null, 2), 'utf8');

  console.log(`Successfully exported staging accounts manifest to: ${outputPath}`);
  return users;
}

if (process.argv[1]?.endsWith('generate-100-synthetic-staging-accounts.mjs')) {
  exportStagingAccountsFile();
}
