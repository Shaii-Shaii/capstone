import { createClient } from 'npm:@supabase/supabase-js@2';
import QRCode from 'npm:qrcode@1.5.4';
import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { isEmailAddress } from '../_shared/email/html.ts';
import { sendTransactionalEmail } from '../_shared/email/smtp-client.ts';
import { renderDonationQrEmail } from '../_shared/email/templates/donation-qr.ts';

type QrItem = {
  title?: string;
  subtitle?: string;
  qrPayload?: string;
  reference?: string;
  details?: { label?: string; value?: string | number | null }[];
};

type PreparedQrItem = QrItem & {
  qrDataUrl: string;
  attachmentName: string;
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const normalizeQrItems = (value: unknown): QrItem[] => (
  (Array.isArray(value) ? value : [value])
    .map((item) => (typeof item === 'object' && item ? item as QrItem : null))
    .filter((item): item is QrItem => Boolean(String(item?.qrPayload || '').trim()))
    .slice(0, 12)
);

const sanitizeAttachmentName = (value = 'donivra-qr') => (
  String(value || 'donivra-qr')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  || 'donivra-qr'
);

const prepareQrItems = async (qrItems: QrItem[]): Promise<PreparedQrItem[]> => {
  const preparedItems: PreparedQrItem[] = [];

  for (const [index, item] of qrItems.entries()) {
    const payload = String(item.qrPayload || '').trim();
    if (!payload) continue;

    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
    });
    const attachmentName = `${sanitizeAttachmentName(item.reference || item.title || `donivra-qr-${index + 1}`)}.png`;
    preparedItems.push({
      ...item,
      qrPayload: payload,
      qrDataUrl,
      attachmentName,
    });
  }

  return preparedItems;
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

  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return createJsonResponse({ message: 'Authorization is required.' }, 401);
  }

  const payload = await request.json().catch(() => ({}));
  const qrItems = await prepareQrItems(normalizeQrItems(payload?.qrItems || payload?.qrItem));
  if (!qrItems.length) {
    return createJsonResponse({ sent: false, skipped: true, reason: 'no_qr_items' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const authUserResult = await supabase.auth.getUser(bearerToken);
  const authUserId = authUserResult.data?.user?.id || '';
  if (!authUserId || authUserResult.error) {
    return createJsonResponse({ message: 'A valid authenticated session is required.' }, 401);
  }

  const systemUserResult = await supabase
    .from('users')
    .select('user_id, email, role')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return createJsonResponse({ message: 'The authenticated donor account could not be resolved.' }, 403);
  }

  if (String(systemUserResult.data.role || '').trim().toLowerCase() !== 'donor') {
    return createJsonResponse({ message: 'Only donor accounts can receive donation QR emails.' }, 403);
  }

  const recipientEmail = String(
    authUserResult.data?.user?.email || systemUserResult.data.email || '',
  ).trim().toLowerCase();
  if (!isEmailAddress(recipientEmail)) {
    return createJsonResponse({ sent: false, skipped: true, reason: 'no_account_email' });
  }

  const donorName = String(payload?.donorName || '').trim();
  try {
    const appUrl = String(Deno.env.get('DONIVRA_APP_URL') || '').replace(/\/$/, '');
    const email = renderDonationQrEmail({
      recipientName: donorName || 'Donor',
      items: qrItems.map((item, index) => ({
        ...item,
        title: item.title || `Donation QR ${index + 1}`,
      })),
      journeyUrl: appUrl ? `${appUrl}/donor/status` : '',
      logoUrl: String(Deno.env.get('DONIVRA_LOGO_URL') || ''),
    });
    const delivery = await sendTransactionalEmail({
      recipient: recipientEmail,
      email,
      attachments: qrItems.map((item) => ({
        filename: item.attachmentName,
        content: item.qrDataUrl.split(',')[1] || '',
        contentType: 'image/png',
        encoding: 'base64',
      })),
    });
    return createJsonResponse({
      sent: true,
      dryRun: delivery.dryRun,
      messageId: delivery.messageId,
    });
  } catch (error) {
    return createJsonResponse({
      sent: false,
      failed: true,
      message: error instanceof Error ? error.message : 'Email delivery failed.',
    }, 502);
  }
});
