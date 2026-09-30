import { getDb, isLiveSupabaseEnabled } from './db';
import { store } from '@/lib/services/data-store';

export interface SeedSyncResult {
  success: boolean;
  message: string;
  syncedTables: { table: string; count: number }[];
  errors: string[];
}

/**
 * Synchronizes and populates all initial institute dataset records from the in-memory
 * store into live Supabase PostgreSQL tables.
 */
export async function syncStoreToSupabase(): Promise<SeedSyncResult> {
  const db = getDb();
  const errors: string[] = [];
  const syncedTables: { table: string; count: number }[] = [];

  try {
    // 1. System Settings
    const { error: errSettings } = await db.from('system_settings').upsert({
      id: '11111111-1111-1111-1111-111111111111',
      institute_name: store.settings.institute_name,
      tagline: store.settings.tagline,
      address: store.settings.address,
      phone: store.settings.phone,
      email: store.settings.email,
      gst_number: store.settings.gst_number,
      default_currency: store.settings.default_currency,
      academic_year: store.settings.academic_year,
      receipt_prefix: store.settings.receipt_prefix,
      invoice_prefix: store.settings.invoice_prefix,
      timezone: store.settings.timezone,
    });
    if (errSettings) errors.push(`system_settings: ${errSettings.message}`);
    else syncedTables.push({ table: 'system_settings', count: 1 });

    // 2. Profiles (all 8 roles)
    const profileRows = store.users.map((u) => ({
      id: u.id.length === 36 ? u.id : undefined, // only if UUID
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      phone: u.phone,
      is_active: u.is_active,
    }));
    const { error: errProfiles } = await db.from('profiles').upsert(profileRows, { onConflict: 'email' });
    if (errProfiles) errors.push(`profiles: ${errProfiles.message}`);
    else syncedTables.push({ table: 'profiles', count: profileRows.length });

    // 3. Courses
    const courseRows = store.courses.map((c) => ({
      course_name: c.course_name,
      course_code: c.course_code,
      description: c.description,
      duration_weeks: c.duration_weeks,
      category: c.category,
      price: c.price,
      status: c.status,
    }));
    const { error: errCourses } = await db.from('courses').upsert(courseRows, { onConflict: 'course_code' });
    if (errCourses) errors.push(`courses: ${errCourses.message}`);
    else syncedTables.push({ table: 'courses', count: courseRows.length });

    // 4. SAP Server Systems
    const sysRows = store.sapSystems.map((s) => ({
      system_name: s.system_name,
      sid: s.sid,
      instance_number: s.instance_number,
      server_host: s.server_host,
      sap_router: s.sap_router,
      default_client: s.default_client,
      description: s.description,
      status: s.status,
    }));
    const { error: errSystems } = await db.from('sap_server_systems').upsert(sysRows, { onConflict: 'sid' });
    if (errSystems) errors.push(`sap_server_systems: ${errSystems.message}`);
    else syncedTables.push({ table: 'sap_server_systems', count: sysRows.length });

    // 5. CRM Leads
    const leadRows = store.leads.map((l) => ({
      lead_code: l.lead_code,
      full_name: l.full_name,
      phone: l.phone,
      email: l.email,
      current_status: l.current_status,
      experience_years: l.experience_years,
      training_preference: l.training_preference,
      lead_source: l.lead_source,
      stage: l.stage,
      notes: l.notes,
    }));
    const { error: errLeads } = await db.from('leads').upsert(leadRows, { onConflict: 'lead_code' });
    if (errLeads) errors.push(`leads: ${errLeads.message}`);
    else syncedTables.push({ table: 'leads', count: leadRows.length });

    return {
      success: errors.length === 0,
      message: errors.length === 0 ? 'All data successfully synced to Supabase PostgreSQL' : 'Sync completed with warnings',
      syncedTables,
      errors,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Fatal error during database sync',
      syncedTables,
      errors: [err.message],
    };
  }
}
