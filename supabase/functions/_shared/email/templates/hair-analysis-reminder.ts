import type { RenderedEmail } from '../email-types.ts';
import { renderEmailAlertBox, renderEmailParagraph, renderEmailStatusCard } from '../components.ts';
import { renderDonivraLayout } from './layout.ts';

export const renderHairAnalysisReminderEmail = ({
  recipientName,
  checkHairUrl = '',
  logoUrl = '',
  eventTitle = 'your registered donation event',
  eventDate = '',
}: {
  recipientName: string;
  checkHairUrl?: string;
  logoUrl?: string;
  eventTitle?: string;
  eventDate?: string;
}): RenderedEmail => {
  const subject = 'Donivra: Complete a Hair Check Before Your Event';
  const bodyHtml = [
    renderEmailParagraph(`Your registered event, ${eventTitle}, is coming up${eventDate ? ` on ${eventDate}` : ''}.`),
    renderEmailStatusCard({
      eyebrow: 'Hair check reminder',
      title: 'Complete one current Hair Check before the event',
      description: 'Upload four current hair-focused photos to receive an initial screening based on the active donation requirements.',
    }),
    renderEmailAlertBox('Initial screening only', 'The physical donated hair still receives final verification after it reaches the organization.'),
  ].join('');
  const bodyText = [
    `Your registered event, ${eventTitle}, is coming up${eventDate ? ` on ${eventDate}` : ''}.`, '',
    'Complete one current Hair Check before the event.',
    'Upload four current hair-focused photos to receive an initial screening based on the active donation requirements.', '',
    'The physical donated hair still receives final verification after it reaches the organization.',
  ].join('\n');
  const layout = renderDonivraLayout({
    eyebrow: 'HAIR CHECK REMINDER',
    recipientName,
    heading: 'Prepare for your donation event',
    previewText: 'Complete one current Hair Check before your registered event.',
    bodyHtml,
    bodyText,
    ctaLabel: checkHairUrl ? 'Open CheckHair' : '',
    ctaUrl: checkHairUrl,
    logoUrl,
  });
  return { subject, ...layout };
};
