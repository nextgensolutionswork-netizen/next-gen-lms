const fs = require('fs');

const storePath = 'data/institute_store.json';
const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));

const uuidCourses = [
  {
    id: 'c1000000-0000-0000-0000-000000000001',
    course_name: 'SAP S/4HANA Finance (FICO)',
    course_code: 'SAP-FICO-2026',
    description: 'Comprehensive Financial Accounting and Controlling on SAP S/4HANA with live enterprise implementation scenarios and S/4HANA migration projects.',
    duration_weeks: 12,
    category: 'SAP Functional',
    trainer_id: 'usr-trainer-fico',
    trainer_name: 'Vikram Rao (SAP FICO Lead)',
    price: 45000,
    status: 'Published',
    modules_count: 3,
    lessons_count: 5,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  },
  {
    id: 'c1000000-0000-0000-0000-000000000002',
    course_name: 'SAP S/4HANA Materials Management (MM)',
    course_code: 'SAP-MM-2026',
    description: 'End-to-end Procurement, Inventory Management, Logistics Invoice Verification (LIV), and Master Data Governance (MDG).',
    duration_weeks: 10,
    category: 'SAP Functional',
    trainer_id: 'usr-trainer-mm',
    trainer_name: 'Neha Patel (SAP MM Lead)',
    price: 40000,
    status: 'Published',
    modules_count: 2,
    lessons_count: 4,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  },
  {
    id: 'c1000000-0000-0000-0000-000000000003',
    course_name: 'SAP Sales & Distribution (SD)',
    course_code: 'SAP-SD-2026',
    description: 'Order-to-Cash (O2C) cycle, Pricing Procedures, Shipping, Credit Management, and S/4HANA Sales integration.',
    duration_weeks: 10,
    category: 'SAP Functional',
    price: 40000,
    status: 'Published',
    modules_count: 2,
    lessons_count: 3,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  },
  {
    id: 'c1000000-0000-0000-0000-000000000004',
    course_name: 'SAP ABAP on HANA & RESTful Application Programming (RAP)',
    course_code: 'SAP-ABAP-2026',
    description: 'Core Data Services (CDS) Views, OData Service Publishing, Business Object Processing Framework (BOPF), and RAP model.',
    duration_weeks: 14,
    category: 'SAP Technical',
    price: 50000,
    status: 'Published',
    modules_count: 3,
    lessons_count: 6,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  }
];

const uuidBatches = [
  {
    id: 'b1000000-0000-0000-0000-000000000001',
    batch_name: 'SAP FICO Morning Cohort (Weekday)',
    batch_code: 'FICO-2026-M1',
    course_id: 'c1000000-0000-0000-0000-000000000001',
    trainer_id: 'usr-trainer-fico',
    trainer_name: 'Vikram Rao (SAP FICO Lead)',
    start_date: '2026-03-01',
    end_date: '2026-05-24',
    schedule_time: '08:00 AM - 10:00 AM IST',
    mode: 'Hybrid',
    maximum_capacity: 25,
    current_enrolled: 4,
    status: 'Upcoming',
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z'
  },
  {
    id: 'b1000000-0000-0000-0000-000000000002',
    batch_name: 'SAP MM Weekend Masterclass',
    batch_code: 'MM-2026-W1',
    course_id: 'c1000000-0000-0000-0000-000000000002',
    trainer_id: 'usr-trainer-mm',
    trainer_name: 'Neha Patel (SAP MM Lead)',
    start_date: '2026-03-07',
    end_date: '2026-05-16',
    schedule_time: '10:00 AM - 02:00 PM IST',
    mode: 'Hybrid',
    maximum_capacity: 25,
    current_enrolled: 2,
    status: 'Upcoming',
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z'
  }
];

for (const c of uuidCourses) {
  if (!store.courses.some(existing => existing.id === c.id)) {
    store.courses.push(c);
  }
}

for (const b of uuidBatches) {
  if (!store.batches.some(existing => existing.id === b.id)) {
    store.batches.push(b);
  }
}

fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
console.log('Successfully synced courses and batches in institute_store.json');
