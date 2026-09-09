import type { RenderedEmail } from '../email-types.ts';
import { renderEmailAlertBox, renderEmailParagraph, renderEmailStatusCard } from '../components.ts';
import { renderDonivraLayout } from './layout.ts';

export const renderHairAnalysisReminderEmail = ({
  recipientName,
  checkHairUrl = '',
  logoUrl = '',
}: {
  recipientName: string;
  checkHairUrl?: string;
  logoUrl?: string;
}): RenderedEmail => {
  const subject = 'Donivra: Complete Your Hair Check Today';
  const bodyHtml = [
    renderEmailParagraph('You have not completed today\'s Donivra hair check yet.'),
    renderEmailStatusCard({
      eyebrow: 'Hair check reminder',
      title: 'Your daily CheckHair update is waiting',
      description: 'Upload your current hair photos to receive guidance based on today\'s images.',
    }),
    renderEmailAlertBox('Helpful reminder', 'This reminder is sent only when no hair analysis has been completed for the day.'),
  ].join('');
  const bodyText = [
    'You have not completed today\'s Donivra hair check yet.', '',
    'Your daily CheckHair update is waiting',
    'Upload your current hair photos to receive guidance based on today\'s images.', '',
    'This reminder is sent only when no hair analysis has been completed for the day.',
  ].join('\n');
  const layout = renderDonivraLayout({
    eyebrow: 'HAIR CHECK REMINDER',
    recipientName,
    heading: 'Time for today\'s hair check',
    previewText: 'Complete today\'s CheckHair analysis in Donivra.',
    bodyHtml,
    bodyText,
    ctaLabel: checkHairUrl ? 'Open CheckHair' : '',
    ctaUrl: checkHairUrl,
    logoUrl,
  });
  return { subject, ...layout };
};
