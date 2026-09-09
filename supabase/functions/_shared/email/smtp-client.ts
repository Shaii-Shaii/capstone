// Nodemailer uses the Deno runtime's Node compatibility layer in Supabase Edge Functions.
// @ts-ignore npm: modules are resolved by the Supabase Deno runtime.
import nodemailer from 'npm:nodemailer@7.0.6';
import type { RenderedEmail } from './email-types.ts';

export type SmtpDeliveryResult = {
  sent: boolean;
  dryRun: boolean;
  messageId: string | null;
  accepted: string[];
  rejected: string[];
  response: string;
};

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType: string;
  encoding?: 'base64' | 'utf8';
};

const requireEnvironment = (name: string) => {
  const value = String(Deno.env.get(name) || '').trim();
  if (!value) throw new Error(`Missing required Edge Function secret: ${name}`);
  return value;
};

const parsePort = () => {
  const port = Number(requireEnvironment('SMTP_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid TCP port.');
  }
  return port;
};

export const sendTransactionalEmail = async ({
  recipient,
  email,
  attachments = [],
}: {
  recipient: string;
  email: RenderedEmail;
  attachments?: EmailAttachment[];
}): Promise<SmtpDeliveryResult> => {
  const deliveryMode = String(Deno.env.get('EMAIL_DELIVERY_MODE') || 'disabled').trim().toLowerCase();
  const testRecipient = String(Deno.env.get('EMAIL_TEST_RECIPIENT_OVERRIDE') || '').trim().toLowerCase();
  const resolvedRecipient = testRecipient || recipient;

  if (deliveryMode === 'dry-run') {
    console.info('DONIVRA email dry run', {
      recipientUserEmailPresent: Boolean(recipient),
      testRecipientOverride: Boolean(testRecipient),
      subject: email.subject,
    });
    return {
      sent: true,
      dryRun: true,
      messageId: 'dry-run',
      accepted: [resolvedRecipient],
      rejected: [],
      response: 'EMAIL_DELIVERY_MODE is not smtp; no external email was sent.',
    };
  }
  if (deliveryMode !== 'smtp') {
    throw new Error('EMAIL_DELIVERY_MODE must be set to smtp for delivery or dry-run for local testing.');
  }

  const host = requireEnvironment('SMTP_HOST');
  const port = parsePort();
  const user = requireEnvironment('SMTP_USER');
  const pass = requireEnvironment('SMTP_PASS');
  const fromEmail = requireEnvironment('SMTP_FROM_EMAIL');
  const fromName = requireEnvironment('SMTP_FROM_NAME');
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  const result = await transport.sendMail({
    from: { name: fromName, address: fromEmail },
    to: resolvedRecipient,
    subject: email.subject,
    text: email.plainText,
    html: email.html,
    attachments: attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
      encoding: attachment.encoding || 'base64',
    })),
  });

  const accepted = (result?.accepted || []).map(String);
  const rejected = (result?.rejected || []).map(String);
  if (!accepted.length || rejected.includes(resolvedRecipient)) {
    throw new Error('SMTP_RECIPIENT_REJECTED');
  }

  return {
    sent: true,
    dryRun: false,
    messageId: String(result?.messageId || '') || null,
    accepted,
    rejected,
    response: String(result?.response || ''),
  };
};
