-- Next-Gen ERP LMS: 005_student_doubts.sql
-- Student Doubts & Academic Support Desk with Threaded Messaging and RLS Isolation

-- 1. Create student_doubts table
CREATE TABLE IF NOT EXISTS student_doubts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number TEXT NOT NULL UNIQUE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    admission_number TEXT NOT NULL,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    course_name TEXT NOT NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    batch_name TEXT,
    assigned_to_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_to_name TEXT,
    assigned_to_role TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'Academic Concept',
        'SAP Configuration',
        'Lab / Server Error',
        'Assignment Doubt',
        'General Query'
    )),
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN (
        'Open',
        'Assigned',
        'In Progress',
        'Resolved',
        'Closed'
    )),
    sap_tcode TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create doubt_messages table for threaded discussions
CREATE TABLE IF NOT EXISTS doubt_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doubt_id UUID NOT NULL REFERENCES student_doubts(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    message TEXT NOT NULL,
    attachment_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_doubts_student ON student_doubts(student_id);
CREATE INDEX IF NOT EXISTS idx_doubts_assigned ON student_doubts(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_doubts_status ON student_doubts(status);
CREATE INDEX IF NOT EXISTS idx_doubt_messages_doubt ON doubt_messages(doubt_id);

-- 3. Row-Level Security
ALTER TABLE student_doubts ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubt_messages ENABLE ROW LEVEL SECURITY;

-- Select policy: Students view only their own doubts; Staff view all doubts
CREATE POLICY "Students see own doubts; staff see all"
ON student_doubts FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM students
        WHERE students.id = student_doubts.student_id
        AND students.user_id = auth.uid()
    )
    OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'trainer', 'support')
    )
);

-- Insert policy: Students can create doubts for their own student record
CREATE POLICY "Students can create doubts"
ON student_doubts FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM students
        WHERE students.id = student_doubts.student_id
        AND students.user_id = auth.uid()
    )
    OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'support')
    )
);

-- Update policy: Assigned mentors, trainers, support staff and admins can update doubts
CREATE POLICY "Staff can update and resolve doubts"
ON student_doubts FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'trainer', 'support')
    )
);

-- Messages Select Policy: Visible if the user has access to the parent doubt
CREATE POLICY "View messages if user can view parent doubt"
ON doubt_messages FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM student_doubts
        JOIN students ON students.id = student_doubts.student_id
        WHERE student_doubts.id = doubt_messages.doubt_id
        AND students.user_id = auth.uid()
    )
    OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'trainer', 'support')
    )
);

-- Messages Insert Policy: Students and Staff can reply to doubts they can view
CREATE POLICY "Post replies on accessible doubts"
ON doubt_messages FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND (
        EXISTS (
            SELECT 1 FROM student_doubts
            JOIN students ON students.id = student_doubts.student_id
            WHERE student_doubts.id = doubt_messages.doubt_id
            AND students.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'admin', 'trainer', 'support')
        )
    )
);
