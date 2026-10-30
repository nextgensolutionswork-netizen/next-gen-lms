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

// 1. Update crm/leads/page.tsx
const crmPageRefreshTarget = `  const refreshLeads = React.useCallback(() => {
    let list = [...(store.leads || [])];
    if (selectedStage !== 'All') {
      list = list.filter((l) => l.stage === selectedStage);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.full_name?.toLowerCase().includes(q) ||
          l.phone?.includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.lead_code?.toLowerCase().includes(q)
      );
    }
    setLeads(list);
  }, [search, selectedStage]);`;

const crmPageRefreshReplacement = `  const refreshLeads = React.useCallback(async () => {
    try {
      const serverLeads = await getLeads();
      let list = [...serverLeads];
      if (selectedStage !== 'All') {
        list = list.filter((l) => l.stage === selectedStage);
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        list = list.filter(
          (l) =>
            l.full_name?.toLowerCase().includes(q) ||
            l.phone?.includes(q) ||
            l.email?.toLowerCase().includes(q) ||
            l.lead_code?.toLowerCase().includes(q)
        );
      }
      setLeads(list);
    } catch {
      let list = [...(store.leads || [])];
      if (selectedStage !== 'All') {
        list = list.filter((l) => l.stage === selectedStage);
      }
      setLeads(list);
    }
  }, [search, selectedStage]);

  React.useEffect(() => {
    let isMounted = true;
    const loadOptions = async () => {
      setIsLoadingOptions(true);
      setOptionsLoadError(null);
      try {
        if (isLiveSupabaseEnabled()) {
          const supabase = createClient();
          const [coursesRes, staffRes] = await Promise.all([
            supabase.from('courses').select('id, course_name, price').order('course_name'),
            supabase.from('profiles').select('id, full_name, role, is_active').eq('is_active', true).in('role', ['counsellor', 'admin', 'super_admin']).order('full_name'),
          ]);
          if (!isMounted) return;
          const courses = coursesRes.data || [];
          const staff = (staffRes.data || []).filter((u) => u.is_active !== false);
          setCoursesList(courses);
          setCounsellorsList(staff);
          if (courses.length > 0 && !courseId) {
            setCourseId(courses[0].id);
          }
          if (staff.length > 0 && !counsellorId) {
            const defaultStaff = staff.find((s) => s.id === user?.id) || staff[0];
            setCounsellorId(defaultStaff?.id || staff[0].id);
          }
        } else {
          const courses = (store.courses || []).map((c) => ({ id: c.id, course_name: c.course_name, price: c.price }));
          const staff = (store.users || []).filter((u) => u.is_active !== false && ['counsellor', 'admin', 'super_admin'].includes(u.role)).map((u) => ({ id: u.id, full_name: u.full_name, role: u.role }));
          setCoursesList(courses);
          setCounsellorsList(staff);
          if (courses.length > 0 && !courseId) {
            setCourseId(courses[0].id);
          }
          if (staff.length > 0 && !counsellorId) {
            const defaultStaff = staff.find((s) => s.id === user?.id) || staff[0];
            setCounsellorId(defaultStaff?.id || staff[0].id);
          }
        }
      } catch (err) {
        if (isMounted) setOptionsLoadError('Failed to load courses or counsellors.');
      } finally {
        if (isMounted) setIsLoadingOptions(false);
      }
    };
    loadOptions();
    return () => { isMounted = false; };
  }, [user?.id]);`;

replaceInFile('app/(dashboard)/crm/leads/page.tsx', crmPageRefreshTarget, crmPageRefreshReplacement);

// Update dropdowns in crm/leads/page.tsx
const crmDropdownsTarget = `              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              >
                {(store.courses || []).length === 0 ? (
                  <option value="">No courses available</option>
                ) : (
                  (store.courses || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Assigned Counsellor *
              </label>
              <select
                value={counsellorId}
                onChange={(e) => setCounsellorId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              >
                {availableCounsellors.length === 0 ? (
                  <option value={user?.id || ''}>{user?.full_name || 'Current User'} (Staff)</option>
                ) : (
                  availableCounsellors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.role})
                    </option>
                  ))
                )}
              </select>`;

const crmDropdownsReplacement = `              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
                required
              >
                {isLoadingOptions ? (
                  <option value="">Loading courses...</option>
                ) : coursesList.length === 0 ? (
                  <option value="">No courses available</option>
                ) : (
                  coursesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Assigned Counsellor *
              </label>
              <select
                value={counsellorId}
                onChange={(e) => setCounsellorId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
                required
              >
                {isLoadingOptions ? (
                  <option value="">Loading counsellors...</option>
                ) : counsellorsList.length === 0 ? (
                  <option value={user?.id || ''}>{user?.full_name || 'Current User'} (Staff)</option>
                ) : (
                  counsellorsList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.role})
                    </option>
                  ))
                )}
              </select>`;

replaceInFile('app/(dashboard)/crm/leads/page.tsx', crmDropdownsTarget, crmDropdownsReplacement);

// 2. Update admissions/page.tsx
const admissionsImportTarget = `import { createAdmissionWorkflow, getAdmissions } from '@/lib/services/admission-service';`;
const admissionsImportReplacement = `import { createAdmissionWorkflow, getAdmissions } from '@/lib/services/admission-service';
import { getCourses } from '@/lib/services/academics-service';`;

replaceInFile('app/(dashboard)/admissions/page.tsx', admissionsImportTarget, admissionsImportReplacement);

const admissionsMountTarget = `  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const leadId = params.get('convertLeadId');
      if (leadId) {
        setConvertedLeadId(leadId);
        const lead = store.leads.find((l) => l.id === leadId);
        if (lead) {
          setName(lead.full_name || '');
          setPhone(lead.phone || '');
          setEmail(lead.email || '');
          if (lead.interested_course_id) {
            setCourseId(lead.interested_course_id);
            const matchingBatches = (store.batches || []).filter((b) => b.course_id === lead.interested_course_id);
            const availableBatch = matchingBatches.find(
              (b) => (b.current_enrolled || 0) < (b.maximum_capacity ?? 25)
            );
            setBatchId(availableBatch?.id || '');
          }
          if (lead.counsellor_id) {
            setCounsellorId(lead.counsellor_id);
          }
          if (lead.training_preference) {
            setTrainingMode(lead.training_preference);
          }
          if (lead.experience_years) {
            setExperienceYears(lead.experience_years);
          }
          if (lead.current_status) {
            setEducation(lead.current_status);
          }
          setIsNewModalOpen(true);
        }
      }
    }
  }, []);`;

const admissionsMountReplacement = `  React.useEffect(() => {
    let isMounted = true;
    const initAdmissions = async () => {
      try {
        await getCourses();
      } catch (e) {
        console.warn('Failed to prefetch courses in admissions page:', e);
      }
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const leadId = params.get('convertLeadId');
        if (leadId) {
          setConvertedLeadId(leadId);
          let lead = store.leads.find((l) => l.id === leadId);
          if (!lead) {
            try {
              const { getLeads } = await import('@/lib/services/crm-service');
              const allLeads = await getLeads();
              lead = allLeads.find((l) => l.id === leadId);
            } catch {}
          }
          if (lead && isMounted) {
            setName(lead.full_name || '');
            setPhone(lead.phone || '');
            setEmail(lead.email || '');
            if (lead.interested_course_id) {
              setCourseId(lead.interested_course_id);
              const matchingBatches = (store.batches || []).filter((b) => b.course_id === lead.interested_course_id);
              const availableBatch = matchingBatches.find(
                (b) => (b.current_enrolled || 0) < (b.maximum_capacity ?? 25)
              );
              setBatchId(availableBatch?.id || '');
            }
            if (lead.counsellor_id) {
              setCounsellorId(lead.counsellor_id);
            }
            if (lead.training_preference) {
              setTrainingMode(lead.training_preference);
            }
            if (lead.experience_years) {
              setExperienceYears(lead.experience_years);
            }
            if (lead.current_status) {
              setEducation(lead.current_status);
            }
            setIsNewModalOpen(true);
          }
        }
      }
    };
    initAdmissions();
    return () => { isMounted = false; };
  }, []);`;

replaceInFile('app/(dashboard)/admissions/page.tsx', admissionsMountTarget, admissionsMountReplacement);

// 3. Update file-upload.tsx error message
const fileUploadTarget = `      if (bucket === 'payment-proofs') {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Payment proof upload failed. Please retry.');
      }`;

const fileUploadReplacement = `      if (bucket === 'payment-proofs') {
        const error = await res.json().catch(() => ({}));
        let errMsg = error.error || 'Payment proof upload failed. Please retry.';
        if (/fetch failed/i.test(errMsg)) {
          errMsg = 'Payment proof upload failed: Remote storage service is unreachable.';
        }
        throw new Error(errMsg);
      }`;

replaceInFile('components/ui/file-upload.tsx', fileUploadTarget, fileUploadReplacement);

// 4. Update proof/route.ts fail function
const proofFailTarget = `function fail(error: unknown) {
  const message = error instanceof Error ? error.message : 'Payment proof operation failed.';
  return NextResponse.json({ success: false, error: message }, { status: message.startsWith('Unauthorized') ? 401 : /Forbidden/.test(message) ? 403 : 400 });
}`;

const proofFailReplacement = `function fail(error: unknown) {
  let message = error instanceof Error ? error.message : 'Payment proof operation failed.';
  if (/fetch failed/i.test(message)) {
    message = 'Payment proof upload failed: Remote storage service is unreachable.';
  }
  return NextResponse.json({ success: false, error: message }, { status: message.startsWith('Unauthorized') ? 401 : /Forbidden/.test(message) ? 403 : 400 });
}`;

replaceInFile('app/api/fees/proof/route.ts', proofFailTarget, proofFailReplacement);
