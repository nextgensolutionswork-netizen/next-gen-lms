import { z } from 'zod';
import type { LeadSource } from '@/types';

export const leadFields = z.object({
  full_name: z.string().trim().min(1).max(250), phone: z.string().min(1).max(50), email: z.string().max(320),
  country_code: z.string().max(10).optional(), whatsapp_country_code: z.string().max(10).optional(), whatsapp_number: z.string().max(50).optional(),
  interested_course_id: z.string().max(100).optional(), current_status: z.string().max(100).optional(),
  institute_id: z.string().max(100).optional(), institute_name: z.string().max(200).optional(),
  require_institute: z.boolean().optional(),
  confirm_financial_institute_change: z.boolean().optional(),
  education: z.string().max(500).optional(), experience_years: z.number().min(0).max(100).optional(),
  experience: z.string().max(100).optional(),
  dob: z.string().max(50).optional(),
  address: z.string().max(1000).optional(),
  training_preference: z.enum(['Online', 'Offline', 'Classroom', 'Hybrid']).optional(),
  lead_source: z.string().trim().min(1).max(200).transform((v) => v as LeadSource).optional(),
  campaign: z.string().max(500).optional(), counsellor_id: z.string().max(100).optional(),
  demo_preference: z.boolean().optional(), demo_date: z.string().max(50).optional(), follow_up_date: z.string().max(50).optional(),
  notes: z.string().max(20000).optional(),
  stage: z.enum(['New', 'Contacted', 'Follow-up', 'Demo Scheduled', 'Demo Attended', 'Interested', 'Not Interested', 'Converted', 'Enrolled', 'Lost']),
  rejectOnDuplicate: z.boolean().optional(), allowDuplicate: z.boolean().optional(),
});
