const fs = require('fs');
let code = fs.readFileSync('lib/services/admission-service.ts', 'utf8');
code = code.replace(
  `  const performingUser =\n    store.users.find((u) => u.id === performedByUserId || u.email === performedByUserId) ||\n    store.users.find((u) => ['counsellor', 'admin', 'super_admin'].includes(u.role) && u.is_active !== false) ||\n    store.users[0];`,
  `  const performingUser =\n    store.users.find((u) => u.id === performedByUserId || u.email === performedByUserId) ||\n    store.users.find((u) => ['counsellor', 'admin', 'super_admin'].includes(u.role) && u.is_active !== false) ||\n    store.users[0];\n  console.log('[DEBUG admission-service] performedByUserId:', performedByUserId, 'performingUser:', performingUser ? { id: performingUser.id, role: performingUser.role } : null);`
);
code = code.replace(
  `    if (!existingLead) {\n      throw new Error(\`Lead not found with ID \${input.lead_id}. Cannot convert non-existent lead.\`);\n    }`,
  `    if (!existingLead) {\n      throw new Error(\`Lead not found with ID \${input.lead_id}. Cannot convert non-existent lead.\`);\n    }\n    console.log('[DEBUG admission-service] existingLead:', existingLead ? { id: existingLead.id, counsellor_id: existingLead.counsellor_id } : null);`
);
fs.writeFileSync('lib/services/admission-service.ts', code, 'utf8');
console.log('Modified admission-service.ts successfully');
