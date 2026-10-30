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

// 1. Update crm-service.ts
const crmServiceTarget = `  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (isLiveSupabaseEnabled()) {
    if (data.interested_course_id && !UUID_REGEX.test(data.interested_course_id)) {
      throw new Error('Invalid course ID: Course must be selected from authorized database records (valid UUID required).');
    }
    if (data.counsellor_id && !UUID_REGEX.test(data.counsellor_id)) {
      throw new Error('Invalid counsellor ID: Counsellor must be selected from authorized staff roster (valid UUID required).');
    }
  } else {
    if (data.counsellor_id && data.counsellor_id !== 'usr-unassigned') {
      const localCounsellor = (store.users || []).find((u) => u.id === data.counsellor_id);
      if (localCounsellor && localCounsellor.is_active === false) {
        throw new Error('Invalid counsellor ID: Assigned counsellor is inactive.');
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
  };`;

const crmServiceReplacement = `  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let verifiedCounsellorName = counsellor?.full_name;

  if (isLiveSupabaseEnabled()) {
    if (data.interested_course_id && !UUID_REGEX.test(data.interested_course_id)) {
      throw new Error('Invalid course ID: Course must be selected from authorized database records (valid UUID required).');
    }
    if (data.counsellor_id && !UUID_REGEX.test(data.counsellor_id)) {
      throw new Error('Invalid counsellor ID: Counsellor must be selected from authorized staff roster (valid UUID required).');
    }
    if (data.counsellor_id) {
      const supabase = createClient(authContext || data.counsellor_id);
      if (typeof supabase.from('profiles')?.select === 'function') {
        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('id, full_name, role, is_active, tenant_id')
          .eq('id', data.counsellor_id)
          .maybeSingle();

        if (profErr || !profile) {
          throw new Error('Invalid counsellor ID: Selected counsellor does not exist in authorized staff roster.');
        }
        if (profile.is_active === false) {
          throw new Error('Invalid counsellor ID: Assigned counsellor is inactive.');
        }
        if (!['counsellor', 'admin', 'super_admin'].includes(profile.role)) {
          throw new Error('Invalid counsellor ID: Assigned staff member is not authorized for lead counselling.');
        }
        if (authContext?.tenant_id && profile.tenant_id && profile.tenant_id !== authContext.tenant_id) {
          throw new Error('Invalid counsellor ID: Counsellor belongs to another tenant.');
        }
        verifiedCounsellorName = profile.full_name;
      }
    }
  } else {
    if (data.counsellor_id && data.counsellor_id !== 'usr-unassigned') {
      const localCounsellor = (store.users || []).find((u) => u.id === data.counsellor_id);
      if (!localCounsellor) {
        throw new Error('Invalid counsellor ID: Selected counsellor does not exist in authorized staff roster.');
      }
      if (localCounsellor.is_active === false) {
        throw new Error('Invalid counsellor ID: Assigned counsellor is inactive.');
      }
      if (!['counsellor', 'admin', 'super_admin'].includes(localCounsellor.role)) {
        throw new Error('Invalid counsellor ID: Assigned staff member is not authorized for lead counselling.');
      }
      if (authContext?.tenant_id && localCounsellor.tenant_id && localCounsellor.tenant_id !== authContext.tenant_id) {
        throw new Error('Invalid counsellor ID: Counsellor belongs to another tenant.');
      }
      verifiedCounsellorName = localCounsellor.full_name;
    }
  }

  const newLead: Lead = {
    ...data,
    id: newId,
    lead_code,
    interested_course_name: course?.course_name,
    counsellor_name: verifiedCounsellorName,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };`;

replaceInFile('lib/services/crm-service.ts', crmServiceTarget, crmServiceReplacement);

// 2. Update app/(dashboard)/crm/leads/page.tsx
const crmLeadPageHookTarget = `  React.useEffect(() => {
    if (user?.id && !counsellorId) {
      setCounsellorId(user.id);
    }
  }, [user?.id, counsellorId]);`;

replaceInFile('app/(dashboard)/crm/leads/page.tsx', crmLeadPageHookTarget, '// Submissions use authoritative counsellorId from loaded counsellorsList; no blind user.id override');

const crmLeadPageLoadStaffTarget = `          const courses = coursesRes.data || [];
          const staff = (staffRes.data || []).filter((u: any) => u.is_active !== false);
          setCoursesList(courses);
          setCounsellorsList(staff);
          if (courses.length > 0 && !courseId) {
            setCourseId(courses[0].id);
          }
          if (staff.length > 0 && !counsellorId) {
            const defaultStaff = staff.find((s: any) => s.id === user?.id) || staff[0];
            setCounsellorId(defaultStaff?.id || staff[0].id);
          }
        } else {
          const courses = (store.courses || []).map((c) => ({ id: c.id, course_name: c.course_name, price: c.price }));
          const staff = (store.users || []).filter((u: any) => u.is_active !== false && ['counsellor', 'admin', 'super_admin'].includes(u.role)).map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role }));
          setCoursesList(courses);
          setCounsellorsList(staff);
          if (courses.length > 0 && !courseId) {
            setCourseId(courses[0].id);
          }
          if (staff.length > 0 && !counsellorId) {
            const defaultStaff = staff.find((s: any) => s.id === user?.id) || staff[0];
            setCounsellorId(defaultStaff?.id || staff[0].id);
          }`;

const crmLeadPageLoadStaffReplacement = `          const courses = coursesRes.data || [];
          const staff = (staffRes.data || []).filter((u: any) => u.is_active !== false);
          setCoursesList(courses);
          setCounsellorsList(staff);
          if (courses.length > 0 && (!courseId || !courses.some((c) => c.id === courseId))) {
            setCourseId(courses[0].id);
          }
          const matchedStaff = staff.find((s: any) => s.id === user?.id || (s.email && user?.email && s.email.toLowerCase() === user.email.toLowerCase()));
          const defaultCounsellor = matchedStaff || staff[0];
          if (defaultCounsellor && (!counsellorId || !staff.some((s: any) => s.id === counsellorId))) {
            setCounsellorId(defaultCounsellor.id);
          }
        } else {
          const courses = (store.courses || []).map((c) => ({ id: c.id, course_name: c.course_name, price: c.price }));
          const staff = (store.users || []).filter((u: any) => u.is_active !== false && ['counsellor', 'admin', 'super_admin'].includes(u.role)).map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role }));
          setCoursesList(courses);
          setCounsellorsList(staff);
          if (courses.length > 0 && (!courseId || !courses.some((c) => c.id === courseId))) {
            setCourseId(courses[0].id);
          }
          const matchedStaff = staff.find((s: any) => s.id === user?.id || (s.email && user?.email && s.email.toLowerCase() === user.email.toLowerCase()));
          const defaultCounsellor = matchedStaff || staff[0];
          if (defaultCounsellor && (!counsellorId || !staff.some((s: any) => s.id === counsellorId))) {
            setCounsellorId(defaultCounsellor.id);
          }`;

replaceInFile('app/(dashboard)/crm/leads/page.tsx', crmLeadPageLoadStaffTarget, crmLeadPageLoadStaffReplacement);

const crmSubmitTarget = `    const assignedCounsellorId = counsellorId || user.id || availableCounsellors[0]?.id;
    if (!assignedCounsellorId) {
      setCreateLeadError('Please select an assigned counsellor.');
      return;
    }`;

const crmSubmitReplacement = `    if (!courseId || (coursesList.length > 0 && !coursesList.some((c) => c.id === courseId))) {
      setCreateLeadError('Please select an interested SAP course.');
      return;
    }
    if (!counsellorId || !counsellorsList.some((c) => c.id === counsellorId)) {
      setCreateLeadError('Invalid counsellor selection: Please select an authorized counsellor from the staff roster.');
      return;
    }
    const assignedCounsellorId = counsellorId;`;

replaceInFile('app/(dashboard)/crm/leads/page.tsx', crmSubmitTarget, crmSubmitReplacement);

const crmEmptyOptionTarget = `                {isLoadingOptions ? (
                  <option value="">Loading counsellors...</option>
                ) : counsellorsList.length === 0 ? (
                  <option value={user?.id || ''}>{user?.full_name || 'Current User'} (Staff)</option>
                ) : (`;

const crmEmptyOptionReplacement = `                {isLoadingOptions ? (
                  <option value="">Loading counsellors...</option>
                ) : counsellorsList.length === 0 ? (
                  <option value="">No authorized counsellors available</option>
                ) : (`;

replaceInFile('app/(dashboard)/crm/leads/page.tsx', crmEmptyOptionTarget, crmEmptyOptionReplacement);
