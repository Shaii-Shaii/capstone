import type { RenderedEmail } from '../email-types.ts';
import { renderEmailInfoRows, renderEmailParagraph, renderEmailStatusCard } from '../components.ts';
import { renderDonivraLayout } from './layout.ts';

export type DonationStatusTemplateData = {
  recipientName: string;
  friendlyStatus: string;
  friendlyDescription: string;
  donationReference: string;
  updatedDate: string;
  subject?: string;
  heading?: string;
  eyebrow?: string;
  ctaLabel?: string;
  tone?: 'brand' | 'success' | 'attention';
  journeyUrl?: string;
  logoUrl?: string;
};

export const renderDonationStatusUpdateEmail = (data: DonationStatusTemplateData): RenderedEmail => {
  const subject = data.subject || `Donivra: ${data.friendlyStatus}`;
  const bodyHtml = [
    renderEmailParagraph('We have an update on your hair donation.'),
    renderEmailStatusCard({
      eyebrow: 'Donation update',
      title: data.friendlyStatus,
      description: data.friendlyDescription,
      tone: data.tone,
    }),
    renderEmailInfoRows([
      { label: 'Donation reference', value: data.donationReference },
      { label: 'Updated', value: data.updatedDate },
    ]),
    renderEmailParagraph('Thank you for your generosity and for helping support individuals who need wigs.'),
  ].join('');
  const bodyText = [
    'There is a new update on your hair donation.',
    '',
    `Current Update: ${data.friendlyStatus}`,
    data.friendlyDescription,
    '',
    `Donation Reference: ${data.donationReference}`,
    `Updated: ${data.updatedDate}`,
    '',
    'Thank you for being part of Donivra.',
  ].join('\n');
  const layout = renderDonivraLayout({
    eyebrow: data.eyebrow || 'HAIR DONATION UPDATE',
    recipientName: data.recipientName,
    heading: data.heading || data.friendlyStatus,
    previewText: `Donation update: ${data.friendlyStatus}`,
    bodyHtml,
    bodyText,
    ctaLabel: data.journeyUrl ? (data.ctaLabel || 'View Donation Journey') : '',
    ctaUrl: data.journeyUrl || '',
    logoUrl: data.logoUrl,
  });
  return { subject, ...layout };
};
