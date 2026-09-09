# DONIVRA transactional email

The Donivra email module provides the shared design system used by the repository-owned donation status, certificate, event, patient wig request, donation QR, hair-check reminder, and account-notification emails. All application-owned transactional mail is delivered through the configured SMTP provider. Supabase Auth email templates and Auth SMTP settings remain separate.

## Deploy

```powershell
supabase secrets set SMTP_HOST="smtp.provider.example"
supabase secrets set SMTP_PORT="587"
supabase secrets set SMTP_USER="replace-in-terminal"
supabase secrets set SMTP_PASS="replace-in-terminal"
supabase secrets set SMTP_FROM_EMAIL="no-reply@example.org"
supabase secrets set SMTP_FROM_NAME="Donivra"
supabase secrets set EMAIL_DELIVERY_MODE="smtp"
supabase secrets set DONIVRA_APP_URL="https://your-donivra-app.example"
supabase secrets set DONIVRA_LOGO_URL="https://public.example.org/donivra-logo.png"
supabase secrets set CERTIFICATE_STORAGE_BUCKET="donation-certificates"
supabase db push
supabase functions deploy send-donivra-email
supabase functions deploy send-push-notification
supabase functions deploy send-donor-qr-email
supabase functions deploy send-donor-hair-analysis-reminder
```

Do not commit real values. For local development, explicitly set `EMAIL_DELIVERY_MODE=dry-run`, use a test SMTP account, or set `EMAIL_TEST_RECIPIENT_OVERRIDE`. If delivery mode is omitted, the worker records a configuration failure instead of falsely marking an email as delivered.

## Preview templates without sending

Generate a local HTML file from repository-owned sample data:

```powershell
deno run --allow-write supabase/functions/_shared/email/preview-email.ts wig-request .preview-wig-request.html
```

Available previews are `donation-status`, `certificate`, `event`, `wig-request`, `notification`, `reminder`, and `qr`. This script has no network access and is not deployed as an HTTP endpoint.

## Enable the scheduled worker

The migration schedules the worker but intentionally stores no service credential. Add the project URL and service-role key to Vault after applying migrations:

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'donivra_project_url');
select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'donivra_service_role_key');
```

The worker runs once per minute and the event-reminder enqueuer runs every 15 minutes. Missing Vault secrets cause a safe no-op; business transactions continue normally.

## Request shape

The endpoint accepts only a known email type plus a database identifier, or an existing outbox ID:

```json
{ "type": "donation_certificate", "certificateId": 120 }
```

It never accepts a client-provided recipient, subject, or HTML body. Database triggers create approved jobs after the underlying transaction commits. Repeated events are deduplicated by `Email_Outbox.Idempotency_Key`.

## Safe verification

Set `EMAIL_DELIVERY_MODE=dry-run` before exercising certificate issuance, milestone changes, RSVP, private-event, missing-recipient, and duplicate-event cases in a non-production project. Inspect `Email_Outbox` for the expected `Pending`, `Sent`, retry, or terminal `Failed` result. Switch to `smtp` only after setting `EMAIL_TEST_RECIPIENT_OVERRIDE` or using a test SMTP account, then verify the HTML and plain-text parts in a mobile and desktop mail client.
