import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import {
  getJobOpenings,
  createJobOpening,
  updateJobOpening,
  updateJobOpeningStatus,
  deleteJobOpening,
} from '@/lib/services/placement-service';

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

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    const { id, status, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Job opening id is required' },
        { status: 400 }
      );
    }

    let updatedJob = null;
    if (status && Object.keys(updates).length === 0) {
      updatedJob = await updateJobOpeningStatus(id, status);
    } else {
      updatedJob = await updateJobOpening(id, { ...updates, ...(status ? { status } : {}) });
    }

    if (!updatedJob) {
      return NextResponse.json(
        { success: false, error: 'Job opening not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: updatedJob,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update job opening' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Job opening id is required' },
        { status: 400 }
      );
    }

    const deleted = await deleteJobOpening(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Job opening not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Job opening successfully deleted',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete job opening' },
      { status: 500 }
    );
  }
}
