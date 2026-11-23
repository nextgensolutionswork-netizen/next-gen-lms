/**
 * Centralized Standard Fee Configuration Service
 * Next-Gen ERP Solutions - LMS & CRM
 * 
 * Manages standard fee configurations for:
 * - Normal Training (Standard Batch / Cohort)
 * - Personal Training (1-on-1 Dedicated Mentorship)
 * 
 * Supports:
 * - Dynamic course-specific and category standard fees
 * - Effective date versioning without mutating historical agreements
 * - Pending confirmation state preserving existing baseline until confirmed
 */

import { store } from './data-store';
import { Course } from '@/types';
import { matchesCourseId } from './academics-service';

export type TrainingCategory = 'Normal Training' | 'Personal Training';

export interface TrainingCategoryFeeConfig {
  training_category: TrainingCategory;
  // Configured standard fee amount (null when pending explicit confirmation)
  configured_fee: number | null;
  // Effective date starting from which revised fee takes effect (YYYY-MM-DD or null)
  effective_date: string | null;
  // Status flag
  status: 'PENDING_CONFIRMATION' | 'ACTIVE';
  // Optional course-level fee overrides
  course_overrides?: Record<string, number>;
  description: string;
}

export interface SystemFeeConfiguration {
  version: string;
  last_updated: string;
  categories: {
    'Normal Training': TrainingCategoryFeeConfig;
    'Personal Training': TrainingCategoryFeeConfig;
  };
}

/**
 * Global In-Memory Standard Fee Configuration
 * Note: New amounts for Normal Training and Personal Training, as well as Effective Date,
 * are PENDING EXPLICIT CONFIRMATION.
 */
let systemFeeConfig: SystemFeeConfiguration = {
  version: '2026.11',
  last_updated: '2026-11-23T18:00:00.000Z',
  categories: {
    'Normal Training': {
      training_category: 'Normal Training',
      configured_fee: null, // To be confirmed
      effective_date: null,  // To be confirmed
      status: 'PENDING_CONFIRMATION',
      description: 'Standard cohort / batch training program with scheduled classes and lab access',
    },
    'Personal Training': {
      training_category: 'Personal Training',
      configured_fee: null, // To be confirmed
      effective_date: null,  // To be confirmed
      status: 'PENDING_CONFIRMATION',
      description: '1-on-1 dedicated faculty training with customized pace and personal mentorship',
    },
  },
};

/**
 * Retrieves the current system standard fee configuration.
 */
export function getSystemFeeConfiguration(): SystemFeeConfiguration {
  return JSON.parse(JSON.stringify(systemFeeConfig));
}

/**
 * Updates standard fee configuration when amounts and effective date are confirmed.
 */
export function updateTrainingFeeConfiguration(
  category: TrainingCategory,
  updates: Partial<TrainingCategoryFeeConfig>
): SystemFeeConfiguration {
  systemFeeConfig.categories[category] = {
    ...systemFeeConfig.categories[category],
    ...updates,
  };
  systemFeeConfig.last_updated = new Date().toISOString();
  return getSystemFeeConfiguration();
}

/**
 * Automatically resolves the applicable standard fee for a given Course and Training Category.
 *
 * Rules:
 * 1. Resolves baseline course fee from Course database record.
 * 2. Checks if revised fee is active and enrollment date >= effective_date.
 * 3. If new fee is pending confirmation or date is before effective date, safely uses the standard course price.
 * 4. Never hardcodes unconfirmed numbers.
 */
export function getStandardFeeForCourseAndTraining(params: {
  courseId: string;
  trainingCategory?: TrainingCategory | string;
  trainingMode?: string;
  enrollmentDate?: string;
  selectedCourse?: Course;
  baselineFee?: number;
}): {
  standard_fee: number;
  training_category: TrainingCategory;
  is_revised_applied: boolean;
  requires_confirmation: boolean;
  effective_date: string | null;
  course: Course | undefined;
} {
  const { courseId, trainingCategory, enrollmentDate = new Date().toISOString().slice(0, 10), selectedCourse, baselineFee } = params;
  
  const course = selectedCourse || (store.courses || []).find((c) => c.id === courseId || matchesCourseId(c.id, courseId));
  const baselinePrice = baselineFee !== undefined
    ? baselineFee
    : (course?.price ?? (course as any)?.fee ?? 0);

  // Normalize category
  const category: TrainingCategory =
    trainingCategory === 'Personal Training' ? 'Personal Training' : 'Normal Training';

  const config = systemFeeConfig.categories[category];

  // Check if course-specific override exists
  const courseOverride = config.course_overrides?.[courseId];
  if (courseOverride !== undefined && courseOverride > 0) {
    return {
      standard_fee: courseOverride,
      training_category: category,
      is_revised_applied: true,
      requires_confirmation: false,
      effective_date: config.effective_date,
      course,
    };
  }

  // Check if revised fee has been confirmed and effective date is reached
  if (
    config.status === 'ACTIVE' &&
    config.configured_fee !== null &&
    config.configured_fee > 0 &&
    config.effective_date &&
    enrollmentDate >= config.effective_date
  ) {
    return {
      standard_fee: config.configured_fee,
      training_category: category,
      is_revised_applied: true,
      requires_confirmation: false,
      effective_date: config.effective_date,
      course,
    };
  }

  // Pending confirmation or before effective date: Use standard course fee baseline
  return {
    standard_fee: baselinePrice,
    training_category: category,
    is_revised_applied: false,
    requires_confirmation: config.status === 'PENDING_CONFIRMATION',
    effective_date: config.effective_date,
    course,
  };
}

export interface EnrollmentFinancialRecalculation {
  totalCourseFee: number;
  discount: number;
  discountPercent: number;
  netPayable: number;
  amountPaid: number;
  outstandingBalance: number;
  installments: Array<{
    installment_number: number;
    amount: number;
    due_date?: string;
  }>;
}

/**
 * Recalculates enrollment financial figures consistently across the platform.
 */
export function calculateEnrollmentFinancials(params: {
  standardFee: number;
  discount: number;
  paymentPlan?: 'Full Payment' | '2 Installments' | '3 Installments' | 'Custom';
  initialPayment?: number;
  admissionDate?: string;
  feeDueDate?: string;
}): EnrollmentFinancialRecalculation {
  const standardFee = Math.max(0, params.standardFee || 0);
  const discount = Math.min(standardFee, Math.max(0, params.discount || 0));
  const netPayable = Math.max(0, standardFee - discount);
  const discountPercent = standardFee > 0 ? Math.round((discount / standardFee) * 100) : 0;
  const initialPayment = Math.min(netPayable, Math.max(0, params.initialPayment || 0));
  const outstandingBalance = Math.max(0, netPayable - initialPayment);

  const plan = params.paymentPlan || 'Full Payment';
  const installments: Array<{ installment_number: number; amount: number; due_date?: string }> = [];

  if (plan === 'Full Payment') {
    installments.push({
      installment_number: 1,
      amount: netPayable,
      due_date: params.feeDueDate || params.admissionDate,
    });
  } else if (plan === '2 Installments') {
    const half = Math.round(netPayable / 2);
    installments.push(
      { installment_number: 1, amount: half, due_date: params.admissionDate },
      { installment_number: 2, amount: netPayable - half, due_date: params.feeDueDate }
    );
  } else if (plan === '3 Installments') {
    const third = Math.round(netPayable / 3);
    installments.push(
      { installment_number: 1, amount: third, due_date: params.admissionDate },
      { installment_number: 2, amount: third, due_date: params.feeDueDate },
      { installment_number: 3, amount: netPayable - 2 * third, due_date: params.feeDueDate }
    );
  } else {
    installments.push({
      installment_number: 1,
      amount: netPayable,
      due_date: params.feeDueDate || params.admissionDate,
    });
  }

  return {
    totalCourseFee: standardFee,
    discount,
    discountPercent,
    netPayable,
    amountPaid: initialPayment,
    outstandingBalance,
    installments,
  };
}
