import { BusinessProfileForm } from '@/components/app/BusinessProfileForm';

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
          One-Time Setup
        </p>
        <h1 className="font-display text-3xl sm:text-5xl">Set up your business</h1>
        <p className="text-sm sm:text-base text-[#57534E] dark:text-[#A8A29E] max-w-xl leading-relaxed">
          Everything here appears on your receipts and can be updated anytime in Settings.
        </p>
      </div>

      <BusinessProfileForm mode="onboarding" />
    </div>
  );
}
