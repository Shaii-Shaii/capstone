import type { LayoutOptions } from '../email-types.ts';
import { escapeAttribute, escapeHtml } from '../html.ts';
import { emailTheme as color } from './theme.ts';

const buttonHtml = (label = '', url = '') => {
  if (!label || !url) return '';
  return `
    <tr>
      <td class="content-pad" style="padding:4px 40px 36px;text-align:left;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr><td style="background:${color.wine800};border-radius:12px;">
            <a href="${escapeAttribute(url)}" style="display:inline-block;border:1px solid ${color.wine800};border-radius:12px;color:${color.textOnBrand};font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:20px;padding:13px 22px;text-decoration:none;">${escapeHtml(label)} &nbsp;&rarr;</a>
          </td></tr>
        </table>
      </td>
    </tr>`;
};

export const renderDonivraLayout = ({
  previewText = '', eyebrow = 'DONIVRA UPDATE', recipientName, heading, bodyHtml, bodyText,
  ctaLabel = '', ctaUrl = '', logoUrl = '',
}: LayoutOptions) => {
  const brand = logoUrl
    ? `<img src="${escapeAttribute(logoUrl)}" width="132" alt="Donivra" style="display:block;width:132px;max-width:100%;height:auto;border:0;">`
    : `<div style="font-family:Arial,sans-serif;font-size:25px;line-height:1;font-weight:800;letter-spacing:3px;color:${color.textOnBrand};">DONIVRA</div>`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(heading)}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    table { border-collapse:separate; }
    @media only screen and (max-width:620px) {
      .outer-pad { padding:12px 8px !important; }
      .content-pad { padding-left:22px !important; padding-right:22px !important; }
      .email-card { border-radius:14px !important; }
      .email-heading { font-size:27px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${color.canvas};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${color.canvas};">
    <tr><td class="outer-pad" align="center" style="padding:32px 12px;">
      <table class="email-card" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:${color.surface};border:1px solid ${color.borderSubtle};border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(75,16,32,.08);">
        <tr><td class="content-pad" style="padding:25px 40px 23px;background:${color.wine900};border-bottom:5px solid ${color.wine600};">
          ${brand}
          <div style="margin-top:9px;font-family:Arial,sans-serif;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:1.4px;color:${color.blush200};">HAIR FOR HOPE</div>
        </td></tr>
        <tr><td class="content-pad" style="padding:36px 40px 12px;">
          <p style="margin:0 0 9px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.3;letter-spacing:1.3px;color:${color.wine700};">${escapeHtml(eyebrow.toUpperCase())}</p>
          <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:${color.textSecondary};">Hello ${escapeHtml(recipientName || 'Donivra member')},</p>
          <h1 class="email-heading" style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.2;color:${color.textPrimary};">${escapeHtml(heading)}</h1>
          ${bodyHtml}
        </td></tr>
        ${buttonHtml(ctaLabel, ctaUrl)}
        <tr><td class="content-pad" style="padding:24px 40px;background:${color.surfaceSoft};border-top:1px solid ${color.borderSubtle};">
          <p style="margin:0 0 7px;font-family:Arial,sans-serif;font-size:13px;line-height:1.65;color:${color.textSecondary};">Thank you for being part of Donivra and helping connect generous hair donations with individuals who need wigs.</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:${color.textSecondary};"><strong style="color:${color.wine800};">Donivra &middot; Hair for Hope</strong></p>
          <p style="margin:12px 0 0;font-family:Arial,sans-serif;font-size:11px;line-height:1.55;color:${color.textMuted};">This automated message was sent to the email registered on your Donivra account. Please do not reply or share secure links from this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const plainText = [
    `Hello ${recipientName || 'Donivra member'},`, '', heading, '', bodyText,
    ...(ctaLabel && ctaUrl ? ['', `${ctaLabel}: ${ctaUrl}`] : []),
    '', 'Thank you for being part of Donivra.', 'Donivra - Hair for Hope',
  ].join('\n');
  return { html, plainText };
};
