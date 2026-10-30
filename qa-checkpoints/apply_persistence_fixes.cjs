const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, search, replacement) {
  const fullPath = path.resolve(filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  // Normalize both to CRLF or LF for matching
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

// 1. Update admission-service.ts
const admissionServiceTarget = `  if (typeof window !== 'undefined') {
    const { paymentWorkflowClient } = await import('./payment-workflow-client');
    const serverResult = await paymentWorkflowClient.createAdmission(input);
    if (serverResult && serverResult.admission) {
      return serverResult;
    }
    throw new Error('Server admission creation did not return a valid admission record.');
  }
  const performingUser =
    store.users.find((u) => u.id === performedByUserId || u.email === performedByUserId) ||
    store.users.find((u) => ['counsellor', 'admin', 'super_admin'].includes(u.role) && u.is_active !== false) ||
    store.users[0];`;

const admissionServiceReplacement = `  if (typeof window !== 'undefined') {
    const { paymentWorkflowClient } = await import('./payment-workflow-client');
    const serverResult = await paymentWorkflowClient.createAdmission(input);
    if (serverResult && serverResult.admission) {
      return serverResult;
    }
    throw new Error('Server admission creation did not return a valid admission record.');
  }

  // Authoritative server path: If not already inside an active paymentTransaction, redirect into it
  if (!transactional) {
    const { paymentTransaction } = await import('./payment-workflow-transaction');
    const actor =
      store.users.find((u) => u.id === performedByUserId || u.email === performedByUserId) ||
      store.users.find((u) => ['counsellor', 'admin', 'super_admin'].includes(u.role) && u.is_active !== false) ||
      store.users[0];
    return paymentTransaction(actor, () => createAdmissionWorkflow(input, performedByUserId, true));
  }

  const performingUser =
    store.users.find((u) => u.id === performedByUserId || u.email === performedByUserId) ||
    store.users.find((u) => ['counsellor', 'admin', 'super_admin'].includes(u.role) && u.is_active !== false) ||
    store.users[0];`;

replaceInFile('lib/services/admission-service.ts', admissionServiceTarget, admissionServiceReplacement);

// Remove unsafe sequential direct PostgREST calls from admission-service.ts
const directSupabaseTarget = `  // Direct Supabase queries utilizing PostgreSQL schema migrations
  if (isLiveSupabaseEnabled() && !transactional) {
    try {
      const supabase = createClient();

    // 1. Direct insert to admissions table
    await supabase.from('admissions').insert({
      id: newAdmission.id,
      admission_number: newAdmission.admission_number,
      student_name: newAdmission.student_name,
      phone: newAdmission.phone,
      email: newAdmission.email,
      dob: newAdmission.dob,
      gender: newAdmission.gender,
      address: newAdmission.address,
      city: newAdmission.city,
      education: newAdmission.education,
      experience_years: newAdmission.experience_years,
      current_employment_status: newAdmission.current_employment_status,
      course_id: newAdmission.course_id,
      training_mode: newAdmission.training_mode,
      batch_id: newAdmission.batch_id,
      trainer_id: newAdmission.trainer_id,
      admission_date: newAdmission.admission_date,
      course_fee: newAdmission.course_fee,
      discount: newAdmission.discount,
      discount_reason: newAdmission.discount_reason,
      net_payable: newAdmission.net_payable,
      payment_plan: newAdmission.payment_plan,
      counsellor_id: newAdmission.counsellor_id,
      status: newAdmission.status,
      lead_id: (newAdmission as any).lead_id || null,
    });

    // 2. Direct insert to students table
    await supabase.from('students').insert({
      id: newStudent.id,
      user_id: newStudent.user_id,
      admission_id: newAdmission.id,
      student_code: newStudent.student_code,
      admission_number: newStudent.admission_number,
      full_name: newStudent.full_name,
      email: newStudent.email,
      phone: newStudent.phone,
      address: newStudent.address,
      course_id: newStudent.course_id,
      batch_id: newStudent.batch_id,
      trainer_id: newStudent.trainer_id,
      joining_date: newStudent.joining_date,
      status: newStudent.status,
      total_fee: newStudent.total_fee,
      paid_amount: newStudent.paid_amount,
      outstanding_amount: newStudent.outstanding_amount,
      attendance_percentage: newStudent.attendance_percentage,
      course_progress: newStudent.course_progress,
      placement_status: newStudent.placement_status,
    });

    // 3. Direct insert to student_fee_accounts table
    await supabase.from('student_fee_accounts').insert({
      id: newFeeAccount.id,
      student_id: newStudent.id,
      admission_id: newAdmission.id,
      course_id: newFeeAccount.course_id,
      original_fee: newFeeAccount.original_fee,
      discount: newFeeAccount.discount,
      discount_reason: newFeeAccount.discount_reason,
      net_payable: newFeeAccount.net_payable,
      paid_amount: newFeeAccount.paid_amount,
      outstanding_amount: newFeeAccount.outstanding_amount,
      payment_plan: newFeeAccount.payment_plan,
      status: newFeeAccount.status,
    });

    // 5. Direct update to leads table if converted
    if (input.lead_id) {
      await supabase
        .from('leads')
        .update({
          stage: 'Converted',
          notes: \`Converted to Admission: \${admission_number}\`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.lead_id);
    }
    } catch (err) {
      console.warn('Supabase direct admission insert warning, preserved in local persistent storage:', err);
    }
  }`;

replaceInFile('lib/services/admission-service.ts', directSupabaseTarget, '// Unsafe sequential relational path removed: authoritative persistence handled atomically via paymentTransaction');

// 2. Update payment-workflow-transaction.ts
const pwTxTarget = `      const [state, roster] = await Promise.all([
        db.from('fee_workflow_state').select('revision, snapshot').eq('tenant_id', tenant).maybeSingle(),
        db.from('profiles').select('*').eq('tenant_id', tenant),
      ]);`;

const pwTxReplacement = `      const [state, roster, liveLeads] = await Promise.all([
        db.from('fee_workflow_state').select('revision, snapshot').eq('tenant_id', tenant).maybeSingle(),
        db.from('profiles').select('*').eq('tenant_id', tenant),
        db.from('leads').select('*').order('created_at', { ascending: false }),
      ]);`;

replaceInFile('lib/services/payment-workflow-transaction.ts', pwTxTarget, pwTxReplacement);

const pwMergeTarget = `      if (data) {
        revision = data.revision;
        mergeWorkflowSnapshot(data.snapshot, tenant);
      } else {`;

const pwMergeReplacement = `      if (data) {
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

replaceInFile('lib/services/payment-workflow-transaction.ts', pwMergeTarget, pwMergeReplacement);

const pwCommitTarget = `        if (db) {
          const response = await db.rpc('commit_fee_workflow', { p_tenant: tenant, p_revision: revision, p_snapshot: snapshot });
          if (response.error || !response.data) throw new Error('Conflict: Payment state changed or could not be committed. Refresh and retry.');
        } else if (!store.persistSync()) {`;

const pwCommitReplacement = `        if (db) {
          const response = await db.rpc('commit_fee_workflow', { p_tenant: tenant, p_revision: revision, p_snapshot: snapshot });
          if (response.error || !response.data) throw new Error('Conflict: Payment state changed or could not be committed. Refresh and retry.');

          // Synchronize converted leads to relational public.leads table
          const convertedLeads = store.leads.filter(
            (l) => l.stage === 'Converted' && (before.leads as any[])?.find((b) => b.id === l.id)?.stage !== 'Converted'
          );
          for (const cl of convertedLeads) {
            try {
              await db.from('leads').update({
                stage: 'Converted',
                notes: cl.notes,
                updated_at: cl.updated_at || new Date().toISOString(),
              }).eq('id', cl.id);
            } catch (leadSyncErr) {
              console.warn('Failed to sync converted lead stage to relational table:', leadSyncErr);
            }
          }
        } else if (!store.persistSync()) {`;

replaceInFile('lib/services/payment-workflow-transaction.ts', pwCommitTarget, pwCommitReplacement);
