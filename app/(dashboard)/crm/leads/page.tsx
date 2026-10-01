'use client';

import * as React from 'react';
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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { BulkImportModal } from '@/components/bulk-import-modal';
import { store } from '@/lib/services/data-store';
import { Lead, LeadStage } from '@/types';
import { createLead, updateLeadStage } from '@/lib/services/crm-service';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { formatDate } from '@/lib/utils/formatters';

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = React.useState<Lead[]>(store.leads);
  const [search, setSearch] = React.useState('');
  const [selectedStage, setSelectedStage] = React.useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [isConvertModalOpen, setIsConvertModalOpen] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

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

  // Convert to Admission state
  const [paymentPlan, setPaymentPlan] = React.useState<'Full Payment' | '2 Installments' | '3 Installments'>('3 Installments');
  const [discount, setDiscount] = React.useState(0);
  const [discountReason, setDiscountReason] = React.useState('');

  const refreshLeads = () => {
    let list = [...store.leads];
    if (selectedStage !== 'All') {
      list = list.filter((l) => l.stage === selectedStage);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.full_name.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.lead_code.toLowerCase().includes(q)
      );
    }
    setLeads(list);
  };

  React.useEffect(() => {
    refreshLeads();
  }, [search, selectedStage]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !phone || !email) return;

    await createLead({
      full_name: fullName,
      phone,
      email,
      interested_course_id: courseId,
      current_status: status,
      experience_years: 1,
      training_preference: trainingPref,
      lead_source: source,
      counsellor_id: 'usr-counsellor',
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
    await updateLeadStage(selectedLead.id, nextStage, updateNotes, 'usr-counsellor');
    setUpdateNotes('');
    setSelectedLead(null);
    refreshLeads();
  };

  const handleConvertLead = async () => {
    if (!selectedLead) return;
    const course = store.courses.find((c) => c.id === selectedLead.interested_course_id) || store.courses[0];
    const defaultBatch = store.batches.find((b) => b.course_id === course.id) || store.batches[0];

    await createAdmissionWorkflow(
      {
        student_name: selectedLead.full_name,
        phone: selectedLead.phone,
        email: selectedLead.email,
        dob: '2000-01-01',
        gender: 'Male',
        address: 'Hitec City, Madhapur',
        city: 'Hyderabad',
        education: 'Graduate / B.Tech / MBA',
        experience_years: selectedLead.experience_years || 1,
        current_employment_status: 'Employed',
        course_id: course.id,
        training_mode: selectedLead.training_preference,
        batch_id: defaultBatch?.id,
        admission_date: new Date().toISOString().slice(0, 10),
        course_fee: course.price,
        discount,
        discount_reason: discountReason || 'Counsellor approved discount',
        payment_plan: paymentPlan,
        counsellor_id: 'usr-counsellor',
        lead_id: selectedLead.id,
      },
      'usr-counsellor'
    );

    setIsConvertModalOpen(false);
    setSelectedLead(null);
    refreshLeads();
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

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
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
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors">
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
                      {lead.stage !== 'Converted' && lead.stage !== 'Enrolled' && (
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
                            onClick={() => {
                              setSelectedLead(lead);
                              setIsConvertModalOpen(true);
                            }}
                            className="text-xs px-2 py-1"
                          >
                            Quick Convert
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
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
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
              <p className="font-bold text-[#0A6ED1]">Auto-Populated from Lead Profile:</p>
              <p className="text-slate-700"><strong>Name:</strong> {selectedLead.full_name}</p>
              <p className="text-slate-700"><strong>Course:</strong> {selectedLead.interested_course_name}</p>
              <p className="text-slate-700"><strong>Contact:</strong> {selectedLead.phone} | {selectedLead.email}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Payment Plan *
                </label>
                <select
                  value={paymentPlan}
                  onChange={(e) => setPaymentPlan(e.target.value as any)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                >
                  <option value="Full Payment">Full Payment (100% Upfront)</option>
                  <option value="2 Installments">2 Installments (50% - 50%)</option>
                  <option value="3 Installments">3 Installments (Monthly)</option>
                </select>
              </div>
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

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
              <span className="font-bold text-emerald-900">Total Net Payable:</span>
              <span className="text-base font-extrabold text-emerald-700">
                ₹{Math.max(0, 45000 - discount).toLocaleString('en-IN')}
              </span>
            </div>

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
