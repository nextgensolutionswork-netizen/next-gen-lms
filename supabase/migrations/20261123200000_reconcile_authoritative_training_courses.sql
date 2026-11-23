-- Migration: 20261123200000_reconcile_authoritative_training_courses.sql
-- Description: Reconcile and authoritatively persist the four configured training courses
--              into Supabase courses table, ensuring single source of truth across all modules.

INSERT INTO courses (
    id,
    course_name,
    course_code,
    description,
    duration_weeks,
    category,
    price,
    status,
    created_at,
    updated_at
) VALUES
(
    'c1000000-0000-4000-a000-000000000101',
    'SAP FICO PERSONAL TRAINING',
    'SAP FICO 101',
    '1-on-1 personalized SAP S/4HANA Finance (FICO) training with dedicated mentorship and custom scheduling.',
    12,
    'SAP Functional',
    35000,
    'Published',
    NOW(),
    NOW()
),
(
    'c1000000-0000-4000-a000-000000000102',
    'SAP FICO NORMAL TRAINING',
    'SAP FICO 102',
    'Standard cohort-based SAP S/4HANA Finance (FICO) normal batch training covering financial accounting and controlling.',
    12,
    'SAP Functional',
    28000,
    'Published',
    NOW(),
    NOW()
),
(
    'c1000000-0000-4000-a000-000000000103',
    'SAP MM PERSONAL TRAINING',
    'SAP MM 103',
    '1-on-1 personalized SAP S/4HANA Materials Management (MM) training with individual mentoring and hands-on scenarios.',
    10,
    'SAP Functional',
    35000,
    'Published',
    NOW(),
    NOW()
),
(
    'c1000000-0000-4000-a000-000000000104',
    'SAP ABAP NORMAL TRAINING',
    'SAP ABAP 104',
    'Standard cohort-based SAP ABAP on HANA normal batch training covering core syntax, CDS views, AMDP, and RAP.',
    12,
    'SAP Technical',
    28000,
    'Published',
    NOW(),
    NOW()
)
ON CONFLICT (course_code) DO UPDATE SET
    course_name = EXCLUDED.course_name,
    price = EXCLUDED.price,
    category = EXCLUDED.category,
    duration_weeks = EXCLUDED.duration_weeks,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    updated_at = NOW();
