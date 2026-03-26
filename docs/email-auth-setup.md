# Email Auth Setup: Supabase + Resend

This project already sends verification and reset emails through Supabase Auth.

Current app flow:

- Sign up uses `supabase.auth.signUp(...)`
- Verify email uses `supabase.auth.verifyOtp({ type: 'signup' })`
- Resend code uses `supabase.auth.resend({ type: 'signup', email })`
- Forgot password uses `supabase.auth.resetPasswordForEmail(...)`

If Gmail is not receiving anything, the most common cause is Supabase still using its default email service instead of a custom SMTP provider.

## Why Gmail is not receiving emails

Supabase's default email service is only for limited testing. It has strict limits and only sends to pre-authorized team addresses unless you configure custom SMTP.

Use Resend as the SMTP provider for Supabase Auth.

## Part 1: Set up Resend

1. Create a Resend account.
2. In Resend, add and verify your sending domain.
3. Use a dedicated auth sender if possible, for example:
   `auth.yourdomain.com`
4. Add the DNS records Resend gives you.
5. Wait until the domain status becomes verified.
6. Create a Resend API key.

Resend SMTP values:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: your Resend API key

Recommended sender:

- From email: `no-reply@auth.yourdomain.com`
- Sender name: `StrandShare`

## Part 2: Connect Resend to Supabase

1. Open your Supabase project dashboard.
2. Go to `Authentication`.
3. Open the email settings section.
4. Find `SMTP Settings`.
5. Enable custom SMTP.
6. Fill in the sender details:
   `Sender email`: your verified Resend sender email
   `Sender name`: `StrandShare`
7. Fill in the SMTP details:
   `Host`: `smtp.resend.com`
   `Port`: `465`
   `Username`: `resend`
   `Password`: your Resend API key
8. Save the settings.

After this, Supabase Auth emails should go through Resend instead of the default Supabase mailer.

## Part 3: Supabase Auth settings to verify

Check these settings in Supabase:

1. `Authentication` -> `Providers` -> `Email`
2. Make sure email signups are enabled.
3. Make sure email confirmations are enabled if you want OTP verification before login.
4. Review the email templates for:
   `Confirm signup`
   `Reset password`
5. Keep rate limits in mind if you are testing resend repeatedly.

For this app, email confirmation should stay enabled because the UI expects verification before login.

## Part 4: App code already wired for resend

These files already call the correct Supabase methods:

- [src/features/auth/api/auth.api.js](d:\react native projects\capstone\strandshare_capstone\src\features\auth\api\auth.api.js)
- [src/features/auth/services/auth.service.js](d:\react native projects\capstone\strandshare_capstone\src\features\auth\services\auth.service.js)
- [app/auth/verify-email.jsx](d:\react native projects\capstone\strandshare_capstone\app\auth\verify-email.jsx)

The resend call in this project is:

```js
await supabase.auth.resend({
  type: 'signup',
  email,
})
```

That part is fine. If resend is failing for Gmail, fix the Supabase SMTP configuration first.

## Part 5: Testing checklist

1. Sign up with a Gmail account that is not a Supabase team member.
2. Confirm the app shows the verify-email screen.
3. Tap `Resend Code`.
4. Check the Gmail inbox.
5. Check Gmail `Spam` and `Promotions`.
6. Check Resend logs to confirm the email was accepted for delivery.
7. If Resend shows success but Gmail still does not show the email, review SPF, DKIM, and DMARC for your sending domain.

## Part 6: Troubleshooting

### Error: `Email address not authorized`

Cause:
Supabase is still using its default email service.

Fix:
Finish the custom SMTP setup with Resend.

### Resend button succeeds but no Gmail email arrives

Cause:
Usually a sender-domain deliverability problem.

Fix:

1. Verify the Resend domain.
2. Confirm SPF, DKIM, and DMARC are valid.
3. Use a real sender address on the verified domain.
4. Avoid free-form `from` addresses that are not verified.

### Password reset email does not return to the app

Cause:
Supabase redirect URL may not be configured.

Fix:

1. In Supabase, add your redirect URL / deep link allowlist entry.
2. For this app, the reset flow uses:
   `strandshare://auth/reset-password`

## Part 7: What to check first in your project

Because your app code is already calling the right methods, check these first:

1. Supabase custom SMTP is enabled
2. Resend domain is verified
3. Resend API key is valid
4. Sender email matches the verified domain
5. `strandshare://auth/reset-password` is allowed in Supabase if reset emails are also failing

## Official references

- Supabase custom SMTP for Auth: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase resend OTP reference: https://supabase.com/docs/reference/javascript/auth-resend
- Resend SMTP with Supabase: https://resend.com/docs/send-with-supabase-smtp
- Resend + Supabase overview: https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase
