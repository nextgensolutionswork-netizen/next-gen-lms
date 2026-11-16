import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { getJobOpenings, createJobOpening } from '@/lib/services/placement-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator', 'student', 'trainer'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const jobs = await getJobOpenings();

    return NextResponse.json(
      {
        success: true,
        jobs,
      },
      {
        headers: {
          'Cache-Control': 'no-store, private',
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to retrieve job openings',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    if (!body.company_name || !body.job_title) {
      return NextResponse.json(
        { success: false, error: 'Hiring company and job role title are required.' },
        { status: 400 }
      );
    }

    const job = await createJobOpening({
      company_name: body.company_name,
      job_title: body.job_title,
      module: body.module || 'SAP FICO',
      experience_required: body.experience_required || '0 - 2 Years',
      location: body.location || 'Hyderabad / Bengaluru',
      salary_range: body.salary_range || '₹6.5 - ₹8.5 LPA',
      description: body.description || '',
      application_deadline: body.application_deadline || '2026-12-31',
      status: body.status || 'Open',
    });

    return NextResponse.json(
      {
        success: true,
        job,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to create job opening',
      },
      { status: 500 }
    );
  }
}
