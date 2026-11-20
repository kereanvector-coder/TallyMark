import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseAnonClient } from '@/lib/supabase/server';
import { getPublicSupabaseConfig } from '@/lib/supabase/config';
import type { PublicReceiptResponse } from '@/lib/database.types';
import { formatNaira } from '@/lib/format';
import { PublicReceiptViewer } from '@/components/receipts/PublicReceiptViewer';
import { TallyMarkLogo } from '@/components/brand/TallyMarkLogo';

async function fetchPublicReceipt(publicId: string): Promise<PublicReceiptResponse | null> {
  const anon = createSupabaseAnonClient();
  if (!anon) return null;

  const { data, error } = await anon.rpc('get_public_receipt', {
    p_public_id: publicId,
  });

  if (error || !data) return null;
  return data as unknown as PublicReceiptResponse;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchPublicReceipt(id);

  if (!data) {
    return {
      title: 'Receipt Not Found — Tallymark',
      description: 'This receipt verification link could not be found.',
    };
  }

  const statusText = data.receipt.status === 'void' ? 'VOID' : 'VALID';
  const title = `Receipt ${data.receipt.receipt_code} · ${data.business.name}`;
  const description = `${statusText} receipt for ${data.receipt.customer_name} — ${formatNaira(
    data.receipt.total_kobo
  )}. View and download verified PDF.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchPublicReceipt(id);

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF7F0] dark:bg-[#101210] text-[#141413] dark:text-[#F4F1EA] px-4 text-center">
        <div className="max-w-md space-y-4">
          <TallyMarkLogo size="md" className="justify-center" />
          <h1 className="font-display text-3xl sm:text-4xl">Receipt not found</h1>
          <p className="text-sm text-[#57534E] dark:text-[#A8A29E] leading-relaxed">
            This public receipt link may be incomplete or invalid. Ask the merchant to resend the
            link from Tallymark.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-[#0F5132] text-white text-sm font-medium hover:bg-[#0B3E26] transition-colors"
            >
              Go to Tallymark
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { url } = getPublicSupabaseConfig();
  const logoUrl =
    data.business.logo_path && url
      ? `${url}/storage/v1/object/public/logos/${data.business.logo_path}`
      : null;

  return <PublicReceiptViewer data={data} logoUrl={logoUrl} />;
}
