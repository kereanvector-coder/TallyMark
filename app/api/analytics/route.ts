import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPublicSupabaseConfig } from '@/lib/supabase/config';

const analyticsEventSchema = z
  .object({
    event_name: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{2,64}$/, 'Invalid event name'),
    path: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine((v) => v.startsWith('/'), 'Path must start with /'),
    timestamp: z.string().datetime().optional(),
  })
  .strict();

// Lightweight sliding-window rate limiter per hashed IP (max 30 events / 60s)
const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const rawIp = forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anonymous';
  const key = crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 16);

  const now = Date.now();
  const current = rateBuckets.get(key);

  if (!current || now > current.resetAt) {
    if (rateBuckets.size > 2000) {
      rateBuckets.clear();
    }
    rateBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (current.count >= MAX_EVENTS_PER_WINDOW) {
    return false;
  }

  current.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = analyticsEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid analytics payload' }, { status: 400 });
  }

  const { isConfigured } = getPublicSupabaseConfig();
  const hasServiceRole = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());

  if (!isConfigured || !hasServiceRole) {
    return NextResponse.json({ ok: true, stored: false }, { status: 202 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from('analytics_events').insert({
      business_id: null,
      user_id: null,
      event_name: parsed.data.event_name,
      properties: {
        path: parsed.data.path,
        client_timestamp: parsed.data.timestamp ?? new Date().toISOString(),
      },
    });

    if (error) {
      return NextResponse.json({ ok: false, stored: false }, { status: 202 });
    }

    return NextResponse.json({ ok: true, stored: true }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, stored: false }, { status: 202 });
  }
}
