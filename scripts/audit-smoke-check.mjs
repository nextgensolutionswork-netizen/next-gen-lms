import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 60000 });
    console.log(JSON.stringify({ width, status: response.status(), forms: await page.locator('form').count(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors }));
    await page.close();
  }
  for (const route of ['/dashboard', '/portal', '/accounts/fees', '/users', '/api/database/backup']) {
    const response = await fetch(`http://localhost:3000${route}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    console.log(JSON.stringify({ route, status: response.status, location: response.headers.get('location') }));
  }
} finally {
  await browser.close();
}
