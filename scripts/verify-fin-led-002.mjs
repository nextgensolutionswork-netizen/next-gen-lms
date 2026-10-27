import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

async function verify() {
  console.log('--- Starting FIN-LED-002 Verification ---');
  const executablePath = 'C:\\Users\\THINKPAD T490\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  try {
    // 1. Authenticate with signed session cookie
    console.log('1. Setting authenticated session cookies for Admin...');
    const adminUser = {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'admin@next-generpsolutions.com',
      full_name: 'Administrator',
      role: 'admin',
      is_active: true,
      tenant_id: 'default',
    };
    const secret = process.env.AUTH_COOKIE_SECRET || 'next-gen-lms-secure-auth-secret-2026';
    const cookieVal = encodeURIComponent(JSON.stringify(adminUser));
    const sig = crypto.createHmac('sha256', secret).update(cookieVal).digest('hex');

    await context.addCookies([
      { name: 'next_gen_auth_user', value: cookieVal, domain: 'localhost', path: '/' },
      { name: 'next_gen_auth_user_sig', value: sig, domain: 'localhost', path: '/' },
    ]);

    const page = await context.newPage();

    // 2. Navigate to Student Fee Accounts Ledger
    console.log('2. Navigating to http://localhost:3001/accounts/fees...');
    await page.goto('http://localhost:3001/accounts/fees', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 3. Verify page header
    const pageHeading = await page.locator('main h1, h1:has-text("Student Fee Accounts Ledger")').first().textContent();
    console.log('Page heading:', pageHeading);
    if (!pageHeading || !pageHeading.includes('Student Fee Accounts Ledger')) {
      throw new Error(`Expected Student Fee Accounts Ledger heading, got: ${pageHeading}`);
    }

    // 4. Check initial ledger rows
    const rows = await page.$$eval('tbody tr', trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ')));
    console.log(`Found ${rows.length} total rows in ledger.`);
    rows.forEach((r, idx) => console.log(` Row [${idx}]:`, r));

    // 5. Verify Amit Gupta is present in the initial ledger
    const initialAmit = rows.find(r => r.includes('Amit Gupta'));
    if (!initialAmit) {
      throw new Error('FAILURE: Amit Gupta not found in initial fee ledger table!');
    }
    console.log('SUCCESS: Amit Gupta found in initial ledger:', initialAmit);

    // 6. Test Search: Type "Amit Gupta"
    console.log('3. Searching for "Amit Gupta"...');
    const searchInput = page.locator('input[placeholder*="Search by student name"]');
    await searchInput.fill('');
    await searchInput.fill('Amit Gupta');
    await page.waitForTimeout(1000);

    const filteredRows = await page.$$eval('tbody tr', trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ')));
    console.log('Rows matching "Amit Gupta":', filteredRows);

    if (filteredRows.length === 0 || filteredRows.some(r => r.includes('No student fee accounts found'))) {
      throw new Error('FAILURE: "No student fee accounts found" displayed when searching for Amit Gupta!');
    }

    const matchedAmit = filteredRows.find(r => r.includes('Amit Gupta'));
    if (!matchedAmit) {
      throw new Error('FAILURE: Amit Gupta row not present in search results!');
    }
    console.log('SUCCESS: Amit Gupta row matched search:', matchedAmit);

    // Verify financial integrity
    if (!matchedAmit.includes('40,000') || !matchedAmit.includes('20,000')) {
      throw new Error(`FAILURE: Financial amounts missing or incorrect in Amit row: ${matchedAmit}`);
    }
    console.log('SUCCESS: Financial amounts verified (Net ₹40,000, Paid ₹20,000, Due ₹20,000)');

    // Verify action button
    if (!matchedAmit.includes('Collect')) {
      throw new Error(`FAILURE: Expected "Collect" action button for outstanding balance in Amit row: ${matchedAmit}`);
    }
    console.log('SUCCESS: Verified "Collect" action button is available for Amit Gupta');

    // 7. Search by admission code "ADM-2026-001"
    console.log('4. Searching by admission code "ADM-2026-001"...');
    await searchInput.fill('ADM-2026-001');
    await page.waitForTimeout(1000);
    const admFiltered = await page.$$eval('tbody tr', trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ')));
    if (!admFiltered.some(r => r.includes('Amit Gupta'))) {
      throw new Error('FAILURE: Search by ADM-2026-001 did not return Amit Gupta!');
    }
    console.log('SUCCESS: Search by ADM-2026-001 matched Amit Gupta');

    // 8. Search for "Sneha Kulkarni"
    console.log('5. Searching for "Sneha Kulkarni"...');
    await searchInput.fill('Sneha Kulkarni');
    await page.waitForTimeout(1000);
    const snehaFiltered = await page.$$eval('tbody tr', trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ')));
    console.log('Rows matching "Sneha Kulkarni":', snehaFiltered);
    const snehaRow = snehaFiltered.find(r => r.includes('Sneha Kulkarni'));
    if (!snehaRow) {
      throw new Error('FAILURE: Sneha Kulkarni not found in search results!');
    }
    if (!snehaRow.includes('Cleared') && !snehaRow.includes('Paid')) {
      throw new Error(`FAILURE: Sneha Kulkarni expected to be Cleared/Paid, got: ${snehaRow}`);
    }
    console.log('SUCCESS: Sneha Kulkarni verified as fully Cleared/Paid');

    // 9. Reset search to "Amit Gupta" and take official screenshot
    await searchInput.fill('Amit Gupta');
    await page.waitForTimeout(1000);
    const screenshotDir = path.resolve('docs/audits');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, 'fin-led-002-resolved.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved resolution screenshot to ${screenshotPath}`);

    console.log('====================================================');
    console.log('🎉 FIN-LED-002 VERIFICATION COMPLETED SUCCESSFULLY!');
    console.log('====================================================');
  } finally {
    await browser.close();
  }
}

verify().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
