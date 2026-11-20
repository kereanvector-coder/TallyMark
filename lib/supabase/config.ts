export interface PublicSupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
}

/**
 * Reads only public Supabase URL & anon key on the server.
 * SUPABASE_SERVICE_ROLE_KEY is never referenced or exposed here.
 */
export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const isConfigured =
    url.startsWith('https://') &&
    anonKey.length > 20 &&
    !url.includes('your-project-ref');

  return { url, anonKey, isConfigured };
}
