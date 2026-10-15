import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import {
  getOnboardingCaseById,
  getOnboardingAuditLogs,
  updateChecklistItem,
  assignOnboardingStaff,
  setCaseBlocked,
  unblockCase,
  provisionStudentLmsAccount,
  arrangeStudentOrientation,
  dispatchStudentWelcomeNotification,
  confirmStudentPortalAccess,
  uploadStudentDocument,
  verifyStudentDocument,
  completeOnboardingWorkflow,
} from '@/lib/services/onboarding-service';
import { canAccessOnboardingCase, canAssignOnboardingStaff } from '@/lib/auth/rbac';
import { OnboardingChecklistKey } from '@/types';
import { store } from '@/lib/services/data-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/onboarding/cases/[id]
 * Retrieves details for a specific onboarding case including audit history and documents.
 * Enforces assignment scope: onboarding_team staff can ONLY access cases assigned to them.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'onboarding_team'],
      requiredPermission: 'onboarding:read',
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { user } = auth;
    return await paymentTransaction(user, async () => {
    const resolvedParams = await Promise.resolve(params);
    const caseId = resolvedParams?.id;

    if (!caseId) {
      return NextResponse.json(
        { success: false, error: 'Case ID parameter is required.' },
        { status: 400 }
      );
    }

    const caseRecord = store.onboardingCases.find((c) => c.id === caseId);

    if (!caseRecord) {
      return NextResponse.json(
        { success: false, error: `Onboarding case "${caseId}" not found.` },
        { status: 404 }
      );
    }

    // Role and assignment authorization check
    if (!canAccessOnboardingCase(user, caseRecord)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Access denied. This onboarding case is not assigned to your account.',
        },
        { status: 403 }
      );
    }

    const auditEvents = await getOnboardingAuditLogs(caseRecord.id, user);

    return NextResponse.json({
      success: true,
      case: caseRecord,
      documents: caseRecord.documents || [],
      auditEvents,
    });
    }, request.method === 'GET');
  } catch (error: any) {
    console.error(`[API /api/onboarding/cases/[id]] GET error:`, error);
    const isAccessDenied = error?.message?.toLowerCase().includes('access denied');
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to retrieve onboarding case.' },
      { status: isAccessDenied ? 403 : 500 }
    );
  }
}

/**
 * PATCH /api/onboarding/cases/[id]
 * Executes onboarding workflow transitions, checklist updates, orientation scheduling,
 * LMS provisioning, document verification, and academic handover.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'onboarding_team'],
      requiredPermission: 'onboarding:write',
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { user } = auth;
    return await paymentTransaction(user, async () => {
    const resolvedParams = await Promise.resolve(params);
    const caseId = resolvedParams?.id;

    if (!caseId) {
      return NextResponse.json(
        { success: false, error: 'Case ID parameter is required.' },
        { status: 400 }
      );
    }

    const existingCase = store.onboardingCases.find((c) => c.id === caseId);

    if (!existingCase) {
      return NextResponse.json(
        { success: false, error: `Onboarding case "${caseId}" not found.` },
        { status: 404 }
      );
    }

    // Scope check: onboarding_team can only update assigned cases
    if (!canAccessOnboardingCase(user, existingCase)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Access denied. You cannot modify an onboarding case not assigned to you.',
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid "action" field in request payload.',
          supportedActions: [
            'update_checklist',
            'assign_staff',
            'block_case',
            'unblock_case',
            'provision_lms',
            'arrange_orientation',
            'dispatch_welcome_notification',
            'confirm_portal_access',
            'upload_document',
            'verify_document',
            'complete_workflow',
          ],
        },
        { status: 400 }
      );
    }

    switch (action) {
      case 'update_checklist': {
        const { itemKey, completed, notes } = body;
        if (!itemKey || typeof completed !== 'boolean') {
          return NextResponse.json(
            { success: false, error: 'Fields "itemKey" (string) and "completed" (boolean) are required.' },
            { status: 400 }
          );
        }
        const updated = await updateChecklistItem(
          caseId,
          itemKey as OnboardingChecklistKey,
          completed,
          notes,
          user
        );
        return NextResponse.json({
          success: true,
          message: `Checklist item "${itemKey}" updated.`,
          case: updated,
        });
      }

      case 'assign_staff': {
        if (!canAssignOnboardingStaff(user)) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: Only administrators can assign or reassign staff.' },
            { status: 403 }
          );
        }
        const { staffId } = body;
        if (!staffId || typeof staffId !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Field "staffId" (string) is required.' },
            { status: 400 }
          );
        }
        const updated = await assignOnboardingStaff(caseId, staffId, user);
        return NextResponse.json({
          success: true,
          message: `Case successfully assigned to ${updated.assigned_staff_name}.`,
          case: updated,
        });
      }

      case 'block_case': {
        const { reason } = body;
        if (!reason || typeof reason !== 'string' || !reason.trim()) {
          return NextResponse.json(
            { success: false, error: 'A non-empty "reason" is required to block an onboarding case.' },
            { status: 400 }
          );
        }
        const updated = await setCaseBlocked(caseId, reason.trim(), user);
        return NextResponse.json({
          success: true,
          message: `Case placed on hold: "${reason}".`,
          case: updated,
        });
      }

      case 'unblock_case': {
        const updated = await unblockCase(caseId, user);
        return NextResponse.json({
          success: true,
          message: 'Case successfully unblocked and resumed.',
          case: updated,
        });
      }

      case 'provision_lms': {
        const result = await provisionStudentLmsAccount(caseId, user);
        return NextResponse.json({
          success: result.success,
          message: result.message,
          case: result.caseRecord,
        });
      }

      case 'arrange_orientation': {
        const { orientationDate, orientationMode, orientationNotes } = body;
        if (!orientationDate || !orientationMode) {
          return NextResponse.json(
            { success: false, error: 'Fields "orientationDate" and "orientationMode" are required.' },
            { status: 400 }
          );
        }
        const updated = await arrangeStudentOrientation(
          caseId,
          orientationDate,
          orientationMode,
          orientationNotes,
          user
        );
        return NextResponse.json({
          success: true,
          message: `Orientation scheduled for ${orientationDate} via ${orientationMode}.`,
          case: updated,
        });
      }

      case 'dispatch_welcome_notification': {
        const { orientationDate, orientationMode } = body;
        const result = await dispatchStudentWelcomeNotification(caseId, user, {
          orientationDate,
          orientationMode,
        });
        return NextResponse.json({
          success: result.success,
          message: result.message,
          case: result.caseRecord,
        });
      }

      case 'confirm_portal_access': {
        const { notes } = body;
        const updated = await confirmStudentPortalAccess(caseId, notes, user);
        return NextResponse.json({
          success: true,
          message: 'Student portal access and first class attendance confirmed.',
          case: updated,
        });
      }

      case 'upload_document': {
        const { name, doc_type, file_url } = body;
        if (!name || !doc_type || !file_url) {
          return NextResponse.json(
            { success: false, error: 'Fields "name", "doc_type", and "file_url" are required.' },
            { status: 400 }
          );
        }
        const updated = await uploadStudentDocument(
          caseId,
          { name, doc_type, file_url },
          user
        );
        return NextResponse.json({
          success: true,
          message: `Document "${name}" uploaded successfully.`,
          case: updated,
        });
      }

      case 'verify_document': {
        const { documentId, status, rejectionReason } = body;
        if (!documentId || (status !== 'verified' && status !== 'rejected')) {
          return NextResponse.json(
            { success: false, error: 'Fields "documentId" and "status" ("verified"|"rejected") are required.' },
            { status: 400 }
          );
        }
        const updated = await verifyStudentDocument(
          caseId,
          documentId,
          status,
          rejectionReason,
          user
        );
        return NextResponse.json({
          success: true,
          message: `Document marked as ${status}.`,
          case: updated,
        });
      }

      case 'complete_workflow': {
        const updated = await completeOnboardingWorkflow(caseId, user);
        return NextResponse.json({
          success: true,
          message: `Onboarding completed and student handed over to Academic Operations.`,
          case: updated,
        });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unsupported action: "${action}".`,
          },
          { status: 400 }
        );
    }
    }, request.method === 'GET');
  } catch (error: any) {
    console.error(`[API /api/onboarding/cases/[id]] PATCH error:`, error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update onboarding case.' },
      { status: 500 }
    );
  }
}
