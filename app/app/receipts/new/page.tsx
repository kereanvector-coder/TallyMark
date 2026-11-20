import { Suspense } from 'react';
import { NewReceiptBuilder } from '@/components/receipts/NewReceiptBuilder';

export default function NewReceiptPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-sm text-[#57534E] dark:text-[#A8A29E]">
          Loading receipt builder…
        </div>
      }
    >
      <NewReceiptBuilder />
    </Suspense>
  );
}
