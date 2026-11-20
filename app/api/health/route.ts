import { NextResponse } from 'next/server';
import { getPublicSupabaseConfig } from '@/lib/supabase/config';

export async function GET() {
  const { isConfigured } = getPublicSupabaseConfig();
  return NextResponse.json({
    ok: true,
    service: 'tallymark',
    supabaseConfigured: isConfigured,
    timestamp: new Date().toISOString(),
  });
}
