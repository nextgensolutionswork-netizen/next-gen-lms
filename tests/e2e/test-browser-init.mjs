import { chromium } from 'playwright';

async function testBrowser() {
  console.log('Launching browser via Playwright...');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    console.log('Successfully launched Chrome channel.');
  } catch (err) {
    console.log('Chrome launch failed, trying msedge:', err.message);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    console.log('Successfully launched msedge channel.');
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Navigating to http://localhost:3000/login ...');
  const response = await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('Page loaded with status:', response?.status());
  console.log('Page title:', await page.title());

  const heading = await page.textContent('h1, h2');
  console.log('Page primary heading:', heading);

  await browser.close();
  console.log('Browser test completed successfully.');
}

testBrowser().catch((err) => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
