import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { logError, logInfo } from '@/lib/logger';

const deleteSchema = z.object({
  confirm: z.literal('DELETE'),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const rl = checkRateLimit(`delete_account:${ip}`, 3, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Confirmation text DELETE is required.' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    // Cascade delete business & immutable financial records safely via SECURITY DEFINER helper
    const { error: cascadeErr } = await admin.rpc('delete_owner_data', {
      p_owner_id: user.id,
    });
    if (cascadeErr) {
      logError('api.account.delete_cascade', cascadeErr, { userId: user.id });
      return NextResponse.json(
        { error: 'Could not delete business records.' },
        { status: 500 }
      );
    }

    const { error: deleteUserErr } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserErr) {
      logError('api.account.delete_auth', deleteUserErr, { userId: user.id });
      return NextResponse.json(
        { error: 'Could not delete user account.' },
        { status: 500 }
      );
    }

    await supabase.auth.signOut();
    logInfo('account.deleted', { userId: user.id });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    logError('api.account.delete_failed', err);
    return NextResponse.json({ error: 'Account deletion failed.' }, { status: 500 });
  }
}
