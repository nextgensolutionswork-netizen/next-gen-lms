export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'accountant'
  | 'counsellor'
  | 'trainer'
  | 'placement_coordinator'
  | 'support'
  | 'student';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  branch_id?: string;
  assigned_course_ids?: string[];
  created_at: string;
  updated_at: string;
}

export type Permission =
  | 'all:manage'
  | 'users:read'
  | 'users:write'
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
  | 'certificates:read'
  | 'certificates:generate'
  | 'reports:read'
  | 'audit:read'
  | 'settings:manage'
  | 'doubts:read'
  | 'doubts:write'
  | 'doubts:assign'
  | 'doubts:resolve';

export type LeadStage =
  | 'New'
  | 'Contacted'
  | 'Follow-up'
  | 'Demo Scheduled'
  | 'Demo Attended'
  | 'Interested'
  | 'Not Interested'
  | 'Converted'
  | 'Lost';

export interface Lead {
  id: string;
  lead_code: string;
  full_name: string;
  phone: string;
  email: string;
  interested_course_id: string;
  interested_course_name?: string;
  current_status: string;
  experience_years: number;
  training_preference: 'Online' | 'Classroom' | 'Hybrid';
  lead_source: 'Website' | 'Google Ads' | 'Meta Ads' | 'Referral' | 'Walk-in' | 'Other';
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
  id: string;
  admission_number: string;
  student_name: string;
  phone: string;
  email: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  address: string;
  city: string;
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
  course_id: string;
  course_name?: string;
  batch_id?: string;
  batch_name?: string;
  trainer_id?: string;
  trainer_name?: string;
  joining_date: string;
  status: 'Active' | 'On Hold' | 'Completed' | 'Suspended' | 'Dropped';
  total_fee: number;
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
  status: 'Draft' | 'Published' | 'Archived';
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
  lesson_type: LessonType;
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
  status: 'Upcoming' | 'Active' | 'Completed' | 'Cancelled';
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
  classroom?: string;
  notes?: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled';
  created_at: string;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused';

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
  description: string;
  duration_minutes: number;
  pass_percentage: number;
  attempts_allowed: number;
  randomize_questions: boolean;
  show_answers_after: boolean;
  start_date?: string;
  end_date?: string;
  questions_count?: number;
  status: 'Draft' | 'Published' | 'Archived';
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: 'MCQ' | 'Multiple' | 'TrueFalse' | 'ShortAnswer';
  points: number;
  order_index: number;
  options: {
    id: string;
    text: string;
    is_correct: boolean;
  }[];
  explanation?: string;
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
}

export type FeeStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Refunded';

export interface StudentFeeAccount {
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
  id: string;
  fee_account_id: string;
  student_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  paid_amount: number;
  paid_date?: string;
  status: 'Upcoming' | 'Due' | 'Paid' | 'Partial' | 'Overdue';
}

export type PaymentMethod =
  | 'Cash'
  | 'UPI'
  | 'Bank Transfer'
  | 'Card'
  | 'Cheque'
  | 'Payment Gateway'
  | 'Other';

export interface Payment {
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
  collected_by: string;
  collected_by_name?: string;
  notes?: string;
  created_at: string;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  payment_id: string;
  student_id: string;
  student_name: string;
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
  phone: string;
  email: string;
  address: string;
  gst_number?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  notes?: string;
  total_paid?: number;
  created_at: string;
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
  is_valid: boolean;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'admission' | 'payment' | 'fee' | 'class' | 'assignment' | 'exam' | 'certificate' | 'placement';
  is_read: boolean;
  action_url?: string;
  created_at: string;
}

export interface AuditLog {
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
  default_currency: string;
  academic_year: string;
  receipt_prefix: string;
  invoice_prefix: string;
  timezone: string;
  enable_email_notifications: boolean;
  enable_sms_notifications: boolean;
  enable_whatsapp_notifications: boolean;
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
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}


