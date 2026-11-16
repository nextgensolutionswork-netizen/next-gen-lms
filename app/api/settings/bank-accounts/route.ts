import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { bankAccountService } from '@/lib/services/bank-account-service';
import { getAuthorizedBankAccounts } from '@/lib/utils/bank-autofill';
import { getAuthenticatedUserFromRequest } from '@/lib/auth/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    store.hydrateFromDisk();
    const authUser = await getAuthenticatedUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required to view bank account presets.' },
        { status: 401 }
      );
    }

    const allowedRoles = ['super_admin', 'admin', 'accountant', 'counsellor'];
    if (!allowedRoles.includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient privileges to view bank account presets.' },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const includePendingParam = url.searchParams.get('include_pending') === 'true' || url.searchParams.get('pending') === 'true';
    const includeArchivedParam = url.searchParams.get('include_archived') === 'true';

    const isAdmin = authUser.role === 'super_admin' || authUser.role === 'admin';
    const includePending = isAdmin && includePendingParam;
    const includeArchived = isAdmin && includeArchivedParam;

    const accounts = getAuthorizedBankAccounts(authUser.role, {
      includePending,
      includeArchived,
    });

    return NextResponse.json({
      success: true,
      total: accounts.length,
      accounts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve bank accounts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    store.hydrateFromDisk();
    const authUser = await getAuthenticatedUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Administrative authentication required.' },
        { status: 401 }
      );
    }

    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only Administrators or Super Admins can configure bank accounts.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'import_reference_accounts';

    if (action === 'import_reference_accounts') {
      const defaultStatus = body.default_status === 'pending' ? 'pending' : 'verified';
      const result = bankAccountService.importReferenceBankAccounts({
        defaultStatus,
        actorUserId: authUser.id,
        actorUserName: authUser.full_name,
        actorRole: authUser.role,
      });

      return NextResponse.json({
        success: true,
        message: `Successfully imported ${result.imported} accounts, updated ${result.updated}, archived ${result.archived}.`,
        result,
      });
    }

    if (action === 'verify') {
      if (!body.account_id) {
        return NextResponse.json({ success: false, error: 'account_id is required.' }, { status: 400 });
      }
      const account = bankAccountService.verifyBankAccount(
        body.account_id,
        authUser.id,
        authUser.full_name
      );
      return NextResponse.json({
        success: true,
        message: `Bank account preset "${account.account_holder_name}" verified and activated.`,
        account,
      });
    }

    if (action === 'verify_all') {
      const verifiedCount = bankAccountService.verifyAllBankAccounts(
        authUser.id,
        authUser.full_name
      );
      return NextResponse.json({
        success: true,
        message: `All ${verifiedCount} pending bank account presets verified and activated.`,
        verifiedCount,
      });
    }

    if (action === 'set_pending') {
      if (!body.account_id) {
        return NextResponse.json({ success: false, error: 'account_id is required.' }, { status: 400 });
      }
      const account = bankAccountService.setAccountPending(
        body.account_id,
        authUser.id,
        authUser.full_name
      );
      return NextResponse.json({
        success: true,
        message: `Bank account preset "${account.account_holder_name}" set to pending verification.`,
        account,
      });
    }

    if (action === 'archive') {
      if (!body.account_id) {
        return NextResponse.json({ success: false, error: 'account_id is required.' }, { status: 400 });
      }
      const account = bankAccountService.archiveBankAccount(
        body.account_id,
        authUser.id,
        authUser.full_name
      );
      return NextResponse.json({
        success: true,
        message: `Bank account preset "${account.account_holder_name}" archived.`,
        account,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action: "${action}"` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Operation failed' },
      { status: 500 }
    );
  }
}
