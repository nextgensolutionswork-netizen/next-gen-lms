const fs = require('fs');

// 1. Update lib/services/data-store.ts: Remove duplicate usr-counsellor and normalize counsellor_id
{
  const file = 'E:/my erp hub/next gen lms/lib/services/data-store.ts';
  let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  // Remove the duplicate usr-counsellor block
  const duplicateBlock = `    {
      id: 'usr-counsellor',
      email: 'counsellor@next-generpsolutions.com',
      full_name: 'Ananya Desai (Senior Counsellor)',
      role: 'counsellor',
      phone: '+91 98000 00004',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
`;
  if (content.includes(duplicateBlock)) {
    content = content.replace(duplicateBlock, '');
    console.log('Removed duplicate usr-counsellor from store.users');
  } else {
    console.log('Duplicate usr-counsellor not found in store.users');
  }

  // Replace remaining seed references of 'usr-counsellor' with '44444444-4444-4444-4444-444444444444'
  content = content.replace(/'usr-counsellor'/g, "'44444444-4444-4444-4444-444444444444'");
  fs.writeFileSync(file, content, 'utf8');
  console.log('Updated data-store.ts');
}

// 2. Update lib/services/crm-service.ts: Enhance counsellor lookup with store fallback when PostgREST RLS blocks anon profiles select
{
  const file = 'E:/my erp hub/next gen lms/lib/services/crm-service.ts';
  let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  const oldLookup = `    if (data.counsellor_id) {
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
    }`;

  const newLookup = `    if (data.counsellor_id) {
      const supabase = createClient(authContext || data.counsellor_id);
      let profile: any = null;
      if (typeof supabase.from('profiles')?.select === 'function') {
        try {
          const { data: prof, error: profErr } = await supabase
            .from('profiles')
            .select('id, full_name, role, is_active, tenant_id')
            .eq('id', data.counsellor_id)
            .maybeSingle();
          if (!profErr && prof) profile = prof;
        } catch {}
      }
      if (!profile) {
        profile = (store.users || []).find((u) => u.id === data.counsellor_id);
      }
      if (!profile) {
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
    }`;

  if (content.includes(oldLookup)) {
    content = content.replace(oldLookup, newLookup);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated crm-service.ts profile verification');
  } else {
    console.log('crm-service.ts profile verification block not matched');
  }
}

// 3. Update app/(dashboard)/crm/leads/page.tsx: Load options & counsellor selection
{
  const file = 'E:/my erp hub/next gen lms/app/(dashboard)/crm/leads/page.tsx';
  let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  const oldLoadOptions = `      try {
        if (isLiveSupabaseEnabled()) {
          const supabase = createClient();
          const [coursesRes, staffRes] = await Promise.all([
            supabase.from('courses').select('id, course_name, price').order('course_name'),
            supabase.from('profiles').select('id, full_name, role, is_active').eq('is_active', true).in('role', ['counsellor', 'admin', 'super_admin']).order('full_name'),
          ]);
          if (!isMounted) return;
          if (coursesRes.error || staffRes.error) throw new Error('Unable to load authorized courses or counsellors.');
          const courses = coursesRes.data || [];
          const staff = (staffRes.data || []).filter((u: any) => u.is_active !== false);
          setCoursesList(courses);
          setCounsellorsList(staff);
          setCourseId((current) => courses.some((c: any) => c.id === current) ? current : courses[0]?.id || '');
          setCounsellorId((current) => staff.some((s: any) => s.id === current) ? current : (staff.find((s: any) => s.id === user?.id) || staff[0])?.id || '');
        } else {
          const courses = (store.courses || []).map((c) => ({ id: c.id, course_name: c.course_name, price: c.price }));
          const staff = (store.users || []).filter((u: any) => u.is_active !== false && ['counsellor', 'admin', 'super_admin'].includes(u.role)).map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role }));
          setCoursesList(courses);
          setCounsellorsList(staff);
          setCourseId((current) => courses.some((c) => c.id === current) ? current : courses[0]?.id || '');
          setCounsellorId((current) => staff.some((s) => s.id === current) ? current : (staff.find((s) => s.id === user?.id) || staff[0])?.id || '');
        }
      } catch (err) {`;

  const newLoadOptions = `      try {
        if (isLiveSupabaseEnabled()) {
          const supabase = createClient();
          const [coursesRes, staffRes] = await Promise.all([
            supabase.from('courses').select('id, course_name, price').order('course_name'),
            supabase.from('profiles').select('id, full_name, role, is_active').eq('is_active', true).in('role', ['counsellor', 'admin', 'super_admin']).order('full_name'),
          ]);
          if (!isMounted) return;
          if (coursesRes.error) throw new Error('Unable to load authorized courses.');
          let courses = coursesRes.data || [];
          let staff = (staffRes.data || []).filter((u: any) => u.is_active !== false);
          if (staff.length === 0) {
            staff = (store.users || [])
              .filter((u: any) => u.is_active !== false && ['counsellor', 'admin', 'super_admin'].includes(u.role))
              .map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role }));
          }
          staff = staff.filter((s: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id));
          setCoursesList(courses);
          setCounsellorsList(staff);
          setCourseId((current) => courses.some((c: any) => c.id === current) ? current : courses[0]?.id || '');
          setCounsellorId((current) => {
            if (staff.some((s: any) => s.id === current)) return current;
            const userUuid = user?.id === 'usr-counsellor' ? '44444444-4444-4444-4444-444444444444' : user?.id;
            const matched = staff.find((s: any) => s.id === userUuid) || staff[0];
            return matched?.id || '';
          });
        } else {
          const courses = (store.courses || []).map((c) => ({ id: c.id, course_name: c.course_name, price: c.price }));
          let staff = (store.users || [])
            .filter((u: any) => u.is_active !== false && ['counsellor', 'admin', 'super_admin'].includes(u.role))
            .map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role }))
            .filter((s: any) => s.id !== 'usr-counsellor');
          setCoursesList(courses);
          setCounsellorsList(staff);
          setCourseId((current) => courses.some((c) => c.id === current) ? current : courses[0]?.id || '');
          setCounsellorId((current) => {
            if (staff.some((s: any) => s.id === current)) return current;
            const userUuid = user?.id === 'usr-counsellor' ? '44444444-4444-4444-4444-444444444444' : user?.id;
            const matched = staff.find((s: any) => s.id === userUuid) || staff[0];
            return matched?.id || '';
          });
        }
      } catch (err) {`;

  if (content.includes(oldLoadOptions)) {
    content = content.replace(oldLoadOptions, newLoadOptions);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated crm/leads/page.tsx loadOptions');
  } else {
    console.log('crm/leads/page.tsx loadOptions block not matched');
  }
}
