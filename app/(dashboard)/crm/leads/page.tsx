'use client';

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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PhoneInput } from '@/components/ui/phone-input';
import { BulkImportModal } from '@/components/bulk-import-modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { Lead, LeadStage, LeadCurrentStatus, LeadTrainingPreference, LeadSource } from '@/types';
import {
  getLeads,
  createLead,
  updateLeadStage,
  updateLeadDetails,
  bulkAssignLeads,
  bulkUpdateLeadStage,
  getLeadAdmission,
  isLeadConverted,
} from '@/lib/services/crm-service';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { formatDate, exportToCSV } from '@/lib/utils/formatters';
import {
  validatePhoneNumber,
  findDuplicateLeadByPhone,
  parseStoredPhone,
  getCanonicalPhoneDigits,
  formatDisplayPhone,
  DEFAULT_COUNTRY,
} from '@/lib/utils/phone-validation';

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

export default function LeadsPage() {
  const router = useRouter();
  const { user, role, hasPermission } = useAuth();
  const [leads, setLeads] = React.useState<Lead[]>(store.leads);
  const [search, setSearch] = React.useState('');
  const [selectedStage, setSelectedStage] = React.useState<string>('All');
  const [selectedTrainingMode, setSelectedTrainingMode] = React.useState<string>('All');
  const [selectedSource, setSelectedSource] = React.useState<string>('All');

  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [isConvertModalOpen, setIsConvertModalOpen] = React.useState(false);
  const [isConverting, setIsConverting] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

  // Bulk Selection & Action State
  const [selectedLeadIds, setSelectedLeadIds] = React.useState<string[]>([]);
  const [bulkCounsellorId, setBulkCounsellorId] = React.useState<string>('');
  const [bulkStage, setBulkStage] = React.useState<LeadStage>('Follow-up');
  const [isBulkProcessing, setIsBulkProcessing] = React.useState(false);

  const availableCounsellors = React.useMemo(() => {
    return (store.users || []).filter(
      (u) => u.role === 'counsellor' || u.role === 'admin' || u.role === 'super_admin'
    );
  }, []);

  const canAccessCrm =
    hasPermission('crm:read') ||
    role === 'counsellor' ||
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

  const [email, setEmail] = React.useState('');
  const [courseId, setCourseId] = React.useState(store.courses?.[0]?.id || '');
  const [counsellorId, setCounsellorId] = React.useState<string>(user?.id || '');
  const [currentStatus, setCurrentStatus] = React.useState<LeadCurrentStatus>('Working Professional');
  const [trainingPref, setTrainingPref] = React.useState<'Online' | 'Offline'>('Online');
  const [source, setSource] = React.useState<LeadSource>('Website');
  const [notes, setNotes] = React.useState('');

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
  const [editCourseId, setEditCourseId] = React.useState('');
  const [editCounsellorId, setEditCounsellorId] = React.useState('');
  const [editCurrentStatus, setEditCurrentStatus] = React.useState<LeadCurrentStatus>('Working Professional');
  const [editTrainingPref, setEditTrainingPref] = React.useState<'Online' | 'Offline'>('Online');
  const [editSource, setEditSource] = React.useState<LeadSource>('Website');
  const [editNotes, setEditNotes] = React.useState('');

  // Follow-up notes update state
  const [updateNotes, setUpdateNotes] = React.useState('');
  const [nextStage, setNextStage] = React.useState<LeadStage>('Follow-up');
  const [followUpDate, setFollowUpDate] = React.useState(
    new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [followUpTime, setFollowUpTime] = React.useState('11:00');
  const [bulkFollowUpDate, setBulkFollowUpDate] = React.useState(
    new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  );

  // Convert to Admission state
  const [convertCourseId, setConvertCourseId] = React.useState(store.courses?.[0]?.id || '');
  const [convertBatchId, setConvertBatchId] = React.useState('');
  const [convertCourseFee, setConvertCourseFee] = React.useState<number>(store.courses?.[0]?.price ?? 0);
  const [convertDob, setConvertDob] = React.useState('');
  const [convertGender, setConvertGender] = React.useState<'Male' | 'Female' | 'Other' | ''>('');
  const [convertCity, setConvertCity] = React.useState('');
  const [convertAddress, setConvertAddress] = React.useState('');
  const [convertEducation, setConvertEducation] = React.useState('');
  const [convertExperience, setConvertExperience] = React.useState<number>(0);
  const [discount, setDiscount] = React.useState(0);
  const [discountReason, setDiscountReason] = React.useState('');

  React.useEffect(() => {
    if (user?.id && !counsellorId) {
      setCounsellorId(user.id);
    }
  }, [user?.id, counsellorId]);

  const refreshLeads = React.useCallback(async () => {
    try {
      const fetched = await getLeads({
        stage: selectedStage as any,
        search: search.trim() || undefined,
      });
      if (Array.isArray(fetched)) {
        let filtered = fetched;
        if (selectedTrainingMode !== 'All') {
          filtered = filtered.filter((l) => l.training_preference === selectedTrainingMode);
        }
        if (selectedSource !== 'All') {
          filtered = filtered.filter((l) => l.lead_source === selectedSource);
        }
        setLeads(filtered);
        return;
      }
    } catch {}

    let list = [...(store.leads || [])];
    if (selectedStage !== 'All') {
      list = list.filter((l) => l.stage === selectedStage);
    }
    if (selectedTrainingMode !== 'All') {
      list = list.filter((l) => l.training_preference === selectedTrainingMode);
    }
    if (selectedSource !== 'All') {
      list = list.filter((l) => l.lead_source === selectedSource);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.full_name?.toLowerCase().includes(q) ||
          l.phone?.includes(q) ||
          l.whatsapp_number?.includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.lead_code?.toLowerCase().includes(q)
      );
    }
    setLeads(list);
  }, [search, selectedStage, selectedTrainingMode, selectedSource]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('search');
      if (q) {
        setSearch(q);
      }
      const leadId = params.get('leadId');
      if (leadId) {
        const matched = (store.leads || []).find((l) => l.id === leadId);
        if (matched) {
          openEditModal(matched);
        }
      }
    }
  }, []);

  React.useEffect(() => {
    refreshLeads();
  }, [refreshLeads]);

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
        experience_years: currentStatus === 'Fresher' ? 0 : 2,
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
      void refreshLeads();
    } catch (err: any) {
      alert(err?.message || 'Failed to create lead');
    }
  };

  const openEditModal = (lead: Lead) => {
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
      setFollowUpDate(new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10));
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
      const l = (store.leads || []).find((lead) => lead.id === selectedLead.id);
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
    if (!selectedLead || !user) return;

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

    try {
      await updateLeadDetails(
        selectedLead.id,
        {
          full_name: editFullName.trim(),
          country_code: editCountryCode,
          phone: editPhone.trim(),
          whatsapp_country_code: finalWaCountry,
          whatsapp_number: finalWaNumber.trim(),
          email: editEmail.trim(),
          interested_course_id: editCourseId,
          current_status: editCurrentStatus,
          training_preference: editTrainingPref,
          lead_source: editSource,
          counsellor_id: editCounsellorId,
          notes: editNotes,
          // NOTE: stage is strictly omitted so it is NOT overwritten!
        },
        user.id
      );

      setSelectedLead(null);
      void refreshLeads();
    } catch (err: any) {
      alert(err?.message || 'Failed to update lead details');
    }
  };

  const handleOpenConvert = (lead: Lead) => {
    if (isLeadConverted(lead, store.admissions)) {
      alert(`Lead ${lead.full_name} has already been converted to an admission.`);
      return;
    }
    if (!store.courses || store.courses.length === 0) {
      alert('No courses available in the system. Please configure courses in Academic management first before converting leads.');
      return;
    }
    setSelectedLead(lead);
    const defaultEdu = lead.education || lead.current_status || '';
    setConvertEducation(defaultEdu);
    setConvertExperience(lead.experience_years ?? 0);
    const matchedCourse = (store.courses || []).find((c) => c.id === lead.interested_course_id) || store.courses[0];
    const initialCourseId = matchedCourse?.id || '';
    setConvertCourseId(initialCourseId);
    const matchedBatch = (store.batches || []).find((b) => b.course_id === initialCourseId);
    setConvertBatchId(matchedBatch?.id || '');
    setConvertCourseFee(matchedCourse?.price ?? 0);
    setConvertDob('');
    setConvertGender('');
    setConvertCity('');
    setConvertAddress('');
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
    const course = (store.courses || []).find((c) => c.id === convertCourseId) || store.courses?.[0];
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

    try {
      await createAdmissionWorkflow(
        {
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
        },
        actorId
      );

      selectedLead.stage = 'Converted';
      setIsConvertModalOpen(false);
      setSelectedLead(null);
      await refreshLeads();
      alert(`Lead ${selectedLead.full_name} converted to confirmed admission successfully!`);
    } catch (err: any) {
      alert('Error converting lead: ' + (err.message || 'Unknown error'));
    } finally {
      setIsConverting(false);
    }
  };

  const getStageBadge = (stage: LeadStage) => {
    switch (stage) {
      case 'New':
        return <Badge variant="info">New</Badge>;
      case 'Contacted':
        return <Badge variant="secondary">Contacted</Badge>;
      case 'Follow-up':
        return <Badge variant="warning">Follow-up</Badge>;
      case 'Demo Scheduled':
        return <Badge variant="warning">Demo Scheduled</Badge>;
      case 'Demo Attended':
        return <Badge variant="success">Demo Attended</Badge>;
      case 'Interested':
        return <Badge variant="success">Interested</Badge>;
      case 'Not Interested':
        return <Badge variant="danger">Not Interested</Badge>;
      case 'Converted':
      case 'Enrolled':
        return <Badge variant="success">Converted</Badge>;
      case 'Lost':
        return <Badge variant="danger">Lost</Badge>;
      default:
        return <Badge variant="secondary">{stage}</Badge>;
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
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">CRM & Lead Management</h1>
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

      {/* Filter and Search Bar */}
      <Card className="p-4">
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
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && leads.every((l) => selectedLeadIds.includes(l.id))}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                  </th>
                  <th className="px-4 py-3">Lead ID</th>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Interested Course</th>
                  <th className="px-4 py-3">Mode & Source</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
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
                    const isSelected = selectedLeadIds.includes(lead.id);
                    const matchingAdmission = getLeadAdmission(lead, store.admissions);
                    const isConverted = lead.stage === 'Converted' || lead.stage === 'Enrolled' || Boolean(matchingAdmission);
                    const waCode = lead.whatsapp_country_code || lead.country_code || '+91';
                    const waNum = lead.whatsapp_number || lead.phone;
                    const waDigits = getCanonicalPhoneDigits(waCode, waNum);

                    return (
                      <tr
                        key={lead.id}
                        className={`transition-colors ${isSelected ? 'bg-blue-50/50 hover:bg-blue-50/80' : 'hover:bg-slate-50/80'}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleLead(lead.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                          />
                        </td>
                        <td className="px-4 py-3 font-semibold text-blue-600">{lead.lead_code}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{lead.full_name}</p>
                          <Badge variant="outline" className="text-[10px] mt-0.5 bg-slate-50 text-slate-600">
                            {lead.current_status || 'Working Professional'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700 flex items-center space-x-1.5 font-medium">
                            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{formatDisplayPhone(lead.country_code, lead.phone)}</span>
                          </p>
                          <div className="flex items-center space-x-1.5 mt-1">
                            <a
                              href={`https://wa.me/${waDigits}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Chat on WhatsApp (${waDigits})`}
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded transition-colors"
                            >
                              <MessageSquare className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                              <span>WhatsApp</span>
                            </a>
                            {lead.whatsapp_number && lead.whatsapp_number !== lead.phone && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[90px]" title={lead.whatsapp_number}>
                                {lead.whatsapp_number}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 text-[10px] flex items-center space-x-1.5 mt-1">
                            <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[130px]">{lead.email}</span>
                          </p>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {lead.interested_course_name || 'SAP Course'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="secondary"
                              className={
                                lead.training_preference === 'Online'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : lead.training_preference === 'Offline'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-50 text-slate-700'
                              }
                            >
                              {lead.training_preference || 'Online'}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={lead.lead_source === 'YouTube' ? 'border-red-200 text-red-700 bg-red-50/50' : ''}
                            >
                              {lead.lead_source || 'Website'}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            {isConverted ? (
                              <Badge variant="success">Converted</Badge>
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
                        <td className="px-4 py-3 text-slate-500">{formatDate(lead.created_at)}</td>
                        <td className="px-4 py-3 text-right space-x-1">
                          {canCreateLead && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditModal(lead)}
                              className="text-xs px-2 py-1"
                            >
                              <Edit2 className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          )}
                          {isConverted ? (
                            matchingAdmission && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  router.push(`/admissions?search=${encodeURIComponent(matchingAdmission.admission_number)}`);
                                }}
                                className="text-xs px-2 py-1 text-blue-600 hover:text-blue-800 border-blue-200 hover:bg-blue-50"
                              >
                                View Admission
                              </Button>
                            )
                          ) : (
                            canConvert && (
                              <>
                                <Button
                                  variant="sap"
                                  size="sm"
                                  onClick={() => {
                                    router.push(`/admissions?convertLeadId=${lead.id}`);
                                  }}
                                  className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  Convert to Admission
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenConvert(lead)}
                                  className="text-xs px-2 py-1"
                                >
                                  Quick Convert
                                </Button>
                              </>
                            )
                          )}
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

          <Input
            label="Email Address *"
            type="email"
            placeholder="ramesh@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

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

                <Input
                  label="Email Address *"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />

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
                      {(store.courses || []).map((c) => (
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

                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-800 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    Saving candidate information updates contact, training mode, and current status without changing the pipeline stage ({selectedLead.stage}).
                  </span>
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <Button variant="outline" size="sm" onClick={() => setSelectedLead(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="sap"
                    size="sm"
                    onClick={handleSaveLeadDetails}
                    disabled={Boolean(editPhoneError || editWaError)}
                  >
                    Save Candidate Details
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
                    const matchedCourse = (store.courses || []).find((c) => c.id === newCId);
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
                  {(store.courses || []).map((c) => (
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
                  onChange={(e) => setConvertBatchId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                >
                  {(() => {
                    const courseBatches = (store.batches || []).filter((b) => b.course_id === convertCourseId);
                    if (courseBatches.length === 0) {
                      return <option value="">No dedicated batches (General)</option>;
                    }
                    return (
                      <>
                        <option value="">Select Batch (Optional)</option>
                        {courseBatches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.batch_name} ({b.training_mode})
                          </option>
                        ))}
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
                disabled={isConverting || (store.courses || []).length === 0}
              >
                {isConverting ? 'Converting...' : 'Confirm Admission & Create Profile'}
              </Button>
            </div>
          </div>
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
