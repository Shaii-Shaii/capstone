export const DONIVRA_EMAIL_TYPES = [
  'donation_certificate',
  'donation_status_update',
  'donation_event_announcement',
  'donation_event_rsvp',
  'donation_event_reminder',
  'patient_wig_request_update',
] as const;

export type DonivraEmailType = typeof DONIVRA_EMAIL_TYPES[number];
export type DonationEventEmailType = Extract<
  DonivraEmailType,
  'donation_event_announcement' | 'donation_event_rsvp' | 'donation_event_reminder'
>;

export type RenderedEmail = {
  subject: string;
  html: string;
  plainText: string;
};

export type LayoutOptions = {
  previewText?: string;
  eyebrow?: string;
  recipientName: string;
  heading: string;
  bodyHtml: string;
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
  logoUrl?: string;
};

export const isDonivraEmailType = (value: unknown): value is DonivraEmailType => (
  DONIVRA_EMAIL_TYPES.includes(String(value || '') as DonivraEmailType)
);
