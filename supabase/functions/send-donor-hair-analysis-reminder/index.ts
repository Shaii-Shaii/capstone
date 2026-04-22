import { createClient } from 'npm:@supabase/supabase-js@2';
import { createJsonResponse, handleCorsPreflight } from '../_shared/cors';

const REMINDER_AUDIT_ACTION = 'notification.hair_analysis_reminder_email';

const normalizeLocalDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return new Date().toISOString().slice(0, 10);
};

const buildReminderEmailHtml = () => `
  <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
    <h2 style="margin-bottom: 8px;">Daily Hair Analysis Reminder</h2>
    <p style="margin: 0 0 12px;">You have not completed your Donivra hair analysis yet today.</p>
    <p style="margin: 0 0 12px;">Open CheckHair in the Donivra app to upload your current hair photos and receive updated guidance based on today's images.</p>
    <p style="margin: 0;">This reminder is sent once per day when your latest analysis has not been completed yet.</p>
  </div>
`;

const buildReminderEmailText = () => (
  'Daily Hair Analysis Reminder\n\n'
  + 'You have not completed your Donivra hair analysis yet today.\n'
  + 'Open CheckHair in the Donivra app to upload your current hair photos and receive updated guidance based on today\'s images.\n'
  + 'This reminder is sent once per day when your latest analysis has not been completed yet.'
);

const insertAuditLog = async ({
  supabase,
  userId,
  userEmail,
  description,
  status,
}: {
  supabase: ReturnType<typeof createClient>;
  userId: number;
  userEmail: string;
  description: string;
  status: 'success' | 'failed';
}) => {
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: REMINDER_AUDIT_ACTION,
    description,
    user_email: userEmail || null,
    resource: 'notification',
    status,
  });
};

const resolveSystemUser = async ({
  supabase,
  authUserId,
  databaseUserId,
  userEmail,
}: {
  supabase: ReturnType<typeof createClient>;
  authUserId: string;
  databaseUserId: number | null;
  userEmail: string;
}) => {
  if (databaseUserId) {
    const result = await supabase
      .from('users')
      .select('user_id, auth_user_id, email')
      .eq('user_id', databaseUserId)
      .maybeSingle();

    return {
      data: result.data,
      error: result.error,
    };
  }

  if (authUserId) {
    const result = await supabase
      .from('users')
      .select('user_id, auth_user_id, email')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    return {
      data: result.data,
      error: result.error,
    };
  }

  if (userEmail) {
    const result = await supabase
      .from('users')
      .select('user_id, auth_user_id, email')
      .ilike('email', userEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      data: result.data,
      error: result.error,
    };
  }

  return {
    data: null,
    error: new Error('A donor user identifier is required.'),
  };
};

Deno.serve(async (request) => {
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (request.method !== 'POST') {
    return createJsonResponse({ message: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
  const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || '';

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return createJsonResponse({ message: 'Supabase server configuration is missing.' }, 500);
  }

  const payload = await request.json().catch(() => ({}));
  const authUserId = String(payload?.authUserId || '').trim();
  const requestedDatabaseUserId = Number(payload?.databaseUserId);
  const databaseUserId = Number.isInteger(requestedDatabaseUserId) && requestedDatabaseUserId > 0
    ? requestedDatabaseUserId
    : null;
  const userEmail = String(payload?.userEmail || '').trim().toLowerCase();
  const localDate = normalizeLocalDate(payload?.localDate);
  const dayStart = `${localDate} 00:00:00`;
  const dayEnd = `${localDate} 23:59:59.999`;

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  console.info('[send-donor-hair-analysis-reminder] invoked', {
    localDate,
    hasAuthUserId: Boolean(authUserId),
    hasDatabaseUserId: Boolean(databaseUserId),
    hasUserEmail: Boolean(userEmail),
  });

  const systemUserResult = await resolveSystemUser({
    supabase,
    authUserId,
    databaseUserId,
    userEmail,
  });

  if (systemUserResult.error) {
    return createJsonResponse({ message: systemUserResult.error.message || 'Donor account could not be resolved.' }, 400);
  }

  if (!systemUserResult.data?.user_id) {
    return createJsonResponse({ message: 'Donor account could not be resolved.' }, 404);
  }

  const resolvedUserId = Number(systemUserResult.data.user_id);
  const resolvedEmail = userEmail || String(systemUserResult.data.email || '').trim().toLowerCase();

  if (!resolvedEmail) {
    return createJsonResponse({ message: 'The donor account does not have a registered email address.' }, 400);
  }

  const submissionResult = await supabase
    .from('Hair_Submissions')
    .select('Submission_ID')
    .eq('User_ID', resolvedUserId);

  if (submissionResult.error) {
    return createJsonResponse({ message: submissionResult.error.message || 'Unable to check donor submissions.' }, 500);
  }

  const submissionIds = (submissionResult.data || [])
    .map((row) => row?.Submission_ID)
    .filter((value): value is number => Number.isInteger(value));

  if (submissionIds.length) {
    const screeningResult = await supabase
      .from('AI_Screenings')
      .select('AI_Screening_ID, Created_At')
      .in('Submission_ID', submissionIds)
      .gte('Created_At', dayStart)
      .lte('Created_At', dayEnd)
      .order('Created_At', { ascending: false })
      .limit(1);

    if (screeningResult.error) {
      return createJsonResponse({ message: screeningResult.error.message || 'Unable to check today\'s hair analysis.' }, 500);
    }

    if ((screeningResult.data || []).length) {
      return createJsonResponse({
        sent: false,
        skipped: true,
        reason: 'analysis_already_completed_today',
      });
    }
  }

  const auditResult = await supabase
    .from('audit_logs')
    .select('log_id, time')
    .eq('user_id', resolvedUserId)
    .eq('action', REMINDER_AUDIT_ACTION)
    .eq('status', 'success')
    .gte('time', dayStart)
    .lte('time', dayEnd)
    .order('time', { ascending: false })
    .limit(1);

  if (auditResult.error) {
    return createJsonResponse({ message: auditResult.error.message || 'Unable to check today\'s reminder history.' }, 500);
  }

  if ((auditResult.data || []).length) {
    return createJsonResponse({
      sent: false,
      skipped: true,
      reason: 'already_sent_today',
    });
  }

  if (!resendApiKey || !resendFromEmail) {
    return createJsonResponse({ message: 'Reminder email is not configured on the server.' }, 500);
  }

  console.info('[send-donor-hair-analysis-reminder] sending reminder email', {
    userId: resolvedUserId,
    localDate,
  });

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [resolvedEmail],
      subject: 'Donivra: complete your hair analysis today',
      html: buildReminderEmailHtml(),
      text: buildReminderEmailText(),
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text().catch(() => '');
    await insertAuditLog({
      supabase,
      userId: resolvedUserId,
      userEmail: resolvedEmail,
      description: errorText || 'Reminder email could not be sent.',
      status: 'failed',
    });

    return createJsonResponse({
      message: 'The reminder email could not be sent right now.',
    }, 502);
  }

  await insertAuditLog({
    supabase,
    userId: resolvedUserId,
    userEmail: resolvedEmail,
    description: `Hair analysis reminder email sent for ${localDate}.`,
    status: 'success',
  });

  return createJsonResponse({
    sent: true,
    skipped: false,
    localDate,
  });
});
