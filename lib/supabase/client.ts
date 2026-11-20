'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

let cachedClient: SupabaseClient<Database> | null = null;
let cachedKey = '';

export function getSupabaseBrowserClient(url: string, anonKey: string): SupabaseClient<Database> {
  const key = `${url}::${anonKey}`;
  if (cachedClient && cachedKey === key) {
    return cachedClient;
  }
  cachedClient = createBrowserClient<Database>(url, anonKey);
  cachedKey = key;
  return cachedClient;
}
