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
  Download,
  ShieldAlert,
  CreditCard,
  CheckCircle,
  ExternalLink,
  Receipt as ReceiptIcon,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileUpload } from '@/components/ui/file-upload';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Admission, AdmissionStatus, PaymentMethod, Receipt } from '@/types';
import { createAdmissionWorkflow, getAdmissions } from '@/lib/services/admission-service';
import { formatINR, formatDate, exportToCSV } from '@/lib/utils/formatters';
import { resolveState, INDIAN_STATE_CODES } from '@/lib/services/finance-formatters';
import { useAuth } from '@/components/providers/auth-provider';

export default function AdmissionsPage() {
  const { user, role, hasPermission } = useAuth();
  const [admissions, setAdmissions] = React.useState<Admission[]>([]);
  const [loadError, setLoadError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('All');
  const [isNewModalOpen, setIsNewModalOpen] = React.useState(false);

  const canAccessAdmissions =
    hasPermission('admissions:read') ||
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'counsellor' ||
    role === 'onboarding_team';

  const canCreateAdmission =
    hasPermission('admissions:write') ||
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'counsellor';

  const canExportAdmissions =
    role === 'admin' ||
    role === 'super_admin' ||
    hasPermission('admissions:read');

  const handleExportCSV = () => {
    const exportData = admissions.map((adm) => ({
      'Admission Number': adm.admission_number,
      'Student Name': adm.student_name,
      'Email': adm.email,
      'Phone': adm.phone,
      'Course Name': adm.course_name,
      'Batch Name': adm.batch_name || 'Unassigned',
      'Training Mode': adm.training_mode,
      'Course Fee (INR)': adm.course_fee,
      'Discount (INR)': adm.discount,
      'Net Payable (INR)': adm.net_payable,
      'Admission Date': formatDate(adm.admission_date),
      'Status': adm.status,
    }));
    exportToCSV(`admissions_registry_${new Date().toISOString().slice(0, 10)}`, exportData);
  };

  // Form State for New Admission
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [dob, setDob] = React.useState('1998-06-15');
  const [gender, setGender] = React.useState<'Male' | 'Female' | 'Other'>('Male');
  const [address, setAddress] = React.useState('');
  const [city, setCity] = React.useState('Hyderabad');
  const [stateCode, setStateCode] = React.useState('36');
  const [education, setEducation] = React.useState('B.Tech / MBA / B.Com');
  const [experienceYears, setExperienceYears] = React.useState(1);
  const [employmentStatus, setEmploymentStatus] = React.useState<'Employed' | 'Unemployed' | 'Student' | 'Career Gap'>('Employed');
  const defaultCourseId = store.courses[0]?.id || '';
  const defaultBatches = (store.batches || []).filter((b) => b.course_id === defaultCourseId);
  const defaultBatch = defaultBatches.find(
    (b) => (b.current_enrolled || 0) < (b.maximum_capacity ?? 25)
  );

  const [courseId, setCourseId] = React.useState(defaultCourseId);
  const [trainingMode, setTrainingMode] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [batchId, setBatchId] = React.useState(defaultBatch?.id || '');
  const [batchError, setBatchError] = React.useState('');
  const [counsellorId, setCounsellorId] = React.useState('');
  const [discount, setDiscount] = React.useState(0);
  const [feeDueDate, setFeeDueDate] = React.useState('');
  const [discountReason, setDiscountReason] = React.useState('');
  const [convertedLeadId, setConvertedLeadId] = React.useState<string | undefined>(undefined);

  const availableCounsellors = React.useMemo(() => {
    return (store.users || []).filter(
      (u) => u.is_active && (u.role === 'counsellor' || u.role === 'admin' || u.role === 'super_admin')
    );
  }, []);

  React.useEffect(() => {
    if (!counsellorId && user) {
      if (user.role === 'counsellor') {
        setCounsellorId(user.id);
      } else {
        const firstCounsellor = availableCounsellors.find((c) => c.role === 'counsellor') || availableCounsellors[0];
        if (firstCounsellor) setCounsellorId(firstCounsellor.id);
      }
    }
  }, [user, availableCounsellors, counsellorId]);

  const courseBatches = React.useMemo(() => {
    return (store.batches || []).filter((b) => b.course_id === courseId);
  }, [courseId, store.batches]);

  // Synchronize batch selection reactively when course changes
  React.useEffect(() => {
    if (courseId) {
      const validBatches = (store.batches || []).filter((b) => b.course_id === courseId);
      const isCurrentValid = validBatches.some((b) => b.id === batchId && (b.current_enrolled || 0) < (b.maximum_capacity ?? 25));
      if (!isCurrentValid) {
        const openBatch = validBatches.find(
          (b) => (b.current_enrolled || 0) < (b.maximum_capacity ?? 25)
        );
        setBatchId(openBatch?.id || '');
      }
    } else {
      setBatchId('');
    }
  }, [courseId, batchId]);

  // Initial Downpayment / Admission Fee Collection state
  const [collectInitialPayment, setCollectInitialPayment] = React.useState(false);
  const [initialPaymentAmount, setInitialPaymentAmount] = React.useState(0);
  const [initialPaymentMode, setInitialPaymentMode] = React.useState<PaymentMethod>('UPI');
  const [initialPaymentRef, setInitialPaymentRef] = React.useState('');
  const [initialPaymentProofUrl, setInitialPaymentProofUrl] = React.useState('');
  const [isPaymentProofUploading, setIsPaymentProofUploading] = React.useState(false);
  const [initialPaymentNotes, setInitialPaymentNotes] = React.useState('');
  const [admissionSuccessModal, setAdmissionSuccessModal] = React.useState<{
    admission: Admission;
    student: any;
    receipt?: Receipt;
    paidAmount: number;
    paymentPending?: boolean;
  } | null>(null);

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
  }, []);

  const selectedCourse = store.courses.find((c) => c.id === courseId) || store.courses[0];
  const courseFee = selectedCourse?.price || 45000;
  const netPayable = Math.max(0, courseFee - discount);

  const refreshList = async () => {
    try {
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
    setLoadError('');
    } catch (error) {
      setAdmissions([]);
      setLoadError(error instanceof Error ? error.message : 'Unable to load admissions. Please retry.');
    }
  };

  React.useEffect(() => {
    refreshList();
  }, [search, statusFilter]);

  const handleCreateAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPaymentProofUploading) return;
    if (!name || !phone || !email || !address) return;
    if (!user) {
      alert('Authentication required: Please sign in to register admissions.');
      return;
    }

    if (!batchId && courseBatches.length > 0) {
      setBatchError('Please select a batch with available seats. All full batches are disabled.');
      return;
    }

    if (batchId) {
      const selectedBatch = (store.batches || []).find((b) => b.id === batchId);
      if (selectedBatch) {
        if (selectedBatch.course_id !== courseId) {
          alert(`Invalid batch selection: Batch "${selectedBatch.batch_name}" belongs to another course. Please select a batch for the enrolled course.`);
          return;
        }
        const cap = selectedBatch.maximum_capacity ?? 25;
        if ((selectedBatch.current_enrolled || 0) >= cap) {
          setBatchError(`"${selectedBatch.batch_name}" is full (${selectedBatch.current_enrolled}/${cap}). Please select another batch.`);
          return;
        }
      }
    }

    try {
      const result = await createAdmissionWorkflow(
        {
          student_name: name,
        phone,
        email,
        dob,
        gender,
        address,
        city,
        state: INDIAN_STATE_CODES[stateCode] || 'Telangana',
        state_code: stateCode,
        education,
        experience_years: experienceYears,
        current_employment_status: employmentStatus,
        course_id: courseId,
        training_mode: trainingMode,
        batch_id: batchId,
        admission_date: new Date().toISOString().slice(0, 10),
        fee_due_date: feeDueDate,
        course_fee: courseFee,
        discount,
        discount_reason: discountReason,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorId || user.id,
        lead_id: convertedLeadId,
        initial_payment_amount: collectInitialPayment ? initialPaymentAmount : 0,
        payment_mode: initialPaymentMode,
        transaction_reference: initialPaymentRef,
        payment_proof_url: collectInitialPayment ? initialPaymentProofUrl : undefined,
        initial_payment_notes: initialPaymentNotes,
      },
      user.id
    );

      setIsNewModalOpen(false);
      setAdmissionSuccessModal({
        admission: result.admission,
        student: result.student,
        receipt: result.receipt,
        paymentPending: !!result.payment,
        paidAmount: collectInitialPayment ? initialPaymentAmount : 0,
      });

      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setDiscount(0);
      setFeeDueDate('');
      setDiscountReason('');
      setCollectInitialPayment(false);
      setInitialPaymentAmount(0);
      setInitialPaymentRef('');
      setInitialPaymentProofUrl('');
      setInitialPaymentNotes('');
      refreshList();
    } catch (err: any) {
      alert('Error registering admission: ' + (err.message || 'Unknown error'));
    }
  };

  if (!canAccessAdmissions) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          You do not have authorization to view student admissions and enrollment records. This area is restricted to Admissions Counsellors, Onboarding Team, and Administration.
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
      {loadError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p>{loadError}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void refreshList()}>
            Retry
          </Button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Admissions</h1>
          <p className="text-xs text-slate-500 mt-1">
            Confirmed student enrollments with automated fee ledger, and portal enablement.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {canExportAdmissions && (
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
          {canCreateAdmission && (
            <Button variant="sap" size="sm" onClick={() => setIsNewModalOpen(true)} className="flex items-center space-x-1 text-xs">
              <Plus className="h-4 w-4" />
              <span>New Admission</span>
            </Button>
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
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Fee Structure</th>
                  
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Onboarding</th>
                  <th className="px-4 py-3 text-right">Actions</th>
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
                  const onbCase = store.onboardingCases.find(
                    (c) => c.admission_id === adm.id || c.admission_number === adm.admission_number
                  );
                  const matchingStudent = (store.students || []).find(
                    (s) =>
                      (adm.student_id && s.id === adm.student_id) ||
                      s.admission_id === adm.id ||
                      s.admission_number === adm.admission_number ||
                      (adm.phone && s.phone === adm.phone) ||
                      (adm.email && s.email?.toLowerCase() === adm.email.toLowerCase())
                  );
                  const profileId =
                    matchingStudent?.id ||
                    adm.student_id ||
                    matchingStudent?.student_code ||
                    adm.admission_number ||
                    adm.id;

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
                        
                      </td>
                      <td className="px-4 py-3 text-slate-600">{adm.batch_name || 'Assigned Batch'}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{formatINR(adm.net_payable)}</p>
                      {adm.discount > 0 && (
                        <p className="text-[10px] text-emerald-600 font-medium">Disc: -{formatINR(adm.discount)}</p>
                      )}
                    </td>
                    
                    <td className="px-4 py-3 text-slate-500">{formatDate(adm.admission_date)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="success">{adm.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {onbCase ? (
                        <div className="flex flex-col items-start gap-1">
                          <Link href={`/onboarding?search=${encodeURIComponent(adm.admission_number)}`}>
                            <Badge
                              variant={
                                onbCase.status === 'completed'
                                  ? 'success'
                                  : onbCase.status === 'in_progress'
                                  ? 'info'
                                  : onbCase.status === 'blocked'
                                  ? 'destructive'
                                  : 'warning'
                              }
                              className="text-[10px] cursor-pointer hover:opacity-80 transition-opacity font-semibold"
                            >
                              {onbCase.status === 'in_progress' ? 'In Progress' : onbCase.status.replace('_', ' ')}
                            </Badge>
                          </Link>
                          <Link
                            href={`/onboarding?search=${encodeURIComponent(adm.admission_number)}`}
                            className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center font-medium"
                          >
                            <span>View Onboarding Case &rarr;</span>
                          </Link>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Not Generated</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {onbCase && (
                          <Link href={`/onboarding?search=${encodeURIComponent(adm.admission_number)}`}>
                            <Button variant="outline" size="sm" className="text-[10px] px-2 py-1 text-blue-600 border-blue-200 hover:bg-blue-50">
                              View Onboarding Case
                            </Button>
                          </Link>
                        )}
                        {matchingStudent && (matchingStudent.outstanding_amount ?? adm.net_payable) > 0 && (
                          <Link
                            href={`/accounts/payments?studentId=${matchingStudent.id}&feeAccountId=fa-${adm.id}&amount=${matchingStudent.outstanding_amount ?? adm.net_payable}`}
                          >
                            <Button
                              variant="sap"
                              size="sm"
                              className="text-[10px] px-2 py-1 flex items-center space-x-1"
                              title="Collect / Record Fee Payment"
                            >
                              <CreditCard className="h-3 w-3" />
                              <span>Collect Fee</span>
                            </Button>
                          </Link>
                        )}
                        <Link href={`/students/${profileId}`}>
                          <Button variant="outline" size="sm" className="text-[10px] px-2 py-1">
                            360° Profile
                          </Button>
                        </Link>
                      </div>
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
        description="Enrolls the student, assigns course & batch, creates fee account, and tracks the outstanding balance."
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
                State *
              </label>
              <select
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                {Object.entries(INDIAN_STATE_CODES).map(([code, stateName]) => (
                  <option key={code} value={code}>
                    {stateName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  SAP Course *
                </label>
                <select
                  value={courseId}
                  onChange={(e) => {
                    const newCourseId = e.target.value;
                    setCourseId(newCourseId);
                    const matchingBatches = (store.batches || []).filter((b) => b.course_id === newCourseId);
                    const availableBatch = matchingBatches.find(
                      (b) => (b.current_enrolled || 0) < (b.maximum_capacity ?? 25)
                    );
                    setBatchId(availableBatch?.id || '');
                    setBatchError('');
                  }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
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
                  onChange={(e) => { setBatchId(e.target.value); setBatchError(''); }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                  required={courseBatches.length > 0}
                >
                  {courseBatches.length > 0 && <option value="" disabled>Select a batch with available seats</option>}
                  {courseBatches.length === 0 ? (
                    <option value="" disabled>No active batches for this course</option>
                  ) : (
                    courseBatches.map((b) => {
                      const cap = b.maximum_capacity ?? 25;
                      const enrolled = b.current_enrolled || 0;
                      const isFull = enrolled >= cap;
                      return (
                        <option key={b.id} value={b.id} disabled={isFull}>
                          {b.batch_name} ({b.start_time}-{b.end_time}) [{enrolled}/{cap} seats]{isFull ? ' - FULL (No Seats)' : ''}
                        </option>
                      );
                    })
                  )}
                </select>
                {courseBatches.length > 0 && !courseBatches.some((b) => (b.current_enrolled || 0) < (b.maximum_capacity ?? 25)) && (
                  <p role="alert" className="mt-2 text-xs text-rose-700">All batches for this course are full. Add a batch or update its capacity in Batch Management before registering.</p>
                )}
                {batchError && <p role="alert" className="mt-2 text-xs text-rose-700">{batchError}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Admissions Counsellor *
                </label>
                <select
                  value={counsellorId}
                  onChange={(e) => setCounsellorId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
                  required
                >
                  <option value="" disabled>Select admissions counsellor</option>
                  {availableCounsellors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.role === 'counsellor' ? 'Counsellor' : 'Admin'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Fee Details */}
          <div className="border-t border-slate-200 pt-3">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
              Fee Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Standard Course Fee"
                value={`₹${courseFee.toLocaleString('en-IN')}`}
                disabled
              />
              <Input
                label="Fee Due Date *"
                type="date"
                value={feeDueDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setFeeDueDate(e.target.value)}
                required
              />
              <Input
                label="Approved Discount (₹)"
                type="number"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between mt-3">
              <div>
                <p className="text-xs font-bold text-emerald-900">Total Net Payable Amount:</p>
                <p className="text-[11px] text-emerald-700">Partial payments are supported; balances update after Accounts approval.</p>
              </div>
              <span className="text-xl font-extrabold text-emerald-800">
                {formatINR(netPayable)}
              </span>
            </div>

            {/* Admission Downpayment & Initial Payment Collection Section */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  <div>
                    <span className="font-bold text-xs text-slate-800 block">
                      Initial Admission Payment & Downpayment (Optional)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Record a partial or full payment at enrollment
                    </span>
                  </div>
                </div>
                <label className="flex items-center space-x-2 cursor-pointer bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-xs hover:border-emerald-400 transition-colors">
                  <input
                    type="checkbox"
                    checked={collectInitialPayment}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCollectInitialPayment(checked);
                      if (checked && initialPaymentAmount === 0) {
                        setInitialPaymentAmount(netPayable);
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-sap-blue focus:ring-sap-blue"
                  />
                  <span className="text-xs font-semibold text-slate-700">Collect Payment Now</span>
                </label>
              </div>

              {collectInitialPayment && (
                <div className="pt-2 border-t border-slate-200 space-y-3">
                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                      Quick Presets:
                    </span>
                    <button
                      type="button"
                      onClick={() => setInitialPaymentAmount(0)}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
                    >
                      ₹0 (Pay Later)
                    </button>
                      <button
                        type="button"
                        onClick={() => setInitialPaymentAmount(Math.round(netPayable / 2))}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-300 transition-colors"
                      >
                        50% Downpayment ({formatINR(Math.round(netPayable / 2))})
                      </button>
                    <button
                      type="button"
                      onClick={() => setInitialPaymentAmount(netPayable)}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 hover:bg-purple-200 border border-purple-300 transition-colors"
                    >
                      Full Fee ({formatINR(netPayable)})
                    </button>
                  </div>

                  {/* Payment Inputs Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Amount to Collect (₹) *
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max={netPayable}
                        value={initialPaymentAmount}
                        onChange={(e) =>
                          setInitialPaymentAmount(Math.min(netPayable, Math.max(0, Number(e.target.value))))
                        }
                        required={collectInitialPayment}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Payment Mode *
                      </label>
                      <select
                        value={initialPaymentMode}
                        onChange={(e) => setInitialPaymentMode(e.target.value as PaymentMethod)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
                      >
                        <option value="UPI">UPI (GPay / PhonePe / QR)</option>
                        <option value="Credit Card">Credit Card</option>
                        <option value="Debit Card">Debit Card</option>
                        <option value="Net Banking">Net Banking</option>
                        <option value="Cash">Cash at Campus Desk</option>
                        <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                        <option value="Cheque">Cheque / Demand Draft</option>
                      </select>
                    </div>

                    <Input
                      label="Transaction / Cheque / UTR Ref #"
                      placeholder="e.g. UTR-9823419082 or Cheque #123456"
                      value={initialPaymentRef}
                      onChange={(e) => setInitialPaymentRef(e.target.value)}
                    />
                  </div>

                  <FileUpload
                    bucket="payment-proofs"
                    label="Payment Proof / Transaction Image (Optional)"
                    description="Attach a payment screenshot, bank transfer confirmation, or cheque image."
                    value={initialPaymentProofUrl}
                    onChange={setInitialPaymentProofUrl}
                    onUploadingChange={setIsPaymentProofUploading}
                  />

                  <Input
                    label="Payment Remarks / Notes"
                    placeholder="e.g. Initial downpayment collected during admission registration"
                    value={initialPaymentNotes}
                    onChange={(e) => setInitialPaymentNotes(e.target.value)}
                  />

                  {/* Live Ledger Calculation Preview */}
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Total Course Fee:</span>
                      <span className="font-semibold text-slate-800">{formatINR(netPayable)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Collected Now:</span>
                      <span className="font-bold text-emerald-600">{formatINR(initialPaymentAmount)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Remaining Arrears:</span>
                      <span
                        className={`font-bold ${
                          netPayable - initialPaymentAmount > 0 ? 'text-amber-600' : 'text-slate-600'
                        }`}
                      >
                        {formatINR(netPayable - initialPaymentAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsNewModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm" disabled={isPaymentProofUploading || (courseBatches.length > 0 && !batchId)}>
              Confirm Admission & Submit Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Admission Success & Receipt Confirmation Modal */}
      {admissionSuccessModal && (
        <Modal
          isOpen={!!admissionSuccessModal}
          onClose={() => setAdmissionSuccessModal(null)}
          title="Student Admission Confirmed!"
          description="The student has been successfully enrolled in the academic cohort."
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-emerald-950">
                  {admissionSuccessModal.admission.student_name}
                </h3>
                <p className="text-emerald-800">
                  Admission Number: <strong className="font-mono">{admissionSuccessModal.admission.admission_number}</strong>
                </p>
                <p className="text-emerald-700 text-[11px]">
                  Course: {admissionSuccessModal.admission.course_name} | Mode: {admissionSuccessModal.admission.training_mode}
                </p>
              </div>
            </div>

            {admissionSuccessModal.receipt ? (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-blue-900 font-bold">
                    <ReceiptIcon className="h-4 w-4 text-blue-600" />
                    <span>Official Payment Receipt Generated</span>
                  </div>
                  <Badge variant="success" className="text-[10px]">
                    Payment Verified
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-blue-100">
                  <div>
                    <span className="text-slate-500 text-[10px] block">Receipt Number:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {admissionSuccessModal.receipt.receipt_number}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">Amount Paid Upfront:</span>
                    <span className="font-bold text-emerald-700">
                      {formatINR(admissionSuccessModal.receipt.payment_amount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">Payment Mode:</span>
                    <span className="font-medium text-slate-800">
                      {admissionSuccessModal.receipt.payment_mode}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">Remaining Arrears:</span>
                    <span className="font-bold text-amber-700">
                      {formatINR(admissionSuccessModal.receipt.remaining_balance)}
                    </span>
                  </div>
                </div>

                
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <p className="font-semibold text-xs">{admissionSuccessModal.paymentPending ? 'Payment Pending Approval' : 'No Upfront Payment Recorded'}</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {admissionSuccessModal.paymentPending ? 'Payment proof has been sent to Accounts for approval. Verified balances and the receipt will update after approval.' : 'The student is enrolled. Record a payment from the Accounts Desk to begin fee approval.'} LMS access remains inactive until onboarding checks are completed.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
              {admissionSuccessModal.receipt && (
                <Link
                  href={`/accounts/receipts/${admissionSuccessModal.receipt.id}`}
                  target="_blank"
                >
                  <Button variant="sap" size="sm" className="w-full sm:w-auto text-xs flex items-center space-x-1">
                    <ReceiptIcon className="h-3.5 w-3.5" />
                    <span>View & Print Official Receipt</span>
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              )}
              <Link href={`/students/${admissionSuccessModal.student.id}`}>
                <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs flex items-center space-x-1">
                  <span>Open Student 360° Profile</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdmissionSuccessModal(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
