import { escapeHtml } from './html.ts';
import { emailTheme as color } from './templates/theme.ts';

export type EmailInfoRow = { label: string; value?: unknown };
export type EmailTone = 'brand' | 'success' | 'attention';

const toneColors = (tone: EmailTone) => {
  if (tone === 'success') return { accent: color.success, surface: color.successSurface };
  if (tone === 'attention') return { accent: color.error, surface: color.errorSurface };
  return { accent: color.wine700, surface: color.surfaceSoft };
};

export const renderEmailParagraph = (content: unknown) => {
  const value = String(content ?? '').trim();
  return value
    ? `<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:${color.textSecondary};">${escapeHtml(value)}</p>`
    : '';
};

export const renderEmailStatusCard = ({
  eyebrow,
  title,
  description,
  tone = 'brand',
}: {
  eyebrow: string;
  title: string;
  description?: string;
  tone?: EmailTone;
}) => {
  const palette = toneColors(tone);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background:${palette.surface};border:1px solid ${color.borderSubtle};border-radius:14px;overflow:hidden;">
    <tr>
      <td width="5" style="width:5px;background:${palette.accent};font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:17px 18px;">
        <p style="margin:0 0 5px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.3;letter-spacing:1.2px;color:${color.textMuted};">${escapeHtml(eyebrow.toUpperCase())}</p>
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:${color.textPrimary};">${escapeHtml(title)}</p>
        ${description ? `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.65;color:${color.textSecondary};">${escapeHtml(description)}</p>` : ''}
      </td>
    </tr>
  </table>`;
};

export const renderEmailInfoRows = (rows: EmailInfoRow[]) => {
  const visibleRows = rows.filter(({ value }) => (
    value !== undefined && value !== null && String(value).trim() !== ''
  ));
  if (!visibleRows.length) return '';

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background:${color.surface};border:1px solid ${color.borderSubtle};border-radius:14px;overflow:hidden;">
    ${visibleRows.map(({ label, value }, index) => `<tr>
      <td valign="top" style="padding:${index ? '14px 18px' : '17px 18px 14px'};${index ? `border-top:1px solid ${color.borderSubtle};` : ''}">
        <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.3;letter-spacing:1px;color:${color.textMuted};">${escapeHtml(label.toUpperCase())}</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.5;color:${color.textPrimary};overflow-wrap:anywhere;">${escapeHtml(value)}</p>
      </td>
    </tr>`).join('')}
  </table>`;
};

export const renderEmailAlertBox = (title: string, message: string) => (
  title && message
    ? `<div style="margin:0 0 20px;padding:15px 17px;background:${color.surfaceMuted};border:1px solid ${color.blush200};border-radius:12px;"><p style="margin:0 0 5px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.8px;color:${color.wine700};">${escapeHtml(title.toUpperCase())}</p><p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.65;color:${color.textSecondary};">${escapeHtml(message)}</p></div>`
    : ''
);
