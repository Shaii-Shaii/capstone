import { createClient } from 'npm:@supabase/supabase-js@2';
import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { sendTransactionalEmail } from '../_shared/email/smtp-client.ts';
import { renderHairAnalysisReminderEmail } from '../_shared/email/templates/hair-analysis-reminder.ts';

const REMINDER_AUDIT_ACTION = 'notification.hair_analysis_reminder_email';

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const normalizeLocalDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return new Date().toISOString().slice(0, 10);
};

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
}: {
  supabase: ReturnType<typeof createClient>;
  authUserId: string;
}) => {
  if (authUserId) {
    const result = await supabase
      .from('users')
      .select('user_id, auth_user_id, email, role')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    return {
      data: result.data,
      error: result.error,
    };
  }

  return {
    data: null,
    error: new Error('A valid authenticated donor session is required.'),
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

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return createJsonResponse({ message: 'Supabase server configuration is missing.' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return createJsonResponse({ message: 'Authorization is required.' }, 401);
  }

  const authUserResult = await supabase.auth.getUser(bearerToken);
  const authUserId = authUserResult.data?.user?.id || '';
  if (!authUserId || authUserResult.error) {
    return createJsonResponse({ message: 'A valid authenticated session is required.' }, 401);
  }

  const payload = await request.json().catch(() => ({}));
  const localDate = normalizeLocalDate(payload?.localDate);
  const dayStart = `${localDate} 00:00:00`;
  const dayEnd = `${localDate} 23:59:59.999`;

  console.info('[send-donor-hair-analysis-reminder] invoked', {
    localDate,
    hasAuthUserId: Boolean(authUserId),
  });

  const systemUserResult = await resolveSystemUser({
    supabase,
    authUserId,
  });

  if (systemUserResult.error) {
    return createJsonResponse({ message: systemUserResult.error.message || 'Donor account could not be resolved.' }, 400);
  }

  if (!systemUserResult.data?.user_id) {
    return createJsonResponse({ message: 'Donor account could not be resolved.' }, 404);
  }

  if (String(systemUserResult.data.role || '').trim().toLowerCase() !== 'donor') {
    return createJsonResponse({ message: 'Only donor accounts can receive hair analysis reminders.' }, 403);
  }

  const resolvedUserId = Number(systemUserResult.data.user_id);
  const resolvedEmail = String(
    authUserResult.data?.user?.email || systemUserResult.data.email || '',
  ).trim().toLowerCase();

  if (!resolvedEmail) {
    return createJsonResponse({ message: 'The donor account does not have a registered email address.' }, 400);
  }

  const screeningResult = await supabase
    .from('AI_Screenings')
    .select('AI_Screening_ID, Created_At')
    .eq('User_ID', resolvedUserId)
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

  console.info('[send-donor-hair-analysis-reminder] sending reminder email', {
    userId: resolvedUserId,
    localDate,
  });

  try {
    const appUrl = String(Deno.env.get('DONIVRA_APP_URL') || '').replace(/\/$/, '');
    await sendTransactionalEmail({
      recipient: resolvedEmail,
      email: renderHairAnalysisReminderEmail({
        recipientName: 'Donor',
        checkHairUrl: appUrl ? `${appUrl}/donor/donations` : '',
        logoUrl: String(Deno.env.get('DONIVRA_LOGO_URL') || ''),
      }),
    });
  } catch (error) {
    const errorText = error instanceof Error ? error.message : 'Reminder email could not be sent.';
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
