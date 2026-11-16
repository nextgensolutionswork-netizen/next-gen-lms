import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import {
  getAuthoritativeJobApplications,
  applyForJob,
  updateJobApplicationStatus,
  withdrawJobApplication,
} from '@/lib/services/placement-service';
import { store } from '@/lib/services/data-store';
import { JobApplicationStatus } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator', 'student'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('job_id') || undefined;
    const rawStatus = searchParams.get('status') || 'All';
    const status = (rawStatus as JobApplicationStatus | 'All');
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('page_size') || '10', 10);

    const tenantId = auth.user.tenant_id || searchParams.get('tenant_id') || undefined;
    let studentId = searchParams.get('student_id') || undefined;

    // Student role can ONLY view their own applications
    if (auth.user.role === 'student') {
      const student = (store.students || []).find(
        (s) => s.id === auth.user.id || s.user_id === auth.user.id || (s.email && s.email.toLowerCase() === auth.user.email?.toLowerCase())
      );
      studentId = student?.id || auth.user.id;
    }

    const result = getAuthoritativeJobApplications({
      jobId,
      studentId,
      tenantId,
      status,
      search,
      page,
      pageSize,
      deduplicate: true,
    });

    return NextResponse.json(
      {
        success: true,
        total: result.total,
        totalForDrive: result.totalForDrive,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        applications: result.applications,
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
        error: err.message || 'Failed to retrieve job applications',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator', 'student'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    if (!body.job_id) {
      return NextResponse.json(
        { success: false, error: 'Job opening ID is required.' },
        { status: 400 }
      );
    }

    let targetStudentId = body.student_id;
    if (auth.user.role === 'student') {
      const student = (store.students || []).find(
        (s) => s.id === auth.user.id || s.user_id === auth.user.id || (s.email && s.email.toLowerCase() === auth.user.email?.toLowerCase())
      );
      targetStudentId = student?.id || auth.user.id;
    }

    if (!targetStudentId) {
      return NextResponse.json(
        { success: false, error: 'Candidate student ID is required.' },
        { status: 400 }
      );
    }

    const application = await applyForJob(body.job_id, targetStudentId, auth.user.id);

    return NextResponse.json(
      {
        success: true,
        application,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to submit application',
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator', 'student'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    const { application_id, status, reason } = body;

    if (!application_id || !status) {
      return NextResponse.json(
        { success: false, error: 'Application ID and target status are required.' },
        { status: 400 }
      );
    }

    let application;
    if (status === 'Withdrawn') {
      application = await withdrawJobApplication(application_id, auth.user.id, reason);
    } else {
      if (auth.user.role === 'student') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Students are only permitted to withdraw their own applications.' },
          { status: 403 }
        );
      }
      application = await updateJobApplicationStatus(application_id, status, auth.user.id);
    }

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (err: any) {
    const isAuth =
      err.message?.includes('Unauthorized') ||
      err.message?.includes('Forbidden') ||
      err.message?.includes('permission');
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to update application status',
      },
      { status: isAuth ? 403 : 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator', 'student'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('id');
    const reason = searchParams.get('reason') || 'Withdrawn by user';

    if (!applicationId) {
      return NextResponse.json(
        { success: false, error: 'Application ID is required.' },
        { status: 400 }
      );
    }

    const application = await withdrawJobApplication(applicationId, auth.user.id, reason);

    return NextResponse.json({
      success: true,
      message: 'Application withdrawn successfully.',
      application,
    });
  } catch (err: any) {
    const isAuth =
      err.message?.includes('Unauthorized') ||
      err.message?.includes('Forbidden') ||
      err.message?.includes('permission');
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to withdraw application',
      },
      { status: isAuth ? 403 : 400 }
    );
  }
}
