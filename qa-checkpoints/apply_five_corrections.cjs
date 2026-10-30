const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, oldStr, newStr) {
  const fullPath = path.resolve(filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  const hasCrlf = content.includes('\r\n');
  const normContent = content.replace(/\r\n/g, '\n');
  const normOld = oldStr.replace(/\r\n/g, '\n');
  const normNew = newStr.replace(/\r\n/g, '\n');

  if (normContent.includes(normNew)) {
    console.log('Already updated ' + filePath);
    return;
  }
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

// -------------------------------------------------------------
// Correction 1: Fix CRM related IDs in lib/services/crm-service.ts
// -------------------------------------------------------------
const crmServiceOld = `  const newLead: Lead = {
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
    };`;

const crmServiceNew = `  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (isLiveSupabaseEnabled()) {
    if (data.interested_course_id && !UUID_REGEX.test(data.interested_course_id)) {
      throw new Error('Invalid course ID: Course must be selected from authorized database records (valid UUID required).');
    }
    if (data.counsellor_id && !UUID_REGEX.test(data.counsellor_id)) {
      throw new Error('Invalid counsellor ID: Counsellor must be selected from authorized staff roster (valid UUID required).');
    }
  } else {
    if (data.interested_course_id && !(store.courses || []).some((c) => c.id === data.interested_course_id)) {
      throw new Error('Invalid course ID: Selected course does not exist in store.');
    }
    if (data.counsellor_id) {
      const localCounsellor = (store.users || []).find((u) => u.id === data.counsellor_id);
      if (!localCounsellor || localCounsellor.is_active === false) {
        throw new Error('Invalid counsellor ID: Assigned counsellor is inactive or not found.');
      }
    }
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
      interested_course_id: newLead.interested_course_id || null,
      counsellor_id: newLead.counsellor_id || null,
      created_at: newLead.created_at,
      updated_at: newLead.updated_at,
    };`;

replaceInFile('lib/services/crm-service.ts', crmServiceOld, crmServiceNew);

// -------------------------------------------------------------
// Correction 2: Lead conversion integrity in lib/services/admission-service.ts
// -------------------------------------------------------------
const admServiceOld = `  // 6. If converted from CRM lead, mark lead as converted
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

const admServiceNew = `  // 6. If converted from CRM lead, mark lead as converted
  if (input.lead_id) {
    const lead = store.leads.find((l) => l.id === input.lead_id);
    if (!lead) {
      throw new Error(\`Lead not found with ID \${input.lead_id}. Cannot convert non-existent lead.\`);
    }
    if (performingUser && performingUser.role === 'counsellor' && lead.counsellor_id && lead.counsellor_id !== performingUser.id) {
      throw new Error('Forbidden: You are not authorized to convert leads assigned to another counsellor.');
    }
    if (lead.tenant_id && performingUser && lead.tenant_id !== (performingUser.tenant_id || 'default')) {
      throw new Error('Forbidden: Lead belongs to another tenant.');
    }
    if (lead.stage === 'Converted') {
      throw new Error('Lead has already been converted to an admission. Duplicate conversion is not allowed.');
    }
    const alreadyConvertedInAdmissions = (store.admissions || []).some(
      (a) => (a as any).lead_id === input.lead_id || (a as any).converted_lead_id === input.lead_id
    );
    if (alreadyConvertedInAdmissions) {
      throw new Error('Lead has already been converted to an admission. Duplicate conversion is not allowed.');
    }

    lead.stage = 'Converted';
    lead.notes = \`\${lead.notes || ''}\\nConverted to Admission: \${admission_number}\`.trim();
    lead.updated_at = new Date().toISOString();
    (newAdmission as any).lead_id = input.lead_id;
    (newAdmission as any).converted_lead_id = input.lead_id;
  }`;

replaceInFile('lib/services/admission-service.ts', admServiceOld, admServiceNew);

// Also add preliminary validation check in createAdmissionWorkflow before any objects are created
const admEarlyCheckOld = `  const performingUser =
    store.users.find((u) => u.id === performedByUserId || u.email === performedByUserId) ||
    store.users.find((u) => ['counsellor', 'admin', 'super_admin'].includes(u.role) && u.is_active !== false) ||
    store.users[0];`;

const admEarlyCheckNew = `  const performingUser =
    store.users.find((u) => u.id === performedByUserId || u.email === performedByUserId) ||
    store.users.find((u) => ['counsellor', 'admin', 'super_admin'].includes(u.role) && u.is_active !== false) ||
    store.users[0];

  if (input.lead_id) {
    const existingLead = store.leads.find((l) => l.id === input.lead_id);
    if (!existingLead) {
      throw new Error(\`Lead not found with ID \${input.lead_id}. Cannot convert non-existent lead.\`);
    }
    if (performingUser && performingUser.role === 'counsellor' && existingLead.counsellor_id && existingLead.counsellor_id !== performingUser.id) {
      throw new Error('Forbidden: You are not authorized to convert leads assigned to another counsellor.');
    }
    if (existingLead.stage === 'Converted') {
      throw new Error('Lead has already been converted to an admission. Duplicate conversion is not allowed.');
    }
    const isAlreadyConverted = (store.admissions || []).some(
      (a) => (a as any).lead_id === input.lead_id || (a as any).converted_lead_id === input.lead_id
    );
    if (isAlreadyConverted) {
      throw new Error('Lead has already been converted to an admission. Duplicate conversion is not allowed.');
    }
  }`;

replaceInFile('lib/services/admission-service.ts', admEarlyCheckOld, admEarlyCheckNew);

// -------------------------------------------------------------
// Correction 3: Snapshot isolation in lib/services/payment-workflow-state.ts
// -------------------------------------------------------------
const pwsOld = `  if (actor.role === 'counsellor') {
    result.studentPayments = result.studentPayments.filter((p) => p.recorded_by === actor.id);
    result.auditLogs = result.auditLogs.filter((a) => a.user_id === actor.id || result.studentPayments.some((p) => p.id === a.record_id));
  }`;

const pwsNew = `  if (actor.role === 'counsellor') {
    result.studentPayments = result.studentPayments.filter((p) => p.recorded_by === actor.id);
    result.auditLogs = result.auditLogs.filter((a) => a.user_id === actor.id || result.studentPayments.some((p) => p.id === a.record_id));
    if (result.leads) {
      result.leads = result.leads.filter((l) => l.counsellor_id === actor.id);
    }
  }`;

replaceInFile('lib/services/payment-workflow-state.ts', pwsOld, pwsNew);

// -------------------------------------------------------------
// Correction 4: Remove silent payment-proof disk fallback in app/api/fees/proof/route.ts
// -------------------------------------------------------------
const proofRouteOld = `    if (isLiveSupabaseEnabled()) {
      try {
        const { error } = await createAdminClient().storage.from('payment-proofs').upload(objectPath, buffer, { contentType: mime[extension], upsert: false });
        if (error) throw new Error(error.message);
      } catch (remoteErr: any) {
        console.warn('Live storage upload unavailable, falling back to secure local disk storage:', remoteErr.message);
        const target = path.join(root, objectPath);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, buffer, { flag: 'wx' });
      }
    } else {
      const target = path.join(root, objectPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer, { flag: 'wx' });
    }
    return NextResponse.json({ success: true, bucket: 'payment-proofs', path: objectPath, url: \`/api/fees/proof?path=\${encodeURIComponent(objectPath)}\` });
  } catch (error) { return fail(error); }
}
export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role)) throw new Error('Forbidden: Payment staff access required.');
    const objectPath = request.nextUrl.searchParams.get('path') || '';
    if (!/^[a-f0-9]{64}\\/[a-f0-9]{64}\\/[a-f0-9-]{36}\\.(png|jpe?g|webp|pdf)$/.test(objectPath)) throw new Error('Invalid payment proof path.');
    const [tenant, owner] = objectPath.split('/');
    if (tenant !== hash(tenantId(actor)) || (actor.role === 'counsellor' && owner !== hash(actor.id))) throw new Error('Forbidden: Payment proof belongs to another account.');
    if (isLiveSupabaseEnabled()) {
      try {
        const { data, error } = await createAdminClient().storage.from('payment-proofs').createSignedUrl(objectPath, 60);
        if (!error && data?.signedUrl) {
          return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
        }
      } catch (remoteErr: any) {
        console.warn('Live storage URL resolution unavailable, serving from local disk storage:', remoteErr.message);
      }
    }
    const bytes = await readFile(path.join(root, objectPath));`;

const proofRouteNew = `    if (isLiveSupabaseEnabled()) {
      const { error } = await createAdminClient().storage.from('payment-proofs').upload(objectPath, buffer, { contentType: mime[extension], upsert: false });
      if (error) {
        throw new Error(\`Payment proof upload to remote storage failed: \${error.message}\`);
      }
    } else {
      const target = path.join(root, objectPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer, { flag: 'wx' });
    }
    return NextResponse.json({ success: true, bucket: 'payment-proofs', path: objectPath, url: \`/api/fees/proof?path=\${encodeURIComponent(objectPath)}\` });
  } catch (error) { return fail(error); }
}
export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role)) throw new Error('Forbidden: Payment staff access required.');
    const objectPath = request.nextUrl.searchParams.get('path') || '';
    if (!/^[a-f0-9]{64}\\/[a-f0-9]{64}\\/[a-f0-9-]{36}\\.(png|jpe?g|webp|pdf)$/.test(objectPath)) throw new Error('Invalid payment proof path.');
    const [tenant, owner] = objectPath.split('/');
    if (tenant !== hash(tenantId(actor)) || (actor.role === 'counsellor' && owner !== hash(actor.id))) throw new Error('Forbidden: Payment proof belongs to another account.');
    if (isLiveSupabaseEnabled()) {
      const { data, error } = await createAdminClient().storage.from('payment-proofs').createSignedUrl(objectPath, 60);
      if (error || !data?.signedUrl) {
        throw new Error('Payment proof not found in remote storage.');
      }
      return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const bytes = await readFile(path.join(root, objectPath));`;

replaceInFile('app/api/fees/proof/route.ts', proofRouteOld, proofRouteNew);

// -------------------------------------------------------------
// Correction 5: Local actor authorization in lib/services/payment-workflow-transaction.ts
// -------------------------------------------------------------
const pwtOld = `    const currentActorProfile = (roster.data || []).find((u) => u.id === actor.id);
      if (!currentActorProfile || currentActorProfile.is_active === false) {
        throw new Error('Unauthorized: Actor is inactive or no longer in staff roster.');
      }
      actor.role = currentActorProfile.role;
      actor.is_active = currentActorProfile.is_active;
    }
    const userIndex = store.users.findIndex((u) => u.id === actor.id);
    if (userIndex < 0) store.users.push(actor); else store.users[userIndex] = actor;`;

const pwtNew = `    if (db) {
      const currentActorProfile = (roster.data || []).find((u) => u.id === actor.id);
      if (!currentActorProfile || currentActorProfile.is_active === false) {
        throw new Error('Unauthorized: Actor is inactive or no longer in staff roster.');
      }
      actor.role = currentActorProfile.role;
      actor.is_active = currentActorProfile.is_active;
    } else {
      const localProfile = (store.users || []).find((u) => u.id === actor.id);
      if (!localProfile || localProfile.is_active === false) {
        throw new Error('Unauthorized: Actor is inactive or no longer in staff roster.');
      }
      if (tenantId(localProfile) !== tenant) {
        throw new Error('Unauthorized: Actor belongs to another tenant.');
      }
      actor.role = localProfile.role;
      actor.is_active = localProfile.is_active;
      actor.tenant_id = localProfile.tenant_id;
    }`;

replaceInFile('lib/services/payment-workflow-transaction.ts', pwtOld, pwtNew);

console.log('All 5 backend corrections applied successfully!');
