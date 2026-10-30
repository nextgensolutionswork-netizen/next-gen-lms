const { authenticatePaymentRequest } = require('../lib/auth/payment-session');
const fs = require('fs');

async function test() {
  const store = JSON.parse(fs.readFileSync('data/institute_store.json', 'utf8'));
  const lead = store.leads.find(l => l.id === 'lead-01');
  console.log('lead-01:', lead.id, lead.counsellor_id);
  const counsellor = store.users.find(u => u.email === 'counsellor@next-generpsolutions.com');
  console.log('counsellor in store.users:', counsellor ? { id: counsellor.id, email: counsellor.email, role: counsellor.role } : null);
}
test();
