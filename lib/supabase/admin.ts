import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getPublicSupabaseConfig } from './config';

export function createSupabaseAdminClient() {
  const { url, isConfigured } = getPublicSupabaseConfig();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!isConfigured || !serviceRoleKey) {
    throw new Error(
      'Supabase admin client is not configured. Add SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in Secrets.'
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
