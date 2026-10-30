const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, search, replacement) {
  const fullPath = path.resolve(filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  const hasCRLF = content.includes('\r\n');
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const normalizedSearch = search.replace(/\r\n/g, '\n');
  const normalizedReplacement = replacement.replace(/\r\n/g, '\n');

  if (!normalizedContent.includes(normalizedSearch)) {
    console.error('Target not found in', filePath);
    process.exit(1);
  }

  let updated = normalizedContent.replace(normalizedSearch, normalizedReplacement);
  if (hasCRLF) {
    updated = updated.replace(/\n/g, '\r\n');
  }
  fs.writeFileSync(fullPath, updated, 'utf8');
  console.log('Successfully updated', filePath);
}

// In payment-workflow-transaction.ts, restore exact [state, roster] contract
const pwTxTarget = `      const [state, roster, liveLeads] = await Promise.all([
        db.from('fee_workflow_state').select('revision, snapshot').eq('tenant_id', tenant).maybeSingle(),
        db.from('profiles').select('*').eq('tenant_id', tenant),
        db.from('leads').select('*').order('created_at', { ascending: false }),
      ]);`;

const pwTxReplacement = `      const [state, roster] = await Promise.all([
        db.from('fee_workflow_state').select('revision, snapshot').eq('tenant_id', tenant).maybeSingle(),
        db.from('profiles').select('*').eq('tenant_id', tenant),
      ]);`;

replaceInFile('lib/services/payment-workflow-transaction.ts', pwTxTarget, pwTxReplacement);

// Remove the liveLeads block that referenced liveLeads
const pwLiveLeadsTarget = `      if (data) {
        revision = data.revision;
        mergeWorkflowSnapshot(data.snapshot, tenant);
      }
      if (liveLeads && !liveLeads.error && liveLeads.data) {
        const existingMap = new Map((store.leads || []).map((l) => [l.id, l]));
        for (const remoteLead of liveLeads.data) {
          const local = existingMap.get(remoteLead.id);
          if (local) {
            if (local.stage === 'Converted' && remoteLead.stage !== 'Converted') {
              remoteLead.stage = 'Converted';
            }
            Object.assign(local, remoteLead);
          } else {
            store.leads.push(remoteLead);
          }
        }
      }
      if (!data) {`;

const pwLiveLeadsReplacement = `      if (data) {
        revision = data.revision;
        mergeWorkflowSnapshot(data.snapshot, tenant);
      } else {`;

replaceInFile('lib/services/payment-workflow-transaction.ts', pwLiveLeadsTarget, pwLiveLeadsReplacement);

// In admission-service.ts, ensure lead is fetched from getLeads() if not in memory
const leadFindTarget = `  if (input.lead_id) {
    const existingLead = store.leads.find((l) => l.id === input.lead_id);
    if (!existingLead) {
      throw new Error(\`Lead not found with ID \${input.lead_id}. Cannot convert non-existent lead.\`);
    }`;

const leadFindReplacement = `  if (input.lead_id) {
    let existingLead = store.leads.find((l) => l.id === input.lead_id);
    if (!existingLead && isLiveSupabaseEnabled()) {
      try {
        const supabase = createClient();
        const { data: dbLead } = await supabase.from('leads').select('*').eq('id', input.lead_id).maybeSingle();
        if (dbLead) {
          store.leads.unshift(dbLead as any);
          existingLead = dbLead as any;
        }
      } catch {}
    }
    if (!existingLead) {
      throw new Error(\`Lead not found with ID \${input.lead_id}. Cannot convert non-existent lead.\`);
    }`;

replaceInFile('lib/services/admission-service.ts', leadFindTarget, leadFindReplacement);
