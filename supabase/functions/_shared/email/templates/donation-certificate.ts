import type { RenderedEmail } from '../email-types.ts';
import { escapeHtml } from '../html.ts';
import { renderDonivraLayout } from './layout.ts';

export type DonationCertificateTemplateData = {
  recipientName: string;
  certificateNumber: string;
  issuedDate: string;
  donationReference: string;
  certificateUrl?: string;
  logoUrl?: string;
};

export const renderDonationCertificateEmail = (data: DonationCertificateTemplateData): RenderedEmail => {
  const subject = 'Donivra: Your Hair Donation Certificate';
  const bodyHtml = `
    <p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#4b3f43;">Thank you for your generous hair donation. Your donation has been successfully accepted, and your official donation certificate is now available.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;background:#faf7f8;border:1px solid #eadde1;border-radius:12px;">
      <tr><td style="padding:16px 18px 6px;font-family:Arial,sans-serif;font-size:12px;color:#846d75;">Certificate Number</td></tr>
      <tr><td style="padding:0 18px 12px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#241c1f;">${escapeHtml(data.certificateNumber)}</td></tr>
      <tr><td style="padding:0 18px 6px;font-family:Arial,sans-serif;font-size:12px;color:#846d75;">Issued Date</td></tr>
      <tr><td style="padding:0 18px 12px;font-family:Arial,sans-serif;font-size:15px;color:#241c1f;">${escapeHtml(data.issuedDate)}</td></tr>
      <tr><td style="padding:0 18px 6px;font-family:Arial,sans-serif;font-size:12px;color:#846d75;">Donation Reference</td></tr>
      <tr><td style="padding:0 18px 16px;font-family:Arial,sans-serif;font-size:15px;color:#241c1f;">${escapeHtml(data.donationReference)}</td></tr>
    </table>
    <p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#4b3f43;">Thank you for helping provide wigs to individuals who need them.</p>`;
  const bodyText = [
    'Thank you for your generous hair donation.',
    'Your donation has been successfully accepted, and your official donation certificate is now available.',
    '',
    `Certificate Number: ${data.certificateNumber}`,
    `Issued Date: ${data.issuedDate}`,
    `Donation Reference: ${data.donationReference}`,
    '',
    'Thank you for helping provide wigs to individuals who need them.',
  ].join('\n');
  const layout = renderDonivraLayout({
    eyebrow: 'DONATION CERTIFICATE',
    recipientName: data.recipientName,
    heading: 'Your donation certificate is ready',
    previewText: 'Your official Donivra hair donation certificate is now available.',
    bodyHtml,
    bodyText,
    ctaLabel: data.certificateUrl ? 'View / Download Certificate' : '',
    ctaUrl: data.certificateUrl || '',
    logoUrl: data.logoUrl,
  });
  return { subject, ...layout };
};
