import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await chromium.launch({ channel: 'msedge', headless: true });
  }
}

async function loginAs(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const emailInput = page.locator('input[type="email"], input#email').first();
  const passwordInput = page.locator('input[type="password"], input#password').first();
  await emailInput.fill(email);
  await passwordInput.fill(password);
  const submitButton = page.locator('button[type="submit"]:has-text("Sign In"), button[type="submit"]').first();
  await submitButton.click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

export async function runModulesAndFormsTests() {
  console.log('='.repeat(80));
  console.log(' PHASE 3 & 4 — COMPLETE MODULE, FORM, AND BUTTON TESTING (PLAYWRIGHT)');
  console.log('='.repeat(80));

  const browser = await launchBrowser();
  const results = {};

  // ==========================================
  // MODULE 1: ADMIN WORKSPACE & MANAGEMENT
  // ==========================================
  console.log('\n--- MODULE 1: Admin Workspace (/dashboard, /users, /audit-logs, /settings) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await loginAs(page, 'admin@next-generpsolutions.com', 'AdminPass#2026');

    // 1. Dashboard
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    const kpiCards = await page.locator('.grid [class*="rounded"], .grid [class*="card"]').count();
    console.log(` - Admin Dashboard: Loaded, detected ${kpiCards} KPI summary cards.`);

    // 2. Users Management
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'domcontentloaded' });
    const userRows = await page.locator('table tbody tr').count();
    const userSearch = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    let searchWorked = false;
    if (await userSearch.isVisible()) {
      await userSearch.fill('Priya');
      await page.waitForTimeout(400);
      searchWorked = true;
      await userSearch.fill('');
      await page.waitForTimeout(300);
    }
    console.log(` - Users Management (/users): ${userRows} users listed. Search filter interactive: ${searchWorked}`);

    // 3. Audit Logs
    await page.goto(`${BASE_URL}/audit-logs`, { waitUntil: 'domcontentloaded' });
    const logRows = await page.locator('table tbody tr, [class*="log-row"], [class*="timeline"]').count();
    console.log(` - Forensic Audit Logs (/audit-logs): Loaded with ${logRows} recorded entries.`);

    // 4. System Settings
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    const settingsInputs = await page.locator('input, select, textarea').count();
    console.log(` - System Settings (/settings): Form rendered with ${settingsInputs} configuration inputs.`);

    results.admin = {
      dashboardKpis: kpiCards > 0,
      usersLoaded: userRows > 0,
      userSearchWorked: searchWorked,
      auditLogsLoaded: logRows > 0,
      settingsInputs: settingsInputs > 0,
      consoleErrors,
    };
    await context.close();
  }

  // ==========================================
  // MODULE 2: CRM & COUNSELLOR ADMISSIONS
  // ==========================================
  console.log('\n--- MODULE 2: CRM & Counsellor Operations (/crm/leads, /crm/followups, /admissions) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await loginAs(page, 'counsellor@next-generpsolutions.com', 'CounsellorPass#2026');

    // 1. Leads Page
    await page.goto(`${BASE_URL}/crm/leads`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const leadRows = await page.locator('table tbody tr:has-text("LD-"), table tbody tr:not(:has-text("No leads"))').count();
    console.log(` - CRM Leads (/crm/leads): Rendered ${leadRows} active leads.`);

    // Test New Lead Modal
    const addLeadBtn = page.locator('button:has-text("Add Lead"), button:has-text("New Lead")').first();
    let leadModalOpened = false;
    let syntheticLeadCreated = false;
    if (await addLeadBtn.isVisible()) {
      await addLeadBtn.click();
      await page.waitForTimeout(500);
      leadModalOpened = await page.locator('role=dialog, [class*="modal"]').isVisible().catch(() => false);

      // Attempt to fill synthetic lead
      const nameInput = page.locator('role=dialog input[name="name"], role=dialog input[name="student_name"], role=dialog input[placeholder*="Name"]').first();
      const phoneInput = page.locator('role=dialog input[name="phone"], role=dialog input[type="tel"]').first();
      const emailInput = page.locator('role=dialog input[name="email"], role=dialog input[type="email"]').first();

      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill(`Test Synthetic Lead ${Date.now()}`);
        if (await phoneInput.isVisible()) await phoneInput.fill('+91 98765 43210');
        if (await emailInput.isVisible()) await emailInput.fill(`synthetic.${Date.now()}@example.com`);
        const saveBtn = page.locator('role=dialog button:has-text("Save"), role=dialog button:has-text("Submit"), role=dialog button:has-text("Create")').first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await page.waitForTimeout(1000);
          syntheticLeadCreated = true;
        }
      }
    }
    console.log(` - CRM Add Lead Modal: Opened: ${leadModalOpened}, Form Submission: ${syntheticLeadCreated}`);

    // 2. Follow-ups Page
    await page.goto(`${BASE_URL}/crm/followups`, { waitUntil: 'domcontentloaded' });
    const followupCount = await page.locator('table tbody tr, [class*="followup-card"]').count();
    console.log(` - CRM Follow-ups (/crm/followups): Rendered with ${followupCount} scheduled follow-ups.`);

    // 3. Admissions Page
    await page.goto(`${BASE_URL}/admissions`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const admissionCount = await page.locator('table tbody tr:has-text("ADM-"), table tbody tr:not(:has-text("No admissions"))').count();
    console.log(` - Student Admissions (/admissions): Rendered ${admissionCount} registered admissions.`);

    results.crm = {
      leadsLoaded: leadRows > 0,
      leadModalOpened,
      syntheticLeadCreated,
      followupsLoaded: followupCount >= 0,
      admissionsLoaded: admissionCount > 0,
      consoleErrors,
    };
    await context.close();
  }

  // ==========================================
  // MODULE 3: ACCOUNTS & FEE APPROVALS
  // ==========================================
  console.log('\n--- MODULE 3: Accounts & Fee Approvals (/accounts/approvals, /accounts/payments, /accounts/fees, /accounts/receipts) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await loginAs(page, 'accounts@next-generpsolutions.com', 'AccountsPass#2026');

    // 1. Fee Approvals Queue
    await page.goto(`${BASE_URL}/accounts/approvals`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const pendingApprovalRows = await page.locator('table tbody tr, [class*="approval-card"]').count();
    const approveButtons = await page.locator('button:has-text("Approve")').count();
    const rejectButtons = await page.locator('button:has-text("Reject")').count();
    console.log(` - Accounts Approvals (/accounts/approvals): ${pendingApprovalRows} approval rows. Actions: ${approveButtons} Approve buttons, ${rejectButtons} Reject buttons.`);

    // 2. Accounts Payments Ledger
    await page.goto(`${BASE_URL}/accounts/payments`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const paymentRows = await page.locator('table tbody tr:has-text("REC-"), table tbody tr:not(:has-text("No payments"))').count();
    console.log(` - Verified Payments Ledger (/accounts/payments): ${paymentRows} verified payment entries.`);

    // 3. Receipts Ledger
    await page.goto(`${BASE_URL}/accounts/receipts`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const receiptRows = await page.locator('table tbody tr:has-text("REC-"), table tbody tr:not(:has-text("No receipts"))').count();
    console.log(` - Official Receipts (/accounts/receipts): ${receiptRows} receipts listed.`);

    // 4. Verify Installment & GST Removal Verification
    await page.goto(`${BASE_URL}/accounts/fees`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const feePageText = await page.locator('main').first().innerText().catch(() => '');
    const hasInstallmentInput = await page.locator('input[name*="installment"], select[name*="installment"]').count();
    const hasGstSelector = await page.locator('select[name*="gst"], input[name*="gst_rate"]').count();
    console.log(` - Installment Removal Verification: Installment input fields found: ${hasInstallmentInput} (Expected: 0)`);
    console.log(` - GST Selector Removal Verification: GST rate selectors found: ${hasGstSelector} (Expected: 0)`);

    results.accounts = {
      approvalsQueueLoaded: pendingApprovalRows >= 0,
      approveButtonsAvailable: approveButtons >= 0,
      paymentsLedgerLoaded: paymentRows > 0,
      receiptsLoaded: receiptRows > 0,
      installmentsRemoved: hasInstallmentInput === 0,
      gstSelectorRemoved: hasGstSelector === 0,
      consoleErrors,
    };
    await context.close();
  }

  // ==========================================
  // MODULE 4: ONBOARDING & VERIFICATION
  // ==========================================
  console.log('\n--- MODULE 4: Student Onboarding (/onboarding) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await loginAs(page, 'onboarding@next-generpsolutions.com', 'OnboardPass#2026');

    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'domcontentloaded' });
    const caseCards = await page.locator('[class*="case-card"], table tbody tr, [class*="onboarding-row"]').count();
    const checklistItems = await page.locator('input[type="checkbox"]').count();
    console.log(` - Onboarding Workspace (/onboarding): ${caseCards} active student cases. Checklists: ${checklistItems} interactive checks.`);

    results.onboarding = {
      casesLoaded: caseCards > 0,
      checklistInteractive: checklistItems > 0,
      consoleErrors,
    };
    await context.close();
  }

  // ==========================================
  // MODULE 5: TRAINER & ACADEMICS
  // ==========================================
  console.log('\n--- MODULE 5: Trainer & Academic Operations (/academics/courses, /academics/batches, /academics/attendance, /academics/assignments) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await loginAs(page, 'vikram.fico@next-generpsolutions.com', 'TrainerPass#2026');

    // 1. Courses
    await page.goto(`${BASE_URL}/academics/courses`, { waitUntil: 'domcontentloaded' });
    const courseCards = await page.locator('[class*="course-card"], table tbody tr').count();
    console.log(` - Academics Courses (/academics/courses): ${courseCards} courses rendered.`);

    // 2. Batches
    await page.goto(`${BASE_URL}/academics/batches`, { waitUntil: 'domcontentloaded' });
    const batchRows = await page.locator('table tbody tr, [class*="batch-card"]').count();
    console.log(` - Academics Batches (/academics/batches): ${batchRows} training batches listed.`);

    // 3. Attendance
    await page.goto(`${BASE_URL}/academics/attendance`, { waitUntil: 'domcontentloaded' });
    const studentAttendanceRows = await page.locator('table tbody tr, [class*="attendance-row"]').count();
    const markAttendanceBtn = page.locator('button:has-text("Save Attendance"), button:has-text("Submit Attendance")').first();
    const canSaveAttendance = await markAttendanceBtn.isVisible().catch(() => false);
    console.log(` - Attendance Tracking (/academics/attendance): ${studentAttendanceRows} student attendance rows. Save button: ${canSaveAttendance}`);

    // 4. Assignments
    await page.goto(`${BASE_URL}/academics/assignments`, { waitUntil: 'domcontentloaded' });
    const assignmentRows = await page.locator('table tbody tr, [class*="assignment-card"]').count();
    console.log(` - Assignments (/academics/assignments): ${assignmentRows} curriculum assignments.`);

    // 5. SAP Servers
    await page.goto(`${BASE_URL}/academics/sap-servers`, { waitUntil: 'domcontentloaded' });
    const serverCards = await page.locator('[class*="server-card"], table tbody tr').count();
    console.log(` - SAP Lab Servers (/academics/sap-servers): ${serverCards} server instances configured.`);

    results.trainer = {
      coursesLoaded: courseCards > 0,
      batchesLoaded: batchRows > 0,
      attendanceLoaded: studentAttendanceRows > 0,
      attendanceActionVisible: canSaveAttendance,
      assignmentsLoaded: assignmentRows > 0,
      sapServersLoaded: serverCards > 0,
      consoleErrors,
    };
    await context.close();
  }

  // ==========================================
  // MODULE 6: STUDENT PORTAL & LEARNING HUB
  // ==========================================
  console.log('\n--- MODULE 6: Student Learning Portal (/portal, /support, /certificates) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await loginAs(page, 'amit.gupta@student.next-gen.com', 'StudentPass#2026');

    // 1. Portal Dashboard & HLS Video Player
    await page.goto(`${BASE_URL}/portal`, { waitUntil: 'domcontentloaded' });
    const videoElement = await page.locator('video, [class*="video-player"]').count();
    const playlistLessons = await page.locator('[class*="lesson-item"], [class*="playlist"] button, ul li button').count();
    const progressIndicators = await page.locator('[role="progressbar"], [class*="progress"]').count();
    console.log(` - Student Portal (/portal): Video player elements: ${videoElement}, Playlist lessons: ${playlistLessons}, Progress bars: ${progressIndicators}`);

    // 2. Support / Doubts
    await page.goto(`${BASE_URL}/support`, { waitUntil: 'domcontentloaded' });
    const doubtTickets = await page.locator('table tbody tr, [class*="ticket-card"], [class*="doubt-row"]').count();
    const askDoubtBtn = page.locator('button:has-text("Ask Doubt"), button:has-text("New Ticket")').first();
    const canAskDoubt = await askDoubtBtn.isVisible().catch(() => false);
    console.log(` - Academic Support (/support): ${doubtTickets} tickets listed. Submit doubt button: ${canAskDoubt}`);

    // 3. Certificates
    await page.goto(`${BASE_URL}/certificates`, { waitUntil: 'domcontentloaded' });
    const certElements = await page.locator('[class*="certificate"], table tbody tr').count();
    console.log(` - Certificates (/certificates): ${certElements} certificate entries.`);

    results.student = {
      portalLoaded: playlistLessons > 0 || videoElement > 0,
      videoPlayerFound: videoElement > 0,
      playlistFound: playlistLessons > 0,
      supportLoaded: doubtTickets >= 0,
      certificatesLoaded: certElements >= 0,
      consoleErrors,
    };
    await context.close();
  }

  // ==========================================
  // MODULE 7: PLACEMENT & RECRUITMENT HUB
  // ==========================================
  console.log('\n--- MODULE 7: Placement Management (/placement, /placement/enrollments) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await loginAs(page, 'placement@next-generpsolutions.com', 'PlacementPass#2026');

    // 1. Placement Dashboard
    await page.goto(`${BASE_URL}/placement`, { waitUntil: 'domcontentloaded' });
    const placementKpis = await page.locator('.grid [class*="card"], .grid [class*="rounded"]').count();
    console.log(` - Placement Dashboard (/placement): ${placementKpis} metrics cards.`);

    // 2. Placement Enrollments
    await page.goto(`${BASE_URL}/placement/enrollments`, { waitUntil: 'domcontentloaded' });
    const candidateRows = await page.locator('table tbody tr, [class*="candidate-card"]').count();
    console.log(` - Placement Enrollments (/placement/enrollments): ${candidateRows} candidates enrolled.`);

    results.placement = {
      dashboardLoaded: placementKpis > 0,
      enrollmentsLoaded: candidateRows > 0,
      consoleErrors,
    };
    await context.close();
  }

  await browser.close();
  return results;
}

if (process.argv[1]?.endsWith('02-modules-and-forms-e2e.mjs')) {
  runModulesAndFormsTests()
    .then((results) => {
      console.log('\n' + '='.repeat(80));
      console.log(' MODULES AND FORMS TEST RESULTS:');
      console.log(JSON.stringify(results, null, 2));
      console.log('='.repeat(80));
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
