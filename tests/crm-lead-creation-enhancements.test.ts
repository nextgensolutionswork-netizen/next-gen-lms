import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createLead,
  updateLeadDetails,
  updateLeadStage,
  convertLeadToAdmission,
} from '@/lib/services/crm-service';
import {
  validatePhoneNumber,
  findDuplicateLeadByPhone,
  parseStoredPhone,
  getCanonicalPhoneDigits,
  formatDisplayPhone,
  COUNTRY_CODES,
  DEFAULT_COUNTRY,
} from '@/lib/utils/phone-validation';
import { Lead, User } from '@/types';

describe('CRM Lead Creation Form Enhancements Suite', () => {
  let initialLeads: Lead[];
  let initialUsers: User[];
  const counsellorId = 'usr-counsellor-enhancement-test';

  beforeEach(() => {
    initialLeads = JSON.parse(JSON.stringify(store.leads || []));
    initialUsers = JSON.parse(JSON.stringify(store.users || []));

    // Ensure counsellor user exists
    if (!store.users.some((u) => u.id === counsellorId)) {
      store.users.push({
        id: counsellorId,
        full_name: 'Priya Sharma',
        email: 'priya.sharma@example.com',
        role: 'counsellor',
        is_active: true,
        created_at: new Date().toISOString(),
      });
    }
  });

  afterEach(() => {
    store.leads = initialLeads;
    store.users = initialUsers;
  });

  describe('1. Mobile Number Validation', () => {
    it('requires a mobile number and rejects empty or whitespace-only inputs', () => {
      const emptyCheck = validatePhoneNumber('+91', '');
      expect(emptyCheck.isValid).toBe(false);
      expect(emptyCheck.error).toContain('mandatory');

      const spaceCheck = validatePhoneNumber('+91', '   ');
      expect(spaceCheck.isValid).toBe(false);
      expect(spaceCheck.error).toContain('mandatory');
    });

    it('validates Indian mobile numbers (+91): exactly 10 digits starting with 6, 7, 8, 9', () => {
      const validNumbers = ['9876543210', '8123456789', '7012345678', '6999888777'];
      for (const num of validNumbers) {
        const res = validatePhoneNumber('+91', num);
        expect(res.isValid).toBe(true);
        expect(res.normalized).toBe(`+91 ${num.slice(0, 5)} ${num.slice(5)}`);
        expect(res.canonicalDigits).toBe(`91${num}`);
      }
    });

    it('rejects Indian mobile numbers with letters, special characters, or invalid starting digits', () => {
      const invalidStarts = ['5876543210', '1234567890', '0876543210', '4987654321'];
      for (const num of invalidStarts) {
        const res = validatePhoneNumber('+91', num);
        expect(res.isValid).toBe(false);
        expect(res.error).toMatch(/must begin with 6, 7, 8, or 9/);
      }

      const letterCheck = validatePhoneNumber('+91', '98765abcde');
      expect(letterCheck.isValid).toBe(false);
      expect(letterCheck.error).toMatch(/numbers only/);
    });

    it('rejects Indian mobile numbers with incorrect length (< 10 or > 10 digits)', () => {
      const tooShort = validatePhoneNumber('+91', '987654321'); // 9 digits
      expect(tooShort.isValid).toBe(false);
      expect(tooShort.error).toMatch(/exactly 10 digits/);

      const tooLong = validatePhoneNumber('+91', '98765432101'); // 11 digits
      expect(tooLong.isValid).toBe(false);
      expect(tooLong.error).toMatch(/exactly 10 digits/);
    });

    it('validates international phone numbers according to E.164 rules (7-15 digits)', () => {
      // US (+1)
      const usRes = validatePhoneNumber('+1', '2025550123');
      expect(usRes.isValid).toBe(true);
      expect(usRes.normalized).toBe('+1 2025550123');

      // UAE (+971)
      const uaeRes = validatePhoneNumber('+971', '501234567');
      expect(uaeRes.isValid).toBe(true);
      expect(uaeRes.normalized).toBe('+971 501234567');

      // UK (+44)
      const ukRes = validatePhoneNumber('+44', '7911123456');
      expect(ukRes.isValid).toBe(true);
      expect(ukRes.normalized).toBe('+44 7911123456');

      // Invalid international length (< 7 digits)
      const tooShortInt = validatePhoneNumber('+44', '12345');
      expect(tooShortInt.isValid).toBe(false);
      expect(tooShortInt.error).toMatch(/between 7 and 15 digits/);
    });
  });

  describe('2. Country Code Dropdown & Parsing Utilities', () => {
    it('provides India (+91) as default country code in directory', () => {
      expect(DEFAULT_COUNTRY.dialCode).toBe('+91');
      expect(DEFAULT_COUNTRY.code).toBe('IN');
      expect(COUNTRY_CODES.some((c) => c.dialCode === '+1')).toBe(true);
      expect(COUNTRY_CODES.some((c) => c.dialCode === '+971')).toBe(true);
      expect(COUNTRY_CODES.some((c) => c.dialCode === '+44')).toBe(true);
    });

    it('parses legacy stored phone numbers with or without country code prefix', () => {
      const p1 = parseStoredPhone('+91 98765 43210');
      expect(p1.dialCode).toBe('+91');
      expect(p1.nationalNumber).toBe('98765 43210');

      const p2 = parseStoredPhone('+1 202 555 0123');
      expect(p2.dialCode).toBe('+1');
      expect(p2.nationalNumber).toBe('202 555 0123');

      const p3 = parseStoredPhone('9876543210');
      expect(p3.dialCode).toBe('+91');
      expect(p3.nationalNumber).toBe('9876543210');
    });

    it('formats display phone number consistently', () => {
      expect(formatDisplayPhone('+91', '98765 43210')).toBe('+91 98765 43210');
      expect(formatDisplayPhone('+91', '+91 98765 43210')).toBe('+91 98765 43210');
      expect(formatDisplayPhone('+1', '202 555 0123')).toBe('+1 202 555 0123');
      expect(formatDisplayPhone(undefined, '')).toBe('—');
    });
  });

  describe('3. Duplicate Mobile Number Handling', () => {
    it('detects existing lead by canonical phone digits regardless of spacing or prefix', () => {
      const existingLeads: Partial<Lead>[] = [
        {
          id: 'lead-dup-01',
          lead_code: 'LD-2026-DUP1',
          full_name: 'Ananya Roy',
          country_code: '+91',
          phone: '+91 98111 22233',
        },
      ];

      // Exact match with different spacing
      const dup1 = findDuplicateLeadByPhone(existingLeads as Lead[], '9811122233', '+91');
      expect(dup1).toBeDefined();
      expect(dup1?.lead_code).toBe('LD-2026-DUP1');

      // Matching with formatted input
      const dup2 = findDuplicateLeadByPhone(existingLeads as Lead[], '+91 98111 22233', '+91');
      expect(dup2).toBeDefined();

      // Non-matching number
      const noDup = findDuplicateLeadByPhone(existingLeads as Lead[], '98999 88877', '+91');
      expect(noDup).toBeUndefined();
    });

    it('rejects duplicate lead creation when rejectOnDuplicate is true', async () => {
      const uniqueNumber = '98333 44455';
      await createLead({
        full_name: 'First Inquiry',
        phone: uniqueNumber,
        country_code: '+91',
        email: 'first@example.com',
        counsellor_id: counsellorId,
        stage: 'New',
      });

      await expect(
        createLead({
          full_name: 'Second Inquiry (Duplicate)',
          phone: uniqueNumber,
          country_code: '+91',
          email: 'second@example.com',
          counsellor_id: counsellorId,
          stage: 'New',
          rejectOnDuplicate: true,
        })
      ).rejects.toThrow(/already exists/);
    });

    it('safely flags duplicate inquiries with a note notice when rejectOnDuplicate is not set', async () => {
      const uniqueNumber = '98444 55566';
      const lead1 = await createLead({
        full_name: 'Primary Inquirer',
        phone: uniqueNumber,
        country_code: '+91',
        email: 'inquirer1@example.com',
        counsellor_id: counsellorId,
        stage: 'New',
      });

      const lead2 = await createLead({
        full_name: 'Secondary Inquirer',
        phone: uniqueNumber,
        country_code: '+91',
        email: 'inquirer2@example.com',
        counsellor_id: counsellorId,
        notes: 'Requested brochure',
        stage: 'New',
      });

      expect(lead2.notes).toContain(`Duplicate Inquiry: matches ${lead1.lead_code}`);
      expect(lead2.notes).toContain('Requested brochure');
    });
  });

  describe('4. Training Mode (Online and Offline)', () => {
    it('accepts Online and Offline training preferences for new leads', async () => {
      const onlineLead = await createLead({
        full_name: 'Online Learner',
        phone: '98555 11122',
        country_code: '+91',
        email: 'online@example.com',
        training_preference: 'Online',
        counsellor_id: counsellorId,
        stage: 'New',
      });
      expect(onlineLead.training_preference).toBe('Online');

      const offlineLead = await createLead({
        full_name: 'Offline Learner',
        phone: '98555 22233',
        country_code: '+91',
        email: 'offline@example.com',
        training_preference: 'Offline',
        counsellor_id: counsellorId,
        stage: 'New',
      });
      expect(offlineLead.training_preference).toBe('Offline');
    });

    it('preserves legacy training preferences (Hybrid, Classroom) on existing records without overwrite', () => {
      const legacyHybridLead: Lead = {
        id: 'lead-legacy-hybrid',
        lead_code: 'LD-2026-HYB',
        full_name: 'Legacy Hybrid Student',
        phone: '+91 98000 11111',
        email: 'hybrid@example.com',
        training_preference: 'Hybrid',
        stage: 'Interested',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.leads.unshift(legacyHybridLead);

      const found = store.leads.find((l) => l.id === 'lead-legacy-hybrid');
      expect(found?.training_preference).toBe('Hybrid');
    });
  });

  describe('5. Lead Source (including YouTube)', () => {
    it('persists YouTube as an official lead source option', async () => {
      const ytLead = await createLead({
        full_name: 'YouTube Prospect',
        phone: '98666 11122',
        country_code: '+91',
        email: 'ytprospect@example.com',
        lead_source: 'YouTube',
        counsellor_id: counsellorId,
        stage: 'New',
      });

      expect(ytLead.lead_source).toBe('YouTube');
    });

    it('persists all standard lead sources correctly', async () => {
      const sources: Lead['lead_source'][] = [
        'Website',
        'Google Ads',
        'Meta Ads',
        'YouTube',
        'Referral',
        'Walk-in',
        'Other',
      ];

      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        const l = await createLead({
          full_name: `Lead From ${src}`,
          phone: `98777 0000${i}`,
          country_code: '+91',
          email: `source${i}@example.com`,
          lead_source: src,
          counsellor_id: counsellorId,
          stage: 'New',
        });
        expect(l.lead_source).toBe(src);
      }
    });
  });

  describe('6. Current Status & Pipeline Stage Independence', () => {
    it('persists each of the four exact current status options', async () => {
      const statuses: Lead['current_status'][] = [
        'Fresher',
        'Career Gap',
        'Working Professional',
        'Experienced + Career Gap',
      ];

      for (let i = 0; i < statuses.length; i++) {
        const st = statuses[i];
        const l = await createLead({
          full_name: `Candidate ${st}`,
          phone: `98888 0001${i}`,
          country_code: '+91',
          email: `status${i}@example.com`,
          current_status: st,
          counsellor_id: counsellorId,
          stage: 'New',
        });
        expect(l.current_status).toBe(st);
        expect(l.stage).toBe('New'); // distinct from stage
      }
    });

    it('updating candidate details does NOT overwrite or mutate pipeline stage', async () => {
      const lead = await createLead({
        full_name: 'Pre-existing Qualified Lead',
        phone: '98999 11223',
        country_code: '+91',
        email: 'qualified@example.com',
        current_status: 'Fresher',
        training_preference: 'Online',
        counsellor_id: counsellorId,
        stage: 'Interested', // Advanced pipeline stage
      });

      expect(lead.stage).toBe('Interested');

      // Update candidate details (status, training preference, phone)
      const updated = await updateLeadDetails(
        lead.id,
        {
          full_name: 'Pre-existing Qualified Lead (Updated)',
          current_status: 'Working Professional',
          training_preference: 'Offline',
        },
        counsellorId
      );

      expect(updated.full_name).toBe('Pre-existing Qualified Lead (Updated)');
      expect(updated.current_status).toBe('Working Professional');
      expect(updated.training_preference).toBe('Offline');
      // Crucial requirement: pipeline stage remains untouched!
      expect(updated.stage).toBe('Interested');
    });
  });

  describe('7. WhatsApp Number Support & Click-to-Chat', () => {
    it('automatically syncs WhatsApp number with mobile number when separate number is omitted', async () => {
      const lead = await createLead({
        full_name: 'WhatsApp Synced Lead',
        phone: '98123 45678',
        country_code: '+91',
        email: 'wasynced@example.com',
        counsellor_id: counsellorId,
        stage: 'New',
      });

      expect(lead.country_code).toBe('+91');
      expect(lead.whatsapp_country_code).toBe('+91');
      expect(lead.whatsapp_number).toBe(lead.phone);
    });

    it('validates and stores an independent WhatsApp number with international country code', async () => {
      const lead = await createLead({
        full_name: 'Dual Contact Lead',
        phone: '98234 56789',
        country_code: '+91',
        whatsapp_country_code: '+971',
        whatsapp_number: '501234567',
        email: 'dual@example.com',
        counsellor_id: counsellorId,
        stage: 'New',
      });

      expect(lead.country_code).toBe('+91');
      expect(lead.whatsapp_country_code).toBe('+971');
      expect(lead.whatsapp_number).toBe('+971 501234567');
    });

    it('rejects invalid WhatsApp numbers with country-code validation errors', async () => {
      await expect(
        createLead({
          full_name: 'Invalid WA Lead',
          phone: '98345 67890',
          country_code: '+91',
          whatsapp_country_code: '+91',
          whatsapp_number: '12345', // < 10 digits for India
          email: 'invalidwa@example.com',
          counsellor_id: counsellorId,
          stage: 'New',
        })
      ).rejects.toThrow(/Indian mobile number must be exactly 10 digits/);
    });

    it('computes clean canonical digits for wa.me click-to-chat links', () => {
      const canonicalIndia = getCanonicalPhoneDigits('+91', '+91 98765 43210');
      expect(canonicalIndia).toBe('919876543210');

      const canonicalUAE = getCanonicalPhoneDigits('+971', '50 123 4567');
      expect(canonicalUAE).toBe('971501234567');

      const canonicalUS = getCanonicalPhoneDigits('+1', '(202) 555-0123');
      expect(canonicalUS).toBe('12025550123');
    });
  });

  describe('8. CRM to Admission Workflow Compatibility', () => {
    it('converts a lead with enhanced phone, WhatsApp, and Offline training mode seamlessly', () => {
      const lead: Lead = {
        id: 'lead-convert-enhancement-01',
        lead_code: 'LD-2026-CONV1',
        full_name: 'Anand Varma',
        country_code: '+91',
        phone: '+91 98666 77788',
        whatsapp_country_code: '+91',
        whatsapp_number: '+91 98666 77788',
        email: 'anand@example.com',
        interested_course_id: store.courses[0]?.id,
        current_status: 'Experienced + Career Gap',
        training_preference: 'Offline',
        lead_source: 'YouTube',
        stage: 'Interested',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.leads.unshift(lead);

      const { lead: convertedLead, admissionPrefill } = convertLeadToAdmission(lead.id);

      expect(convertedLead.stage).toBe('Converted');
      expect(admissionPrefill.student_name).toBe('Anand Varma');
      expect(admissionPrefill.phone).toBe('+91 98666 77788');
      expect(admissionPrefill.email).toBe('anand@example.com');
      expect(admissionPrefill.training_mode).toBe('Offline');
      expect(admissionPrefill.education).toBe('Experienced + Career Gap');
    });
  });
});
