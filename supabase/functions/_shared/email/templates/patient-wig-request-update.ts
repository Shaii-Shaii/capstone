import type { RenderedEmail } from '../email-types.ts';
import { renderEmailAlertBox, renderEmailInfoRows, renderEmailParagraph, renderEmailStatusCard } from '../components.ts';
import { renderDonivraLayout } from './layout.ts';

export type PatientWigRequestUpdateTemplateData = {
  recipientName: string;
  friendlyStatus: string;
  friendlyDescription: string;
  requestReference: string;
  requestStatus: string;
  updatedDate: string;
  expectedReleaseDate?: string;
  subject?: string;
  heading?: string;
  ctaLabel?: string;
  showEstimateNotice?: boolean;
  journeyUrl?: string;
  logoUrl?: string;
};

export const renderPatientWigRequestUpdateEmail = (
  data: PatientWigRequestUpdateTemplateData,
): RenderedEmail => {
  const subject = data.subject || `Donivra: ${data.friendlyStatus}`;
  const bodyHtml = [
    renderEmailParagraph('We have an update on your Donivra wig request.'),
    renderEmailStatusCard({
      eyebrow: 'Wig request update',
      title: data.friendlyStatus,
      description: data.friendlyDescription,
      tone: /rejected|cancelled/i.test(data.friendlyStatus) ? 'attention' : 'brand',
    }),
    renderEmailInfoRows([
      { label: 'Request code', value: data.requestReference },
      { label: 'Current status', value: data.requestStatus },
      { label: 'Estimated release', value: data.expectedReleaseDate },
      { label: 'Updated', value: data.updatedDate },
    ]),
    data.showEstimateNotice
      ? renderEmailAlertBox('Please note', 'This is the current estimated release schedule. The date or time may change while your wig is being prepared.')
      : '',
  ].join('');
  const bodyText = [
    'There is a new update on your Donivra wig request.',
    '',
    `Current Update: ${data.friendlyStatus}`,
    data.friendlyDescription,
    '',
    `Request Reference: ${data.requestReference}`,
    `Request Status: ${data.requestStatus}`,
    ...(data.expectedReleaseDate ? [`Expected Release: ${data.expectedReleaseDate}`] : []),
    `Updated: ${data.updatedDate}`,
  ].join('\n');
  const layout = renderDonivraLayout({
    eyebrow: 'WIG REQUEST UPDATE',
    recipientName: data.recipientName,
    heading: data.heading || data.friendlyStatus,
    previewText: `Wig request update: ${data.friendlyStatus}`,
    bodyHtml,
    bodyText,
    ctaLabel: data.journeyUrl ? (data.ctaLabel || 'View Wig Request') : '',
    ctaUrl: data.journeyUrl || '',
    logoUrl: data.logoUrl,
  });
  return { subject, ...layout };
};
