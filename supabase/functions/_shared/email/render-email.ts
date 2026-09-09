import type { DonivraEmailType, RenderedEmail } from './email-types.ts';
import { renderDonationCertificateEmail, type DonationCertificateTemplateData } from './templates/donation-certificate.ts';
import { renderDonationEventEmail, type DonationEventTemplateData } from './templates/donation-event.ts';
import { renderDonationStatusUpdateEmail, type DonationStatusTemplateData } from './templates/donation-status-update.ts';
import { renderPatientWigRequestUpdateEmail, type PatientWigRequestUpdateTemplateData } from './templates/patient-wig-request-update.ts';

export type DonivraTemplateData =
  | DonationCertificateTemplateData
  | DonationStatusTemplateData
  | DonationEventTemplateData
  | PatientWigRequestUpdateTemplateData;

export const renderDonivraEmail = (
  type: DonivraEmailType,
  data: DonivraTemplateData,
): RenderedEmail => {
  switch (type) {
    case 'donation_certificate':
      return renderDonationCertificateEmail(data as DonationCertificateTemplateData);
    case 'donation_status_update':
      return renderDonationStatusUpdateEmail(data as DonationStatusTemplateData);
    case 'patient_wig_request_update':
      return renderPatientWigRequestUpdateEmail(data as PatientWigRequestUpdateTemplateData);
    case 'donation_event_announcement':
    case 'donation_event_rsvp':
    case 'donation_event_reminder':
      return renderDonationEventEmail({
        ...(data as DonationEventTemplateData),
        type,
      });
    default: {
      const exhaustiveType: never = type;
      throw new Error(`Unsupported Donivra email type: ${String(exhaustiveType)}`);
    }
  }
};
