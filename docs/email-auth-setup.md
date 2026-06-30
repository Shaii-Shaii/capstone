# Email Auth Setup: Supabase Confirm Signup OTP Template

This app uses Supabase Auth's normal signup confirmation flow.

Current app flow:

- Sign up uses `supabase.auth.signUp(...)`
- Verify email uses `supabase.auth.verifyOtp({ type: 'signup' })`
- Resend code uses `supabase.auth.resend({ type: 'signup', email })`
- Forgot password uses `supabase.auth.resetPasswordForEmail(...)`

## Supabase settings

Check these in your Supabase project:

1. `Authentication -> Providers -> Email`
2. Make sure email signups are enabled.
3. Make sure email confirmations are enabled.
4. Open `Authentication -> Email`.
5. Use the `Confirm signup` template.

## Confirm signup template

Use this in `Authentication -> Email -> Confirm signup`.

Subject:

```text
Donivra
```

Important:

- Use the `Confirm signup` template slot.
- Show `{{ .Token }}` clearly because the app verifies with OTP entry.
- `{{ .ConfirmationURL }}` can stay as a fallback link, but the OTP should be the main action shown in the email.

Body:

```html
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#080808;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #c9c8c8;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 16px 32px;text-align:center;">
                <h1 style="margin:0;font-size:28px;line-height:1.2;color:#080808;">Donivra</h1>
                <p style="margin:10px 0 0 0;font-size:15px;line-height:1.6;color:#646464;">
                  Hair donation and wig support platform
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h2 style="margin:0;font-size:22px;line-height:1.3;color:#080808;">
                  Your verification code
                </h2>
                <p style="margin:12px 0 0 0;font-size:15px;line-height:1.7;color:#4f4f4f;">
                  Enter this one-time code in the Donivra app to continue your signup.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 8px 32px;text-align:center;">
                <div style="display:inline-block;padding:16px 24px;border-radius:14px;background:#f7efef;border:1px solid #d8b4b4;font-size:32px;line-height:1;font-weight:700;letter-spacing:8px;color:#8b3a3a;">
                  {{ .Token }}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 32px 0 32px;">
                <p style="margin:0;font-size:14px;line-height:1.7;color:#646464;text-align:center;">
                  This code was sent to <strong>{{ .Email }}</strong>.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px 0 32px;text-align:center;">
                <a
                  href="{{ .ConfirmationURL }}"
                  style="display:inline-block;padding:14px 24px;background:#8b3a3a;color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;"
                >
                  Confirm Email
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px 0 32px;">
                <p style="margin:0;font-size:14px;line-height:1.7;color:#4f4f4f;text-align:center;">
                  If needed, you can also use this link:
                </p>
                <p style="margin:10px 0 0 0;font-size:13px;line-height:1.7;color:#8b3a3a;word-break:break-all;text-align:center;">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 32px 32px;">
                <p style="margin:0 0 10px 0;font-size:14px;line-height:1.7;color:#4f4f4f;">
                  If you were not expecting this code, you can safely ignore this email.
                </p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:#8a8a8a;">
                  Site URL: {{ .SiteURL }}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## App files already using OTP verification

- [auth.api.js](d:/react%20native%20projects/capstone/strandshare_capstone/src/features/auth/api/auth.api.js)
- [auth.service.js](d:/react%20native%20projects/capstone/strandshare_capstone/src/features/auth/services/auth.service.js)
- [verify-email.jsx](d:/react%20native%20projects/capstone/strandshare_capstone/app/auth/verify-email.jsx)
