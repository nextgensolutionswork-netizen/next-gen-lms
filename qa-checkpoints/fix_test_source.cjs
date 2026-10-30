const fs = require('fs');
const file = 'E:/my erp hub/next gen lms/tests/crm-counsellor-selection.test.ts';
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/lead_source: 'Website Form'/g, "lead_source: 'Website' as const");
fs.writeFileSync(file, c, 'utf8');
console.log('Fixed lead_source in test file');
