'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  UserCheck,
  Search,
  Plus,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  FileText,
  Building,
  GraduationCap,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Admission, AdmissionStatus } from '@/types';
import { createAdmissionWorkflow, getAdmissions } from '@/lib/services/admission-service';
import { formatINR, formatDate } from '@/lib/utils/formatters';
import { calculateGstBreakdown, resolveState, GST_STATE_CODES } from '@/lib/services/gst-service';

export default function AdmissionsPage() {
  const [admissions, setAdmissions] = React.useState<Admission[]>(store.admissions);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('All');
  const [isNewModalOpen, setIsNewModalOpen] = React.useState(false);

  // Form State for New Admission
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [dob, setDob] = React.useState('1998-06-15');
  const [gender, setGender] = React.useState<'Male' | 'Female' | 'Other'>('Male');
  const [address, setAddress] = React.useState('');
  const [city, setCity] = React.useState('Hyderabad');
  const [stateCode, setStateCode] = React.useState('36');
  const [studentGstin, setStudentGstin] = React.useState('');
  const [education, setEducation] = React.useState('B.Tech / MBA / B.Com');
  const [experienceYears, setExperienceYears] = React.useState(1);
  const [employmentStatus, setEmploymentStatus] = React.useState<'Employed' | 'Unemployed' | 'Student' | 'Career Gap'>('Employed');
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || '');
  const [trainingMode, setTrainingMode] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [batchId, setBatchId] = React.useState(store.batches[0]?.id || '');
  const [discount, setDiscount] = React.useState(0);
  const [discountReason, setDiscountReason] = React.useState('');
  const [paymentPlan, setPaymentPlan] = React.useState<'Full Payment' | '2 Installments' | '3 Installments' | 'Custom'>('3 Installments');
  const [convertedLeadId, setConvertedLeadId] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
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
  }, []);

  const selectedCourse = store.courses.find((c) => c.id === courseId) || store.courses[0];
  const courseFee = selectedCourse?.price || 45000;
  const netPayable = Math.max(0, courseFee - discount);

  const gstPreview = React.useMemo(() => {
    return calculateGstBreakdown(netPayable, stateCode);
  }, [netPayable, stateCode]);

  const refreshList = async () => {
    let list = await getAdmissions();
    if (statusFilter !== 'All') {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.student_name?.toLowerCase().includes(q) ||
          a.admission_number?.toLowerCase().includes(q) ||
          a.phone?.includes(q) ||
          a.email?.toLowerCase().includes(q)
      );
    }
    setAdmissions(list);
  };

  React.useEffect(() => {
    refreshList();
  }, [search, statusFilter]);

  const handleCreateAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !email || !address) return;

    await createAdmissionWorkflow(
      {
        student_name: name,
        phone,
        email,
        dob,
        gender,
        address,
        city,
        state: GST_STATE_CODES[stateCode] || 'Telangana',
        state_code: stateCode,
        gstin: studentGstin,
        education,
        experience_years: experienceYears,
        current_employment_status: employmentStatus,
        course_id: courseId,
        training_mode: trainingMode,
        batch_id: batchId,
        admission_date: new Date().toISOString().slice(0, 10),
        course_fee: courseFee,
        discount,
        discount_reason: discountReason,
        payment_plan: paymentPlan,
        counsellor_id: 'usr-counsellor',
        lead_id: convertedLeadId,
      },
      'usr-admin'
    );

    setIsNewModalOpen(false);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setStudentGstin('');
    setDiscount(0);
    refreshList();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Admissions</h1>
          <p className="text-xs text-slate-500 mt-1">
            Confirmed student enrollments with automated fee ledger, installment plan generation, and portal enablement.
          </p>
        </div>
        <Button variant="sap" size="sm" onClick={() => setIsNewModalOpen(true)} className="flex items-center space-x-1 text-xs">
          <Plus className="h-4 w-4" />
          <span>New Admission</span>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by student name, admission #, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            {['All', 'Confirmed', 'Active', 'Completed', 'On Hold'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  statusFilter === st
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

      {/* Admissions Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Adm #</th>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Course & Mode</th>
                  <th className="px-4 py-3">Place of Supply</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Fee Structure</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admissions.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      <UserCheck className="h-8 w-8 mx-auto text-slate-400 mb-2 opacity-50" />
                      <p className="font-semibold text-slate-700">No Admissions Found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {search || statusFilter !== 'All'
                          ? 'Try adjusting your search query or status filter.'
                          : 'No admissions have been registered yet. Click "New Admission" above to add one.'}
                      </p>
                    </td>
                  </tr>
                )}
                {admissions.map((adm) => {
                  const resolved = resolveState(adm.state_code || adm.state || adm.city || adm.address);
                  const isIntra = resolved.code === '36';
                  return (
                    <tr key={adm.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-blue-600">{adm.admission_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{adm.student_name}</p>
                        <p className="text-[10px] text-slate-400">{adm.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{adm.course_name}</p>
                        <Badge variant="outline" className="text-[10px] mt-0.5">{adm.training_mode}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{adm.state || resolved.name}</p>
                        <Badge
                          variant="outline"
                          className={`text-[9px] mt-0.5 ${
                            isIntra
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {isIntra ? 'Intra-State (9%+9%)' : 'Inter-State (18% IGST)'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{adm.batch_name || 'Assigned Batch'}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{formatINR(adm.net_payable)}</p>
                      {adm.discount > 0 && (
                        <p className="text-[10px] text-emerald-600 font-medium">Disc: -{formatINR(adm.discount)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">{adm.payment_plan}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(adm.admission_date)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="success">{adm.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href="/students">
                        <Button variant="outline" size="sm" className="text-xs px-2.5 py-1">
                          View 360°
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* New Admission Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Register New Student Admission"
        description="Enrolls the student, assigns course & batch, creates fee account, and generates installment plan."
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateAdmission} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Student Full Name *"
              placeholder="e.g. Ramesh Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Phone Number *"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label="Email Address *"
              type="email"
              placeholder="student@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Date of Birth *"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Gender *
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label="Residential Address *"
              placeholder="House #, Street, Locality"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
            <Input
              label="City *"
              placeholder="e.g. Hyderabad / Pune / Bengaluru"
              value={city}
              onChange={(e) => {
                const val = e.target.value;
                setCity(val);
                const resolved = resolveState(val);
                if (resolved && resolved.code) {
                  setStateCode(resolved.code);
                }
              }}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                State & Place of Supply *
              </label>
              <select
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                {Object.entries(GST_STATE_CODES).map(([code, stateName]) => (
                  <option key={code} value={code}>
                    {stateName} ({code}) {code === '36' ? '— Intra-State (TS)' : '— Inter-State'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Student/Sponsor GSTIN (Optional B2B)"
              placeholder="e.g. 36AABCU9603R1ZX"
              value={studentGstin}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setStudentGstin(val);
                if (val.length >= 2 && /^\d{2}/.test(val)) {
                  const prefix = val.substring(0, 2);
                  if (GST_STATE_CODES[prefix]) {
                    setStateCode(prefix);
                  }
                }
              }}
            />
            <Input
              label="Education Qualification *"
              placeholder="B.Tech / MBA / B.Com"
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Experience (Years)"
              type="number"
              value={experienceYears}
              onChange={(e) => setExperienceYears(Number(e.target.value))}
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Employment Status
              </label>
              <select
                value={employmentStatus}
                onChange={(e) => setEmploymentStatus(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Employed">Employed</option>
                <option value="Unemployed">Unemployed</option>
                <option value="Student">Student</option>
                <option value="Career Gap">Career Gap</option>
              </select>
            </div>
          </div>

          {/* Academic Selection */}
          <div className="border-t border-slate-200 pt-3">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
              Academic Course & Batch Assignment
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  SAP Course *
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
                >
                  {store.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_name} (₹{c.price.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Training Mode *
                </label>
                <select
                  value={trainingMode}
                  onChange={(e) => setTrainingMode(e.target.value as any)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                >
                  <option value="Hybrid">Hybrid</option>
                  <option value="Online">Online Live</option>
                  <option value="Classroom">Classroom Lab</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Assign Batch *
                </label>
                <select
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                >
                  {store.batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batch_name} ({b.start_time}-{b.end_time})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Fee & Payment Plan */}
          <div className="border-t border-slate-200 pt-3">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
              Fee Ledger & Installment Plan
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                label="Standard Course Fee"
                value={`₹${courseFee.toLocaleString('en-IN')}`}
                disabled
              />
              <Input
                label="Approved Discount (₹)"
                type="number"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Payment Installment Plan *
                </label>
                <select
                  value={paymentPlan}
                  onChange={(e) => setPaymentPlan(e.target.value as any)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
                >
                  <option value="Full Payment">Full Payment (Single Installment)</option>
                  <option value="2 Installments">2 Installments (50% - 50%)</option>
                  <option value="3 Installments">3 Installments (Monthly)</option>
                  <option value="Custom">Custom Plan (4 Installments)</option>
                </select>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between mt-3">
              <div>
                <p className="text-xs font-bold text-emerald-900">Total Net Payable Amount:</p>
                <p className="text-[11px] text-emerald-700">Installments will be automatically created on due dates</p>
              </div>
              <span className="text-xl font-extrabold text-emerald-800">
                {formatINR(netPayable)}
              </span>
            </div>

            {/* Live Automated GST Invoicing Engine Breakdown */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 mt-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  <span className="font-bold text-slate-800">
                    Automated GST Invoicing Engine (SAC: 999293)
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={
                    gstPreview.supply_type === 'INTRA_STATE'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]'
                      : 'bg-amber-100 text-amber-800 border-amber-300 text-[10px]'
                  }
                >
                  {gstPreview.supply_type === 'INTRA_STATE'
                    ? 'Intra-State: 9% CGST + 9% SGST'
                    : 'Inter-State: 18% IGST'}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs pt-1.5 border-t border-blue-100">
                <div>
                  <span className="text-slate-500 text-[10px] block">Base Taxable Value:</span>
                  <span className="font-semibold text-slate-800">{formatINR(gstPreview.taxable_amount)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">
                    {gstPreview.supply_type === 'INTRA_STATE' ? 'CGST (9%) + SGST (9%):' : 'IGST (18%):'}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {gstPreview.supply_type === 'INTRA_STATE'
                      ? `${formatINR(gstPreview.cgst_amount)} + ${formatINR(gstPreview.sgst_amount)}`
                      : formatINR(gstPreview.igst_amount)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Total Tax Liability:</span>
                  <span className="font-bold text-emerald-700">{formatINR(gstPreview.total_tax)}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-blue-100/60">
                <span>Place of Supply: <strong>{gstPreview.place_of_supply}</strong></span>
                <span>SHA-256 e-Invoice IRN signing automated on payment receipt</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsNewModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Confirm Admission & Activate Student
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
