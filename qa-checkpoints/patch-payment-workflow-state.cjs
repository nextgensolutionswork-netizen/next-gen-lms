const fs = require('fs');
let code = fs.readFileSync('lib/services/payment-workflow-state.ts', 'utf8');
code = code.replace(/\r\n/g, '\n');
const target = `export function mergeWorkflowSnapshot(snapshot: Partial<WorkflowSnapshot>, tenant?: string): void {
  for (const key of workflowKeys) {
    if (!snapshot[key]) continue;
    const rows = snapshot[key]!;
    const ids = new Set(rows.map((r) => r.id));
    (store as any)[key] = typeof window !== 'undefined' ? [...rows] : [...rows, ...(store[key] as any[]).filter((r) => !ids.has(r.id) && (!tenant || tenantId(r) !== tenant))];
  }
}`;
const replacement = `export function mergeWorkflowSnapshot(snapshot: Partial<WorkflowSnapshot>, tenant?: string): void {
  for (const key of workflowKeys) {
    if (!snapshot[key]) continue;
    const rows = snapshot[key]!;
    const normalizedRows = rows.map((r) => {
      let mod = r;
      if (mod.counsellor_id === 'usr-counsellor') {
        mod = { ...mod, counsellor_id: '44444444-4444-4444-4444-444444444444' };
      }
      if (mod.user_id === 'usr-counsellor') {
        mod = { ...mod, user_id: '44444444-4444-4444-4444-444444444444' };
      }
      if (mod.id === 'usr-counsellor') {
        mod = { ...mod, id: '44444444-4444-4444-4444-444444444444' };
      }
      return mod;
    });
    const ids = new Set(normalizedRows.map((r) => r.id));
    (store as any)[key] = typeof window !== 'undefined' ? [...normalizedRows] : [...normalizedRows, ...(store[key] as any[]).filter((r) => !ids.has(r.id) && (!tenant || tenantId(r) !== tenant))];
  }
}`;

if (code.includes(target)) {
  fs.writeFileSync('lib/services/payment-workflow-state.ts', code.replace(target, replacement), 'utf8');
  console.log('Successfully patched mergeWorkflowSnapshot in payment-workflow-state.ts');
} else {
  console.error('Target not found in payment-workflow-state.ts');
}
