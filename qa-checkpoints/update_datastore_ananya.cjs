const fs = require('fs');
const path = require('path');

const filePath = path.resolve('lib/services/data-store.ts');
let content = fs.readFileSync(filePath, 'utf8');

const target = `    {
      id: 'usr-counsellor',
      email: 'counsellor@next-generpsolutions.com',
      full_name: 'Ananya Desai (Senior Counsellor)',
      role: 'counsellor',
      phone: '+91 98000 00004',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },`;

const replacement = `    {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'counsellor@next-generpsolutions.com',
      full_name: 'Ananya Desai (Senior Counsellor)',
      role: 'counsellor',
      phone: '+91 98000 00004',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'usr-counsellor',
      email: 'counsellor@next-generpsolutions.com',
      full_name: 'Ananya Desai (Senior Counsellor)',
      role: 'counsellor',
      phone: '+91 98000 00004',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },`;

const hasCRLF = content.includes('\r\n');
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = target.replace(/\r\n/g, '\n');
const normalizedReplacement = replacement.replace(/\r\n/g, '\n');

if (!normalizedContent.includes(normalizedTarget)) {
  console.error('Target not found in data-store.ts');
  process.exit(1);
}

let updated = normalizedContent.replace(normalizedTarget, normalizedReplacement);
if (hasCRLF) {
  updated = updated.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, updated, 'utf8');
console.log('Successfully updated data-store.ts with authorized database profile 44444444-4444-4444-4444-444444444444');
