import { redirect } from 'next/navigation';
import { getPublicSupabaseConfig } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppAreaLayout({ children }: { children: React.ReactNode }) {
  const { isConfigured } = getPublicSupabaseConfig();
  if (!isConfigured) {
    redirect('/auth/login');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return (
    <AppShell
      userId={user.id}
      userEmail={user.email || ''}
      initialBusiness={business ?? null}
    >
      {children}
    </AppShell>
  );
}
