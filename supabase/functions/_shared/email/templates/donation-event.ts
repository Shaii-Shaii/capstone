import type { DonationEventEmailType, RenderedEmail } from '../email-types.ts';
import { escapeHtml } from '../html.ts';
import { renderDonivraLayout } from './layout.ts';
import { emailTheme as color } from './theme.ts';

export type DonationEventTemplateData = {
  type: DonationEventEmailType;
  recipientName: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventInstructions?: string;
  eventStatus?: string;
  eventUrl?: string;
  logoUrl?: string;
};

const introByType: Record<DonationEventEmailType, string> = {
  donation_event_announcement: 'You are invited to an upcoming Donivra hair donation event.',
  donation_event_rsvp: 'Your place is confirmed. Here are the event details you will need.',
  donation_event_reminder: 'A friendly reminder that your Donivra hair donation event is coming up.',
};

export const renderDonationEventEmail = (data: DonationEventTemplateData): RenderedEmail => {
  const subject = data.type === 'donation_event_rsvp'
    ? 'Donivra: Your Event RSVP Is Confirmed'
    : data.type === 'donation_event_reminder'
      ? 'Donivra: Your Hair Donation Event Is Coming Up'
      : 'Donivra: Upcoming Hair Donation Event';
  const statusKey = String(data.eventStatus || '').trim().toLowerCase();
  const isCancelled = statusKey.includes('cancel');
  const introduction = isCancelled
    ? 'An event connected to your Donivra account has been cancelled.'
    : introByType[data.type];
  const statusLabel = data.eventStatus || (data.type === 'donation_event_rsvp' ? 'RSVP confirmed' : 'Scheduled');
  const statusColor = isCancelled ? color.error : color.success;
  const statusSurface = isCancelled ? color.errorSurface : color.successSurface;
  const bodyHtml = `
    <p style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:${color.textSecondary};">${escapeHtml(introduction)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;background:${color.surface};border:1px solid ${color.borderSubtle};border-radius:16px;overflow:hidden;">
      <tr><td style="padding:18px 20px;background:${color.wine800};">
        <p style="margin:0 0 7px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.3;letter-spacing:1.4px;color:${color.blush200};">DONATION EVENT</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:19px;font-weight:700;line-height:1.35;color:${color.textOnBrand};">${escapeHtml(data.eventName)}</p>
      </td></tr>
      <tr><td style="padding:18px 20px 6px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td width="86" valign="top" style="padding:0 12px 13px 0;border-bottom:1px solid ${color.borderSubtle};font-family:Arial,sans-serif;font-size:11px;font-weight:700;line-height:1.5;letter-spacing:.5px;color:${color.textMuted};">DATE</td>
            <td valign="top" style="padding:0 0 13px;border-bottom:1px solid ${color.borderSubtle};font-family:Arial,sans-serif;font-size:14px;font-weight:600;line-height:1.5;color:${color.textPrimary};">${escapeHtml(data.eventDate)}</td>
          </tr>
          <tr>
            <td width="86" valign="top" style="padding:13px 12px 13px 0;border-bottom:1px solid ${color.borderSubtle};font-family:Arial,sans-serif;font-size:11px;font-weight:700;line-height:1.5;letter-spacing:.5px;color:${color.textMuted};">TIME</td>
            <td valign="top" style="padding:13px 0;border-bottom:1px solid ${color.borderSubtle};font-family:Arial,sans-serif;font-size:14px;font-weight:600;line-height:1.5;color:${color.textPrimary};">${escapeHtml(data.eventTime)}</td>
          </tr>
          <tr>
            <td width="86" valign="top" style="padding:13px 12px 13px 0;font-family:Arial,sans-serif;font-size:11px;font-weight:700;line-height:1.5;letter-spacing:.5px;color:${color.textMuted};">LOCATION</td>
            <td valign="top" style="padding:13px 0;font-family:Arial,sans-serif;font-size:14px;font-weight:600;line-height:1.55;color:${color.textPrimary};">${escapeHtml(data.eventLocation)}</td>
          </tr>
        </table>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;background:${statusSurface};border-radius:12px;">
      <tr>
        <td width="5" style="width:5px;background:${statusColor};border-radius:12px 0 0 12px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.3;letter-spacing:1.2px;color:${color.textMuted};">CURRENT STATUS</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;font-weight:700;line-height:1.5;color:${statusColor};">${escapeHtml(statusLabel)}</p>
        </td>
      </tr>
    </table>
    ${data.eventInstructions ? `<div style="margin:0 0 18px;padding:16px 18px;background:${color.surfaceMuted};border:1px solid ${color.blush200};border-radius:12px;"><p style="margin:0 0 5px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.8px;color:${color.wine700};">BEFORE YOU GO</p><p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.65;color:${color.textSecondary};">${escapeHtml(data.eventInstructions)}</p></div>` : ''}`;
  const bodyText = [
    introduction, '', `Event: ${data.eventName}`, `Date: ${data.eventDate}`,
    `Time: ${data.eventTime}`, `Location: ${data.eventLocation}`,
    `Current status: ${statusLabel}`, data.eventInstructions || '',
  ].filter(Boolean).join('\n');
  const layout = renderDonivraLayout({
    eyebrow: data.type === 'donation_event_rsvp' ? 'EVENT RSVP' : 'DONATION EVENT',
    recipientName: data.recipientName,
    heading: data.eventName,
    previewText: subject,
    bodyHtml,
    bodyText,
    ctaLabel: data.eventUrl ? 'View Event Details' : '',
    ctaUrl: data.eventUrl || '',
    logoUrl: data.logoUrl,
  });
  return { subject, ...layout };
};
