'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Filter,
  Plus,
  Phone,
  Mail,
  Calendar,
  ArrowRight,
  CheckCircle,
  Clock,
  UserCheck,
  ChevronRight,
  MessageSquare,
  Upload,
  Download,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { BulkImportModal } from '@/components/bulk-import-modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { Lead, LeadStage } from '@/types';
import { createLead, updateLeadStage, bulkAssignLeads, bulkUpdateLeadStage } from '@/lib/services/crm-service';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { formatDate, exportToCSV } from '@/lib/utils/formatters';

export default function LeadsPage() {
  const router = useRouter();
  const { user, role, hasPermission } = useAuth();
  const [leads, setLeads] = React.useState<Lead[]>(store.leads);
  const [search, setSearch] = React.useState('');
  const [selectedStage, setSelectedStage] = React.useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [isConvertModalOpen, setIsConvertModalOpen] = React.useState(false);
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
      'Phone': l.phone,
      'Email': l.email,
      'Interested Course': l.interested_course_name || 'N/A',
      'Training Preference': l.training_preference,
      'Lead Source': l.lead_source,
      'Stage': l.stage,
      'Current Status': l.current_status,
      'Counsellor': l.counsellor_name || 'Unassigned',
      'Follow-up Date': l.follow_up_date ? formatDate(l.follow_up_date) : 'N/A',
      'Created Date': formatDate(l.created_at),
    }));
    exportToCSV(`crm_leads_export_${new Date().toISOString().slice(0, 10)}`, exportData);
  };

  // New Lead Form state
  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || '');
  const [status, setStatus] = React.useState('Working Professional');
  const [trainingPref, setTrainingPref] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [source, setSource] = React.useState<'Website' | 'Google Ads' | 'Meta Ads' | 'Referral' | 'Walk-in' | 'Other'>('Website');
  const [notes, setNotes] = React.useState('');

  // Follow-up notes update state
  const [updateNotes, setUpdateNotes] = React.useState('');
  const [nextStage, setNextStage] = React.useState<LeadStage>('Follow-up');
  const [followUpDate, setFollowUpDate] = React.useState(
    new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [followUpTime, setFollowUpTime] = React.useState('11:00');

  // Convert to Admission state
  const [convertCourseId, setConvertCourseId] = React.useState(store.courses[0]?.id || '');
  const [convertBatchId, setConvertBatchId] = React.useState('');
  const [convertCourseFee, setConvertCourseFee] = React.useState<number>(store.courses[0]?.price || 45000);
  const [convertDob, setConvertDob] = React.useState('2001-06-15');
  const [convertGender, setConvertGender] = React.useState<'Male' | 'Female' | 'Other'>('Male');
  const [convertCity, setConvertCity] = React.useState('Hyderabad');
  const [convertAddress, setConvertAddress] = React.useState('Plot 12, Madhapur');
  const [convertEducation, setConvertEducation] = React.useState('Graduate / B.Tech / MBA');
  const [convertExperience, setConvertExperience] = React.useState<number>(1);
  const [discount, setDiscount] = React.useState(0);
  const [discountReason, setDiscountReason] = React.useState('');

  const refreshLeads = () => {
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
  };

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
          setSelectedLead(matched);
          setNextStage(matched.stage);
        }
      }
    }
  }, []);

  React.useEffect(() => {
    refreshLeads();
  }, [search, selectedStage]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !phone || !email) return;
    if (!user) {
      alert('Authentication required: Please sign in to create leads.');
      return;
    }

    await createLead({
      full_name: fullName,
      phone,
      email,
      interested_course_id: courseId,
      current_status: status,
      experience_years: 1,
      training_preference: trainingPref,
      lead_source: source,
      counsellor_id: user.id,
      notes,
      stage: 'New',
    });

    setIsAddModalOpen(false);
    setFullName('');
    setPhone('');
    setEmail('');
    setNotes('');
    refreshLeads();
  };

  const handleUpdateStage = async () => {
    if (!selectedLead) return;
    if (!user) {
      alert('Authentication required: Please sign in to update lead stages.');
      return;
    }
    await updateLeadStage(selectedLead.id, nextStage, updateNotes, user.id);
    if (followUpDate && (nextStage === 'Follow-up' || nextStage === 'Demo Scheduled')) {
      const l = (store.leads || []).find((lead) => lead.id === selectedLead.id);
      if (l) {
        l.follow_up_date = followUpTime ? `${followUpDate}T${followUpTime}:00` : followUpDate;
        store.persist();
      }
    }
    setUpdateNotes('');
    setSelectedLead(null);
    refreshLeads();
  };

  const handleOpenConvert = (lead: Lead) => {
    setSelectedLead(lead);
    const defaultEdu =
      lead.education || lead.current_status || 'Graduate / B.Tech / MBA';
    setConvertEducation(defaultEdu);
    setConvertExperience(lead.experience_years ?? 1);
    const matchedCourse = (store.courses || []).find((c) => c.id === lead.interested_course_id) || store.courses?.[0];
    const initialCourseId = matchedCourse?.id || '';
    setConvertCourseId(initialCourseId);
    const matchedBatch = (store.batches || []).find((b) => b.course_id === initialCourseId);
    setConvertBatchId(matchedBatch?.id || '');
    setConvertCourseFee(matchedCourse?.price || 45000);
    setConvertDob('2001-06-15');
    setConvertGender('Male');
    setConvertCity('Hyderabad');
    setConvertAddress('Plot 12, Madhapur');
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

  const handleBulkStage = async () => {
    if (!selectedLeadIds.length || !bulkStage) return;
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
        `Bulk stage update to ${bulkStage}`
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
    if (!selectedLead) return;
    if (!user) {
      alert('Authentication required: Please sign in to convert leads.');
      return;
    }
    const course = (store.courses || []).find((c) => c.id === convertCourseId) || store.courses?.[0];
    if (!course) {
      alert('No courses available to convert lead into admission.');
      return;
    }
    const defaultBatch = convertBatchId
      ? (store.batches || []).find((b) => b.id === convertBatchId)
      : (store.batches || []).find((b) => b.course_id === course.id);

    try {
      await createAdmissionWorkflow(
        {
          student_name: selectedLead.full_name,
          phone: selectedLead.phone,
          email: selectedLead.email,
          dob: convertDob || '2001-06-15',
          gender: convertGender,
          address: convertAddress || 'Hitec City, Madhapur',
          city: convertCity || 'Hyderabad',
          education: convertEducation || 'Graduate / B.Tech / MBA',
          experience_years: Number(convertExperience) || 0,
          current_employment_status: (['Employed', 'Unemployed', 'Student', 'Career Gap'].includes(selectedLead.current_status || '')
            ? (selectedLead.current_status as any)
            : 'Employed') as 'Employed' | 'Unemployed' | 'Student' | 'Career Gap',
          course_id: course.id,
          training_mode: selectedLead.training_preference,
          batch_id: defaultBatch?.id,
          admission_date: new Date().toISOString().slice(0, 10),
          course_fee: Number(convertCourseFee) || course.price || 45000,
          discount: Number(discount) || 0,
          discount_reason: discountReason || 'Counsellor approved discount',
          payment_plan: 'Full Payment',
          counsellor_id: user.id,
          lead_id: selectedLead.id,
        },
        user.id
      );

      setIsConvertModalOpen(false);
      setSelectedLead(null);
      refreshLeads();
      alert(`Lead ${selectedLead.full_name} converted to confirmed admission successfully!`);
    } catch (err: any) {
      alert('Error converting lead: ' + (err.message || 'Unknown error'));
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
        return <Badge variant="default">Demo Scheduled</Badge>;
      case 'Demo Attended':
        return <Badge variant="info">Demo Attended</Badge>;
      case 'Interested':
        return <Badge variant="default">Interested</Badge>;
      case 'Converted':
        return <Badge variant="success">Converted</Badge>;
      case 'Lost':
      case 'Not Interested':
        return <Badge variant="destructive">{stage}</Badge>;
    }
  };

  if (!canAccessCrm) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          You do not have authorization to view prospective leads and CRM pipeline data. This area is restricted to Counsellors and Admissions Administration.
        </p>
        <div className="pt-2">
          <Link href={role === 'student' ? '/portal' : '/dashboard'}>
            <Button variant="sap" size="sm" className="text-xs">
              Return to {role === 'student' ? 'Student Portal' : 'Dashboard'}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">CRM & Lead Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Capture prospective SAP students, track demos, manage counselling follow-ups, and convert to admissions.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </Button>
          )}
          {canCreateLead && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center space-x-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Bulk Import Leads</span>
              </Button>
              <Button variant="sap" size="sm" onClick={() => setIsAddModalOpen(true)} className="flex items-center space-x-1 text-xs">
                <Plus className="h-4 w-4" />
                <span>New Lead</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
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

          <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto">
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
      </Card>

      {/* Bulk Actions Toolbar */}
      {selectedLeadIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <div className="flex items-center space-x-2 font-semibold text-blue-900">
            <Users className="h-4 w-4 text-blue-600" />
            <span>{selectedLeadIds.length} lead(s) selected</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bulk Assign Counsellor */}
            <div className="flex items-center space-x-1.5">
              <select
                value={bulkCounsellorId}
                onChange={(e) => setBulkCounsellorId(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800"
              >
                <option value="">Select Counsellor</option>
                {availableCounsellors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.role})
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkCounsellorId || isBulkProcessing}
                onClick={handleBulkAssign}
                className="text-xs h-7 px-2.5 bg-white border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                Assign
              </Button>
            </div>

            <div className="h-4 w-px bg-blue-200 hidden sm:block" />

            {/* Bulk Update Stage */}
            <div className="flex items-center space-x-1.5">
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value as LeadStage)}
                className="text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800"
              >
                {['New', 'Contacted', 'Follow-up', 'Demo Scheduled', 'Demo Attended', 'Interested', 'Not Interested', 'Lost'].map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={isBulkProcessing}
                onClick={handleBulkStage}
                className="text-xs h-7 px-2.5 bg-white border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                Update Stage
              </Button>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedLeadIds([])}
              className="text-xs h-7 px-2 text-slate-500 hover:text-slate-800"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && leads.every((l) => selectedLeadIds.includes(l.id))}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                  </th>
                  <th className="px-4 py-3">Lead Code</th>
                  <th className="px-4 py-3">Prospect Name</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Interested Course</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                      <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-medium text-slate-700">No leads found</p>
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
                          <p className="text-[10px] text-slate-400">{lead.current_status}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700 flex items-center space-x-1">
                            <Phone className="h-3 w-3 text-slate-400" />
                            <span>{lead.phone}</span>
                          </p>
                          <p className="text-slate-500 text-[10px] flex items-center space-x-1 mt-0.5">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <span className="truncate max-w-[140px]">{lead.email}</span>
                          </p>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {lead.interested_course_name || 'SAP Course'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{lead.lead_source}</Badge>
                        </td>
                        <td className="px-4 py-3">{getStageBadge(lead.stage)}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(lead.created_at)}</td>
                        <td className="px-4 py-3 text-right space-x-1">
                          {canCreateLead && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedLead(lead);
                                setNextStage(lead.stage);
                              }}
                              className="text-xs px-2 py-1"
                            >
                              Update
                            </Button>
                          )}
                          {lead.stage !== 'Converted' && lead.stage !== 'Enrolled' && canConvert && (
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
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone Number *"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <Input
              label="Email Address *"
              type="email"
              placeholder="ramesh@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Interested SAP Course *
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            >
              {store.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_name} ({formatDate(c.created_at)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Training Mode
              </label>
              <select
                value={trainingPref}
                onChange={(e) => setTrainingPref(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Hybrid">Hybrid (Classroom + Online)</option>
                <option value="Online">Online Live Interactive</option>
                <option value="Classroom">Classroom Lab</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Lead Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Website">Website Form</option>
                <option value="Google Ads">Google Ads Campaign</option>
                <option value="Meta Ads">Meta Ads</option>
                <option value="Referral">Alumni Referral</option>
                <option value="Walk-in">Walk-in Inquiry</option>
              </select>
            </div>
          </div>

          <Input
            label="Current Status / Background"
            placeholder="e.g. Accounts Executive (2 yrs exp)"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Counsellor Notes / Demo Preferences
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Candidate requested syllabus brochure for S/4HANA weekend batch..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Create Lead
            </Button>
          </div>
        </form>
      </Modal>

      {/* Update Stage & Followup Modal */}
      {selectedLead && !isConvertModalOpen && (
        <Modal
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          title={`Update Lead: ${selectedLead.full_name}`}
          description={`Lead ID: ${selectedLead.lead_code} | Current Stage: ${selectedLead.stage}`}
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                New Stage
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

            {(nextStage === 'Follow-up' || nextStage === 'Demo Scheduled') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Follow-up Date *
                  </label>
                  <Input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="w-full text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Scheduled Time
                  </label>
                  <Input
                    type="time"
                    value={followUpTime}
                    onChange={(e) => setFollowUpTime(e.target.value)}
                    className="w-full text-xs"
                  />
                </div>
              </div>
            )}

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
                Save Updates
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Convert to Admission Modal (No Duplicate Data Entry) */}
      {selectedLead && isConvertModalOpen && (
        <Modal
          isOpen={isConvertModalOpen}
          onClose={() => setIsConvertModalOpen(false)}
          title={`Convert Lead to Confirmed Admission`}
          description={`Seamlessly creates Student ID, Course Assignment, Fee Ledger & Portal Account for ${selectedLead.full_name}.`}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
              <p className="font-bold text-[#0A6ED1]">Auto-Populated from Lead Profile:</p>
              <p className="text-slate-700"><strong>Name:</strong> {selectedLead.full_name}</p>
              <p className="text-slate-700"><strong>Interested Course:</strong> {selectedLead.interested_course_name || 'N/A'}</p>
              <p className="text-slate-700"><strong>Contact:</strong> {selectedLead.phone} | {selectedLead.email}</p>
            </div>

            {/* Academic Assignment */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Enrolling Course *
                </label>
                <select
                  value={convertCourseId}
                  onChange={(e) => {
                    const newCId = e.target.value;
                    setConvertCourseId(newCId);
                    const c = store.courses.find((x) => x.id === newCId);
                    if (c) {
                      setConvertCourseFee(c.price || 45000);
                      const matchingBatches = (store.batches || []).filter((b) => b.course_id === newCId);
                      setConvertBatchId(matchingBatches[0]?.id || '');
                    }
                  }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                >
                  {(store.courses || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Assigned Batch *
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
                    return courseBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_name}
                      </option>
                    ));
                  })()}
                </select>
              </div>

              <Input
                label="Course Fee (₹) *"
                type="number"
                value={convertCourseFee}
                onChange={(e) => setConvertCourseFee(Number(e.target.value))}
                required
              />
            </div>

            {/* Personal Details */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <Input
                label="City *"
                value={convertCity}
                onChange={(e) => setConvertCity(e.target.value)}
                required
              />
              <Input
                label="Address *"
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
              <Button variant="sap" size="sm" onClick={handleConvertLead}>
                Confirm Admission & Create Profile
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
