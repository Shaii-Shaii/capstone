import { createClient } from 'npm:@supabase/supabase-js@2';
import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { isDonivraEmailType, type DonivraEmailType } from '../_shared/email/email-types.ts';
import { formatPhilippineDateTime, isEmailAddress, normalizeSingleLine } from '../_shared/email/html.ts';
import { renderDonivraEmail, type DonivraTemplateData } from '../_shared/email/render-email.ts';
import { sendTransactionalEmail } from '../_shared/email/smtp-client.ts';

type OutboxRow = {
  email_outbox_id: number;
  user_id: number;
  email_type: DonivraEmailType;
  reference_type: string;
  reference_id: string;
  event_key: string;
  payload: Record<string, unknown>;
  status: string;
  attempt_count: number;
  max_attempts: number;
};

type Caller = {
  isServiceRole: boolean;
  userId: number | null;
  isStaff: boolean;
};

type SupabaseClient = ReturnType<typeof createClient>;

const STAFF_ROLES = new Set(['admin', 'staff', 'qa_stylist', 'organization', 'super_admin']);
const STATUS_COPY: Record<string, { title: string; description: string }> = {
  donation_confirmed: {
    title: 'Donation Confirmed',
    description: 'Your hair donation has been recorded by the organization.',
  },
  hair_received: {
    title: 'Hair Received',
    description: 'The organization has received your donated hair.',
  },
  hair_accepted: {
    title: 'Hair Accepted',
    description: 'Your donated hair passed assessment and can be prepared for wig production.',
  },
  hair_rejected: {
    title: 'Hair Could Not Be Accepted',
    description: 'After physical verification, the donated hair did not meet one or more current donation requirements.',
  },
  hair_bundled: {
    title: 'Hair Bundled',
    description: 'Your donated hair has been included in a production bundle.',
  },
  wig_in_production: {
    title: 'Wig in Production',
    description: 'The hair bundle is being transformed into a wig.',
  },
  wig_created: {
    title: 'Wig Created',
    description: 'A wig made with the contributed hair has been completed.',
  },
  wig_assigned: {
    title: 'Wig Assigned',
    description: 'The wig created with your donated hair has been assigned for distribution.',
  },
  wig_ready_for_release: {
    title: 'Wig Ready for Release',
    description: 'The wig is ready to begin its release process.',
  },
  preparing_for_release: {
    title: 'Preparing for Release',
    description: 'The organization is preparing the wig for release.',
  },
  wig_being_released: {
    title: 'Wig Being Released',
    description: 'The wig is currently going through the release process.',
  },
  wig_received: {
    title: 'Wig Received',
    description: 'The wig has successfully reached its final release stage.',
  },
};

const PATIENT_WIG_REQUEST_STATUS_COPY: Record<string, { title: string; description: string }> = {
  request_submitted: {
    title: 'Wig Request Submitted',
    description: 'Your wig request has been received and is waiting for review.',
  },
  wig_allocated: {
    title: 'Wig Allocated',
    description: 'A wig has been matched and allocated to your request.',
  },
  wig_in_production: {
    title: 'Wig in Production',
    description: 'Your requested wig is currently being prepared.',
  },
  ready_for_pickup: {
    title: 'Wig Ready for Pick-up',
    description: 'Your wig is ready for pick-up. Open Donivra to review the latest release details.',
  },
  preparing_for_release: {
    title: 'Preparing Your Wig for Release',
    description: 'The organization is preparing your wig for release.',
  },
  wig_being_released: {
    title: 'Wig Release in Progress',
    description: 'Your wig is currently going through the release process.',
  },
  wig_released: {
    title: 'Wig Released',
    description: 'Your wig has been released. Once you physically receive it, please confirm receipt in Donivra.',
  },
  request_rejected: {
    title: 'Wig Request Update',
    description: 'Your wig request was not approved.',
  },
  request_cancelled: {
    title: 'Wig Request Cancelled',
    description: 'Your wig request has been cancelled.',
  },
  expected_release_updated: {
    title: 'Estimated Release Schedule Updated',
    description: 'Your current estimated wig release schedule has been updated.',
  },
};

const getBearerToken = (request: Request) => {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const getVerifiedJwtRole = (token: string) => {
  try {
    const payloadSegment = token.split('.')[1] || '';
    const normalizedPayload = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    );
    const payload = JSON.parse(atob(paddedPayload)) as Record<string, unknown>;
    return String(payload.role || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const getCaller = async (
  supabase: SupabaseClient,
  bearerToken: string,
  serviceRoleKey: string,
): Promise<Caller> => {
  // verify_jwt is enabled for this function, so a token reaching this handler
  // has already passed the Supabase gateway signature check. Recognize the
  // service_role claim as well as an exact legacy-key match because hosted
  // projects can expose a rotated built-in key to the function runtime.
  if (bearerToken === serviceRoleKey || getVerifiedJwtRole(bearerToken) === 'service_role') {
    return { isServiceRole: true, userId: null, isStaff: true };
  }
  const authResult = await supabase.auth.getUser(bearerToken);
  const authUserId = authResult.data?.user?.id || '';
  if (!authUserId || authResult.error) throw new Error('AUTHENTICATION_REQUIRED');

  const userResult = await supabase
    .from('users')
    .select('user_id, role')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (userResult.error || !userResult.data?.user_id) throw new Error('APP_USER_NOT_FOUND');
  const role = String(userResult.data.role || '').trim().toLowerCase();
  return {
    isServiceRole: false,
    userId: Number(userResult.data.user_id),
    isStaff: STAFF_ROLES.has(role),
  };
};

const resolveRecipient = async (supabase: SupabaseClient, userId: number) => {
  const [accountResult, detailsResult] = await Promise.all([
    supabase.from('users').select('user_id, auth_user_id, email').eq('user_id', userId).maybeSingle(),
    supabase
      .from('user_details')
      .select('first_name, middle_name, last_name, suffix')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (accountResult.error || !accountResult.data?.user_id) throw new Error('RECIPIENT_ACCOUNT_MISSING');

  let email = '';
  const authUserId = String(accountResult.data.auth_user_id || '');
  if (authUserId) {
    const authAccount = await supabase.auth.admin.getUserById(authUserId);
    if (authAccount.error) throw new Error('REGISTERED_AUTH_EMAIL_UNAVAILABLE');
    email = String(authAccount.data?.user?.email || '').trim().toLowerCase();
  } else {
    email = String(accountResult.data.email || '').trim().toLowerCase();
  }
  if (!isEmailAddress(email)) throw new Error('RECIPIENT_MISSING');

  const details = detailsResult.data;
  const name = [
    details?.first_name,
    details?.middle_name,
    details?.last_name,
    details?.suffix,
  ].map((part) => normalizeSingleLine(part)).filter(Boolean).join(' ');

  return { email, name: name || 'Donivra member' };
};

const resolveCertificateUrl = async (supabase: SupabaseClient, rawValue: unknown) => {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  if (/^https:\/\//i.test(value)) return value;

  const storageUri = value.match(/^supabase:\/\/([^/]+)\/(.+)$/i);
  const configuredBucket = String(Deno.env.get('CERTIFICATE_STORAGE_BUCKET') || 'donation-certificates').trim();
  const bucket = storageUri?.[1] || configuredBucket;
  let path = storageUri?.[2] || value.replace(/^\/+/, '');
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
  const signedResult = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return signedResult.data?.signedUrl || '';
};

const buildCertificateTemplate = async (
  supabase: SupabaseClient,
  job: OutboxRow,
  recipientName: string,
): Promise<DonivraTemplateData> => {
  const certificateResult = await supabase
    .from('Donation_Certificates')
    .select('Certificate_ID, Certificate_Number, Issued_At, File_URL, Submission_ID, User_ID')
    .eq('Certificate_ID', Number(job.reference_id))
    .maybeSingle();
  const certificate = certificateResult.data;
  if (certificateResult.error || !certificate?.Certificate_ID) throw new Error('CERTIFICATE_NOT_FOUND');
  if (Number(certificate.User_ID) !== Number(job.user_id)) throw new Error('REFERENCE_OWNER_MISMATCH');

  const submissionResult = certificate.Submission_ID
    ? await supabase
      .from('Hair_Submissions')
      .select('Submission_ID, User_ID, Waybill_Code')
      .eq('Submission_ID', certificate.Submission_ID)
      .maybeSingle()
    : { data: null, error: null };
  if (submissionResult.error) throw new Error('CERTIFICATE_SUBMISSION_UNAVAILABLE');

  const appUrl = String(Deno.env.get('DONIVRA_APP_URL') || '').replace(/\/$/, '');
  const secureFileUrl = await resolveCertificateUrl(supabase, certificate.File_URL);
  return {
    recipientName,
    certificateNumber: normalizeSingleLine(certificate.Certificate_Number, 'Not available'),
    issuedDate: formatPhilippineDateTime(certificate.Issued_At, false),
    donationReference: normalizeSingleLine(
      submissionResult.data?.Waybill_Code || certificate.Submission_ID,
      'Not available',
    ),
    certificateUrl: secureFileUrl || (appUrl ? `${appUrl}/donor/achievements` : ''),
    logoUrl: String(Deno.env.get('DONIVRA_LOGO_URL') || ''),
  };
};

const buildStatusTemplate = async (
  supabase: SupabaseClient,
  job: OutboxRow,
  recipientName: string,
): Promise<DonivraTemplateData> => {
  const submissionResult = await supabase
    .from('Hair_Submissions')
    .select('Submission_ID, User_ID, Waybill_Code, Updated_At')
    .eq('Submission_ID', Number(job.reference_id))
    .maybeSingle();
  const submission = submissionResult.data;
  if (submissionResult.error || !submission?.Submission_ID) throw new Error('SUBMISSION_NOT_FOUND');
  if (Number(submission.User_ID) !== Number(job.user_id)) throw new Error('REFERENCE_OWNER_MISMATCH');

  const milestoneKey = normalizeSingleLine(job.event_key || job.payload?.milestone_key).toLowerCase();
  const copy = STATUS_COPY[milestoneKey];
  if (!copy) throw new Error('UNSUPPORTED_DONATION_MILESTONE');
  let description = copy.description;
  if (milestoneKey === 'hair_rejected') {
    const safeReason = normalizeSingleLine(job.payload?.rejection_reason);
    if (safeReason) description = `${description} Reason provided: ${safeReason}`;
  }
  const appUrl = String(Deno.env.get('DONIVRA_APP_URL') || '').replace(/\/$/, '');
  return {
    recipientName,
    friendlyStatus: copy.title,
    friendlyDescription: description,
    heading: milestoneKey === 'hair_accepted'
      ? 'Thank you for your donation'
      : milestoneKey === 'hair_rejected' ? 'Update on your hair donation' : copy.title,
    tone: milestoneKey === 'hair_rejected'
      ? 'attention'
      : ['hair_accepted', 'hair_received', 'wig_created'].includes(milestoneKey) ? 'success' : 'brand',
    donationReference: normalizeSingleLine(submission.Waybill_Code || submission.Submission_ID),
    updatedDate: formatPhilippineDateTime(job.payload?.updated_at || submission.Updated_At),
    journeyUrl: appUrl ? `${appUrl}/donor/status` : '',
    logoUrl: String(Deno.env.get('DONIVRA_LOGO_URL') || ''),
  };
};

const buildPatientWigRequestTemplate = async (
  supabase: SupabaseClient,
  job: OutboxRow,
  recipientName: string,
): Promise<DonivraTemplateData> => {
  const requestResult = await supabase
    .from('Wig_Requests')
    .select('Req_ID, Patient_ID, Status, Status_Reason, Request_Code, Updated_At, Expected_Release_At')
    .eq('Req_ID', Number(job.reference_id))
    .maybeSingle();
  const wigRequest = requestResult.data;
  if (requestResult.error || !wigRequest?.Req_ID) throw new Error('WIG_REQUEST_NOT_FOUND');

  const patientResult = await supabase
    .from('Patients')
    .select('Patient_ID, User_ID')
    .eq('Patient_ID', wigRequest.Patient_ID)
    .maybeSingle();
  if (patientResult.error || !patientResult.data?.Patient_ID) throw new Error('PATIENT_NOT_FOUND');
  if (Number(patientResult.data.User_ID) !== Number(job.user_id)) throw new Error('REFERENCE_OWNER_MISMATCH');

  const milestoneKey = normalizeSingleLine(job.payload?.milestone_key || job.event_key)
    .toLowerCase();
  const copy = PATIENT_WIG_REQUEST_STATUS_COPY[milestoneKey];
  if (!copy) throw new Error('UNSUPPORTED_WIG_REQUEST_MILESTONE');

  const reason = normalizeSingleLine(job.payload?.status_reason || wigRequest.Status_Reason);
  const expectedReleaseAt = job.payload?.expected_release_at || wigRequest.Expected_Release_At;
  const appUrl = String(Deno.env.get('DONIVRA_APP_URL') || '').replace(/\/$/, '');
  return {
    recipientName,
    friendlyStatus: copy.title,
    friendlyDescription: reason ? `${copy.description} Details: ${reason}` : copy.description,
    requestReference: normalizeSingleLine(wigRequest.Request_Code || wigRequest.Req_ID),
    requestStatus: normalizeSingleLine(job.payload?.status || wigRequest.Status, copy.title),
    updatedDate: formatPhilippineDateTime(job.payload?.updated_at || wigRequest.Updated_At),
    expectedReleaseDate: expectedReleaseAt ? formatPhilippineDateTime(expectedReleaseAt) : '',
    ctaLabel: milestoneKey === 'wig_released' ? 'Confirm Wig Receipt' : 'View Wig Request',
    showEstimateNotice: milestoneKey === 'expected_release_updated',
    journeyUrl: appUrl ? `${appUrl}/patient/home` : '',
    logoUrl: String(Deno.env.get('DONIVRA_LOGO_URL') || ''),
  };
};

const buildEventTemplate = async (
  supabase: SupabaseClient,
  job: OutboxRow,
  recipientName: string,
): Promise<DonivraTemplateData> => {
  const eventResult = await supabase
    .from('Event_Requests')
    .select('Event_Request_ID, Event_Application_ID, Event_Name, Start_Date, End_Date, Venue_Name, Street, Barangay, City_Municipality, Province, Country, Staff_Contact_Notes, Status, Event_Visibility')
    .eq('Event_Request_ID', Number(job.reference_id))
    .maybeSingle();
  const event = eventResult.data;
  if (eventResult.error || !event?.Event_Request_ID) throw new Error('EVENT_NOT_FOUND');

  const [attendeeResult, accessResult] = await Promise.all([
    supabase
      .from('Event_Attendees')
      .select('Event_Attendee_ID')
      .eq('Event_Request_ID', event.Event_Request_ID)
      .eq('User_ID', job.user_id)
      .limit(1),
    event.Event_Application_ID
      ? supabase
        .from('Private_Event_Access')
        .select('Event_Application_ID')
        .eq('Event_Application_ID', event.Event_Application_ID)
        .eq('User_ID', job.user_id)
        .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (attendeeResult.error || accessResult.error) throw new Error('EVENT_ACCESS_CHECK_FAILED');
  const isPrivate = normalizeSingleLine(event.Event_Visibility).toLowerCase() === 'private';
  const hasAttendee = Boolean(attendeeResult.data?.length);
  const hasPrivateAccess = Boolean(accessResult.data?.length);
  if (!hasAttendee && !(isPrivate && hasPrivateAccess)) throw new Error('EVENT_RECIPIENT_NOT_AUTHORIZED');

  const start = event.Start_Date ? new Date(event.Start_Date) : null;
  const appUrl = String(Deno.env.get('DONIVRA_APP_URL') || '').replace(/\/$/, '');
  return {
    type: job.email_type as 'donation_event_announcement' | 'donation_event_rsvp' | 'donation_event_reminder',
    recipientName,
    eventName: normalizeSingleLine(event.Event_Name, 'Donivra Donation Event'),
    eventDate: formatPhilippineDateTime(event.Start_Date, false),
    eventTime: start && !Number.isNaN(start.getTime())
      ? new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
      }).format(start)
      : 'See event details',
    eventLocation: [
      event.Venue_Name,
      event.Street,
      event.Barangay,
      event.City_Municipality,
      event.Province,
      event.Country,
    ].map((part) => normalizeSingleLine(part)).filter(Boolean).join(', ') || 'See event details',
    eventInstructions: normalizeSingleLine(event.Staff_Contact_Notes),
    eventStatus: normalizeSingleLine(event.Status),
    eventUrl: appUrl ? `${appUrl}/donor/drives/${event.Event_Request_ID}` : '',
    logoUrl: String(Deno.env.get('DONIVRA_LOGO_URL') || ''),
  };
};

const resolveTemplateData = async (
  supabase: SupabaseClient,
  job: OutboxRow,
  recipientName: string,
) => {
  if (job.email_type === 'donation_certificate') {
    return await buildCertificateTemplate(supabase, job, recipientName);
  }
  if (job.email_type === 'donation_status_update') {
    return await buildStatusTemplate(supabase, job, recipientName);
  }
  if (job.email_type === 'patient_wig_request_update') {
    return await buildPatientWigRequestTemplate(supabase, job, recipientName);
  }
  return await buildEventTemplate(supabase, job, recipientName);
};

const markFailed = async (supabase: SupabaseClient, job: OutboxRow, error: unknown) => {
  const attemptCount = Number(job.attempt_count || 1);
  const maxAttempts = Number(job.max_attempts || 5);
  const message = error instanceof Error ? error.message : 'Email delivery failed.';
  const permanentFailure = [
    'RECIPIENT_ACCOUNT_MISSING',
    'REGISTERED_AUTH_EMAIL_UNAVAILABLE',
    'RECIPIENT_MISSING',
    'CERTIFICATE_NOT_FOUND',
    'SUBMISSION_NOT_FOUND',
    'EVENT_NOT_FOUND',
    'REFERENCE_OWNER_MISMATCH',
    'EVENT_RECIPIENT_NOT_AUTHORIZED',
    'UNSUPPORTED_DONATION_MILESTONE',
    'WIG_REQUEST_NOT_FOUND',
    'PATIENT_NOT_FOUND',
    'UNSUPPORTED_WIG_REQUEST_MILESTONE',
  ].includes(message);
  const terminal = permanentFailure || attemptCount >= maxAttempts;
  const retryMinutes = Math.min(60, 2 ** Math.max(1, attemptCount));
  await supabase
    .from('Email_Outbox')
    .update({
      Status: terminal ? 'Failed' : 'Pending',
      Last_Error: message.slice(0, 1000),
      Scheduled_At: terminal ? new Date().toISOString() : new Date(Date.now() + retryMinutes * 60_000).toISOString(),
      Locked_At: null,
      Updated_At: new Date().toISOString(),
    })
    .eq('Email_Outbox_ID', job.email_outbox_id);
  return { outboxId: job.email_outbox_id, sent: false, retryScheduled: !terminal, error: message };
};

const processJob = async (supabase: SupabaseClient, job: OutboxRow) => {
  try {
    const recipient = await resolveRecipient(supabase, job.user_id);
    const templateData = await resolveTemplateData(supabase, job, recipient.name);
    const renderedEmail = renderDonivraEmail(job.email_type, templateData);
    const delivery = await sendTransactionalEmail({ recipient: recipient.email, email: renderedEmail });
    await supabase
      .from('Email_Outbox')
      .update({
        Status: 'Sent',
        Recipient_Email: recipient.email,
        Subject: renderedEmail.subject,
        Provider_Message_ID: delivery.messageId,
        Sent_At: new Date().toISOString(),
        Last_Error: null,
        Locked_At: null,
        Delivery_Response: {
          dry_run: delivery.dryRun,
          accepted_count: delivery.accepted.length,
          rejected_count: delivery.rejected.length,
          response: delivery.response,
        },
        Updated_At: new Date().toISOString(),
      })
      .eq('Email_Outbox_ID', job.email_outbox_id);
    console.info('DONIVRA email sent', {
      emailType: job.email_type,
      referenceId: job.reference_id,
      recipientUserId: job.user_id,
      outboxId: job.email_outbox_id,
      dryRun: delivery.dryRun,
    });
    return { outboxId: job.email_outbox_id, sent: true, dryRun: delivery.dryRun };
  } catch (error) {
    console.error('DONIVRA email failed', {
      emailType: job.email_type,
      referenceId: job.reference_id,
      recipientUserId: job.user_id,
      outboxId: job.email_outbox_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return await markFailed(supabase, job, error);
  }
};

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  if (request.method !== 'POST') return createJsonResponse({ message: 'Method not allowed.' }, 405);

  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '');
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  if (!supabaseUrl || !serviceRoleKey) {
    return createJsonResponse({ message: 'Supabase server configuration is missing.' }, 500);
  }
  const bearerToken = getBearerToken(request);
  if (!bearerToken) return createJsonResponse({ message: 'Authorization is required.' }, 401);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let caller: Caller;
  try {
    caller = await getCaller(supabase, bearerToken, serviceRoleKey);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return createJsonResponse({ message: code === 'APP_USER_NOT_FOUND' ? 'Application user not found.' : 'A valid session is required.' }, code === 'APP_USER_NOT_FOUND' ? 403 : 401);
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const forbiddenClientFields = ['to', 'recipient', 'subject', 'html'];
  if (forbiddenClientFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
    return createJsonResponse({ message: 'Recipient and email content are resolved by the server.' }, 400);
  }
  const requestedType = body.type;
  if (requestedType !== undefined && !isDonivraEmailType(requestedType)) {
    return createJsonResponse({ message: 'Unsupported email type.' }, 400);
  }
  const requestedOutboxId = Number(body.outboxId || 0);
  const requestedReferenceId = Number(
    body.certificateId || body.submissionId || body.eventRequestId || body.wigRequestId || 0,
  );
  let targetOutboxId = Number.isInteger(requestedOutboxId) && requestedOutboxId > 0 ? requestedOutboxId : null;

  if (!targetOutboxId && requestedType && requestedReferenceId > 0) {
    const referenceType = requestedType === 'donation_certificate'
      ? 'donation_certificate'
      : requestedType === 'donation_status_update'
        ? 'hair_submission'
        : requestedType === 'patient_wig_request_update'
          ? 'wig_request'
          : 'donation_event';
    const existingResult = await supabase
      .from('Email_Outbox')
      .select('Email_Outbox_ID, User_ID')
      .eq('Email_Type', requestedType)
      .eq('Reference_Type', referenceType)
      .eq('Reference_ID', String(requestedReferenceId))
      .order('Created_At', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingResult.error || !existingResult.data?.Email_Outbox_ID) {
      return createJsonResponse({ message: 'No approved email event exists for that reference.' }, 404);
    }
    if (!caller.isStaff && Number(existingResult.data.User_ID) !== Number(caller.userId)) {
      return createJsonResponse({ message: 'You cannot send this email event.' }, 403);
    }
    targetOutboxId = Number(existingResult.data.Email_Outbox_ID);
  }

  if (targetOutboxId && !caller.isServiceRole && !caller.isStaff) {
    const ownershipResult = await supabase
      .from('Email_Outbox')
      .select('User_ID')
      .eq('Email_Outbox_ID', targetOutboxId)
      .maybeSingle();
    if (ownershipResult.error || !ownershipResult.data) {
      return createJsonResponse({ message: 'Email event not found.' }, 404);
    }
    if (Number(ownershipResult.data.User_ID) !== Number(caller.userId)) {
      return createJsonResponse({ message: 'You cannot send this email event.' }, 403);
    }
  }

  if (!caller.isServiceRole && !caller.isStaff && !targetOutboxId) {
    return createJsonResponse({ message: 'Only authorized staff can process pending email jobs.' }, 403);
  }

  const claimResult = await supabase.rpc('claim_donivra_email_outbox', {
    p_limit: targetOutboxId ? 1 : Math.min(Math.max(Number(body.limit || 10), 1), 25),
    p_outbox_id: targetOutboxId,
  });
  if (claimResult.error) {
    return createJsonResponse({ message: claimResult.error.message || 'Unable to claim email jobs.' }, 500);
  }
  let jobs = (claimResult.data || []) as OutboxRow[];
  if (!caller.isServiceRole && !caller.isStaff) {
    jobs = jobs.filter((job) => Number(job.user_id) === Number(caller.userId));
  }
  const results = [];
  for (const job of jobs) results.push(await processJob(supabase, job));
  return createJsonResponse({
    processed: results.length,
    sent: results.filter((result) => result.sent).length,
    failed: results.filter((result) => !result.sent).length,
    results,
  });
});
