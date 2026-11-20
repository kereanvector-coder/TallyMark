import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { logError, logInfo } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const rl = checkRateLimit(`export:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many export requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
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

    const [
      businessesRes,
      customersRes,
      itemsRes,
      receiptsRes,
      ledgerRes,
      debtsRes,
      creditorsRes,
      closuresRes,
    ] = await Promise.all([
      supabase.from('businesses').select('*'),
      supabase.from('customers').select('*'),
      supabase.from('items').select('*'),
      supabase.from('receipts').select('*').order('issued_at', { ascending: false }),
      supabase.from('ledger_entries').select('*').order('occurred_at', { ascending: false }),
      supabase.from('debts').select('*'),
      supabase.from('creditors').select('*'),
      supabase.from('day_closures').select('*'),
    ]);

    const payload = {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      user_email: user.email,
      businesses: businessesRes.data ?? [],
      customers: customersRes.data ?? [],
      items: itemsRes.data ?? [],
      receipts: receiptsRes.data ?? [],
      ledger_entries: ledgerRes.data ?? [],
      debts: debtsRes.data ?? [],
      creditors: creditorsRes.data ?? [],
      day_closures: closuresRes.data ?? [],
    };

    logInfo('account.export', { userId: user.id });

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="tallymark-export-${new Date()
          .toISOString()
          .slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    logError('api.export.failed', err);
    return NextResponse.json({ error: 'Failed to export data.' }, { status: 500 });
  }
}
