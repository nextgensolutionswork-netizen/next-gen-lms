import { z } from 'zod';

export const leadSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(10, 'Valid phone number is required'),
  email: z.string().email('Valid email address is required'),
  interested_course_id: z.string().min(1, 'Please select a course'),
  current_status: z.string().min(1, 'Current status is required'),
  experience_years: z.coerce.number().min(0, 'Experience must be 0 or greater'),
  training_preference: z.enum(['Online', 'Classroom', 'Hybrid']),
  lead_source: z.enum(['Website', 'Google Ads', 'Meta Ads', 'Referral', 'Walk-in', 'Other']),
  campaign: z.string().optional(),
  counsellor_id: z.string().optional(),
  demo_preference: z.boolean().default(false),
  demo_date: z.string().optional(),
  follow_up_date: z.string().optional(),
  notes: z.string().optional(),
  stage: z.enum([
    'New',
    'Contacted',
    'Follow-up',
    'Demo Scheduled',
    'Demo Attended',
    'Interested',
    'Not Interested',
    'Converted',
    'Lost',
  ]).default('New'),
});

export const admissionSchema = z.object({
  student_name: z.string().min(2, 'Student name is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  email: z.string().email('Valid email address is required'),
  dob: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['Male', 'Female', 'Other']),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  education: z.string().min(2, 'Education qualification is required'),
  experience_years: z.coerce.number().min(0),
  current_employment_status: z.enum(['Employed', 'Unemployed', 'Student', 'Career Gap']),
  course_id: z.string().min(1, 'Course selection is required'),
  training_mode: z.enum(['Online', 'Classroom', 'Hybrid']),
  batch_id: z.string().optional(),
  trainer_id: z.string().optional(),
  admission_date: z.string().min(1, 'Admission date is required'),
  course_fee: z.coerce.number().positive('Course fee must be greater than 0'),
  discount: z.coerce.number().min(0).default(0),
  discount_reason: z.string().optional(),
  payment_plan: z.enum(['Full Payment', '2 Installments', '3 Installments', 'Custom']),
  counsellor_id: z.string().optional(),
});

export const paymentSchema = z.object({
  student_id: z.string().min(1, 'Student ID is required'),
  course_id: z.string().min(1, 'Course ID is required'),
  fee_account_id: z.string().min(1, 'Fee account is required'),
  installment_id: z.string().optional(),
  amount: z.coerce.number().positive('Payment amount must be greater than 0'),
  payment_date: z.string().min(1, 'Payment date is required'),
  payment_mode: z.enum([
    'Cash',
    'UPI',
    'Bank Transfer',
    'Card',
    'Cheque',
    'Payment Gateway',
    'Other',
  ]),
  transaction_reference: z.string().optional(),
  notes: z.string().optional(),
});

export const courseSchema = z.object({
  course_name: z.string().min(3, 'Course name must be at least 3 characters'),
  course_code: z.string().min(2, 'Course code is required (e.g. SAP-FICO)'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  duration_weeks: z.coerce.number().positive('Duration must be positive'),
  category: z.enum(['SAP Functional', 'SAP Technical', 'SAP Cloud', 'Enterprise Other']),
  trainer_id: z.string().optional(),
  price: z.coerce.number().positive('Course price must be positive'),
  status: z.enum(['Draft', 'Published', 'Archived']).default('Draft'),
});

export const batchSchema = z.object({
  batch_name: z.string().min(3, 'Batch name is required'),
  course_id: z.string().min(1, 'Course is required'),
  trainer_id: z.string().min(1, 'Trainer is required'),
  training_mode: z.enum(['Online', 'Classroom', 'Hybrid']),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().min(1, 'End time is required'),
  days: z.array(z.string()).min(1, 'Select at least one day'),
  maximum_capacity: z.coerce.number().int().positive('Capacity must be positive'),
  status: z.enum(['Upcoming', 'Active', 'Completed', 'Cancelled']).default('Upcoming'),
});

export const batchTransferSchema = z.object({
  student_id: z.string().min(1, 'Student ID is required'),
  from_batch_id: z.string().min(1, 'Current batch is required'),
  to_batch_id: z.string().min(1, 'New batch is required'),
  reason: z.string().min(5, 'Reason for transfer is mandatory for audit trail'),
});

export const expenseSchema = z.object({
  category: z.enum([
    'Trainer payment',
    'Salary',
    'Rent',
    'Marketing',
    'Meta Ads',
    'Google Ads',
    'Software',
    'Internet',
    'Electricity',
    'Office supplies',
    'Refund',
    'Travel',
    'Maintenance',
    'Miscellaneous',
  ]),
  vendor_id: z.string().optional(),
  description: z.string().min(3, 'Description is required'),
  amount: z.coerce.number().positive('Expense amount must be positive'),
  expense_date: z.string().min(1, 'Date is required'),
  payment_mode: z.enum([
    'Cash',
    'UPI',
    'Bank Transfer',
    'Card',
    'Cheque',
    'Payment Gateway',
    'Other',
  ]),
  reference: z.string().optional(),
  status: z.enum(['Draft', 'Pending Approval', 'Approved', 'Paid', 'Rejected']).default('Draft'),
});

export const assignmentSchema = z.object({
  title: z.string().min(3, 'Title is required'),
  description: z.string().min(10, 'Description is required'),
  course_id: z.string().min(1, 'Course is required'),
  batch_id: z.string().min(1, 'Batch is required'),
  module_id: z.string().optional(),
  due_date: z.string().min(1, 'Due date is required'),
  maximum_marks: z.coerce.number().positive('Maximum marks must be positive'),
  attachment_url: z.string().optional(),
});

export const quizSchema = z.object({
  title: z.string().min(3, 'Quiz title is required'),
  course_id: z.string().min(1, 'Course is required'),
  description: z.string().min(5, 'Description is required'),
  duration_minutes: z.coerce.number().positive(),
  pass_percentage: z.coerce.number().min(1).max(100),
  attempts_allowed: z.coerce.number().int().positive(),
  randomize_questions: z.boolean().default(true),
  show_answers_after: z.boolean().default(true),
});

export const settingsSchema = z.object({
  institute_name: z.string().min(3),
  tagline: z.string().optional(),
  address: z.string().min(5),
  phone: z.string().min(8),
  email: z.string().email(),
  gst_number: z.string().min(5),
  default_currency: z.string().default('INR'),
  academic_year: z.string().default('2026-2027'),
  receipt_prefix: z.string().default('REC'),
  invoice_prefix: z.string().default('INV'),
  timezone: z.string().default('Asia/Kolkata'),
  enable_email_notifications: z.boolean().default(true),
  enable_sms_notifications: z.boolean().default(false),
  enable_whatsapp_notifications: z.boolean().default(true),
});
