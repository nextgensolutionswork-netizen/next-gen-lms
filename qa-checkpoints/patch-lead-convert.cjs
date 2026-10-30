const fs = require('fs');
let code = fs.readFileSync('lib/services/admission-service.ts', 'utf8');
code = code.replace(/\r\n/g, '\n');

// Patch 1: existingLead fetch via admin client
const target1 = `    if (!existingLead && isLiveSupabaseEnabled()) {
      try {
        const supabase = createClient();
        const { data: dbLead } = await supabase.from('leads').select('*').eq('id', input.lead_id).maybeSingle();
        if (dbLead) {
          store.leads.unshift(dbLead as any);
          existingLead = dbLead as any;
        }
      } catch {}
    }`;

const repl1 = `    if (!existingLead && isLiveSupabaseEnabled()) {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const { data: dbLead } = await createAdminClient().from('leads').select('*').eq('id', input.lead_id).maybeSingle();
        if (dbLead) {
          store.leads.unshift(dbLead as any);
          existingLead = dbLead as any;
        }
      } catch {}
    }`;

code = code.replace(target1, repl1);

// Patch 2: lead in conversion block via admin client and updating remote stage
const target2 = `  // 6. If converted from CRM lead, mark lead as converted
  if (input.lead_id) {
    const lead = store.leads.find((l) => l.id === input.lead_id);
    if (!lead) {
      throw new Error(\`Lead not found with ID \${input.lead_id}. Cannot convert non-existent lead.\`);
    }`;

const repl2 = `  // 6. If converted from CRM lead, mark lead as converted
  if (input.lead_id) {
    let lead = store.leads.find((l) => l.id === input.lead_id);
    if (!lead && isLiveSupabaseEnabled()) {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const { data: dbLead } = await createAdminClient().from('leads').select('*').eq('id', input.lead_id).maybeSingle();
        if (dbLead) {
          store.leads.unshift(dbLead as any);
          lead = dbLead as any;
        }
      } catch {}
    }
    if (!lead) {
      throw new Error(\`Lead not found with ID \${input.lead_id}. Cannot convert non-existent lead.\`);
    }`;

code = code.replace(target2, repl2);

const target3 = `    lead.stage = 'Converted';
    lead.notes = \`\${lead.notes || ''}\\nConverted to Admission: \${admission_number}\`.trim();
    lead.updated_at = new Date().toISOString();
    (newAdmission as any).lead_id = input.lead_id;
    (newAdmission as any).converted_lead_id = input.lead_id;
  }`;

const repl3 = `    lead.stage = 'Converted';
    lead.notes = \`\${lead.notes || ''}\\nConverted to Admission: \${admission_number}\`.trim();
    lead.updated_at = new Date().toISOString();
    (newAdmission as any).lead_id = input.lead_id;
    (newAdmission as any).converted_lead_id = input.lead_id;

    if (isLiveSupabaseEnabled()) {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        await createAdminClient().from('leads').update({
          stage: 'Converted',
          notes: lead.notes,
          updated_at: lead.updated_at,
        }).eq('id', input.lead_id);
      } catch (err) {
        console.warn('Failed to update lead stage in Supabase:', err);
      }
    }
  }`;

code = code.replace(target3, repl3);

fs.writeFileSync('lib/services/admission-service.ts', code, 'utf8');
console.log('Patched admission-service.ts successfully');
