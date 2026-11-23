import { z } from 'zod';

export const leadFields = z.object({
  full_name: z.string().trim().min(1).max(250), phone: z.string().min(1).max(50), email: z.string().max(320),
  country_code: z.string().max(10).optional(), whatsapp_country_code: z.string().max(10).optional(), whatsapp_number: z.string().max(50).optional(),
  interested_course_id: z.string().max(100).optional(), current_status: z.string().max(100).optional(),
  education: z.string().max(500).optional(), experience_years: z.number().min(0).max(100).optional(),
  training_preference: z.enum(['Online', 'Offline', 'Classroom', 'Hybrid']).optional(),
  lead_source: z.enum(['Website', 'Google Ads', 'Meta Ads', 'YouTube', 'Referral', 'Walk-in', 'Other']).optional(),
  campaign: z.string().max(500).optional(), counsellor_id: z.string().max(100).optional(),
  demo_preference: z.boolean().optional(), demo_date: z.string().max(50).optional(), follow_up_date: z.string().max(50).optional(),
  notes: z.string().max(20000).optional(),
  stage: z.enum(['New', 'Contacted', 'Follow-up', 'Demo Scheduled', 'Demo Attended', 'Interested', 'Not Interested', 'Converted', 'Enrolled', 'Lost']),
  rejectOnDuplicate: z.boolean().optional(), allowDuplicate: z.boolean().optional(),
});
