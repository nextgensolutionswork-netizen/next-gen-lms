const { generateAuthCookieSignature } = require('../lib/security/auth-cookie');
const { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } = require('../lib/security/auth-cookie');

async function test() {
  const user = {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'counsellor@next-generpsolutions.com',
    full_name: 'Ananya Desai (Senior Counsellor)',
    role: 'counsellor',
    tenant_id: 'default',
    is_active: true
  };
  const val = encodeURIComponent(JSON.stringify(user));
  const sig = await generateAuthCookieSignature(val);
  const cookieHeader = `${AUTH_COOKIE_NAME}=${val}; ${AUTH_SIG_COOKIE_NAME}=${sig}`;

  console.log('Sending request with cookie...');
  const res = await fetch('http://localhost:3000/api/fees/proof', {
    method: 'POST',
    headers: {
      'cookie': cookieHeader,
      'origin': 'http://localhost:3000'
    }
  });
  console.log('Status:', res.status, await res.text());
}
test().catch(console.error);
