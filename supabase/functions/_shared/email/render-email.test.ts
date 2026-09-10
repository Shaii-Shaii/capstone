import { renderDonivraEmail } from './render-email.ts';
import { renderDonationQrEmail } from './templates/donation-qr.ts';
import { renderHairAnalysisReminderEmail } from './templates/hair-analysis-reminder.ts';
import { renderNotificationUpdateEmail } from './templates/notification-update.ts';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test('certificate email escapes user-controlled values and includes its CTA', () => {
  const email = renderDonivraEmail('donation_certificate', {
    recipientName: '<script>alert(1)</script>',
    certificateNumber: 'CERT<&>',
    issuedDate: 'September 8, 2026',
    donationReference: 'DON-123',
    certificateUrl: 'https://example.com/certificate.pdf',
  });

  assert(email.subject === 'Donivra: Your Hair Donation Certificate', 'Unexpected certificate subject');
  assert(!email.html.includes('<script>'), 'Recipient name was not escaped');
  assert(email.html.includes('&lt;script&gt;'), 'Escaped recipient name is missing');
  assert(email.html.includes('CERT&lt;&amp;&gt;'), 'Certificate number was not escaped');
  assert(email.html.includes('https://example.com/certificate.pdf'), 'Certificate CTA URL is missing');
  assert(email.plainText.includes('Certificate Number: CERT<&>'), 'Plain-text fallback is incomplete');
});

Deno.test('event reminder renders the supplied event details', () => {
  const email = renderDonivraEmail('donation_event_reminder', {
    type: 'donation_event_reminder',
    recipientName: 'Donor',
    eventName: 'Community Hair Drive',
    eventDate: 'September 10, 2026',
    eventTime: '9:00 AM',
    eventLocation: 'Donivra Center',
    eventStatus: 'Approved',
    eventUrl: 'https://example.com/events/10',
  });

  assert(email.subject === 'Donivra: Your Hair Donation Event Is Coming Up', 'Unexpected reminder subject');
  assert(email.html.includes('September 10, 2026'), 'Event date is missing');
  assert(email.html.includes('9:00 AM'), 'Event time is missing');
  assert(email.plainText.includes('Donivra Center'), 'Plain-text event location is missing');
});

Deno.test('patient wig request email uses patient wording and escapes request details', () => {
  const email = renderDonivraEmail('patient_wig_request_update', {
    recipientName: 'Patient <One>',
    friendlyStatus: 'Wig Ready for Pick-up',
    friendlyDescription: 'Your wig is ready & waiting.',
    requestReference: 'WR<123>',
    requestStatus: 'Ready for Pick-up',
    updatedDate: 'September 8, 2026, 5:30 PM',
    expectedReleaseDate: 'September 10, 2026, 9:00 AM',
    journeyUrl: 'https://example.com/patient/home',
  });

  assert(email.subject === 'Donivra: Wig Ready for Pick-up', 'Unexpected patient wig request subject');
  assert(email.html.includes('Wig Ready for Pick-up'), 'Wig status is missing');
  assert(email.html.includes('WR&lt;123&gt;'), 'Request reference was not escaped');
  assert(!email.html.includes('hair donation'), 'Patient email contains donor-only wording');
  assert(
    email.plainText.includes('Expected Release: September 10, 2026, 9:00 AM'),
    'Expected release is missing',
  );
});

Deno.test('hair analysis reminder uses the shared Donivra shell', () => {
  const email = renderHairAnalysisReminderEmail({
    recipientName: 'Donor',
    eventTitle: 'Community Hair Drive',
    eventDate: 'September 17, 2026, 9:00 AM',
    checkHairUrl: 'https://example.com/donor/donations',
  });

  assert(email.subject.startsWith('Donivra:'), 'Reminder subject is not branded');
  assert(email.html.includes('HAIR CHECK REMINDER'), 'Reminder eyebrow is missing');
  assert(email.html.includes('DONIVRA'), 'Shared Donivra header is missing');
  assert(email.html.includes('Open CheckHair'), 'Reminder CTA is missing');
  assert(email.plainText.includes('Community Hair Drive'), 'Registered event is missing');
  assert(email.plainText.includes('Complete one current Hair Check'), 'Reminder fallback is incomplete');
});

Deno.test('generic notification uses shared HTML and escapes database content', () => {
  const email = renderNotificationUpdateEmail({
    recipientName: 'Patient',
    title: 'Appeal <Approved>',
    message: 'Your report is ready & waiting.',
    category: 'WIG REQUEST UPDATE',
    actionUrl: 'https://example.com/patient/requests',
    actionLabel: 'View Appeal Details',
  });

  assert(email.html.includes('Appeal &lt;Approved&gt;'), 'Notification title was not escaped');
  assert(!email.html.includes('Appeal <Approved>'), 'Unescaped notification title is present');
  assert(email.html.includes('View Appeal Details'), 'Contextual notification CTA is missing');
  assert(email.plainText.includes('Your report is ready & waiting.'), 'Notification fallback is incomplete');
});

Deno.test('donation QR email uses the shared shell and retains its attachment reference', () => {
  const email = renderDonationQrEmail({
    recipientName: 'Donor',
    items: [{
      title: 'Donation Waybill',
      qrDataUrl: 'data:image/png;base64,AAAA',
      attachmentName: 'WB12AB34.png',
      reference: 'WB12AB34',
    }],
    journeyUrl: 'https://example.com/donor/status',
  });

  assert(email.html.startsWith('<!doctype html>'), 'QR email is missing the shared HTML document');
  assert(email.html.includes('DONATION QR'), 'QR email category is missing');
  assert(email.html.includes('max-width:600px'), 'QR email is missing the responsive width');
  assert(email.html.includes('WB12AB34'), 'QR email reference is missing');
  assert(email.plainText.includes('Attached file: WB12AB34.png'), 'QR fallback is incomplete');
});

Deno.test('active donor and patient status variants render without raw backend labels', () => {
  const donorLabels = [
    'Donation Confirmed',
    'Hair Received',
    'Hair Accepted',
    'Hair Could Not Be Accepted',
    'Hair Bundled',
    'Wig in Production',
    'Wig Created',
    'Wig Assigned',
    'Wig Ready for Release',
    'Wig Received',
  ];
  for (const friendlyStatus of donorLabels) {
    const email = renderDonivraEmail('donation_status_update', {
      recipientName: 'Donor',
      friendlyStatus,
      friendlyDescription: 'A friendly donation journey update.',
      donationReference: 'WB12AB34',
      updatedDate: 'September 8, 2026, 4:35 PM',
    });
    assert(email.html.includes('HAIR DONATION UPDATE'), `Missing donor category for ${friendlyStatus}`);
    assert(email.plainText.includes('WB12AB34'), `Missing donor reference for ${friendlyStatus}`);
  }

  const patientLabels = [
    'Wig Request Submitted',
    'Wig Allocated',
    'Wig in Production',
    'Wig Ready for Pick-up',
    'Preparing Your Wig for Release',
    'Wig Release in Progress',
    'Wig Released',
    'Wig Request Update',
    'Wig Request Cancelled',
    'Estimated Release Schedule Updated',
  ];
  for (const friendlyStatus of patientLabels) {
    const email = renderDonivraEmail('patient_wig_request_update', {
      recipientName: 'Patient',
      friendlyStatus,
      friendlyDescription: 'A friendly wig request update.',
      requestReference: 'WR45CD67',
      requestStatus: friendlyStatus,
      updatedDate: 'September 8, 2026, 4:35 PM',
    });
    assert(email.html.includes('WIG REQUEST UPDATE'), `Missing patient category for ${friendlyStatus}`);
    assert(!email.html.includes('Wig_Requests'), `Raw table name leaked for ${friendlyStatus}`);
    assert(email.plainText.includes('WR45CD67'), `Missing request code for ${friendlyStatus}`);
  }
});
