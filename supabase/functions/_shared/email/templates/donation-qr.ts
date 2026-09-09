import type { RenderedEmail } from '../email-types.ts';
import { escapeAttribute, escapeHtml } from '../html.ts';
import { renderEmailInfoRows, renderEmailParagraph } from '../components.ts';
import { renderDonivraLayout } from './layout.ts';
import { emailTheme as color } from './theme.ts';

export type DonationQrTemplateItem = {
  title: string;
  subtitle?: string;
  qrDataUrl: string;
  attachmentName: string;
  reference?: string;
  details?: { label?: string; value?: string | number | null }[];
};

export const renderDonationQrEmail = ({
  recipientName,
  items,
  journeyUrl = '',
  logoUrl = '',
}: {
  recipientName: string;
  items: DonationQrTemplateItem[];
  journeyUrl?: string;
  logoUrl?: string;
}): RenderedEmail => {
  const plural = items.length > 1;
  const subject = plural ? 'Donivra: Your Donation QR Labels Are Ready' : 'Donivra: Your Donation QR Is Ready';
  const cards = items.map((item) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background:${color.surface};border:1px solid ${color.borderSubtle};border-radius:14px;overflow:hidden;">
    <tr><td align="center" style="padding:20px 18px 8px;">
      <p style="margin:0 0 5px;font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:${color.textPrimary};">${escapeHtml(item.title)}</p>
      ${item.subtitle ? `<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:${color.textSecondary};">${escapeHtml(item.subtitle)}</p>` : ''}
      <img src="${escapeAttribute(item.qrDataUrl)}" alt="Donivra donation QR code" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:12px auto;border:0;">
    </td></tr>
    <tr><td style="padding:8px 18px 18px;">
      ${renderEmailInfoRows([
        { label: 'Donation reference', value: item.reference },
        ...(item.details || []).map((detail) => ({ label: detail.label || '', value: detail.value })),
      ])}
      <p style="margin:0;text-align:center;font-family:Arial,sans-serif;font-size:12px;line-height:1.55;color:${color.textMuted};">The QR image is also attached as ${escapeHtml(item.attachmentName)}.</p>
    </td></tr>
  </table>`).join('');
  const bodyHtml = renderEmailParagraph('Keep this QR available for donation logistics and staff scanning.') + cards;
  const bodyText = [
    `Your Donivra donation QR ${plural ? 'labels are' : 'is'} ready.`, '',
    'Keep this QR available for donation logistics and staff scanning.', '',
    ...items.flatMap((item) => [
      item.title,
      ...(item.reference ? [`Donation Reference: ${item.reference}`] : []),
      `Attached file: ${item.attachmentName}`,
      '',
    ]),
  ].join('\n');
  const layout = renderDonivraLayout({
    eyebrow: 'DONATION QR',
    recipientName,
    heading: plural ? 'Your donation QR labels are ready' : 'Your donation QR is ready',
    previewText: subject,
    bodyHtml,
    bodyText,
    ctaLabel: journeyUrl ? 'View Donation Journey' : '',
    ctaUrl: journeyUrl,
    logoUrl,
  });
  return { subject, ...layout };
};
