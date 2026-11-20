export const MARKETING_CONFIG = {
  brandName: 'Tallymark',
  tagline: 'Issue the receipt. Keep the book. Know your day.',
  siteUrl: (process.env.APP_URL || 'https://tallymark.ng').replace(/\/$/, ''),
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'hello@tallymark.ng',
  pricingFaqAnswer:
    'Free during early access. No card required, and you can export your full ledger or receipts anytime.',
  creditLine: 'Built by Emmanuel Eleweke | Emmanuel of ZedTech',
  earlyAccessLabel: 'Early access',
  trustLine: 'Your data stays yours',
} as const;
