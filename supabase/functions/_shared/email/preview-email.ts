import { renderDonivraEmail } from './render-email.ts';
import { renderDonationQrEmail } from './templates/donation-qr.ts';
import { renderHairAnalysisReminderEmail } from './templates/hair-analysis-reminder.ts';
import { renderNotificationUpdateEmail } from './templates/notification-update.ts';

const previewKey = String(Deno.args[0] || 'donation-status');
const outputPath = String(Deno.args[1] || 'donivra-email-preview.html');

const previews: Record<string, () => { html: string }> = {
  'donation-status': () => renderDonivraEmail('donation_status_update', {
    recipientName: 'Donor',
    friendlyStatus: 'Hair Accepted',
    friendlyDescription: 'Your donated hair passed physical verification and is ready for the next stage.',
    donationReference: 'WB12AB34',
    updatedDate: 'September 8, 2026, 4:35 PM',
    journeyUrl: 'https://example.com/donor/status',
  }),
  certificate: () => renderDonivraEmail('donation_certificate', {
    recipientName: 'Donor',
    certificateNumber: 'DNV-2026-001',
    issuedDate: 'September 8, 2026',
    donationReference: 'WB12AB34',
    certificateUrl: 'https://example.com/certificate.pdf',
  }),
  event: () => renderDonivraEmail('donation_event_reminder', {
    type: 'donation_event_reminder',
    recipientName: 'Donor',
    eventName: 'Community Hair Drive',
    eventDate: 'September 14, 2026',
    eventTime: '3:00 PM',
    eventLocation: 'Donivra Center, Bulacan',
    eventStatus: 'Approved',
    eventUrl: 'https://example.com/event',
  }),
  'wig-request': () => renderDonivraEmail('patient_wig_request_update', {
    recipientName: 'Patient',
    friendlyStatus: 'Wig in Production',
    friendlyDescription: 'Your wig is currently being prepared.',
    requestReference: 'WR45CD67',
    requestStatus: 'In production',
    expectedReleaseDate: 'September 20, 2026, 2:00 PM',
    updatedDate: 'September 8, 2026, 4:35 PM',
    journeyUrl: 'https://example.com/patient/home',
  }),
  notification: () => renderNotificationUpdateEmail({
    recipientName: 'Member',
    title: 'Appeal Under Review',
    message: 'Our team is reviewing the report you submitted.',
    category: 'WIG REQUEST UPDATE',
    actionUrl: 'https://example.com/patient/requests',
    actionLabel: 'View Appeal Details',
  }),
  reminder: () => renderHairAnalysisReminderEmail({
    recipientName: 'Donor',
    checkHairUrl: 'https://example.com/donor/donations',
  }),
  qr: () => renderDonationQrEmail({
    recipientName: 'Donor',
    items: [{
      title: 'Donation Waybill',
      qrDataUrl: 'data:image/png;base64,',
      attachmentName: 'WB12AB34.png',
      reference: 'WB12AB34',
    }],
  }),
};

const renderPreview = previews[previewKey];
if (!renderPreview) {
  throw new Error(`Unknown preview "${previewKey}". Choose: ${Object.keys(previews).join(', ')}`);
}

await Deno.writeTextFile(outputPath, renderPreview().html);
console.info(`Wrote ${previewKey} preview to ${outputPath}`);
