-- Next-Gen ERP LMS: 004_sap_lab_servers.sql
-- SAP Lab Server Systems and Student Sandbox Allocations

-- 1. Create sap_server_systems table
CREATE TABLE IF NOT EXISTS sap_server_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_name TEXT NOT NULL,
    sid TEXT NOT NULL,
    instance_number TEXT NOT NULL DEFAULT '00',
    server_host TEXT NOT NULL,
    sap_router TEXT,
    default_client TEXT NOT NULL DEFAULT '800',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Online' CHECK (status IN ('Online', 'Maintenance', 'Offline')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create sap_server_allocations table
CREATE TABLE IF NOT EXISTS sap_server_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    admission_number TEXT NOT NULL,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    course_name TEXT NOT NULL,
    system_id UUID NOT NULL REFERENCES sap_server_systems(id) ON DELETE CASCADE,
    system_name TEXT NOT NULL,
    server_host TEXT NOT NULL,
    sid TEXT NOT NULL,
    instance_number TEXT NOT NULL,
    client_number TEXT NOT NULL DEFAULT '800',
    sap_user_id TEXT NOT NULL,
    sap_password TEXT NOT NULL,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expired', 'Revoked')),
    allocated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_sap_alloc_student ON sap_server_allocations(student_id);
CREATE INDEX IF NOT EXISTS idx_sap_alloc_system ON sap_server_allocations(system_id);
CREATE INDEX IF NOT EXISTS idx_sap_alloc_status ON sap_server_allocations(status);

-- 3. Row-Level Security
ALTER TABLE sap_server_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE sap_server_allocations ENABLE ROW LEVEL SECURITY;

-- Staff can view all SAP systems
CREATE POLICY "Staff can view SAP systems"
ON sap_server_systems FOR SELECT
TO authenticated
USING (true);

-- Admins can manage SAP systems
CREATE POLICY "Admins can manage SAP systems"
ON sap_server_systems FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin')
    )
);

-- Students can view only their own SAP allocations
CREATE POLICY "Students can view their own SAP allocations"
ON sap_server_allocations FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM students
        WHERE students.id = sap_server_allocations.student_id
        AND students.user_id = auth.uid()
    )
    OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'trainer')
    )
);

-- Admins can manage allocations
CREATE POLICY "Admins can manage allocations"
ON sap_server_allocations FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin')
    )
);

-- 4. Initial Seed Systems
INSERT INTO sap_server_systems (id, system_name, sid, instance_number, server_host, sap_router, default_client, description, status)
VALUES
('a0000000-0000-0000-0000-000000000001', 'SAP S/4HANA 2022 FPS02 Enterprise Sandbox', 'S4H', '00', 's4h.lab.next-generpsolutions.com', '/H/103.212.120.45/S/3299', '800', 'Dedicated S/4HANA practice sandbox with full FICO, MM, SD, and ABAP customization tables.', 'Online'),
('a0000000-0000-0000-0000-000000000002', 'SAP ECC 6.0 EHP8 Production Simulation', 'DEV', '01', 'ecc.lab.next-generpsolutions.com', NULL, '100', 'Classic ECC environment for legacy interface, IDoc, and transaction code reference practice.', 'Online')
ON CONFLICT (id) DO NOTHING;
