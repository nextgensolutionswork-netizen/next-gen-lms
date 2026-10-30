const fs = require('fs');
const path = require('path');

const filePath = path.resolve('app/(dashboard)/crm/leads/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  "import { createLead, updateLeadStage, bulkAssignLeads, bulkUpdateLeadStage } from '@/lib/services/crm-service';",
  "import { createLead, updateLeadStage, bulkAssignLeads, bulkUpdateLeadStage, getLeads } from '@/lib/services/crm-service';"
);

content = content.replace(
  "const staff = (staffRes.data || []).filter((u) => u.is_active !== false);",
  "const staff = (staffRes.data || []).filter((u: any) => u.is_active !== false);"
);

content = content.replace(
  "const defaultStaff = staff.find((s) => s.id === user?.id) || staff[0];",
  "const defaultStaff = staff.find((s: any) => s.id === user?.id) || staff[0];"
);

content = content.replace(
  "const staff = (store.users || []).filter((u) => u.is_active !== false && ['counsellor', 'admin', 'super_admin'].includes(u.role)).map((u) => ({ id: u.id, full_name: u.full_name, role: u.role }));",
  "const staff = (store.users || []).filter((u: any) => u.is_active !== false && ['counsellor', 'admin', 'super_admin'].includes(u.role)).map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role }));"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed types in crm/leads/page.tsx');
