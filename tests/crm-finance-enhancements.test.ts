import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { store } from '@/lib/services/data-store';
import { convertLeadToAdmission } from '@/lib/services/crm-service';
import {
  createCashfreeOrder,
  createGatewayOrder,
  verifyCashfreeWebhookSignature,
  getCashfreeConfig,
} from '@/lib/services/payment-gateway-service';
import { calculateGstBreakdown, resolveState } from '@/lib/services/gst-service';
import { Lead } from '@/types';

describe('CRM & Finance Enhancements Test Suite', () => {
  const mockLeadId = 'lead-test-convert-001';

  beforeEach(() => {
    // Reset test lead in store
    const existingIndex = store.leads.findIndex((l) => l.id === mockLeadId);
    const mockLead: Lead = {
      id: mockLeadId,
      lead_code: 'LD-2026-999',
      full_name: 'Ananya Sharma',
      phone: '+91 91234 56789',
      email: 'ananya.sharma@example.com',
      interested_course_id: store.courses[0]?.id || 'course-sap-fico',
      interested_course_name: 'SAP S/4HANA Finance (FI/CO)',
      current_status: 'Working Professional',
      experience_years: 3,
      training_preference: 'Hybrid',
      lead_source: 'Google Ads',
      counsellor_id: 'usr-counsellor',
      counsellor_name: 'Lead Counsellor',
      stage: 'Interested',
      notes: 'Wants weekend batches with SAP server access',
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-01T10:00:00Z',
    };

    if (existingIndex >= 0) {
      store.leads[existingIndex] = mockLead;
    } else {
      store.leads.push(mockLead);
    }
  });

  describe('1. One-Click Lead to Admission Conversion Workflow', () => {
    it('successfully transitions lead stage to Enrolled and creates prefill input', () => {
      const result = convertLeadToAdmission(mockLeadId);

      expect(result).toBeDefined();
      expect(result.lead.stage).toBe('Enrolled');
      expect(result.admissionPrefill).toMatchObject({
        student_name: 'Ananya Sharma',
        email: 'ananya.sharma@example.com',
        phone: '+91 91234 56789',
        education: 'Working Professional',
        experience_years: 3,
        course_id: store.courses[0]?.id || 'course-sap-fico',
        counsellor_id: 'usr-counsellor',
        lead_id: mockLeadId,
        training_mode: 'Hybrid',
      });
      expect(result.admissionPrefill.course_fee).toBeGreaterThan(0);
    });

    it('persists Enrolled stage in store', () => {
      convertLeadToAdmission(mockLeadId);
      const updated = store.leads.find((l) => l.id === mockLeadId);
      expect(updated?.stage).toBe('Enrolled');
    });

    it('throws error for non-existent lead ID', () => {
      expect(() => convertLeadToAdmission('non-existent-lead-xyz')).toThrow(/Lead not found/);
    });
  });

  describe('2. Cashfree Payment Gateway Integration & Order Generation', () => {
    it('creates a simulated Cashfree order with proper attributes', async () => {
      const order = await createCashfreeOrder({
        amount: 25000,
        currency: 'INR',
        student_id: 'std-test-01',
        course_id: 'course-sap-fico',
        fee_account_id: 'fa-test-01',
        installment_id: 'inst-01',
        student_name: 'Rohan Gupta',
        student_email: 'rohan.gupta@example.com',
      });

      expect(order.order_id).toMatch(/^cf_order_/);
      expect(order.amount).toBe(2500000); // 25,000 INR in paise
      expect(order.currency).toBe('INR');
      expect(order.gateway).toBe('Cashfree');
      expect(order.status).toBe('ACTIVE');
      expect(order.notes.student_id).toBe('std-test-01');
      expect(order.notes.fee_account_id).toBe('fa-test-01');
      expect(order.is_mock).toBe(true);
    });

    it('routes to Cashfree when preferredGateway is specified as Cashfree in createGatewayOrder', async () => {
      const order = await createGatewayOrder(
        {
          amount: 15000,
          student_id: 'std-test-02',
          course_id: 'course-sap-mm',
          fee_account_id: 'fa-test-02',
        },
        'Cashfree'
      );

      expect(order.gateway).toBe('Cashfree');
      expect(order.order_id).toMatch(/^cf_order_/);
      expect(order.amount).toBe(1500000);
    });
  });

  describe('3. Cashfree Webhook Signature Verification', () => {
    const testSecret = 'cf_webhook_test_secret_key_2026';
    const rawBody = JSON.stringify({
      data: {
        order: { order_id: 'cf_order_998877', order_amount: 10000 },
        payment: { payment_id: 'cf_pay_123', payment_status: 'SUCCESS' },
      },
      event_time: '2026-10-01T06:00:00Z',
      type: 'PAYMENT_SUCCESS_WEBHOOK',
    });
    const timestamp = '1727762400';

    it('successfully verifies a valid HMAC-SHA256 signature calculated on timestamp + rawBody', () => {
      const payload = `${timestamp}${rawBody}`;
      const validSignature = crypto
        .createHmac('sha256', testSecret)
        .update(payload)
        .digest('base64');

      const isValid = verifyCashfreeWebhookSignature(
        rawBody,
        validSignature,
        timestamp,
        testSecret
      );
      expect(isValid).toBe(true);
    });

    it('rejects tampered webhook body', () => {
      const payload = `${timestamp}${rawBody}`;
      const validSignature = crypto
        .createHmac('sha256', testSecret)
        .update(payload)
        .digest('base64');

      const tamperedBody = rawBody.replace('10000', '99999');
      const isValid = verifyCashfreeWebhookSignature(
        tamperedBody,
        validSignature,
        timestamp,
        testSecret
      );
      expect(isValid).toBe(false);
    });

    it('rejects mismatched timestamp', () => {
      const payload = `${timestamp}${rawBody}`;
      const validSignature = crypto
        .createHmac('sha256', testSecret)
        .update(payload)
        .digest('base64');

      const wrongTimestamp = '1727769999';
      const isValid = verifyCashfreeWebhookSignature(
        rawBody,
        validSignature,
        wrongTimestamp,
        testSecret
      );
      expect(isValid).toBe(false);
    });

    it('rejects empty or missing parameters', () => {
      expect(verifyCashfreeWebhookSignature('', 'sig', 'ts')).toBe(false);
      expect(verifyCashfreeWebhookSignature('body', '', 'ts')).toBe(false);
      expect(verifyCashfreeWebhookSignature('body', 'sig', '')).toBe(false);
    });
  });

  describe('4. Financial Reports GST State Resolution Parity', () => {
    it('correctly resolves Telangana (36) as INTRA_STATE with CGST 9% and SGST 9%', () => {
      const gst = calculateGstBreakdown(11800, '36');
      expect(gst.supply_type).toBe('INTRA_STATE');
      expect(gst.place_of_supply_code).toBe('36');
      expect(gst.taxable_amount).toBe(10000);
      expect(gst.cgst_amount).toBe(900);
      expect(gst.sgst_amount).toBe(900);
      expect(gst.igst_amount).toBe(0);
      expect(gst.total_tax).toBe(1800);
    });

    it('correctly resolves Maharashtra (27) as INTER_STATE with IGST 18%', () => {
      const gst = calculateGstBreakdown(11800, '27');
      expect(gst.supply_type).toBe('INTER_STATE');
      expect(gst.place_of_supply_code).toBe('27');
      expect(gst.taxable_amount).toBe(10000);
      expect(gst.cgst_amount).toBe(0);
      expect(gst.sgst_amount).toBe(0);
      expect(gst.igst_amount).toBe(1800);
      expect(gst.total_tax).toBe(1800);
    });

    it('prioritizes state_code over address string in composite student location object', () => {
      // Even if address mentions Mumbai, state_code '36' takes priority
      const resolved = resolveState('36');
      expect(resolved.code).toBe('36');
      expect(resolved.name).toBe('Telangana');

      const gst = calculateGstBreakdown(11800, {
        state_code: '36',
        city: 'Mumbai',
        address: 'Nariman Point, Mumbai, Maharashtra',
      });
      expect(gst.supply_type).toBe('INTRA_STATE');
      expect(gst.place_of_supply_code).toBe('36');
    });

    it('resolves Bangalore / Karnataka as INTER_STATE (29)', () => {
      const gst = calculateGstBreakdown(5900, {
        state_code: '29',
        state: 'Karnataka',
        city: 'Bengaluru',
      });
      expect(gst.supply_type).toBe('INTER_STATE');
      expect(gst.place_of_supply_code).toBe('29');
      expect(gst.igst_amount).toBe(900);
      expect(gst.total_tax).toBe(900);
    });
  });
});
