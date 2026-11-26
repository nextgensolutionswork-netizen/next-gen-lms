'use client';
import { cachedLeads } from '@/lib/services/lead-cache';
import { useDataSync } from '@/lib/hooks/use-data-sync';

import { getRoleLabel } from '@/lib/utils/role-labels';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  Upload,
  Download,
  ShieldAlert,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PhoneInput } from '@/components/ui/phone-input';
import { BulkImportModal } from '@/components/bulk-import-modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { Lead, LeadStage, LeadCurrentStatus, LeadTrainingPreference, LeadSource, Course } from '@/types';
import { getCourses, createBatch } from '@/lib/services/academics-service';
import {
  getLeads,
  createLead,
  updateLeadStage,
  updateLeadDetails,
  bulkAssignLeads,
  bulkUpdateLeadStage,
  getLeadAdmission,
  getLeadHistoricalAdmissionNumber,
  classifyLeadConversion,
  isLeadConverted,
} from '@/lib/services/crm-service';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import {
  getEligibleAdmissionsCounsellors,
  fetchAuthoritativeCounsellors,
  EligibleCounsellorOption,
} from '@/lib/services/counsellor-service';
import { tenantId } from '@/lib/auth/tenant';
import { formatDate, exportToCSV } from '@/lib/utils/formatters';
import {
  validatePhoneNumber,
  findDuplicateLeadByPhone,
  parseStoredPhone,
  getCanonicalPhoneDigits,
  formatDisplayPhone,
  DEFAULT_COUNTRY,
} from '@/lib/utils/phone-validation';
import { validateEmailAddress } from '@/lib/utils/email-validation';

const CURRENT_STATUS_OPTIONS: LeadCurrentStatus[] = [
  'Fresher',
  'Career Gap',
  'Working Professional',
  'Experienced + Career Gap',
];

const LEAD_SOURCE_OPTIONS: LeadSource[] = [
  'Website',
  'Google Ads',
  'Meta Ads',
  'YouTube',
  'Referral',
  'Walk-in',
  'Other',
];

function getDefaultFollowUpDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

export default function LeadsPage() {
  const router = useRouter();
  const { user, role, hasPermission } = useAuth();
  const [leadSnapshot, setLeadSnapshot] = React.useState<{ owner?: string; rows: Lead[] }>({ rows: [] });
  const leads = leadSnapshot.owner === user?.id ? leadSnapshot.rows : [];
  const [creatorFilter, setCreatorFilter] = React.useState('');
  const [salespersonFilter, setSalespersonFilter] = React.useState('');
  const [courseFilter, setCourseFilter] = React.useState('');
  const [teamFilter, setTeamFilter] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const [selectedStage, setSelectedStage] = React.useState<string>('All');
  const [selectedTrainingMode, setSelectedTrainingMode] = React.useState<string>('All');
  const [selectedSource, setSelectedSource] = React.useState<string>('All');
  const [summary, setSummary] = React.useState<any>(null);
  const visibleSummary = summary?.owner === user?.id ? summary : null;

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      search: debouncedSearch.trim(),
      stage: selectedStage,
      training_preference: selectedTrainingMode === 'All' ? '' : selectedTrainingMode,
      lead_source: selectedSource === 'All' ? '' : selectedSource,
      created_by: creatorFilter,
      counsellor_id: salespersonFilter,
      course_id: courseFilter,
      team_id: teamFilter,
      from: dateFrom,
      to: dateTo,
    });
    fetch('/api/crm/summary?' + params, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setSummary({ ...data, owner: user?.id });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setSummary(null);
      });
    return () => {
      controller.abort();
    };
  }, [
    user?.id,
    role,
    leadSnapshot.rows.length,
    creatorFilter,
    salespersonFilter,
    courseFilter,
    teamFilter,
    dateFrom,
    dateTo,
    debouncedSearch,
    selectedStage,
    selectedTrainingMode,
    selectedSource,
  ]);
  const scopeLabel = role === 'counsellor' ? 'My' : role === 'counsellor_lead' ? 'My Team' : 'All';
  const [isLoading, setIsLoading] = React.useState(true);


  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = React.useState(false);
  const [isConverting, setIsConverting] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

  // Bulk Selection & Action State
  const [selectedLeadIds, setSelectedLeadIds] = React.useState<string[]>([]);
  const [bulkCounsellorId, setBulkCounsellorId] = React.useState<string>('');
  const [bulkStage, setBulkStage] = React.useState<LeadStage>('Follow-up');
  const [isBulkProcessing, setIsBulkProcessing] = React.useState(false);

  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSelectedLead(null);
      setSelectedLeadIds([]);
      setIsConvertModalOpen(false);
      setIsAddModalOpen(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [user?.id]);

  const [authoritativeCounsellors, setAuthoritativeCounsellors] = React.useState<EligibleCounsellorOption[]>([]);

  React.useEffect(() => {
    let isMounted = true;
    async function syncCounsellors() {
      try {
        const currentTenant = (user && tenantId(user)) || 'default';
        const data = await fetchAuthoritativeCounsellors(currentTenant);
        if (isMounted && data && data.length > 0) {
          setAuthoritativeCounsellors(data);
        }
      } catch (err) {
        console.warn('[CRM Leads] Failed to load authoritative counsellors:', err);
      }
    }
    syncCounsellors();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const availableCounsellors = React.useMemo(() => {
    if (authoritativeCounsellors.length > 0) {
      return authoritativeCounsellors;
    }
    const currentTenant = (user && tenantId(user)) || 'default';
    return getEligibleAdmissionsCounsellors(store.users || [], currentTenant);
  }, [authoritativeCounsellors, user]);

  const canAccessCrm =
    hasPermission('crm:read') ||
    (role === 'counsellor' || role === 'counsellor_lead') ||
    role === 'admin' ||
    role === 'super_admin';
  const canCreateLead =
    hasPermission('crm:write') ||
    role === 'counsellor' ||
    role === 'admin' ||
    role === 'super_admin';
  const canConvert =
    hasPermission('crm:convert') ||
    role === 'counsellor' ||
    role === 'admin' ||
    role === 'super_admin';
  const canExport =
    role === 'super_admin' ||
    role === 'admin' ||
    hasPermission('crm:read');

  const handleExportCSV = () => {
    const exportData = leads.map((l) => ({
      'Lead Code': l.lead_code,
      'Full Name': l.full_name,
      'Country Code': l.country_code || '+91',
      'Phone': l.phone,
      'WhatsApp Country Code': l.whatsapp_country_code || l.country_code || '+91',
      'WhatsApp Number': l.whatsapp_number || l.phone,
      'Email': l.email,
      'Interested Course': l.interested_course_name || 'N/A',
      'Training Preference': l.training_preference || 'Online',
      'Lead Source': l.lead_source || 'Website',
      'Current Status': l.current_status || 'Working Professional',
      'Stage': l.stage,
      'Sales': l.counsellor_name || 'Unassigned',
      'Follow-up Date': l.follow_up_date ? formatDate(l.follow_up_date) : 'N/A',
      'Created Date': formatDate(l.created_at),
    }));
    exportToCSV(`crm_leads_export_${new Date().toISOString().slice(0, 10)}`, exportData);
  };

  // --- New Lead Form state ---
  const [fullName, setFullName] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('+91');
  const [phone, setPhone] = React.useState('');
  const [phoneError, setPhoneError] = React.useState('');
  const [phoneDuplicateWarning, setPhoneDuplicateWarning] = React.useState('');

  // WhatsApp form state
  const [isWhatsAppSame, setIsWhatsAppSame] = React.useState(true);
  const [whatsappCountryCode, setWhatsappCountryCode] = React.useState('+91');
  const [whatsappNumber, setWhatsappNumber] = React.useState('');
  const [whatsappError, setWhatsappError] = React.useState('');

  const [courses, setCourses] = React.useState<Course[]>(store.courses);
  const publishedCourses = React.useMemo(() => {
    return (courses || store.courses || []).filter((c) => !c.status || c.status === 'Published');
  }, [courses]);

  const [courseId, setCourseId] = React.useState(courses[0]?.id || store.courses?.[0]?.id || '');
  const [convertCourseId, setConvertCourseId] = React.useState(courses[0]?.id || store.courses?.[0]?.id || '');
  const [convertCourseFee, setConvertCourseFee] = React.useState<number>(courses[0]?.price || store.courses?.[0]?.price || 0);

  React.useEffect(() => {
    let isMounted = true;
    getCourses()
      .then((data) => {
        if (isMounted && data && data.length > 0) {
          setCourses(data);
          if (!courseId && data[0]?.id) setCourseId(data[0].id);
          if (!convertCourseId && data[0]?.id) {
            setConvertCourseId(data[0].id);
            setConvertCourseFee(data[0].price ?? 0);
          }
        }
      })
      .catch((err) => console.warn('[CRM] Failed to load authoritative courses:', err));
    return () => {
      isMounted = false;
    };
  }, [courseId, convertCourseId]);

  const [email, setEmail] = React.useState('');
  const [emailError, setEmailError] = React.useState('');
  const [counsellorId, setCounsellorId] = React.useState<string>(user?.id || '');
  const [currentStatus, setCurrentStatus] = React.useState<LeadCurrentStatus>('Working Professional');
  const [trainingPref, setTrainingPref] = React.useState<'Online' | 'Offline'>('Online');
  const [source, setSource] = React.useState<LeadSource>('Website');
  const [notes, setNotes] = React.useState('');
  const [experience, setExperience] = React.useState('');
  const [experienceError, setExperienceError] = React.useState('');
  const [dob, setDob] = React.useState('');
  const [address, setAddress] = React.useState('');

  // --- Edit Lead / Update Stage state ---
  const [modalTab, setModalTab] = React.useState<'stage' | 'details'>('stage');
  const [editFullName, setEditFullName] = React.useState('');
  const [editCountryCode, setEditCountryCode] = React.useState('+91');
  const [editPhone, setEditPhone] = React.useState('');
  const [editPhoneError, setEditPhoneError] = React.useState('');
  const [editPhoneDuplicateWarning, setEditPhoneDuplicateWarning] = React.useState('');

  const [editIsWaSame, setEditIsWaSame] = React.useState(true);
  const [editWaCountryCode, setEditWaCountryCode] = React.useState('+91');
  const [editWaNumber, setEditWaNumber] = React.useState('');
  const [editWaError, setEditWaError] = React.useState('');

  const [editEmail, setEditEmail] = React.useState('');
  const [editEmailError, setEditEmailError] = React.useState('');
  const [editCourseId, setEditCourseId] = React.useState('');
  const [editCounsellorId, setEditCounsellorId] = React.useState('');
  const [editCurrentStatus, setEditCurrentStatus] = React.useState<LeadCurrentStatus>('Working Professional');
  const [editTrainingPref, setEditTrainingPref] = React.useState<'Online' | 'Offline'>('Online');
  const [editSource, setEditSource] = React.useState<LeadSource>('Website');
  const [editNotes, setEditNotes] = React.useState('');
  const [editExperience, setEditExperience] = React.useState('');
  const [editDob, setEditDob] = React.useState('');
  const [editAddress, setEditAddress] = React.useState('');
  const [isSavingDetails, setIsSavingDetails] = React.useState(false);
  const [saveDetailsError, setSaveDetailsError] = React.useState('');

  // Follow-up notes update state
  const [updateNotes, setUpdateNotes] = React.useState('');
  const [nextStage, setNextStage] = React.useState<LeadStage>('Follow-up');
  const [followUpDate, setFollowUpDate] = React.useState(() => getDefaultFollowUpDate());
  const [followUpTime, setFollowUpTime] = React.useState('11:00');
  const [bulkFollowUpDate, setBulkFollowUpDate] = React.useState(() => getDefaultFollowUpDate());

  // Convert to Admission state
  const [convertBatchId, setConvertBatchId] = React.useState('');
  const [convertDob, setConvertDob] = React.useState('');
  const [convertGender, setConvertGender] = React.useState<'Male' | 'Female' | 'Other' | ''>('');
  const [convertCity, setConvertCity] = React.useState('');
  const [convertAddress, setConvertAddress] = React.useState('');
  const [convertEducation, setConvertEducation] = React.useState('');
  const [convertExperience, setConvertExperience] = React.useState<number>(0);
  const [discount, setDiscount] = React.useState(0);
  const [discountReason, setDiscountReason] = React.useState('');

  // Inline Convert Batch Modal State
  const [isConvertBatchModalOpen, setIsConvertBatchModalOpen] = React.useState(false);
  const [convertBatchTimingPreset, setConvertBatchTimingPreset] = React.useState('10:00 AM');
  const [convertBatchCustomTime, setConvertBatchCustomTime] = React.useState('10:00');
  const [convertBatchMonth, setConvertBatchMonth] = React.useState(() => {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months[new Date().getMonth()];
  });
  const [convertBatchYear, setConvertBatchYear] = React.useState(() => String(new Date().getFullYear()).slice(-2));
  const [convertBatchStartDate, setConvertBatchStartDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [convertBatchTrainerId, setConvertBatchTrainerId] = React.useState('');
  const [convertBatchMode, setConvertBatchMode] = React.useState<'Online' | 'Offline'>('Online');
  const [convertBatchCapacity, setConvertBatchCapacity] = React.useState(25);
  const [convertBatchName, setConvertBatchName] = React.useState('10AM NOV 26');
  const [convertBatchError, setConvertBatchError] = React.useState('');

  // convertBatchName is maintained upon batch modal inputs

  const availableTrainers = React.useMemo(() => {
    return (store.users || []).filter(
      (u) => u.role === 'trainer' || u.role === 'support' || u.role === 'admin'
    );
  }, []);

  const handleCreateConvertBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = convertBatchName.trim();
    if (!trimmedName) {
      setConvertBatchError('Batch Name is required.');
      return;
    }
    if (!convertCourseId) {
      setConvertBatchError('Please select a course first.');
      return;
    }
    const exists = (store.batches || []).some(
      (b) => b.course_id === convertCourseId && b.batch_name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      setConvertBatchError(`A batch named "${trimmedName}" already exists for this course.`);
      return;
    }

    let startTime = '10:00';
    let endTime = '11:00';
    if (convertBatchTimingPreset === '09:00 AM') {
      startTime = '09:00'; endTime = '10:00';
    } else if (convertBatchTimingPreset === '10:00 AM') {
      startTime = '10:00'; endTime = '11:00';
    } else if (convertBatchTimingPreset === '11:00 AM') {
      startTime = '11:00'; endTime = '12:00';
    } else if (convertBatchTimingPreset === '12:00 PM') {
      startTime = '12:00'; endTime = '13:00';
    } else if (convertBatchCustomTime) {
      startTime = convertBatchCustomTime;
      const parts = convertBatchCustomTime.split(':');
      const h = (parseInt(parts[0], 10) + 1) % 24;
      endTime = `${String(h).padStart(2, '0')}:${parts[1] || '00'}`;
    }

    const trainer = availableTrainers.find((t) => t.id === convertBatchTrainerId) || availableTrainers[0];
    const batchCode = `BTC-${trimmedName.replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;

    try {
      const created = await createBatch({
        batch_code: batchCode,
        batch_name: trimmedName,
        course_id: convertCourseId,
        trainer_id: trainer?.id || 'usr-trainer',
        training_mode: convertBatchMode === 'Offline' ? 'Classroom' : 'Online',
        start_date: convertBatchStartDate,
        end_date: new Date(new Date(convertBatchStartDate).getTime() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        start_time: startTime,
        end_time: endTime,
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        maximum_capacity: convertBatchCapacity || 25,
        status: 'Upcoming',
      });

      setConvertBatchId(created.id);
      setIsConvertBatchModalOpen(false);
      setConvertBatchError('');
    } catch (err: any) {
      setConvertBatchError(err.message || 'Failed to create batch.');
    }
  };

  // counsellorId defaults to user?.id || ''

  const openEditModal = React.useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setModalTab('stage');
    setNextStage(lead.stage);

    if (lead.follow_up_date) {
      const parts = lead.follow_up_date.split('T');
      setFollowUpDate(parts[0]);
      if (parts[1]) {
        setFollowUpTime(parts[1].slice(0, 5));
      }
    } else {
      setFollowUpDate(getDefaultFollowUpDate());
      setFollowUpTime('11:00');
    }

    // Populate candidate details tab
    setEditFullName(lead.full_name || '');
    const parsedPhone = parseStoredPhone(lead.phone, lead.country_code || '+91');
    setEditCountryCode(parsedPhone.dialCode);
    setEditPhone(parsedPhone.nationalNumber);
    setEditPhoneError('');
    setEditPhoneDuplicateWarning('');

    const hasDistinctWa = Boolean(
      lead.whatsapp_number &&
      lead.whatsapp_number.trim() &&
      lead.whatsapp_number.replace(/\D/g, '') !== lead.phone.replace(/\D/g, '')
    );
    setEditIsWaSame(!hasDistinctWa);
    if (hasDistinctWa && lead.whatsapp_number) {
      const parsedWa = parseStoredPhone(lead.whatsapp_number, lead.whatsapp_country_code || '+91');
      setEditWaCountryCode(parsedWa.dialCode);
      setEditWaNumber(parsedWa.nationalNumber);
    } else {
      setEditWaCountryCode(parsedPhone.dialCode);
      setEditWaNumber(parsedPhone.nationalNumber);
    }
    setEditWaError('');

    setEditEmail(lead.email || '');
    setEditCourseId(lead.interested_course_id || '');
    setEditCounsellorId(lead.counsellor_id || '');
    setEditCurrentStatus((lead.current_status as LeadCurrentStatus) || 'Working Professional');
    setEditTrainingPref(
      lead.training_preference === 'Offline' || lead.training_preference === 'Classroom'
        ? 'Offline'
        : 'Online'
    );
    setEditSource((lead.lead_source as LeadSource) || 'Website');
    setEditNotes(lead.notes || '');
    setEditExperience(lead.experience || (lead.current_status === 'Fresher' ? 'Fresher' : '0–2 Years'));
    setEditDob(lead.dob || '');
    setEditAddress(lead.address || '');
    setIsSavingDetails(false);
    setSaveDetailsError('');
  }, []);

  const refreshLeads = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await getLeads({
        stage: selectedStage as LeadStage,
        search: debouncedSearch.trim() || undefined,
        created_by: creatorFilter,
        counsellor_id: salespersonFilter,
        course_id: courseFilter,
        from: dateFrom,
        to: dateTo,
        team_id: teamFilter,
      });
      setLeadSnapshot({
        owner: user?.id,
        rows: fetched.filter(
          (l) =>
            (selectedTrainingMode === 'All' || l.training_preference === selectedTrainingMode) &&
            (selectedSource === 'All' || l.lead_source === selectedSource)
        ),
      });
    } catch {
      setLeadSnapshot({ owner: user?.id, rows: [] });
    } finally {
      setIsLoading(false);
    }
  }, [
    debouncedSearch,
    selectedStage,
    selectedTrainingMode,
    selectedSource,
    user,
    creatorFilter,
    salespersonFilter,
    courseFilter,
    dateFrom,
    dateTo,
    teamFilter,
  ]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('search');
        if (q) {
          setSearch(q);
        }
        const leadId = params.get('leadId');
        if (leadId) {
          const matched = (cachedLeads(user?.id) || []).find((l) => l.id === leadId);
          if (matched) {
            openEditModal(matched);
          }
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user?.id, openEditModal]);

  React.useEffect(() => {
    void (async () => {
      await refreshLeads();
    })();
  }, [refreshLeads]);

  useDataSync({
    domain: 'leads',
    onSync: refreshLeads,
  });

  // Phone input handler for Create Lead
  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (!val.trim()) {
      setPhoneError('');
      setPhoneDuplicateWarning('');
      return;
    }
    const res = validatePhoneNumber(countryCode, val, 'Mobile number');
    if (!res.isValid) {
      setPhoneError(res.error || 'Invalid mobile number');
      setPhoneDuplicateWarning('');
    } else {
      setPhoneError('');
      const dup = findDuplicateLeadByPhone(leads, val, countryCode);
      if (dup) {
        setPhoneDuplicateWarning(`Existing lead found with this number: ${dup.lead_code} - ${dup.full_name} (${dup.stage})`);
      } else {
        setPhoneDuplicateWarning('');
      }
    }
  };

  const handleCountryCodeChange = (code: string) => {
    setCountryCode(code);
    if (phone.trim()) {
      const res = validatePhoneNumber(code, phone, 'Mobile number');
      setPhoneError(res.isValid ? '' : (res.error || ''));
      if (res.isValid) {
        const dup = findDuplicateLeadByPhone(leads, phone, code);
        setPhoneDuplicateWarning(dup ? `Existing lead found: ${dup.lead_code} - ${dup.full_name} (${dup.stage})` : '');
      }
    }
  };

  // WhatsApp input handler for Create Lead
  const handleWhatsappChange = (val: string) => {
    setWhatsappNumber(val);
    if (!val.trim()) {
      setWhatsappError('');
      return;
    }
    const res = validatePhoneNumber(whatsappCountryCode, val, 'WhatsApp number');
    setWhatsappError(res.isValid ? '' : (res.error || ''));
  };

  const handleWhatsappCountryCodeChange = (code: string) => {
    setWhatsappCountryCode(code);
    if (whatsappNumber.trim()) {
      const res = validatePhoneNumber(code, whatsappNumber, 'WhatsApp number');
      setWhatsappError(res.isValid ? '' : (res.error || ''));
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !phone || !email) return;
    if (!user) {
      alert('Authentication required: Please sign in to create leads.');
      return;
    }

    const emailCheck = validateEmailAddress(email, 'Email address', true);
    if (!emailCheck.isValid) {
      setEmailError(emailCheck.error || 'Please enter a valid email address.');
      return;
    }
    setEmailError('');

    const pCheck = validatePhoneNumber(countryCode, phone, 'Mobile number');
    if (!pCheck.isValid) {
      setPhoneError(pCheck.error || 'Invalid mobile number');
      return;
    }

    const finalWaCountry = isWhatsAppSame ? countryCode : whatsappCountryCode;
    const finalWaNumber = isWhatsAppSame ? phone : whatsappNumber;

    if (!isWhatsAppSame && finalWaNumber.trim()) {
      const wCheck = validatePhoneNumber(finalWaCountry, finalWaNumber, 'WhatsApp number');
      if (!wCheck.isValid) {
        setWhatsappError(wCheck.error || 'Invalid WhatsApp number');
        return;
      }
    }

    const assignedCounsellorId = counsellorId || user.id || availableCounsellors[0]?.id;
    if (!assignedCounsellorId) {
      alert('Please select an assigned counsellor.');
      return;
    }

    if (!experience || !experience.trim()) {
      setExperienceError('Experience is required.');
      return;
    }
    setExperienceError('');

    const expYears = experience === 'Fresher' ? 0 : experience === '0–2 Years' ? 1 : experience === '2–5 Years' ? 3 : 5;

    try {
      await createLead({
        full_name: fullName.trim(),
        country_code: countryCode,
        phone: phone.trim(),
        whatsapp_country_code: finalWaCountry,
        whatsapp_number: finalWaNumber.trim(),
        email: email.trim(),
        interested_course_id: courseId,
        current_status: currentStatus,
        experience: experience.trim(),
        experience_years: expYears,
        dob: dob.trim() || undefined,
        address: address.trim() || undefined,
        training_preference: trainingPref,
        lead_source: source,
        counsellor_id: assignedCounsellorId,
        notes: notes.trim(),
        stage: 'New',
      });

      setIsAddModalOpen(false);
      setFullName('');
      setPhone('');
      setPhoneError('');
      setPhoneDuplicateWarning('');
      setIsWhatsAppSame(true);
      setWhatsappCountryCode('+91');
      setWhatsappNumber('');
      setWhatsappError('');
      setEmail('');
      setNotes('');
      setExperience('');
      setExperienceError('');
      setDob('');
      setAddress('');
      void refreshLeads();
    } catch (err: any) {
      alert(err?.message || 'Failed to create lead');
    }
  };



  const handleUpdateStage = async () => {
    if (!selectedLead) return;
    if (!user) {
      alert('Authentication required: Please sign in to update lead stages.');
      return;
    }
    if ((nextStage === 'Follow-up' || nextStage === 'Demo Scheduled') && !followUpDate) {
      alert('Please select a valid follow-up or demo date.');
      return;
    }

    const scheduledDate = followUpDate
      ? (followUpTime ? `${followUpDate}T${followUpTime}:00` : followUpDate)
      : null;

    const actorId = user.id;
    await updateLeadStage(selectedLead.id, nextStage, updateNotes, actorId, scheduledDate);

    if (nextStage === 'Demo Scheduled') {
      const l = (cachedLeads(user?.id) || []).find((lead) => lead.id === selectedLead.id);
      if (l) {
        l.demo_date = scheduledDate || undefined;
        l.demo_preference = true;
        store.persist();
      }
    }

    setUpdateNotes('');
    setSelectedLead(null);
    refreshLeads();
  };

  const handleSaveLeadDetails = async () => {
    if (!selectedLead || !user || isSavingDetails) return;
    setSaveDetailsError('');

    const pCheck = validatePhoneNumber(editCountryCode, editPhone, 'Mobile number');
    if (!pCheck.isValid) {
      setEditPhoneError(pCheck.error || 'Invalid mobile number');
      return;
    }

    const finalWaCountry = editIsWaSame ? editCountryCode : editWaCountryCode;
    const finalWaNumber = editIsWaSame ? editPhone : editWaNumber;

    if (!editIsWaSame && finalWaNumber.trim()) {
      const wCheck = validatePhoneNumber(finalWaCountry, finalWaNumber, 'WhatsApp number');
      if (!wCheck.isValid) {
        setEditWaError(wCheck.error || 'Invalid WhatsApp number');
        return;
      }
    }

    if (editEmail.trim()) {
      const emailCheck = validateEmailAddress(editEmail, 'Email address', false);
      if (!emailCheck.isValid) {
        setEditEmailError(emailCheck.error || 'Please enter a valid email address.');
        return;
      }
    }
    setEditEmailError('');

    setIsSavingDetails(true);
    try {
      const updatedLead = await updateLeadDetails(
        selectedLead.id,
        {
          full_name: editFullName.trim(),
          country_code: editCountryCode,
          phone: editPhone.trim(),
          whatsapp_country_code: finalWaCountry,
          whatsapp_number: finalWaNumber.trim(),
          email: editEmail.trim(),
          interested_course_id: editCourseId || undefined,
          current_status: editCurrentStatus,
          training_preference: editTrainingPref,
          lead_source: editSource,
          counsellor_id: editCounsellorId || undefined,
          notes: editNotes,
          experience: editExperience.trim() || undefined,
          dob: editDob.trim() || undefined,
          address: editAddress.trim() || undefined,
          // NOTE: stage is strictly omitted so it is NOT overwritten!
        },
        user.id
      );

      // Optimistically update the local row
      setLeadSnapshot((prev) => ({
        owner: prev.owner,
        rows: prev.rows.map((r) => (r.id === updatedLead.id ? updatedLead : r)),
      }));

      setSelectedLead(null);
    } catch (err: any) {
      setSaveDetailsError(err?.message || 'Failed to update lead details');
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleOpenConvert = (lead: Lead) => {
    if (isLeadConverted(lead, store.admissions)) {
      alert(`Lead ${lead.full_name} has already been converted to an admission.`);
      return;
    }
    if (!publishedCourses || publishedCourses.length === 0) {
      alert('No courses available in the system. Please configure courses in Academic management first before converting leads.');
      return;
    }
    setSelectedLead(lead);
    const defaultEdu = lead.education || lead.current_status || '';
    setConvertEducation(defaultEdu);
    if (lead.experience) {
      const expNum = lead.experience === 'Fresher' ? 0 : lead.experience === '0–2 Years' ? 1 : lead.experience === '2–5 Years' ? 3 : 5;
      setConvertExperience(expNum);
    } else {
      setConvertExperience(lead.experience_years ?? 0);
    }
    const matchedCourse = publishedCourses.find((c) => c.id === lead.interested_course_id) || publishedCourses[0];
    const initialCourseId = matchedCourse?.id || '';
    setConvertCourseId(initialCourseId);
    const matchedBatch = (store.batches || []).find((b) => b.course_id === initialCourseId);
    setConvertBatchId(matchedBatch?.id || '');
    setConvertCourseFee(matchedCourse?.price ?? 0);
    setConvertDob(lead.dob || '');
    setConvertGender('');
    setConvertCity('');
    setConvertAddress(lead.address || '');
    setDiscount(0);
    setDiscountReason('');
    setIsConvertModalOpen(true);
  };

  const handleToggleSelectAll = () => {
    if (leads.length > 0 && leads.every((l) => selectedLeadIds.includes(l.id))) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map((l) => l.id));
    }
  };

  const handleToggleLead = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkAssign = async () => {
    if (!selectedLeadIds.length || !bulkCounsellorId) return;
    if (!user) {
      alert('Authentication required: Please sign in.');
      return;
    }
    setIsBulkProcessing(true);
    try {
      const count = await bulkAssignLeads(selectedLeadIds, bulkCounsellorId, user.id);
      setSelectedLeadIds([]);
      refreshLeads();
      alert(`Successfully assigned ${count} lead(s).`);
    } catch (err: any) {
      alert('Error assigning leads: ' + (err.message || 'Unknown error'));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkStageChange = async () => {
    if (!selectedLeadIds.length) return;
    if (!user) {
      alert('Authentication required: Please sign in.');
      return;
    }
    setIsBulkProcessing(true);
    try {
      const count = await bulkUpdateLeadStage(
        selectedLeadIds,
        bulkStage,
        user.id,
        'Bulk stage update from CRM console',
        bulkStage === 'Follow-up' || bulkStage === 'Demo Scheduled' ? bulkFollowUpDate : undefined
      );
      setSelectedLeadIds([]);
      refreshLeads();
      alert(`Successfully updated stage for ${count} lead(s).`);
    } catch (err: any) {
      alert('Error updating lead stages: ' + (err.message || 'Unknown error'));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleConvertLead = async () => {
    if (isConverting) return;
    if (!selectedLead) return;
    if (!user) {
      alert('Authentication required: Please sign in to convert leads.');
      return;
    }
    if (isLeadConverted(selectedLead, store.admissions)) {
      alert(`Lead ${selectedLead.full_name} has already been converted to an admission.`);
      setIsConvertModalOpen(false);
      setSelectedLead(null);
      void refreshLeads();
      return;
    }
    setIsConverting(true);
    const course = publishedCourses.find((c) => c.id === convertCourseId) || publishedCourses[0];
    if (!course) {
      alert('No courses available to convert lead into admission. Please configure courses first.');
      return;
    }
    if (!convertDob) {
      alert('Please specify the student Date of Birth.');
      return;
    }
    if (!convertGender) {
      alert('Please select student Gender.');
      return;
    }
    if (!convertCity.trim()) {
      alert('Please enter student City.');
      return;
    }
    if (!convertAddress.trim()) {
      alert('Please enter student Address.');
      return;
    }
    if (!convertEducation.trim()) {
      alert('Please specify student Education/Qualification.');
      return;
    }
    if (convertCourseFee <= 0) {
      alert('Please specify a valid Course Fee.');
      return;
    }

    const defaultBatch = convertBatchId
      ? (store.batches || []).find((b) => b.id === convertBatchId)
      : (store.batches || []).find((b) => b.course_id === course.id);

    const actorId = user.id;
    const assignedCounsellorId = selectedLead.counsellor_id || actorId;
    const leadFullName = selectedLead.full_name;

    try {
      const result = await paymentWorkflowClient.createAdmission({
        student_name: selectedLead.full_name,
        phone: selectedLead.phone,
        email: selectedLead.email,
        dob: convertDob,
        gender: convertGender as 'Male' | 'Female' | 'Other',
        address: convertAddress.trim(),
        city: convertCity.trim(),
        education: convertEducation.trim(),
        experience_years: Number(convertExperience) || 0,
        current_employment_status: (['Employed', 'Unemployed', 'Student', 'Career Gap'].includes(selectedLead.current_status || '')
          ? (selectedLead.current_status as any)
          : 'Employed') as 'Employed' | 'Unemployed' | 'Student' | 'Career Gap',
        course_id: course.id,
        training_mode: selectedLead.training_preference === 'Offline' ? 'Classroom' : (selectedLead.training_preference as any),
        batch_id: defaultBatch?.id,
        admission_date: new Date().toISOString().slice(0, 10),
        course_fee: Number(convertCourseFee),
        discount: Number(discount) || 0,
        discount_reason: discountReason || 'Sales approved discount',
        payment_plan: 'Full Payment',
        counsellor_id: assignedCounsellorId,
        lead_id: selectedLead.id,
      });

      setIsConvertModalOpen(false);
      setSelectedLead(null);
      await refreshLeads();
      alert(`Lead ${leadFullName} converted to confirmed admission (${result?.admission?.admission_number || 'Confirmed'}) successfully!`);
    } catch (err: any) {
      alert('Error converting lead: ' + (err.message || 'Unknown error'));
    } finally {
      setIsConverting(false);
    }
  };

  const getStageBadge = (stage: LeadStage) => {
    switch (stage) {
      case 'New':
        return <Badge variant="info" className="whitespace-nowrap font-medium">New</Badge>;
      case 'Contacted':
        return <Badge variant="secondary" className="whitespace-nowrap font-medium">Contacted</Badge>;
      case 'Follow-up':
        return <Badge variant="warning" className="whitespace-nowrap font-medium">Follow-up</Badge>;
      case 'Demo Scheduled':
        return <Badge variant="warning" className="whitespace-nowrap font-medium" title="Demo Scheduled">Demo Sch</Badge>;
      case 'Demo Attended':
        return <Badge variant="success" className="whitespace-nowrap font-medium">Demo Attended</Badge>;
      case 'Interested':
        return <Badge variant="success" className="whitespace-nowrap font-medium">Interested</Badge>;
      case 'Not Interested':
        return <Badge variant="danger" className="whitespace-nowrap font-medium">Not Interested</Badge>;
      case 'Converted':
      case 'Enrolled':
        return <Badge variant="success" className="whitespace-nowrap font-medium">Converted</Badge>;
      case 'Lost':
        return <Badge variant="danger" className="whitespace-nowrap font-medium">Lost</Badge>;
      default:
        return <Badge variant="secondary" className="whitespace-nowrap font-medium">{stage}</Badge>;
    }
  };

  if (!canAccessCrm) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <ShieldAlert className="h-12 w-12 text-amber-500" />
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-slate-500 text-sm max-w-md text-center">
          You do not have permission to view CRM Leads. Please contact your system administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{scopeLabel} Leads</h1>
          <p className="text-xs text-slate-500 mt-1">
            Capture, track, and convert prospective student inquiries for SAP training courses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-xs">
              <Download className="h-3.5 w-3.5 mr-1" />
              Export CSV
            </Button>
          )}
          {canCreateLead && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportModalOpen(true)}
                className="text-xs"
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Import Leads
              </Button>
              <Button
                variant="sap"
                size="sm"
                onClick={() => setIsAddModalOpen(true)}
                className="text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Lead
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3" aria-label="Lead statistics">
        {['total', 'new', 'followups', 'pending', 'converted', 'conversionRate'].map((key, index) => (
          <Card key={key} className="p-3">
            <p className="text-xs text-slate-500">{scopeLabel} {['Leads', 'New Leads', 'Follow-ups', 'Pending Leads', 'Converted Leads', 'Conversion Rate'][index]}</p>
            <p className="text-xl font-semibold">{visibleSummary?.metrics?.[key] ?? '—'}{key === 'conversionRate' ? '%' : ''}</p>
            {key === 'converted' && (Boolean(visibleSummary?.metrics?.historicalConversions) || Boolean(visibleSummary?.metrics?.integrityErrors)) && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {visibleSummary?.metrics?.activeConversions ?? 0} active · {visibleSummary?.metrics?.historicalConversions ?? 0} archived
                {Boolean(visibleSummary?.metrics?.integrityErrors) && (
                  <span className="text-rose-600 font-semibold"> · {visibleSummary.metrics.integrityErrors} discrepancies</span>
                )}
              </p>
            )}
          </Card>
        ))}
      </div>
      {role !== 'counsellor' && visibleSummary && <details className="text-sm"><summary>Salesperson and team performance</summary>
        <table className="w-full"><thead><tr><th>Creator</th><th>Leads</th><th>Converted</th></tr></thead><tbody>{visibleSummary.performance.map((p: any) => <tr key={p.id}><td>{p.full_name}</td><td>{p.total}</td><td>{p.converted}</td></tr>)}</tbody></table>
      </details>}
      <div className="flex flex-wrap gap-3 text-sm">
        {role !== 'counsellor' && <>
          <label className="flex items-center gap-2">Created By<select value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}><option value="">All authorized creators</option>{visibleSummary?.users?.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>
          <label className="flex items-center gap-2">Salesperson<select value={salespersonFilter} onChange={e => setSalespersonFilter(e.target.value)}><option value="">All assignments</option>{visibleSummary?.users?.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>
          <label className="flex items-center gap-2">Team<select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}><option value="">All authorized teams</option>{visibleSummary?.teams?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        </>}
        <label className="flex items-center gap-2">Course<select value={courseFilter} onChange={e => setCourseFilter(e.target.value)}><option value="">All courses</option>{publishedCourses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}</select></label>
        <label className="flex items-center gap-2">From<input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
        <label className="flex items-center gap-2">To<input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label>
      </div>
      {/* Filter and Search Bar */}
      <Card className="p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, phone, email, or lead ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              />
            </div>

            <div className="flex items-center space-x-1.5 w-full sm:w-auto overflow-x-auto">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Stage:</span>
              {['All', 'New', 'Follow-up', 'Demo Scheduled', 'Interested', 'Converted', 'Lost'].map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStage(st)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    selectedStage === st
                      ? 'bg-[#0A6ED1] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary Filters: Mode & Source */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Training Mode:</span>
              <select
                value={selectedTrainingMode}
                onChange={(e) => setSelectedTrainingMode(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700"
              >
                <option value="All">All Modes</option>
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
                <option value="Hybrid">Hybrid (Legacy)</option>
                <option value="Classroom">Classroom (Legacy)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Source:</span>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700"
              >
                <option value="All">All Sources</option>
                {LEAD_SOURCE_OPTIONS.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Bulk Actions Toolbar */}
      {selectedLeadIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <div className="flex items-center space-x-2 font-semibold text-blue-900">
            <Users className="h-4 w-4 text-blue-600" />
            <span>{selectedLeadIds.length} lead(s) selected</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bulk Assign Sales */}
            <div className="flex items-center space-x-1.5">
              <select
                value={bulkCounsellorId}
                onChange={(e) => setBulkCounsellorId(e.target.value)}
                className="text-xs bg-white border border-blue-300 rounded px-2 py-1.5 text-slate-800"
              >
                <option value="">Assign Sales...</option>
                {availableCounsellors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({getRoleLabel(c.role)})
                  </option>
                ))}
              </select>
              <Button
                variant="sap"
                size="sm"
                onClick={handleBulkAssign}
                disabled={!bulkCounsellorId || isBulkProcessing}
                className="text-xs"
              >
                Assign
              </Button>
            </div>

            {/* Bulk Stage Update */}
            <div className="flex items-center space-x-1.5">
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value as LeadStage)}
                className="text-xs bg-white border border-blue-300 rounded px-2 py-1.5 text-slate-800"
              >
                <option value="Contacted">Contacted</option>
                <option value="Follow-up">Follow-up</option>
                <option value="Demo Scheduled">Demo Scheduled</option>
                <option value="Interested">Interested</option>
                <option value="Not Interested">Not Interested</option>
                <option value="Lost">Lost</option>
              </select>
              {(bulkStage === 'Follow-up' || bulkStage === 'Demo Scheduled') && (
                <input
                  type="date"
                  value={bulkFollowUpDate}
                  onChange={(e) => setBulkFollowUpDate(e.target.value)}
                  className="text-xs bg-white border border-blue-300 rounded px-2 py-1 text-slate-800"
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkStageChange}
                disabled={isBulkProcessing}
                className="text-xs"
              >
                Update Stage
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && leads.every((l) => selectedLeadIds.includes(l.id))}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                  </th>
                  <th className="px-3.5 py-2.5">Candidate</th>
                  <th className="px-3.5 py-2.5">Contact</th>
                  <th className="px-3.5 py-2.5">Interested Course</th>
                  <th className="px-3.5 py-2.5">Mode & Source</th>
                  <th className="px-3.5 py-2.5">Stage</th>
                  <th className="px-3.5 py-2.5">Created</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <TableSkeleton columns={8} rows={6} />
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3.5 py-8 text-center text-slate-400">
                      <p className="font-semibold text-slate-600">No leads found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {search || selectedStage !== 'All'
                          ? 'Try adjusting your filters or search terms.'
                          : 'Create a new lead to start tracking prospects.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => {
                    const conversionInfo = classifyLeadConversion(lead, store.admissions);
                    const isSelected = selectedLeadIds.includes(lead.id);
                    const waCode = lead.whatsapp_country_code || lead.country_code || '+91';
                    const waNum = lead.whatsapp_number || lead.phone;
                    const waDigits = getCanonicalPhoneDigits(waCode, waNum);

                    return (
                      <tr
                        key={lead.id}
                        className={`transition-colors ${isSelected ? 'bg-blue-50/50 hover:bg-blue-50/80' : 'hover:bg-slate-50/80'}`}
                      >
                        <td className="px-3.5 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleLead(lead.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                          />
                        </td>
                        <td className="px-3.5 py-2.5">
                          <p className="font-semibold text-slate-900 text-xs">{lead.full_name}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {lead.current_status || 'Working Professional'}
                          </p>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-900 whitespace-nowrap">
                              {formatDisplayPhone(lead.country_code, lead.phone)}
                            </span>
                            <a
                              href={`https://wa.me/${waDigits}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Chat on WhatsApp (${waDigits})`}
                              className="h-5 w-5 rounded-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white flex items-center justify-center transition-all shrink-0 border border-[#25D366]/30 shadow-2xs"
                            >
                              <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                              </svg>
                            </a>
                          </div>
                          {lead.email && (
                            <p className="text-slate-500 text-[11px] flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
                              <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[170px]" title={lead.email}>
                                {lead.email}
                              </span>
                            </p>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-800">
                          {lead.interested_course_name || 'SAP Course'}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-slate-800">
                              {lead.training_preference || 'Online'}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              via {lead.lead_source || 'Website'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div>
                            {conversionInfo.status === 'active' && conversionInfo.matchingAdmission ? (
                              <div className="flex flex-col gap-0.5">
                                <Badge variant="success" className="whitespace-nowrap font-medium">Converted</Badge>
                                <span className="text-[10px] text-emerald-700 font-semibold">
                                  {conversionInfo.admissionNumber}
                                </span>
                              </div>
                            ) : conversionInfo.status === 'historical' ? (
                              <div className="flex flex-col gap-0.5">
                                <Badge variant="warning" className="whitespace-nowrap font-medium text-amber-800 bg-amber-50 border border-amber-200">
                                  Historical Conversion
                                </Badge>
                                {conversionInfo.historicalReference && (
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    Ref: {conversionInfo.historicalReference}
                                  </span>
                                )}
                              </div>
                            ) : conversionInfo.status === 'cancelled' ? (
                              <div className="flex flex-col gap-0.5">
                                <Badge variant="outline" className="whitespace-nowrap font-medium text-slate-600 bg-slate-50 border-slate-300">
                                  Conversion Cancelled
                                </Badge>
                                {conversionInfo.admissionNumber && (
                                  <span className="text-[10px] text-slate-400 line-through">
                                    {conversionInfo.admissionNumber}
                                  </span>
                                )}
                              </div>
                            ) : conversionInfo.status === 'integrity_error' ? (
                              <div className="flex flex-col gap-0.5">
                                <Badge variant="destructive" className="whitespace-nowrap font-semibold bg-rose-100 text-rose-800 border-rose-300">
                                  Integrity Error
                                </Badge>
                                <span className="text-[10px] text-rose-600 font-medium">
                                  Missing Admission
                                </span>
                              </div>
                            ) : (
                              getStageBadge(lead.stage)
                            )}
                          </div>
                          {lead.follow_up_date && (
                            <div className="flex items-center space-x-1 text-[10px] text-amber-700 font-medium mt-1">
                              <Calendar className="h-3 w-3 shrink-0" />
                              <span>{formatDate(lead.follow_up_date)}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-500">{formatDate(lead.created_at)}</td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {canCreateLead && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditModal(lead)}
                                className="h-7 px-2.5 text-xs text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                                title="Edit lead information"
                              >
                                <Edit2 className="h-3 w-3 mr-1 text-slate-500" />
                                Edit
                              </Button>
                            )}
                            {conversionInfo.status === 'active' && conversionInfo.matchingAdmission?.admission_number ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  router.push(`/admissions?search=${encodeURIComponent(conversionInfo.matchingAdmission!.admission_number)}`);
                                }}
                                className="h-7 px-2.5 text-xs text-blue-600 hover:text-blue-800 border-blue-200 hover:bg-blue-50 font-medium"
                                title={`View live admission record ${conversionInfo.matchingAdmission.admission_number}`}
                              >
                                View Admission
                              </Button>
                            ) : conversionInfo.status === 'historical' ? (
                              <span
                                className="inline-flex items-center px-2 py-1 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                                title={conversionInfo.historicalReference ? `Archived admission reference: ${conversionInfo.historicalReference}. Original admission record was removed during historical cleanup.` : 'Historical conversion record (admission archived)'}
                              >
                                Archived{conversionInfo.historicalReference ? ` (${conversionInfo.historicalReference})` : ''}
                              </span>
                            ) : conversionInfo.status === 'cancelled' ? (
                              <span
                                className="inline-flex items-center px-2 py-1 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200"
                                title="Admission was cancelled per approved policy"
                              >
                                Cancelled
                              </span>
                            ) : conversionInfo.status === 'integrity_error' ? (
                              <span
                                className="inline-flex items-center px-2 py-1 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                title="Integrity Warning: Converted stage has no live admission and no verified archival record."
                              >
                                Data Discrepancy
                              </span>
                            ) : (
                              canConvert && (
                                <Button
                                  variant="sap"
                                  size="sm"
                                  onClick={() => {
                                    router.push(`/admissions?convertLeadId=${lead.id}`);
                                  }}
                                  className="h-7 px-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap shadow-xs"
                                  title="Convert to full admission"
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Convert
                                </Button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Lead Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Prospective Lead"
        description="Record prospective student inquiry for SAP training."
      >
        <form onSubmit={handleCreateLead} className="space-y-4 text-xs">
          <p className="text-slate-600">Created by: {user?.full_name} (your signed-in account)</p>
          <Input
            label="Full Name *"
            placeholder="e.g. Ramesh Kumar"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

          {/* Mobile Number with Country Code Dropdown */}
          <PhoneInput
            label="Mobile Number"
            countryCode={countryCode}
            onCountryCodeChange={handleCountryCodeChange}
            phoneNumber={phone}
            onPhoneNumberChange={handlePhoneChange}
            error={phoneError}
            duplicateWarning={phoneDuplicateWarning}
            required
            placeholder="98765 43210"
          />

          {/* WhatsApp Number Section */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isWhatsAppSame}
                  onChange={(e) => {
                    const same = e.target.checked;
                    setIsWhatsAppSame(same);
                    if (same) {
                      setWhatsappCountryCode(countryCode);
                      setWhatsappNumber(phone);
                      setWhatsappError('');
                    }
                  }}
                  className="rounded border-slate-300 text-[#0A6ED1] focus:ring-[#0A6ED1] h-3.5 w-3.5"
                />
                <span>WhatsApp number is same as mobile number</span>
              </label>
            </div>

            {isWhatsAppSame ? (
              <p className="text-[11px] text-slate-500 italic">
                WhatsApp communication will be sent to the primary mobile number ({countryCode} {phone || '...'}).
              </p>
            ) : (
              <PhoneInput
                label="Separate WhatsApp Number"
                countryCode={whatsappCountryCode}
                onCountryCodeChange={handleWhatsappCountryCodeChange}
                phoneNumber={whatsappNumber}
                onPhoneNumberChange={handleWhatsappChange}
                error={whatsappError}
                placeholder="Separate WhatsApp number"
              />
            )}
          </div>

          <div>
            <Input
              label="Email Address *"
              type="email"
              placeholder="ramesh@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError('');
              }}
              required
            />
            {emailError && <p className="text-xs text-rose-500 font-medium mt-1">{emailError}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Interested SAP Course *
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              >
                {publishedCourses.length === 0 ? (
                  <option value="">No courses available</option>
                ) : (
                  publishedCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Assigned Sales *
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
                      {c.full_name} ({getRoleLabel(c.role)})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Training Mode: Exactly Online and Offline */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Training Mode *
              </label>
              <select
                value={trainingPref}
                onChange={(e) => setTrainingPref(e.target.value as 'Online' | 'Offline')}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
              </select>
            </div>

            {/* Lead Source: including YouTube */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Lead Source *
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as LeadSource)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Website">Website</option>
                <option value="Google Ads">Google Ads</option>
                <option value="Meta Ads">Meta Ads</option>
                <option value="YouTube">YouTube</option>
                <option value="Referral">Referral</option>
                <option value="Walk-in">Walk-in</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Current Status: Exactly 4 options */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Current Status *
            </label>
            <select
              value={currentStatus}
              onChange={(e) => setCurrentStatus(e.target.value as LeadCurrentStatus)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            >
              {CURRENT_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Experience Level: Mandatory with options Fresher, 0–2 Years, 2–5 Years, 5+ Years (no pre-selection) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Experience *
            </label>
            <select
              value={experience}
              onChange={(e) => {
                setExperience(e.target.value);
                if (experienceError) setExperienceError('');
              }}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
              required
            >
              <option value="">Select Experience Level *</option>
              <option value="Fresher">Fresher</option>
              <option value="0–2 Years">0–2 Years</option>
              <option value="2–5 Years">2–5 Years</option>
              <option value="5+ Years">5+ Years</option>
            </select>
            {experienceError && (
              <p className="text-xs text-rose-500 font-medium mt-1">{experienceError}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Date of Birth (Optional)"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
            <Input
              label="Residential Address (Optional)"
              placeholder="e.g. Flat 302, Silicon Hills, Hyderabad"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Sales Notes / Demo Preferences
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Candidate requested syllabus brochure for SAP S/4HANA..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm" disabled={Boolean(phoneError || whatsappError)}>
              Create Lead
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit / Update Lead Modal */}
      {selectedLead && !isConvertModalOpen && (
        <Modal
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          title={`Edit Lead: ${selectedLead.full_name}`}
          description={`Lead ID: ${selectedLead.lead_code} | Stage: ${selectedLead.stage}`}
        >
          <div className="space-y-4 text-xs">
            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setModalTab('stage')}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  modalTab === 'stage'
                    ? 'border-[#0A6ED1] text-[#0A6ED1]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Follow-up & Stage
              </button>
              <button
                type="button"
                onClick={() => setModalTab('details')}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  modalTab === 'details'
                    ? 'border-[#0A6ED1] text-[#0A6ED1]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Candidate Information
              </button>
            </div>

            {/* TAB 1: Follow-up & Stage */}
            {modalTab === 'stage' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Pipeline Stage
                  </label>
                  <select
                    value={nextStage}
                    onChange={(e) => setNextStage(e.target.value as LeadStage)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
                  >
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Follow-up">Follow-up</option>
                    <option value="Demo Scheduled">Demo Scheduled</option>
                    <option value="Demo Attended">Demo Attended</option>
                    <option value="Interested">Interested</option>
                    <option value="Not Interested">Not Interested</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>

                <div
                  className={`p-3 rounded-lg border transition-colors ${
                    nextStage === 'Follow-up' || nextStage === 'Demo Scheduled'
                      ? 'bg-amber-50/80 border-amber-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-[#0A6ED1]" />
                      <span>
                        Follow-up & Demo Schedule{' '}
                        {nextStage === 'Follow-up' || nextStage === 'Demo Scheduled' ? '(Required)' : '(Optional)'}
                      </span>
                    </span>
                    {(nextStage === 'Follow-up' || nextStage === 'Demo Scheduled') && (
                      <Badge variant="warning" className="text-[10px]">
                        Date Required
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Scheduled Date {nextStage === 'Follow-up' || nextStage === 'Demo Scheduled' ? '*' : ''}
                      </label>
                      <Input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="w-full text-xs bg-white"
                        required={nextStage === 'Follow-up' || nextStage === 'Demo Scheduled'}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Scheduled Time</label>
                      <Input
                        type="time"
                        value={followUpTime}
                        onChange={(e) => setFollowUpTime(e.target.value)}
                        className="w-full text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Add Follow-up Notes
                  </label>
                  <textarea
                    rows={3}
                    value={updateNotes}
                    onChange={(e) => setUpdateNotes(e.target.value)}
                    placeholder="Enter discussion notes with student..."
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
                  />
                </div>

                {selectedLead.notes && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Existing Notes Log:</p>
                    <p className="text-xs text-slate-700 whitespace-pre-line">{selectedLead.notes}</p>
                  </div>
                )}

                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <Button variant="outline" size="sm" onClick={() => setSelectedLead(null)}>
                    Cancel
                  </Button>
                  <Button variant="sap" size="sm" onClick={handleUpdateStage}>
                    Save Stage Updates
                  </Button>
                </div>
              </div>
            )}

            {/* TAB 2: Candidate Information (No Overwriting Pipeline Stage) */}
            {modalTab === 'details' && (
              <div className="space-y-4">
                <Input
                  label="Full Name *"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                />

                {/* Edit Mobile Number */}
                <PhoneInput
                  label="Mobile Number"
                  countryCode={editCountryCode}
                  onCountryCodeChange={(code) => {
                    setEditCountryCode(code);
                    if (editPhone.trim()) {
                      const res = validatePhoneNumber(code, editPhone, 'Mobile number');
                      setEditPhoneError(res.isValid ? '' : (res.error || ''));
                    }
                  }}
                  phoneNumber={editPhone}
                  onPhoneNumberChange={(val) => {
                    setEditPhone(val);
                    if (!val.trim()) {
                      setEditPhoneError('');
                      return;
                    }
                    const res = validatePhoneNumber(editCountryCode, val, 'Mobile number');
                    setEditPhoneError(res.isValid ? '' : (res.error || ''));
                  }}
                  error={editPhoneError}
                  duplicateWarning={editPhoneDuplicateWarning}
                  required
                />

                {/* Edit WhatsApp Number */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsWaSame}
                      onChange={(e) => {
                        const same = e.target.checked;
                        setEditIsWaSame(same);
                        if (same) {
                          setEditWaCountryCode(editCountryCode);
                          setEditWaNumber(editPhone);
                          setEditWaError('');
                        }
                      }}
                      className="rounded border-slate-300 text-[#0A6ED1] focus:ring-[#0A6ED1] h-3.5 w-3.5"
                    />
                    <span>WhatsApp number is same as mobile number</span>
                  </label>

                  {!editIsWaSame && (
                    <PhoneInput
                      label="Separate WhatsApp Number"
                      countryCode={editWaCountryCode}
                      onCountryCodeChange={setEditWaCountryCode}
                      phoneNumber={editWaNumber}
                      onPhoneNumberChange={(val) => {
                        setEditWaNumber(val);
                        if (!val.trim()) {
                          setEditWaError('');
                          return;
                        }
                        const res = validatePhoneNumber(editWaCountryCode, val, 'WhatsApp number');
                        setEditWaError(res.isValid ? '' : (res.error || ''));
                      }}
                      error={editWaError}
                    />
                  )}
                </div>

                <div>
                  <Input
                    label="Email Address *"
                    type="email"
                    value={editEmail}
                    onChange={(e) => {
                      setEditEmail(e.target.value);
                      if (editEmailError) setEditEmailError('');
                    }}
                    required
                  />
                  {editEmailError && <p className="text-xs text-rose-500 font-medium mt-1">{editEmailError}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Current Status: Exactly 4 options */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Current Status
                    </label>
                    <select
                      value={editCurrentStatus}
                      onChange={(e) => setEditCurrentStatus(e.target.value as LeadCurrentStatus)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                    >
                      {CURRENT_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Training Mode: Online or Offline */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Training Mode
                    </label>
                    <select
                      value={editTrainingPref}
                      onChange={(e) => setEditTrainingPref(e.target.value as 'Online' | 'Offline')}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                    >
                      <option value="Online">Online</option>
                      <option value="Offline">Offline</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Lead Source: including YouTube */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Lead Source
                    </label>
                    <select
                      value={editSource}
                      onChange={(e) => setEditSource(e.target.value as LeadSource)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                    >
                      {LEAD_SOURCE_OPTIONS.map((src) => (
                        <option key={src} value={src}>
                          {src}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Course */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Interested Course
                    </label>
                    <select
                      value={editCourseId}
                      onChange={(e) => setEditCourseId(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                    >
                      {publishedCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.course_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Assigned Sales
                  </label>
                  <select
                    value={editCounsellorId}
                    onChange={(e) => setEditCounsellorId(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                  >
                    {availableCounsellors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({getRoleLabel(c.role)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Experience Level */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Experience
                  </label>
                  <select
                    value={editExperience}
                    onChange={(e) => setEditExperience(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                  >
                    <option value="">Select Experience Level</option>
                    <option value="Fresher">Fresher</option>
                    <option value="0–2 Years">0–2 Years</option>
                    <option value="2–5 Years">2–5 Years</option>
                    <option value="5+ Years">5+ Years</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Date of Birth"
                    type="date"
                    value={editDob}
                    onChange={(e) => setEditDob(e.target.value)}
                  />
                  <Input
                    label="Residential Address"
                    placeholder="e.g. Flat 302, Silicon Hills, Hyderabad"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                  />
                </div>

                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-800 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    Saving candidate information updates contact, training mode, and current status without changing the pipeline stage ({selectedLead.stage}).
                  </span>
                </div>

                {saveDetailsError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <span>{saveDetailsError}</span>
                  </div>
                )}

                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <Button variant="outline" size="sm" onClick={() => setSelectedLead(null)} disabled={isSavingDetails}>
                    Cancel
                  </Button>
                  <Button
                    variant="sap"
                    size="sm"
                    onClick={handleSaveLeadDetails}
                    disabled={isSavingDetails || Boolean(editPhoneError || editWaError)}
                  >
                    {isSavingDetails ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        Saving Details...
                      </>
                    ) : (
                      'Save Candidate Details'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Convert to Admission Modal (No Duplicate Data Entry) */}
      {selectedLead && isConvertModalOpen && (
        <Modal
          isOpen={isConvertModalOpen}
          onClose={() => setIsConvertModalOpen(false)}
          title={`Convert Lead to Confirmed Admission: ${selectedLead.full_name}`}
          description={`Lead Code: ${selectedLead.lead_code} | Converting to student admission record`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
              <p className="font-semibold text-blue-900">Pre-filled Candidate Data from CRM Lead:</p>
              <div className="grid grid-cols-2 gap-2 text-slate-700 text-[11px]">
                <p><strong>Candidate:</strong> {selectedLead.full_name}</p>
                <p><strong>Mobile:</strong> {formatDisplayPhone(selectedLead.country_code, selectedLead.phone)}</p>
                <p><strong>WhatsApp:</strong> {selectedLead.whatsapp_number || selectedLead.phone}</p>
                <p><strong>Email:</strong> {selectedLead.email}</p>
                <p><strong>Current Status:</strong> {selectedLead.current_status || 'Working Professional'}</p>
                <p><strong>Training Mode:</strong> {selectedLead.training_preference || 'Online'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Enrolling Course *
                </label>
                <select
                  value={convertCourseId}
                  onChange={(e) => {
                    const newCId = e.target.value;
                    setConvertCourseId(newCId);
                    const matchedCourse = publishedCourses.find((c) => c.id === newCId);
                    if (matchedCourse) {
                      setConvertCourseFee(matchedCourse.price);
                      const matchingBatches = (store.batches || []).filter((b) => b.course_id === newCId);
                      setConvertBatchId(matchingBatches[0]?.id || '');
                    } else {
                      setConvertCourseFee(0);
                    }
                  }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                >
                  {publishedCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_name} (₹{c.price.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Assigned Batch
                </label>
                <select
                  value={convertBatchId}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW_BATCH__') {
                      setIsConvertBatchModalOpen(true);
                    } else {
                      setConvertBatchId(e.target.value);
                    }
                  }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                >
                  {(() => {
                    const courseBatches = (store.batches || []).filter((b) => b.course_id === convertCourseId);
                    return (
                      <>
                        <option value="">{courseBatches.length === 0 ? 'No dedicated batches (General)' : 'Select Batch (Optional)'}</option>
                        {courseBatches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.batch_name} ({b.training_mode})
                          </option>
                        ))}
                        <option value="__ADD_NEW_BATCH__" className="text-blue-600 font-bold">
                          + Add New Batch
                        </option>
                      </>
                    );
                  })()}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Date of Birth *"
                type="date"
                value={convertDob}
                onChange={(e) => setConvertDob(e.target.value)}
                required
              />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Gender *
                </label>
                <select
                  value={convertGender}
                  onChange={(e) => setConvertGender(e.target.value as any)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                  required
                >
                  <option value="">Select Gender *</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <Input
                label="City *"
                placeholder="e.g. Hyderabad"
                value={convertCity}
                onChange={(e) => setConvertCity(e.target.value)}
                required
              />
              <Input
                label="Address *"
                placeholder="e.g. Plot 12, Madhapur"
                value={convertAddress}
                onChange={(e) => setConvertAddress(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Education / Qualification *"
                value={convertEducation}
                onChange={(e) => setConvertEducation(e.target.value)}
                placeholder="e.g. B.Tech / B.Com / MBA"
                required
              />
              <Input
                label="Prior Work Experience (Years) *"
                type="number"
                min="0"
                value={convertExperience}
                onChange={(e) => setConvertExperience(Number(e.target.value))}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Discount Amount (₹)"
                type="number"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>

            <Input
              label="Discount Reason"
              placeholder="e.g. Merit discount / Early registration"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
            />

            {(() => {
              const netPayable = Math.max(0, convertCourseFee - discount);
              return (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-bold text-emerald-900 block">Total Net Payable:</span>
                    <span className="text-[11px] text-emerald-700">Course Base Fee: ₹{convertCourseFee.toLocaleString('en-IN')}</span>
                  </div>
                  <span className="text-base font-extrabold text-emerald-700">
                    ₹{netPayable.toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })()}

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setIsConvertModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="sap"
                size="sm"
                onClick={handleConvertLead}
                disabled={isConverting || publishedCourses.length === 0}
              >
                {isConverting ? 'Converting...' : 'Confirm Admission & Create Profile'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create New Training Batch Modal - Inline Convert Workflow */}
      {isConvertBatchModalOpen && (
        <Modal
          isOpen={isConvertBatchModalOpen}
          onClose={() => {
            setIsConvertBatchModalOpen(false);
            setConvertBatchError('');
          }}
          title="Create New Training Batch"
          description="Add a new batch for this conversion without losing candidate information."
        >
          <form onSubmit={handleCreateConvertBatch} className="space-y-4 text-xs">
            {/* Auto-matched Course */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Course (Auto-Matched)
              </label>
              <Input
                value={publishedCourses.find((c) => c.id === convertCourseId)?.course_name || 'Selected Course'}
                disabled
                className="bg-slate-50 text-slate-700 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Batch Timing */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Batch Timing *
                </label>
                <select
                  value={convertBatchTimingPreset}
                  onChange={(e) => setConvertBatchTimingPreset(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                >
                  <option value="09:00 AM">09:00 AM (09:00 - 10:00)</option>
                  <option value="10:00 AM">10:00 AM (10:00 - 11:00)</option>
                  <option value="11:00 AM">11:00 AM (11:00 - 12:00)</option>
                  <option value="12:00 PM">12:00 PM (12:00 - 13:00)</option>
                  <option value="Custom">Custom Timing...</option>
                </select>
              </div>

              {/* Month */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Month *
                </label>
                <select
                  value={convertBatchMonth}
                  onChange={(e) => setConvertBatchMonth(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                >
                  {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Year *
                </label>
                <select
                  value={convertBatchYear}
                  onChange={(e) => setConvertBatchYear(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                >
                  <option value="26">2026 (26)</option>
                  <option value="27">2027 (27)</option>
                  <option value="28">2028 (28)</option>
                </select>
              </div>
            </div>

            {convertBatchTimingPreset === 'Custom' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Custom Start Time *
                </label>
                <Input
                  type="time"
                  value={convertBatchCustomTime}
                  onChange={(e) => setConvertBatchCustomTime(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Auto-suggested Batch Name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Batch Name (Auto-Suggested) *
              </label>
              <Input
                placeholder="e.g. 10AM NOV 26"
                value={convertBatchName}
                onChange={(e) => {
                  setConvertBatchName(e.target.value);
                  if (convertBatchError) setConvertBatchError('');
                }}
                required
              />
              <p className="text-[11px] text-slate-500 mt-0.5">
                Format: <code>[Time] [Month] [Year]</code> (e.g. 9AM NOV 26, 10AM NOV 26, 11AM DEC 26, 12PM JAN 27).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Start Date */}
              <Input
                label="Start Date *"
                type="date"
                value={convertBatchStartDate}
                onChange={(e) => setConvertBatchStartDate(e.target.value)}
                required
              />

              {/* Training Mode */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Training Mode *
                </label>
                <select
                  value={convertBatchMode}
                  onChange={(e) => setConvertBatchMode(e.target.value as 'Online' | 'Offline')}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                >
                  <option value="Online">Online</option>
                  <option value="Offline">Offline</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Trainer */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Assigned Trainer *
                </label>
                <select
                  value={convertBatchTrainerId}
                  onChange={(e) => setConvertBatchTrainerId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                >
                  <option value="">Select Trainer...</option>
                  {availableTrainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Capacity */}
              <Input
                label="Batch Capacity *"
                type="number"
                min={1}
                max={200}
                value={convertBatchCapacity}
                onChange={(e) => setConvertBatchCapacity(Number(e.target.value))}
                required
              />
            </div>

            {convertBatchError && (
              <p className="text-xs text-rose-600 font-medium">{convertBatchError}</p>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsConvertBatchModalOpen(false);
                  setConvertBatchError('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm">
                Create Batch
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        defaultEntity="leads"
        onSuccess={refreshLeads}
      />
    </div>
  );
}
