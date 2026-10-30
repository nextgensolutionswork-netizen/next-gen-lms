const fs = require('fs');
const file = 'E:/my erp hub/next gen lms/lib/auth/payment-session.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) throw new Error('Unauthorized: A valid Supabase session is required.');
    if (!error && data?.user) {`;

const replacement = `    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const { data, error } = await client.auth.getUser(token);
    if (!error && data?.user) {`;

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = target.replace(/\r\n/g, '\n');
const normalizedReplacement = replacement.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedTarget)) {
  const updated = normalizedContent.replace(normalizedTarget, normalizedReplacement);
  fs.writeFileSync(file, updated, 'utf8');
  console.log('payment-session.ts updated successfully');
} else {
  console.error('Target not found in payment-session.ts');
}
