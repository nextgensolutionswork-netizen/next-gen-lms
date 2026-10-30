const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, oldStr, newStr) {
  const fullPath = path.resolve(filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  const hasCrlf = content.includes('\r\n');
  const normContent = content.replace(/\r\n/g, '\n');
  const normOld = oldStr.replace(/\r\n/g, '\n');
  const normNew = newStr.replace(/\r\n/g, '\n');

  if (!normContent.includes(normOld)) {
    throw new Error(`Target string not found in ${filePath}`);
  }

  let updated = normContent.replace(normOld, normNew);
  if (hasCrlf) {
    updated = updated.replace(/\n/g, '\r\n');
  }
  fs.writeFileSync(fullPath, updated, 'utf8');
  console.log(`Successfully updated ${filePath}`);
}

// 1. Fix lib/services/crm-service.ts
const crmOld = `  let newId: string;
  try {
    newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : \`lead-\${Date.now()}\`;
  } catch {
    newId = \`lead-\${Date.now()}\`;
  }

  const newLead: Lead = {
    ...data,
    id: newId,
    lead_code,
    interested_course_name: course?.course_name,
    counsellor_name: counsellor?.full_name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.leads.unshift(newLead);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient(authContext || data.counsellor_id);
      const isUuid = (str?: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '');

      const supabasePayload: Record<string, any> = {
        lead_code: newLead.lead_code,
        full_name: newLead.full_name,
        phone: newLead.phone,
        email: newLead.email,
        current_status: newLead.current_status,
        experience_years: newLead.experience_years,
        training_preference: newLead.training_preference,
        lead_source: newLead.lead_source,
        campaign: newLead.campaign,
        demo_preference: newLead.demo_preference,
        demo_date: newLead.demo_date,
        follow_up_date: newLead.follow_up_date,
        notes: newLead.notes,
        stage: newLead.stage,
        created_at: newLead.created_at,
        updated_at: newLead.updated_at,
      };

      if (isUuid(newLead.id)) supabasePayload.id = newLead.id;
      if (isUuid(newLead.interested_course_id)) supabasePayload.interested_course_id = newLead.interested_course_id;
      if (isUuid(newLead.counsellor_id)) supabasePayload.counsellor_id = newLead.counsellor_id;

      let { error } = await supabase.from('leads').insert(supabasePayload);
      if (error && error.message && error.message.includes('leads_lead_code_key')) {
        const uniqueSuffix = Date.now().toString().slice(-4);
        const retryCode = \`\${newLead.lead_code}-\${uniqueSuffix}\`;
        newLead.lead_code = retryCode;
        supabasePayload.lead_code = retryCode;
        store.persist();
        const retryRes = await supabase.from('leads').insert(supabasePayload);
        error = retryRes.error;
      }
      if (error) {
        console.warn('Supabase leads insert notice (persisted locally):', error.message);
      }
    } catch (err: any) {
      console.warn('Supabase leads insert notice (persisted locally):', err?.message || err);
    }
  }`;

const crmNew = `  let newId: string;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      newId = crypto.randomUUID();
    } else {
      newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
  } catch {
    newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  const newLead: Lead = {
    ...data,
    id: newId,
    lead_code,
    interested_course_name: course?.course_name,
    counsellor_name: counsellor?.full_name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isLiveSupabaseEnabled()) {
    const supabase = createClient(authContext || data.counsellor_id);
    const supabasePayload: Record<string, any> = {
      id: newLead.id,
      lead_code: newLead.lead_code,
      full_name: newLead.full_name,
      phone: newLead.phone,
      email: newLead.email,
      current_status: newLead.current_status,
      experience_years: newLead.experience_years,
      training_preference: newLead.training_preference,
      lead_source: newLead.lead_source,
      campaign: newLead.campaign,
      demo_preference: newLead.demo_preference,
      demo_date: newLead.demo_date,
      follow_up_date: newLead.follow_up_date,
      notes: newLead.notes,
      stage: newLead.stage,
      interested_course_id: newLead.interested_course_id,
      counsellor_id: newLead.counsellor_id,
      created_at: newLead.created_at,
      updated_at: newLead.updated_at,
    };

    let { error } = await supabase.from('leads').insert(supabasePayload);
    if (error && error.message && error.message.includes('leads_lead_code_key')) {
      const uniqueSuffix = Date.now().toString().slice(-4);
      const retryCode = \`\${newLead.lead_code}-\${uniqueSuffix}\`;
      newLead.lead_code = retryCode;
      supabasePayload.lead_code = retryCode;
      const retryRes = await supabase.from('leads').insert(supabasePayload);
      error = retryRes.error;
    }
    if (error) {
      throw new Error(\`Failed to create lead in database: Database error creating lead: \${error.message}\`);
    }
  }

  store.leads.unshift(newLead);
  store.persist();`;

replaceInFile('lib/services/crm-service.ts', crmOld, crmNew);

// 2. Fix app/(dashboard)/crm/leads/page.tsx
const pageOld = `          {createLeadError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <span className="font-semibold text-red-800">Error:</span>
              <span>{createLeadError}</span>
            </div>
          )}`;

const pageNew = `          {createLeadError && (
            <div role="alert" className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <span className="font-semibold text-red-800">Error:</span>
              <span>{createLeadError}</span>
            </div>
          )}`;

replaceInFile('app/(dashboard)/crm/leads/page.tsx', pageOld, pageNew);

// 3. Fix lib/services/admission-service.ts
const admOld = `  if (typeof window !== 'undefined') {
    const { paymentWorkflowClient } = await import('./payment-workflow-client');
    try {
      const serverResult = await paymentWorkflowClient.createAdmission(input);
      if (serverResult && serverResult.admission) {
        return serverResult;
      }
    } catch (err: any) {
      console.warn('paymentWorkflowClient.createAdmission failed, falling back to local admission workflow:', err);
    }
  }`;

const admNew = `  if (typeof window !== 'undefined') {
    const { paymentWorkflowClient } = await import('./payment-workflow-client');
    const serverResult = await paymentWorkflowClient.createAdmission(input);
    if (serverResult && serverResult.admission) {
      return serverResult;
    }
    throw new Error('Server admission creation did not return a valid admission record.');
  }`;

replaceInFile('lib/services/admission-service.ts', admOld, admNew);

// 4. Also in lib/services/admission-service.ts - Lead conversion sync
const convOld = `  // 6. If converted from CRM lead, mark lead as converted
  if (input.lead_id) {
    const lead = store.leads.find((l) => l.id === input.lead_id);
    if (lead) {
      lead.stage = 'Converted';
      lead.notes = \`\${lead.notes || ''}\\nConverted to Admission: \${admission_number}\`;
      lead.updated_at = new Date().toISOString();
    }
  }`;

const convNew = `  // 6. If converted from CRM lead, mark lead as converted
  if (input.lead_id) {
    let lead = store.leads.find((l) => l.id === input.lead_id);
    if (!lead && input.student_name) {
      lead = store.leads.find((l) => l.full_name?.toLowerCase() === input.student_name.toLowerCase());
    }
    if (lead) {
      lead.stage = 'Converted';
      lead.notes = \`\${lead.notes || ''}\\nConverted to Admission: \${admission_number}\`.trim();
      lead.updated_at = new Date().toISOString();
    } else {
      store.leads.unshift({
        id: input.lead_id,
        lead_code: \`LD-\${Date.now().toString().slice(-4)}\`,
        full_name: input.student_name,
        phone: input.phone,
        email: input.email,
        interested_course_id: input.course_id,
        stage: 'Converted',
        notes: \`Converted to Admission: \${admission_number}\`,
        training_preference: input.training_mode || 'Hybrid',
        lead_source: 'Website',
        current_status: input.current_employment_status || 'Employed',
        experience_years: input.experience_years || 0,
        counsellor_id: input.counsellor_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }`;

replaceInFile('lib/services/admission-service.ts', convOld, convNew);

// 5. Fix lib/services/payment-workflow-transaction.ts
const pwtOld = `    const userIndex = store.users.findIndex((u) => u.id === actor.id);
    if (userIndex < 0) store.users.push(actor); else store.users[userIndex] = actor;`;

const pwtNew = `    if (db) {
      const currentActorProfile = (roster.data || []).find((u) => u.id === actor.id);
      if (!currentActorProfile || currentActorProfile.is_active === false) {
        throw new Error('Unauthorized: Actor is inactive or no longer in staff roster.');
      }
      actor.role = currentActorProfile.role;
      actor.is_active = currentActorProfile.is_active;
    }
    const userIndex = store.users.findIndex((u) => u.id === actor.id);
    if (userIndex < 0) store.users.push(actor); else store.users[userIndex] = actor;`;

replaceInFile('lib/services/payment-workflow-transaction.ts', pwtOld, pwtNew);

// 6. Fix lib/services/payment-workflow-state.ts (leads in snapshot for counsellors/admins)
const pwsOld = `  // Profiles and operational configuration are not part of a payment response.
  const { users, batches, leads, ...result } = snapshot;`;

const pwsNew = `  // Profiles and operational configuration are not part of a payment response.
  const { users, batches, ...result } = snapshot;
  if (!['counsellor', 'admin', 'super_admin'].includes(actor.role)) {
    delete (result as any).leads;
  }`;

replaceInFile('lib/services/payment-workflow-state.ts', pwsOld, pwsNew);

// 7. Fix app/api/admissions/route.ts (Zod validation formatting)
const admRouteOld = `  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admission failed.';
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith('Unauthorized') ? 401 : message.startsWith('Forbidden') ? 403 : 400 });
  }`;

const admRouteNew = `  } catch (error) {
    let message = error instanceof Error ? error.message : 'Admission failed.';
    if (error instanceof z.ZodError) {
      message = error.errors.map((e) => \`\${e.path.join('.') || 'field'}: \${e.message}\`).join('; ');
    }
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith('Unauthorized') ? 401 : message.startsWith('Forbidden') ? 403 : 400 });
  }`;

replaceInFile('app/api/admissions/route.ts', admRouteOld, admRouteNew);

// 8. Lead stage sync in handleConvertLead (app/(dashboard)/crm/leads/page.tsx)
const convLeadOld = `      setIsConvertModalOpen(false);
      setSelectedLead(null);
      refreshLeads();
      alert(\`Lead \${selectedLead.full_name} converted to confirmed admission successfully!\`);`;

const convLeadNew = `      const targetLead = store.leads.find((l) => l.id === selectedLead.id);
      if (targetLead) {
        targetLead.stage = 'Converted';
        targetLead.updated_at = new Date().toISOString();
      }
      selectedLead.stage = 'Converted';
      store.persist();

      setIsConvertModalOpen(false);
      setSelectedLead(null);
      refreshLeads();
      alert(\`Lead \${selectedLead.full_name} converted to confirmed admission successfully!\`);`;

replaceInFile('app/(dashboard)/crm/leads/page.tsx', convLeadOld, convLeadNew);

console.log('ALL FIXES APPLIED SUCCESSFULLY!');
