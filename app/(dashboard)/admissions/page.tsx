'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  UploadCloud,
  Image as ImageIcon,
  User,
  X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { FileUpload } from '@/components/ui/file-upload';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Admission, AdmissionStatus, PaymentMethod, Receipt } from '@/types';
import { createAdmissionWorkflow, getAdmissions, validateFeeDueDate } from '@/lib/services/admission-service';
import { isLeadConverted } from '@/lib/services/crm-service';
import { formatINR, formatDate, exportToCSV, maskBankAccountId } from '@/lib/utils/formatters';
import { resolveState, INDIAN_STATE_CODES } from '@/lib/services/finance-formatters';
import { actualPaymentDate } from '@/lib/services/payment-entry-rules';
import { validateAlternatePhoneNumber, getCanonicalPhoneDigits } from '@/lib/utils/phone-validation';
import { useAuth } from '@/components/providers/auth-provider';

export default function AdmissionsPage() {
  const router = useRouter();
  const { user, role, hasPermission } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [admissions, setAdmissions] = React.useState<Admission[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
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
  const [alternatePhone, setAlternatePhone] = React.useState('');
  const [alternatePhoneError, setAlternatePhoneError] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [photoUrl, setPhotoUrl] = React.useState('');
  const [photoPreview, setPhotoPreview] = React.useState('');
  const [photoError, setPhotoError] = React.useState('');
  const [isPhotoUploading, setIsPhotoUploading] = React.useState(false);
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
  const [trainingMode, setTrainingMode] = React.useState<'Online' | 'Offline' | 'Classroom' | 'Hybrid'>('Hybrid');
  const [batchId, setBatchId] = React.useState(defaultBatch?.id || '');
  const [batchError, setBatchError] = React.useState('');
  const [counsellorId, setCounsellorId] = React.useState('');
  // Requirement 4: Approved discount numeric input is empty by default when form opens
  const [discount, setDiscount] = React.useState<number | ''>('');
  const [feeDueDate, setFeeDueDate] = React.useState('');
  const [feeDueDateError, setFeeDueDateError] = React.useState('');
  const [discountReason, setDiscountReason] = React.useState('');
  const [convertedLeadId, setConvertedLeadId] = React.useState<string | undefined>(undefined);

  // Requirement 6: Four Bank Details Fields in Payments in exact order
  const defaultBankName = store.settings?.bank_name || 'HDFC Bank Ltd';
  const defaultAccountName = store.settings?.bank_account_name || 'NEXT GEN ERP SOLUTIONS PRIVATE LIMITED';
  const defaultAccountId = store.settings?.bank_account_number || '50200088991122';
  const defaultUpi = store.settings?.upi_id || 'nextgenerp@hdfcbank';

  const [ourBankName, setOurBankName] = React.useState(defaultBankName);
  const [ourBankAccountName, setOurBankAccountName] = React.useState(defaultAccountName);
  const [ourBankAccountId, setOurBankAccountId] = React.useState(defaultAccountId);
  const [ourUpiDetails, setOurUpiDetails] = React.useState(defaultUpi);
  const [bankPreset, setBankPreset] = React.useState<'default' | 'custom'>('default');

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError('');

    // Supported formats: JPG, JPEG, PNG, WEBP (Max 2 MB)
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setPhotoError('Supported photo formats: JPG, JPEG, PNG, WEBP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Student photograph size must not exceed 2 MB.');
      return;
    }

    // Instant local preview
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setIsPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'student-photos');
      const res = await fetch('/api/students/photo', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success && data.url) {
        setPhotoUrl(data.url);
      } else {
        setPhotoError(data.error || 'Failed to upload photo. Please retry.');
      }
    } catch (err: any) {
      setPhotoError(err.message || 'Photo upload failed.');
    } finally {
      setIsPhotoUploading(false);
    }
  };

  const handlePhotoRemove = () => {
    setPhotoUrl('');
    setPhotoPreview('');
    setPhotoError('');
  };

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

  const courseBatches = (store.batches || []).filter((b) => b.course_id === courseId);

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
  const [initialPaymentDate, setInitialPaymentDate] = React.useState(actualPaymentDate);
  const paymentProofGeneration = React.useRef(0);
  const paymentProofVersion = paymentProofGeneration.current;
  const changeInitialPaymentMode = (mode: PaymentMethod) => {
    paymentProofGeneration.current += 1;
    setInitialPaymentMode(mode);
    setIsPaymentProofUploading(false);
    if (mode === 'Cash') { setInitialPaymentRef(''); setInitialPaymentProofUrl(''); }
  };
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
        const lead = store.leads.find((l) => l.id === leadId);
        if (lead) {
          if (isLeadConverted(lead, store.admissions)) {
            alert(`Lead ${lead.lead_code || lead.full_name} has already been converted to an admission.`);
            router.replace('/admissions');
            return;
          }
          setConvertedLeadId(leadId);
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
  }, [router]);

  const selectedCourse = store.courses.find((c) => c.id === courseId) || store.courses[0];
  const courseFee = selectedCourse?.price || 45000;
  const discountAmount = typeof discount === 'number' ? discount : 0;
  const netPayable = Math.max(0, courseFee - discountAmount);
  const isFullPayment = (collectInitialPayment && initialPaymentAmount >= netPayable) || netPayable === 0;
  const isFeeDueDateRequired = !isFullPayment;

  // Requirement 5: Clear due date from form state when full payment is collected
  React.useEffect(() => {
    if (isFullPayment) {
      if (feeDueDate) setFeeDueDate('');
      if (feeDueDateError) setFeeDueDateError('');
    }
  }, [isFullPayment, feeDueDate, feeDueDateError]);

  const refreshList = React.useCallback(async () => {
    setIsLoading(true);
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
            a.student_unique_id?.toLowerCase().includes(q) ||
            a.phone?.includes(q) ||
            a.alternate_phone?.includes(q) ||
            a.email?.toLowerCase().includes(q)
        );
      }
      setAdmissions(list);
      setLoadError('');
    } catch (error) {
      setAdmissions([]);
      setLoadError(error instanceof Error ? error.message : 'Unable to load admissions. Please retry.');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter]);

  React.useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleCreateAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (initialPaymentMode !== 'Cash' && isPaymentProofUploading) return;
    if (collectInitialPayment && (!Number.isFinite(initialPaymentAmount) || initialPaymentAmount <= 0)) { alert('Amount to Collect must be greater than zero.'); return; }
    if (collectInitialPayment && initialPaymentMode !== 'Cash' && !initialPaymentRef.trim()) { alert('Transaction reference is required for non-cash payments.'); return; }
    if (!name || !phone || !email || !address) return;
    if (!user) {
      alert('Authentication required: Please sign in to register admissions.');
      return;
    }

    if (alternatePhone.trim()) {
      const altValidation = validateAlternatePhoneNumber(alternatePhone, 'Alternate mobile number');
      if (!altValidation.isValid) {
        setAlternatePhoneError(altValidation.error || 'Please enter a valid alternate mobile number.');
        return;
      }
    }
    setAlternatePhoneError('');

    const admissionDateStr = new Date().toISOString().slice(0, 10);
    const dueDateValidation = validateFeeDueDate({
      feeDueDate: isFullPayment ? undefined : (feeDueDate.trim() ? feeDueDate : undefined),
      admissionDate: admissionDateStr,
      netPayable,
      collectInitialPayment,
      initialPaymentAmount: collectInitialPayment ? initialPaymentAmount : 0,
    });

    if (!dueDateValidation.isValid) {
      setFeeDueDateError(dueDateValidation.error || 'Please enter a valid fee due date.');
      return;
    }
    setFeeDueDateError('');
    if (convertedLeadId) {
      const lead = store.leads.find((l) => l.id === convertedLeadId);
      if (lead && isLeadConverted(lead, store.admissions)) {
        alert(`Lead ${lead.lead_code || lead.full_name} has already been converted to an admission.`);
        setIsNewModalOpen(false);
        setConvertedLeadId(undefined);
        return;
      }
    }
    setIsSubmitting(true);

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
        alternate_phone: alternatePhone.trim() || undefined,
        email,
        photo_url: photoUrl || undefined,
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
        fee_due_date: isFullPayment ? undefined : (feeDueDate.trim() ? feeDueDate : undefined),
        course_fee: courseFee,
        discount: discountAmount,
        discount_reason: discountReason,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorId || user.id,
        lead_id: convertedLeadId,
        collect_initial_payment: collectInitialPayment,
        initial_payment_amount: collectInitialPayment ? initialPaymentAmount : 0,
        payment_mode: initialPaymentMode,
        transaction_reference: initialPaymentMode === 'Cash' ? null : initialPaymentRef,
        payment_proof_url: collectInitialPayment && initialPaymentMode !== 'Cash' ? initialPaymentProofUrl || undefined : undefined,
        payment_date: collectInitialPayment ? initialPaymentDate : undefined,
        initial_payment_notes: initialPaymentNotes,
        our_bank_name: collectInitialPayment && initialPaymentMode !== 'Cash' ? ourBankName : undefined,
        our_bank_account_name: collectInitialPayment && initialPaymentMode !== 'Cash' ? ourBankAccountName : undefined,
        our_bank_account_id: collectInitialPayment && initialPaymentMode !== 'Cash' ? ourBankAccountId : undefined,
        our_upi_details: collectInitialPayment && (initialPaymentMode === 'UPI' || ourUpiDetails) ? ourUpiDetails : undefined,
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
      setAlternatePhone('');
      setAlternatePhoneError('');
      setPhotoUrl('');
      setPhotoPreview('');
      setPhotoError('');
      setEmail('');
      setAddress('');
      setDiscount('');
      setFeeDueDate('');
      setFeeDueDateError('');
      setDiscountReason('');
      setCollectInitialPayment(false);
      setInitialPaymentAmount(0);
      setInitialPaymentRef('');
      setInitialPaymentProofUrl('');
      setInitialPaymentDate(actualPaymentDate());
      setInitialPaymentNotes('');
      if (convertedLeadId) {
        const lead = store.leads.find((l) => l.id === convertedLeadId);
        if (lead) {
          lead.stage = 'Converted';
        }
      }
      refreshList();
    } catch (err: any) {
      alert('Error registering admission: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
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
          You do not have authorization to view student admissions and enrollment records. This area is restricted to Admissions Sales staff, Onboarding Team, and Administration.
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
    <div className="space-y-4">
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
        <div className="flex flex-wrap items-center gap-2 max-w-full">
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
      <Card className="p-3">
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

          <div className="flex flex-wrap items-center gap-2 max-w-full">
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
              <thead className="bg-slate-50 text-[11px] text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-3.5 py-2.5">Student</th>
                  <th className="px-3.5 py-2.5">Course</th>
                  <th className="px-3.5 py-2.5">Batch</th>
                  <th className="px-3.5 py-2.5">Fee Structure</th>
                  <th className="px-3.5 py-2.5">Date</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <TableSkeleton columns={7} rows={6} />
                ) : admissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3.5 py-8 text-center text-slate-500">
                      <UserCheck className="h-8 w-8 mx-auto text-slate-400 mb-2 opacity-50" />
                      <p className="font-semibold text-slate-700">No Admissions Found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {search || statusFilter !== 'All'
                          ? 'Try adjusting your search query or status filter.'
                          : 'No admissions have been registered yet. Click "New Admission" above to add one.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  admissions.map((adm) => {
                  const resolved = resolveState(adm.state_code || adm.state || adm.city || adm.address);
                  const isIntra = resolved.code === '36';
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
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <Link
                          href={`/students/${profileId}`}
                          className="font-semibold text-slate-900 text-xs hover:text-[#0A6ED1] transition-colors block"
                        >
                          {adm.student_name}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 whitespace-nowrap">
                          <span className="font-medium text-slate-600">{adm.phone}</span>
                          {adm.phone && (
                            <a
                              href={`https://wa.me/${getCanonicalPhoneDigits('+91', adm.phone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Chat on WhatsApp (${adm.phone})`}
                              className="h-5 w-5 rounded-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white flex items-center justify-center transition-all shrink-0 border border-[#25D366]/30 shadow-2xs"
                            >
                              <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                              </svg>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <p className="font-semibold text-slate-800 text-xs">{adm.course_name}</p>
                        <span className="text-[10px] text-slate-500 font-medium">{adm.training_mode || 'Online'}</span>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-slate-700 font-medium">
                          {adm.batch_name || 'Assigned Batch'}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <p className="font-bold text-slate-900 text-xs">{formatINR(adm.net_payable)}</p>
                        {adm.discount > 0 && (
                          <p className="text-[10px] text-emerald-600 font-medium">Disc: -{formatINR(adm.discount)}</p>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(adm.admission_date)}</td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <Badge variant="success" className="whitespace-nowrap font-medium">{adm.status}</Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {matchingStudent && (matchingStudent.outstanding_amount ?? adm.net_payable) > 0 && (
                            <Link
                              href={`/accounts/payments?studentId=${matchingStudent.id}&feeAccountId=fa-${adm.id}&amount=${matchingStudent.outstanding_amount ?? adm.net_payable}`}
                            >
                              <Button
                                variant="sap"
                                size="sm"
                                className="h-7 px-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap shadow-xs"
                                title="Collect / Record Fee Payment"
                              >
                                <CreditCard className="h-3 w-3 mr-1" />
                                <span>Collect Fee</span>
                              </Button>
                            </Link>
                          )}
                          <Link href={`/students/${profileId}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200"
                              title="View Student Profile"
                            >
                              <User className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                }))}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <Input
              label="Alternate Mobile Number (Optional)"
              type="tel"
              placeholder="+91 98765 43211"
              value={alternatePhone}
              error={alternatePhoneError}
              onChange={(e) => {
                setAlternatePhone(e.target.value);
                if (alternatePhoneError) setAlternatePhoneError('');
              }}
            />
          </div>

          {/* Student Photo Attachment (Optional) */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="h-14 w-14 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center relative shadow-xs shrink-0">
                  {photoPreview || photoUrl ? (
                    <img
                      src={photoPreview || photoUrl}
                      alt="Student photo preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-slate-400 flex flex-col items-center justify-center p-1 text-center">
                      <ImageIcon className="h-5 w-5 text-slate-300" />
                      <span className="text-[9px] text-slate-400">Photo</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Student Photo (Optional)
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Supported: JPG, JPEG, PNG, WEBP (Max 2 MB).
                  </p>
                  {photoError && <p role="alert" className="text-xs text-rose-600 font-medium mt-0.5">{photoError}</p>}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <label className="cursor-pointer">
                  <span className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs inline-flex items-center space-x-1.5 transition-colors">
                    <UploadCloud className="h-3.5 w-3.5 text-slate-500" />
                    <span>{isPhotoUploading ? 'Uploading...' : photoUrl || photoPreview ? 'Change Photo' : 'Upload Photo'}</span>
                  </span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={isPhotoUploading}
                    onChange={handlePhotoSelect}
                  />
                </label>
                {(photoUrl || photoPreview) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    onClick={handlePhotoRemove}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    <span>Remove</span>
                  </Button>
                )}
              </div>
            </div>
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
                  <option value="Offline">Offline</option>
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
                  Admissions Sales *
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
                      {c.full_name} ({c.role === 'counsellor' ? 'Sales' : 'Admin'})
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
                label="Approved Discount (₹)"
                type="number"
                placeholder="Enter approved discount"
                value={discount}
                min="0"
                max={courseFee}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setDiscount('');
                  } else {
                    const num = Number(val);
                    if (num < 0) setDiscount(0);
                    else if (num > courseFee) setDiscount(courseFee);
                    else setDiscount(num);
                  }
                }}
              />
              {!isFullPayment && (
                <div className="space-y-1 md:col-span-2">
                  <Input
                    label="Fee Due Date *"
                    type="date"
                    value={feeDueDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => {
                      setFeeDueDate(e.target.value);
                      if (feeDueDateError) setFeeDueDateError('');
                    }}
                    required
                    error={feeDueDateError}
                  />
                  <p className="text-[11px] text-slate-500">
                    Required for remaining balance of {formatINR(netPayable - (collectInitialPayment ? initialPaymentAmount : 0))}.
                  </p>
                </div>
              )}
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
                <div className="flex flex-wrap items-center gap-2 max-w-full">
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
                        min="0.01"
                        step="0.01"
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
                        onChange={(e) => changeInitialPaymentMode(e.target.value as PaymentMethod)}
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

                    <Input label="Actual Payment Date *" type="date" value={initialPaymentDate} onChange={(e) => setInitialPaymentDate(e.target.value)} required={collectInitialPayment} />
                    {initialPaymentMode !== 'Cash' && <Input
                      required={collectInitialPayment}
                      label="Transaction / Cheque / UTR Ref #"
                      placeholder="e.g. UTR-9823419082 or Cheque #123456"
                      value={initialPaymentRef}
                      onChange={(e) => setInitialPaymentRef(e.target.value)}
                    />}
                  </div>

                  {initialPaymentMode !== 'Cash' && (
                    <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-xs text-slate-800 block">
                            Bank Details
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Institute receiving account details for fee reconciliation
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <label className="text-[10px] text-slate-500 font-medium">Account Preset:</label>
                          <select
                            value={bankPreset}
                            onChange={(e) => {
                              const val = e.target.value as 'default' | 'custom';
                              setBankPreset(val);
                              if (val === 'default') {
                                setOurBankName(defaultBankName);
                                setOurBankAccountName(defaultAccountName);
                                setOurBankAccountId(defaultAccountId);
                                setOurUpiDetails(defaultUpi);
                              }
                            }}
                            className="text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"
                          >
                            <option value="default">Primary Account ({defaultBankName})</option>
                            <option value="custom">Custom Bank Account</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div>
                          <Input
                            label="Our Bank Name *"
                            placeholder="e.g. HDFC Bank"
                            value={ourBankName}
                            onChange={(e) => {
                              setOurBankName(e.target.value);
                              setBankPreset('custom');
                            }}
                            required={collectInitialPayment}
                          />
                        </div>
                        <div>
                          <Input
                            label="Our Bank Account Name *"
                            placeholder="e.g. Next-Gen ERP Solutions"
                            value={ourBankAccountName}
                            onChange={(e) => {
                              setOurBankAccountName(e.target.value);
                              setBankPreset('custom');
                            }}
                            required={collectInitialPayment}
                          />
                        </div>
                        <div>
                          <Input
                            label="Our Bank Account ID *"
                            type="text"
                            placeholder="e.g. 50200088991122"
                            value={ourBankAccountId}
                            onChange={(e) => {
                              setOurBankAccountId(e.target.value);
                              setBankPreset('custom');
                            }}
                            required={collectInitialPayment}
                          />
                        </div>
                        <div>
                          <Input
                            label="Our UPI Details"
                            type="text"
                            placeholder="e.g. nextgenerp@bank"
                            value={ourUpiDetails}
                            onChange={(e) => {
                              setOurUpiDetails(e.target.value);
                              setBankPreset('custom');
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {initialPaymentMode !== 'Cash' && <FileUpload
                    key={initialPaymentMode}
                    bucket="payment-proofs"
                    label="Payment Proof / Transaction Image (Optional)"
                    description="Attach a payment screenshot, bank transfer confirmation, or cheque image."
                    value={initialPaymentProofUrl}
                    onChange={(url) => { if (paymentProofVersion === paymentProofGeneration.current) setInitialPaymentProofUrl(url); }}
                    onUploadingChange={(uploading) => { if (paymentProofVersion === paymentProofGeneration.current) setIsPaymentProofUploading(uploading); }}
                  />}

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
            <Button type="submit" variant="sap" size="sm" disabled={isSubmitting || isPaymentProofUploading || (courseBatches.length > 0 && !batchId)}>
              {isSubmitting ? 'Registering Admission...' : 'Confirm Admission & Submit Payment'}
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
                <p className="text-emerald-900 font-medium">
                  Student Unique ID:{' '}
                  <strong className="font-mono bg-emerald-100/90 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                    {admissionSuccessModal.student.student_unique_id ||
                      admissionSuccessModal.admission.student_unique_id ||
                      admissionSuccessModal.student.student_code}
                  </strong>
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

                {admissionSuccessModal.admission.our_bank_name && (
                  <div className="pt-2 border-t border-blue-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Credited To:</span>
                    <span className="font-semibold text-slate-800">
                      {admissionSuccessModal.admission.our_bank_name}
                      {admissionSuccessModal.admission.our_bank_account_id &&
                        ` (${maskBankAccountId(admissionSuccessModal.admission.our_bank_account_id)})`}
                    </span>
                  </div>
                )}
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
