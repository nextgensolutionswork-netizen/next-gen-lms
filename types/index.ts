export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'accountant'
  | 'counsellor'
  | 'trainer'
  | 'placement_coordinator'
  | 'support'
  | 'onboarding_team'
  | 'student';

export interface UserProfile {
  tenant_id?: string;
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  status?: string;
  branch_id?: string;
  assigned_course_ids?: string[];
  created_at: string;
  updated_at: string;
}

export type Permission =
  | 'all:manage'
  | 'users:read'
  | 'users:write'
  | 'users:manage'
  | 'roles:manage'
  | 'crm:read'
  | 'crm:write'
  | 'crm:convert'
  | 'admissions:read'
  | 'admissions:write'
  | 'admissions:approve'
  | 'students:read'
  | 'students:write'
  | 'students:export'
  | 'courses:read'
  | 'courses:write'
  | 'courses:publish'
  | 'batches:read'
  | 'batches:write'
  | 'batches:transfer'
  | 'schedule:read'
  | 'schedule:write'
  | 'attendance:read'
  | 'attendance:write'
  | 'assignments:read'
  | 'assignments:write'
  | 'assignments:grade'
  | 'assessments:read'
  | 'assessments:write'
  | 'assessments:grade'
  | 'accounts:read'
  | 'accounts:write'
  | 'payments:create'
  | 'receipts:read'
  | 'receipts:create'
  | 'expenses:read'
  | 'expenses:write'
  | 'expenses:approve'
  | 'vendors:read'
  | 'vendors:write'
  | 'placements:read'
  | 'placements:write'
  | 'placement:read'
  | 'placement:write'
  | 'certificates:read'
  | 'certificates:generate'
  | 'certificates:issue'
  | 'certificates:revoke'
  | 'reports:read'
  | 'audit:read'
  | 'settings:manage'
  | 'settings:write'
  | 'doubts:read'
  | 'doubts:write'
  | 'doubts:assign'
  | 'doubts:resolve'
  | 'support:reply'
  | 'onboarding:read'
  | 'onboarding:write'
  | 'onboarding:assign'
  | 'onboarding:activate'
  | 'onboarding:complete';

export type LeadStage =
  | 'New'
  | 'Contacted'
  | 'Follow-up'
  | 'Demo Scheduled'
  | 'Demo Attended'
  | 'Interested'
  | 'Not Interested'
  | 'Converted'
  | 'Enrolled'
  | 'Lost';

export interface Lead {
  id: string;
  lead_code: string;
  full_name: string;
  phone: string;
  email: string;
  interested_course_id?: string;
  interested_course_name?: string;
  current_status?: string;
  education?: string;
  experience_years?: number;
  training_preference?: 'Online' | 'Classroom' | 'Hybrid';
  lead_source?: 'Website' | 'Google Ads' | 'Meta Ads' | 'Referral' | 'Walk-in' | 'Other';
  campaign?: string;
  counsellor_id?: string;
  counsellor_name?: string;
  demo_preference?: boolean;
  demo_date?: string;
  follow_up_date?: string;
  notes?: string;
  stage: LeadStage;
  created_at: string;
  updated_at: string;
}

export interface LeadFollowup {
  id: string;
  lead_id: string;
  counsellor_id: string;
  counsellor_name: string;
  stage_before: LeadStage;
  stage_after: LeadStage;
  notes: string;
  next_follow_up_date?: string;
  created_at: string;
}

export type AdmissionStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Active'
  | 'Completed'
  | 'Cancelled'
  | 'On Hold';

export interface Admission {
  tenant_id?: string;
  id: string;
  admission_number: string;
  student_id?: string;
  student_name: string;
  phone: string;
  email: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  address: string;
  city: string;
  state?: string;
  state_code?: string;
  gstin?: string;
  education: string;
  experience_years: number;
  current_employment_status: 'Employed' | 'Unemployed' | 'Student' | 'Career Gap';
  course_id: string;
  course_name?: string;
  training_mode: 'Online' | 'Classroom' | 'Hybrid';
  batch_id?: string;
  batch_name?: string;
  trainer_id?: string;
  trainer_name?: string;
  admission_date: string;
  course_fee: number;
  discount: number;
  discount_reason?: string;
  net_payable: number;
  payment_plan: 'Full Payment' | '2 Installments' | '3 Installments' | 'Custom';
  counsellor_id?: string;
  counsellor_name?: string;
  status: AdmissionStatus;
  created_at: string;
  updated_at: string;
}

export interface Student {
  onboarding_required?: boolean;
  tenant_id?: string;
  id: string;
  user_id: string;
  admission_id: string;
  student_code: string;
  admission_number: string;
  full_name: string;
  email: string;
  phone: string;
  profile_photo?: string;
  address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  gstin?: string;
  course_id: string;
  course_name?: string;
  sap_module?: string;
  batch_id?: string;
  batch_name?: string;
  trainer_id?: string;
  trainer_name?: string;
  joining_date: string;
  status: 'Active' | 'On Hold' | 'Completed' | 'Suspended' | 'Dropped';
  total_fee: number;
  discount?: number;
  paid_amount: number;
  outstanding_amount: number;
  attendance_percentage: number;
  course_progress: number;
  placement_status: 'Not Started' | 'Resume Preparation' | 'Mock Interview' | 'Job Search' | 'Interview Scheduled' | 'Interview Completed' | 'Offer Received' | 'Placed';
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  course_name: string;
  course_code: string;
  description: string;
  duration_weeks: number;
  category: 'SAP Functional' | 'SAP Technical' | 'SAP Cloud' | 'Enterprise Other';
  trainer_id?: string;
  trainer_name?: string;
  thumbnail_url?: string;
  price: number;
  status: 'Draft' | 'Under Review' | 'Published' | 'Archived';
  syllabus_url?: string;
  modules_count?: number;
  lessons_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  order_index: number;
  lessons_count?: number;
  created_at: string;
  updated_at: string;
}

export type LessonType =
  | 'Video'
  | 'PDF'
  | 'Document'
  | 'Text'
  | 'Quiz'
  | 'Assignment'
  | 'External link'
  | 'Live session';

export interface Lesson {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  lesson_type?: LessonType;
  content_type?: LessonType;
  duration_minutes: number;
  order_index: number;
  is_published: boolean;
  content_url?: string;
  text_content?: string;
  video_signed_path?: string;
  created_at: string;
  updated_at: string;
}

export interface LessonProgress {
  id: string;
  student_id: string;
  course_id: string;
  lesson_id: string;
  last_watched_seconds: number;
  video_total_seconds: number;
  completed_percentage: number;
  is_completed: boolean;
  completion_date?: string;
  updated_at: string;
}

export interface Batch {
  id: string;
  batch_code: string;
  batch_name: string;
  name?: string;
  course_id: string;
  course_name?: string;
  trainer_id: string;
  trainer_name?: string;
  training_mode: 'Online' | 'Classroom' | 'Hybrid';
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  days: string[]; // e.g. ['Mon', 'Wed', 'Fri']
  maximum_capacity: number;
  current_enrolled: number;
  status: 'Upcoming' | 'Active' | 'Completed' | 'Cancelled' | 'On Hold';
  created_at: string;
  updated_at: string;
}

export interface BatchTransferAudit {
  id: string;
  student_id: string;
  student_name: string;
  from_batch_id: string;
  from_batch_name: string;
  to_batch_id: string;
  to_batch_name: string;
  reason: string;
  transferred_by: string;
  transferred_at: string;
}

export interface ClassSession {
  id: string;
  course_id: string;
  course_name?: string;
  batch_id: string;
  batch_name?: string;
  trainer_id: string;
  trainer_name?: string;
  topic: string;
  session_date: string;
  start_time: string;
  end_time: string;
  mode: 'Online' | 'Classroom' | 'Hybrid';
  meeting_link?: string;
  meeting_id?: string;
  meeting_provider?: 'Zoom' | 'Google Meet';
  classroom?: string;
  notes?: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled' | 'Rescheduled';
  created_at: string;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused';
export type AttendanceSource = 'Manual' | 'Zoom' | 'Google Meet';

export interface AttendanceRecord {
  id: string;
  student_id: string;
  student_name?: string;
  batch_id: string;
  session_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  notes?: string;
  marked_by: string;
  marked_by_name?: string;
  marked_at: string;
  source?: AttendanceSource;
  meeting_id?: string;
  duration_minutes?: number;
  join_time?: string;
  leave_time?: string;
}

export interface MeetingParticipantLog {
  id: string;
  meeting_id: string;
  provider: 'Zoom' | 'Google Meet';
  participant_email: string;
  participant_name: string;
  join_time: string;
  leave_time?: string;
  duration_seconds: number;
  created_at: string;
}

export interface MeetingAttendanceSyncResult {
  session_id: string;
  meeting_id: string;
  provider: 'Zoom' | 'Google Meet';
  total_meeting_minutes: number;
  synced_records_count: number;
  records: AttendanceRecord[];
  alerts_dispatched: number;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  course_id: string;
  course_name?: string;
  batch_id: string;
  batch_name?: string;
  module_id?: string;
  due_date: string;
  maximum_marks: number;
  attachment_url?: string;
  created_by: string;
  created_at: string;
  submissions_count?: number;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name?: string;
  submission_text?: string;
  attachment_url?: string;
  submitted_at: string;
  status: 'Submitted' | 'Graded' | 'Resubmission Requested';
  marks_obtained?: number;
  feedback?: string;
  graded_by?: string;
  graded_at?: string;
}

export interface Quiz {
  id: string;
  course_id: string;
  course_name?: string;
  title: string;
  description?: string;
  duration_minutes: number;
  time_limit_minutes?: number;
  pass_percentage: number;
  passing_percentage?: number;
  attempts_allowed?: number;
  randomize_questions?: boolean;
  show_answers_after?: boolean;
  start_date?: string;
  end_date?: string;
  questions_count?: number;
  status?: 'Draft' | 'Published' | 'Archived';
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: 'MCQ' | 'Multiple' | 'TrueFalse' | 'ShortAnswer' | 'Multiple Choice';
  points: number;
  order_index: number;
  options: {
    id: string;
    text: string;
    is_correct?: boolean;
    [key: string]: any;
  }[];
  correct_option?: string;
  explanation?: string;
  created_at?: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  quiz_title?: string;
  student_id: string;
  student_name?: string;
  score: number;
  total_points: number;
  percentage: number;
  passed: boolean;
  started_at: string;
  completed_at?: string;
  status: 'In Progress' | 'Completed' | 'Timed Out';
  answers?: Record<string, string>;
  question_results?: any[];
}

export type FeeStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Refunded';

export interface StudentFeeAccount {
  tenant_id?: string;
  id: string;
  student_id: string;
  student_name?: string;
  admission_id: string;
  course_id: string;
  course_name?: string;
  original_fee: number;
  discount: number;
  discount_reason?: string;
  net_payable: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_plan: string;
  status: FeeStatus;
  created_at: string;
  updated_at: string;
}

export interface Installment {
  tenant_id?: string;
  id: string;
  fee_account_id: string;
  student_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  paid_amount: number;
  paid_date?: string;
  status: 'Upcoming' | 'Due' | 'Paid' | 'Partial' | 'Overdue' | 'Pending';
}

export type PaymentMethod =
  | 'Cash'
  | 'UPI'
  | 'Bank Transfer'
  | 'Card'
  | 'Credit Card'
  | 'Debit Card'
  | 'Net Banking'
  | 'Cheque'
  | 'Payment Gateway'
  | 'Other';

export interface Payment {
  tenant_id?: string;
  id: string;
  receipt_number: string;
  student_id: string;
  student_name?: string;
  admission_number?: string;
  fee_account_id: string;
  installment_id?: string;
  course_id: string;
  course_name?: string;
  amount: number;
  payment_date: string;
  payment_mode: PaymentMethod;
  transaction_reference?: string;
  gateway_order_id?: string;
  gateway_payment_id?: string;
  gateway_signature?: string;
  gateway_name?: 'Razorpay' | 'Cashfree';
  status?: 'Success' | 'Pending' | 'Failed' | 'Refunded';
  collected_by: string;
  collected_by_name?: string;
  notes?: string;
  created_at: string;
}

export interface Receipt {
  tenant_id?: string;
  id: string;
  receipt_number: string;
  payment_id: string;
  student_id: string;
  student_name: string;
  student_email?: string;
  admission_number: string;
  course_name: string;
  payment_amount: number;
  payment_mode: PaymentMethod;
  transaction_reference?: string;
  payment_date: string;
  remaining_balance: number;
  authorized_by: string;
  institute_name: string;
  institute_address: string;
  institute_phone: string;
  institute_gst: string;
  created_at: string;

  // GST & e-Invoice Compliance Fields
  supply_type?: 'INTRA_STATE' | 'INTER_STATE';
  place_of_supply?: string;
  place_of_supply_code?: string;
  sac_code?: string;
  taxable_amount?: number;
  cgst_rate?: number;
  cgst_amount?: number;
  sgst_rate?: number;
  sgst_amount?: number;
  igst_rate?: number;
  igst_amount?: number;
  total_tax?: number;
  is_reverse_charge?: boolean;
  irn?: string;
  ack_no?: string;
  ack_date?: string;
  pdf_url?: string;

  // Receipt Cancellation & Credit Note Workflow
  status?: 'Valid' | 'Void';
  void_reason?: string;
  void_at?: string;
  void_by?: string;
  credit_note_number?: string;
}

export type ExpenseCategory =
  | 'Trainer payment'
  | 'Salary'
  | 'Rent'
  | 'Marketing'
  | 'Meta Ads'
  | 'Google Ads'
  | 'Software'
  | 'Internet'
  | 'Electricity'
  | 'Office supplies'
  | 'Refund'
  | 'Travel'
  | 'Maintenance'
  | 'Miscellaneous';

export type ExpenseStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Paid'
  | 'Rejected';

export interface Expense {
  id: string;
  expense_code: string;
  expense_date: string;
  category: ExpenseCategory;
  vendor_id?: string;
  vendor_name?: string;
  description: string;
  amount: number;
  payment_mode: PaymentMethod;
  reference?: string;
  attachment_url?: string;
  paid_by?: string;
  paid_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  status: ExpenseStatus;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  vendor_name: string;
  contact_person: string;
  phone?: string;
  email?: string;
  address?: string;
  gst_number?: string;
  pan_number?: string;
  tds_section?: string;
  tds_rate?: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  notes?: string;
  total_paid?: number;
  is_active?: boolean;
  status?: 'Active' | 'Archived';
  created_at: string;
  updated_at?: string;
}

export interface PlacementProfile {
  id: string;
  student_id: string;
  student_name?: string;
  resume_url?: string;
  resume_status: 'Not Uploaded' | 'Pending Review' | 'Reviewed & Approved' | 'Needs Improvement';
  mock_interview_status: 'Not Scheduled' | 'Scheduled' | 'Completed' | 'Needs Retake';
  technical_interview_score?: number; // 0 - 100
  hr_interview_score?: number; // 0 - 100
  skills: string[];
  experience_years: number;
  preferred_location: string;
  expected_salary_lpa: number;
  placement_status: 'Not Started' | 'Resume Preparation' | 'Mock Interview' | 'Job Search' | 'Interview Scheduled' | 'Interview Completed' | 'Offer Received' | 'Placed';
  placed_company?: string;
  placed_package_lpa?: number;
  placed_date?: string;
  created_at: string;
  updated_at: string;
}

export interface JobOpening {
  id: string;
  company_name: string;
  job_title: string;
  module: string; // e.g., 'SAP FICO', 'SAP MM'
  experience_required: string;
  location: string;
  salary_range: string;
  description: string;
  application_deadline: string;
  status: 'Open' | 'Closed' | 'Draft';
  applications_count?: number;
  created_at: string;
}

export interface JobApplication {
  id: string;
  job_id: string;
  job_title?: string;
  company_name?: string;
  student_id: string;
  student_name?: string;
  applied_at: string;
  status: 'Applied' | 'Shortlisted' | 'Interview Scheduled' | 'Selected' | 'Rejected';
  notes?: string;
}

export interface Certificate {
  id: string;
  certificate_id: string; // e.g. "CERT-2026-FICO-0091"
  student_id: string;
  student_name: string;
  course_id: string;
  course_name: string;
  grade: string;
  issue_date: string;
  completion_date: string;
  attendance_percentage: number;
  assignment_completion_rate: number;
  exam_score_percentage: number;
  verification_url: string;
  pdf_url?: string;
  is_valid: boolean;
  status?: 'Issued' | 'Revoked' | 'Suspended' | 'Fraudulent';
  revocation_reason?: string;
  revoked_at?: string;
  revoked_by?: string;
  created_at: string;
}

export type NotificationCategory =
  | 'admission'
  | 'payment'
  | 'fee'
  | 'class'
  | 'assignment'
  | 'exam'
  | 'certificate'
  | 'placement'
  | 'support'
  | 'onboarding'
  | 'general';

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp' | 'sms';

export interface NotificationItem {
  tenant_id?: string;
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: NotificationCategory;
  is_read: boolean;
  action_url?: string;
  created_at: string;
}

export interface MultiChannelDispatchPayload {
  userId: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  title: string;
  message: string;
  category: NotificationCategory;
  type?: 'info' | 'success' | 'warning' | 'error';
  channels?: NotificationChannel[];
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface RealtimeMessageEvent {
  id: string;
  topic: string;
  event: string;
  payload: any;
  timestamp: string;
}

export interface AuditLog {
  tenant_id?: string;
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action: string;
  module: string;
  record_id: string;
  old_value?: Record<string, any>;
  new_value?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface SystemSettings {
  id: string;
  institute_name: string;
  logo_url?: string;
  tagline?: string;
  address: string;
  phone: string;
  email: string;
  gst_number: string;
  bank_account_name?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  upi_id?: string;
  default_currency: string;
  academic_year: string;
  receipt_prefix: string;
  invoice_prefix?: string;
  admission_prefix?: string;
  student_code_prefix?: string;
  invoice_terms?: string;
  authorized_signatory_name?: string;
  authorized_signatory_designation?: string;
  timezone: string;
  enable_email_notifications: boolean;
  enable_sms_notifications: boolean;
  enable_whatsapp_notifications: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SapServerSystem {
  id: string;
  system_name: string;
  sid: string;
  instance_number: string;
  server_host: string;
  sap_router?: string;
  default_client: string;
  description: string;
  status: 'Online' | 'Maintenance' | 'Offline';
  capacity?: number;
  active_users?: number;
}

export interface SapServerAllocation {
  id: string;
  student_id: string;
  student_name: string;
  admission_number: string;
  course_id: string;
  course_name: string;
  system_id: string;
  system_name: string;
  server_host: string;
  sid: string;
  instance_number: string;
  client_number: string;
  sap_user_id: string;
  sap_password: string;
  valid_from: string;
  valid_to: string;
  status: 'Active' | 'Expired' | 'Revoked';
  allocated_by: string;
  created_at: string;
  updated_at: string;
}

export type DoubtStatus = 'Open' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed';
export type DoubtPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type DoubtCategory =
  | 'Academic Concept'
  | 'SAP Configuration'
  | 'Lab / Server Error'
  | 'Assignment Doubt'
  | 'General Query';

export interface DoubtMessage {
  id: string;
  doubt_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: UserRole;
  message: string;
  attachment_url?: string;
  created_at: string;
}

export interface StudentDoubt {
  id: string;
  ticket_number: string;
  student_id: string;
  student_name: string;
  admission_number: string;
  course_id: string;
  course_name: string;
  batch_id?: string;
  batch_name?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  assigned_to_role?: 'support' | 'trainer';
  title: string;
  description: string;
  category: DoubtCategory;
  priority: DoubtPriority;
  status: DoubtStatus;
  sap_tcode?: string;
  messages: DoubtMessage[];
  resolution_notes?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

// --- Placement Enrollment & Eligibility Architecture ---

export type PlacementCurrentStatus =
  | 'Student'
  | 'Fresher'
  | 'Working Professional'
  | 'Career Restart'
  | 'Looking for Job Change';

export type PlacementEmploymentStatus =
  | 'Fresher'
  | 'Currently Working'
  | 'Not Working'
  | 'Serving Notice Period'
  | 'Immediate Joiner';

export type PlacementWorkMode = 'On-Site' | 'Hybrid' | 'Remote' | 'Any';

export type PlacementEnrollmentStatus =
  | 'Not Enrolled'
  | 'Application Submitted'
  | 'Under Review'
  | 'More Information Required'
  | 'Enrollment Approved'
  | 'Profile Completion Pending'
  | 'Documents Pending'
  | 'Resume Review Pending'
  | 'Mock Interview Pending'
  | 'Placement Eligible'
  | 'Active Placement'
  | 'Placed'
  | 'Placement Closed'
  | 'Enrollment Rejected'
  | 'Enrollment On Hold'
  | 'Student Withdrawn'
  | 'Re-enrollment Requested'
  | 'Re-enrollment Under Review'
  | 'Re-enrollment Approved'
  | 'Re-enrollment Rejected';

export interface PlacementDocumentItem {
  id: string;
  document_type:
    | 'Passport Photo'
    | 'Aadhaar / ID Proof'
    | 'PAN Card'
    | 'Degree Certificate'
    | 'Marksheets'
    | 'Experience Letter'
    | 'Relieving Letter'
    | 'SAP Certification'
    | 'Other Certification';
  file_name: string;
  file_url: string;
  uploaded_at: string;
  is_verified?: boolean;
  verified_by?: string;
  verified_at?: string;
  verification_notes?: string;
}

export interface PlacementDeclaration {
  terms_version: string;
  accepted_by: string;
  accepted_by_name: string;
  accepted_at: string;
  confirmed_information_correct: boolean;
  understands_no_guarantee: boolean;
  agrees_attend_scheduled_interviews: boolean;
  agrees_inform_external_offer: boolean;
  authorizes_resume_sharing: boolean;
  understands_sensitive_docs_policy: boolean;
  agrees_keep_profile_updated: boolean;
  ip_address?: string;
  user_agent?: string;
}

export interface PlacementEnrollment {
  id: string;
  student_id: string;
  student_name: string;
  admission_number: string;
  student_code: string;
  email: string;
  mobile_number: string;
  whatsapp_number: string;
  course_id: string;
  course_name: string;
  sap_module: string;
  batch_id?: string;
  batch_name?: string;
  trainer_id?: string;
  trainer_name?: string;

  // Status Lifecycle
  enrollment_status: PlacementEnrollmentStatus;
  is_placement_eligible: boolean;
  eligibility_reasons?: string[];
  eligibility_overridden?: boolean;
  override_reason?: string;
  overridden_by?: string;
  overridden_at?: string;

  // Current & Employment Status
  current_status: PlacementCurrentStatus;
  employment_status: PlacementEmploymentStatus;

  // Professional Experience (if experienced/working)
  current_company?: string;
  current_designation?: string;
  total_experience_years?: number;
  relevant_sap_experience_years?: number;
  current_ctc_lpa?: number;
  expected_ctc_lpa?: number;
  notice_period?: string;
  last_working_date?: string;

  // Academic Education
  highest_qualification: string;
  degree: string;
  specialization: string;
  college_university: string;
  graduation_year: number;
  percentage_or_cgpa: string;

  // Placement Preferences
  preferred_job_roles: string[];
  preferred_locations: string[];
  preferred_work_mode: PlacementWorkMode;
  willing_to_relocate: boolean;
  immediate_joiner: boolean;
  preferred_industry?: string;

  // Resume & Documents
  resume_url?: string;
  resume_name?: string;
  resume_status: 'Not Uploaded' | 'Pending Review' | 'Reviewed & Approved' | 'Needs Improvement';
  documents: PlacementDocumentItem[];

  // Terms and Declaration
  declaration: PlacementDeclaration;

  // Administration Review
  enrollment_date: string;
  reviewed_at?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  assigned_placement_officer_id?: string;
  assigned_placement_officer_name?: string;
  internal_notes?: string[];

  // Rejection, Hold & Change Notes
  rejection_reason?: string;
  hold_reason?: string;
  withdrawal_reason?: string;
  more_info_required_notes?: string;

  created_at: string;
  updated_at: string;
}

export interface PlacementEnrollmentStatusHistory {
  id: string;
  enrollment_id: string;
  student_id: string;
  old_status: PlacementEnrollmentStatus;
  new_status: PlacementEnrollmentStatus;
  changed_by: string;
  changed_by_name: string;
  changed_by_role: string;
  changed_at: string;
  reason?: string;
  notes?: string;
}

export interface PlacementEligibilitySettings {
  id: string;
  min_course_progress_percentage: number; // default 80
  min_attendance_percentage: number; // default 80
  require_assessments_completed: boolean; // default true
  require_mock_interview_completed: boolean; // default true
  min_mock_interview_score: number; // default 75
  require_resume_approved: boolean; // default true
  require_mandatory_documents_verified: boolean; // default true
  require_fees_cleared: boolean; // default true
  allow_admin_override: boolean; // default true
  updated_at: string;
  updated_by?: string;
}

// ============================================================================
// GLOBAL LMS FEE APPROVAL & FINANCIAL MANAGEMENT WORKFLOW ARCHITECTURE
// ============================================================================

export type GlobalFeeCategory =
  | 'Course Admission Fee'
  | 'Course Fee'
  | 'Registration Fee'
  | 'Placement Fee'
  | 'Certification Fee'
  | 'Exam / Assessment Fee'
  | 'Fast Track Fee'
  | 'Additional Training Fee'
  | 'Rejoining Fee'
  | 'Module Change Fee'
  | 'Batch Transfer Fee'
  | 'Late Fee'
  | 'Material Fee'
  | 'Project Fee'
  | 'Other Student Charges';

export type FeeApprovalStatus =
  | 'Draft'
  | 'Submitted for Approval'
  | 'Pending Accountant Approval'
  | 'Approved'
  | 'Rejected'
  | 'Correction Required'
  | 'Cancelled'
  | 'Superseded';

export type PaymentVerificationStatus =
  | 'Pending'
  | 'Recorded'
  | 'Pending Verification'
  | 'Verified'
  | 'Rejected'
  | 'Partially Paid'
  | 'Fully Paid'
  | 'Refunded'
  | 'Cancelled';

export type StudentFinancialStatus =
  | 'No Fee Created'
  | 'Approval Pending'
  | 'Approved'
  | 'Payment Pending'
  | 'Partially Paid'
  | 'Fully Paid'
  | 'Overdue'
  | 'Payment Verification Pending'
  | 'Refund Pending'
  | 'Financial Hold'
  | 'Financially Cleared';

export type FeeReferenceType =
  | 'Course'
  | 'Placement'
  | 'Certification'
  | 'Assessment'
  | 'Fast Track'
  | 'General'
  | 'Other';

export interface FeeCategoryItem {
  id: string;
  name: string;
  code: string;
  default_amount: number;
  is_taxable: boolean;
  gst_rate: number;
  sac_code?: string;
  reference_type: FeeReferenceType;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface StudentFee {
  enrollment_id?: string;
  tenant_id?: string;
  id: string;
  student_id: string;
  student_name: string;
  student_code: string;
  admission_number: string;
  fee_category: string;
  reference_type: FeeReferenceType;
  reference_id?: string;
  course_id?: string;
  course_name?: string;
  batch_id?: string;
  batch_name?: string;
  sap_module?: string;
  placement_enrollment_id?: string;
  fee_account_id?: string;

  standard_fee: number;
  proposed_fee: number;
  discount_amount: number;
  discount_percentage: number;
  discount_reason?: string;
  discount_approval_level?: 'Accountant' | 'Finance Manager' | 'Management';
  tax_gst_amount: number;
  additional_charges: number;
  final_payable: number;
  paid_amount: number;
  outstanding_amount: number;

  payment_plan: 'Full Payment' | '2 Installments' | '3 Installments' | 'Custom';
  number_of_installments: number;
  first_due_date: string;

  counsellor_id: string;
  counsellor_name: string;
  counsellor_notes?: string;
  notes?: string;

  approval_status: FeeApprovalStatus;
  submitted_by?: string;
  submitted_by_name?: string;
  submitted_at?: string;

  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  approved_fee?: number;
  approved_discount?: number;
  approved_tax?: number;
  approved_total?: number;
  approval_notes?: string;

  rejection_reason?: string;
  correction_reason?: string;
  correction_notes?: string;

  version: number;
  parent_fee_id?: string;
  is_payable: boolean;

  created_at: string;
  updated_at: string;
}

export interface FeeApprovalHistory {
  id: string;
  fee_id: string;
  student_id: string;
  action: 'Created' | 'Submitted' | 'Approved' | 'Rejected' | 'Correction Requested' | 'Revised' | 'Cancelled';
  actor_id: string;
  actor_name: string;
  actor_role: string;
  old_status?: FeeApprovalStatus;
  new_status: FeeApprovalStatus;
  amount_snapshot: number;
  discount_snapshot: number;
  reason?: string;
  notes?: string;
  timestamp: string;
}

export interface FeeRevisionRequest {
  id: string;
  original_fee_id: string;
  student_id: string;
  student_name: string;
  revision_type:
    | 'Additional Discount'
    | 'Wrong Fee Amount'
    | 'Course Change'
    | 'Module Change'
    | 'Batch Change'
    | 'Installment Change'
    | 'Offer Adjustment'
    | 'Management Approval'
    | 'Cancellation';
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
  justification: string;
  proposed_changes: Partial<StudentFee>;
  status: 'Pending Review' | 'Approved' | 'Rejected';
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
}

export interface StudentPaymentRecord {
  status?: 'Pending Approval' | 'Approved' | 'Rejected' | 'Voided';
  enrollment_id?: string;
  idempotency_key?: string;
  rejection_reason?: string;
  rejected_by?: string;
  rejected_at?: string;
  tenant_id?: string;
  id: string;
  fee_id: string;
  installment_id?: string;
  student_id: string;
  student_name: string;
  admission_number: string;
  fee_category: string;
  amount_paid: number;
  payment_date: string;
  payment_mode: PaymentMethod;
  transaction_reference?: string;
  bank_upi_reference?: string;
  receipt_number?: string;
  payment_proof_url?: string;
  notes?: string;

  recorded_by: string;
  recorded_by_name: string;
  recorded_by_role: string;

  verification_status: PaymentVerificationStatus;
  verified_by?: string;
  verified_by_name?: string;
  verified_at?: string;
  verification_notes?: string;

  updated_at?: string;
  updated_by?: string;
  updated_by_name?: string;
  updated_by_role?: string;

  created_at: string;
}

export interface StudentFinancialLedgerEntry {
  tenant_id?: string;
  id: string;
  student_id: string;
  entry_date: string;
  entry_type:
    | 'Fee Raised'
    | 'Discount Approved'
    | 'Payment Recorded'
    | 'Payment Verified'
    | 'Refund Processed'
    | 'Fee Adjustment'
    | 'Fee Waiver'
    | 'Debit Note'
    | 'Credit Note';
  fee_category: string;
  reference_type: string;
  reference_id: string;
  debit: number;
  credit: number;
  running_balance: number;
  description: string;
  recorded_by: string;
  receipt_id?: string;
  created_at: string;
}

export interface StudentRefundRequest {
  id: string;
  student_id: string;
  student_name: string;
  fee_id: string;
  payment_id: string;
  receipt_number?: string;
  refund_amount: number;
  refund_reason: string;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
  status: 'Requested' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Processed' | 'Cancelled';
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  processed_by?: string;
  processed_by_name?: string;
  processed_at?: string;
  transaction_reference?: string;
  created_at: string;
}

export interface FinanceWorkflowSettings {
  id: string;
  low_discount_max_percent: number;
  medium_discount_max_percent: number;
  exceptional_discount_threshold: number;
  minimum_down_payment_percent?: number;
  require_payment_verification_for_all_non_accountants: boolean;
  auto_clearance_on_zero_balance: boolean;
  clearance_rules: {
    course_access: boolean;
    certificate_generation: boolean;
    placement_eligibility: boolean;
    exam_access: boolean;
    project_access: boolean;
    batch_transfer: boolean;
  };
  updated_at: string;
  updated_by: string;
}

// ==========================================
// ONBOARDING TEAM & WORKFLOW DOMAIN TYPES
// ==========================================

export type OnboardingStatus = 'pending' | 'in_progress' | 'blocked' | 'completed';

export type OnboardingChecklistKey =
  | 'admission_confirmation'
  | 'student_details_verification'
  | 'document_verification'
  | 'course_confirmation'
  | 'batch_allocation'
  | 'fee_clearance_verification'
  | 'lms_account_activation'
  | 'welcome_notification'
  | 'orientation_confirmation'
  | 'first_class_confirmation'
  | 'academic_handover';

export interface OnboardingChecklistItem {
  key: OnboardingChecklistKey;
  title: string;
  description: string;
  completed: boolean;
  completed_at?: string;
  completed_by?: string;
  completed_by_name?: string;
  notes?: string;
  mandatory: boolean;
}

export interface OnboardingDocument {
  id: string;
  name: string;
  doc_type: 'photo' | 'id_proof' | 'degree_certificate' | 'marksheets' | 'experience_letter' | 'other';
  status: 'pending' | 'verified' | 'rejected';
  file_url: string;
  uploaded_at: string;
  verified_at?: string;
  verified_by?: string;
  rejection_reason?: string;
}

export interface OnboardingAuditEvent {
  tenant_id?: string;
  id: string;
  case_id: string;
  timestamp: string;
  action: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  details: string;
}

export interface OnboardingCase {
  tenant_id?: string;
  id: string;
  case_number: string;
  admission_id: string;
  admission_number: string;
  student_id: string;
  student_name: string;
  student_email: string;
  student_phone: string;
  course_id: string;
  course_name: string;
  batch_id?: string;
  batch_name?: string;
  trainer_id?: string;
  trainer_name?: string;
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  assigned_at?: string;
  status: OnboardingStatus;
  blocked_reason?: string;
  checklist: Record<OnboardingChecklistKey, OnboardingChecklistItem>;
  documents: OnboardingDocument[];
  orientation_date?: string;
  orientation_mode?: 'Online' | 'Classroom' | 'Hybrid';
  lms_account_created: boolean;
  lms_account_activated_at?: string;
  portal_access_confirmed: boolean;
  academic_handover_confirmed: boolean;
  completed_at?: string;
  completed_by?: string;
  notes?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
}

export interface OnboardingKpis {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  blocked: number;
  overdue: number;
}

export interface OnboardingStaffPerformance {
  staff_id: string;
  staff_name: string;
  staff_email: string;
  staff_role: string;
  total_assigned: number;
  pending_count: number;
  in_progress_count: number;
  blocked_count: number;
  completed_count: number;
  overdue_count: number;
  avg_completion_days: number;
  sla_compliance_rate: number;
  workload_status: 'Available' | 'Balanced' | 'High Workload';
}

export interface LegacyBackfillResult {
  total_processed: number;
  cases_created: number;
  cases_skipped: number;
  created_case_numbers: string[];
  message: string;
}



