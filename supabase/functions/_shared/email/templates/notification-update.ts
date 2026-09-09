import type { RenderedEmail } from '../email-types.ts';
import { renderEmailParagraph, renderEmailStatusCard } from '../components.ts';
import { renderDonivraLayout } from './layout.ts';

export const renderNotificationUpdateEmail = ({
  recipientName,
  title,
  message,
  category = 'DONIVRA UPDATE',
  actionLabel = 'View Update',
  actionUrl = '',
  logoUrl = '',
}: {
  recipientName: string;
  title: string;
  message: string;
  category?: string;
  actionLabel?: string;
  actionUrl?: string;
  logoUrl?: string;
}): RenderedEmail => {
  const safeTitle = title.trim() || 'Account update';
  const safeMessage = message.trim() || 'There is a new update in your Donivra account.';
  const subject = `Donivra: ${safeTitle}`;
  const bodyHtml = [
    renderEmailParagraph('There is a new update in your Donivra account.'),
    renderEmailStatusCard({ eyebrow: category, title: safeTitle, description: safeMessage }),
    renderEmailParagraph('Open Donivra to review the full details and any next steps.'),
  ].join('');
  const bodyText = [
    'There is a new update in your Donivra account.', '', safeTitle, safeMessage, '',
    'Open Donivra to review the full details and any next steps.',
  ].join('\n');
  const layout = renderDonivraLayout({
    eyebrow: category,
    recipientName,
    heading: safeTitle,
    previewText: safeMessage,
    bodyHtml,
    bodyText,
    ctaLabel: actionUrl ? actionLabel : '',
    ctaUrl: actionUrl,
    logoUrl,
  });
  return { subject, ...layout };
};
