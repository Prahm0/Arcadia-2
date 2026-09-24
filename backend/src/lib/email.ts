import type { Env } from "../types";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends through Resend. Returns false (without throwing) when RESEND_API_KEY
 * is unset, so a dev environment without mail still works: the caller falls
 * back to returning the verification link in the response, which is exactly
 * what the register page already handles via `verificationToken`.
 */
export async function sendEmail(env: Env, args: SendArgs): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!response.ok) {
    // Provider error payloads can echo a recipient address. Keep logs useful
    // without risking personal data from verification or reset mail.
    console.error("[email] resend failed", response.status);
    return false;
  }
  return true;
}

/**
 * Shared HTML shell for transactional emails. Email clients are far behind
 * browsers, so this stays deliberately old-school: table layout, all styles
 * inline, web-safe fonts, a light card that renders the same everywhere
 * rather than fighting each client's dark-mode handling. `preheader` is the
 * grey preview line inbox lists show next to the subject.
 */
function emailLayout(opts: { heading: string; preheader: string; body: string }): string {
  const accent = "#7c5cff";
  const ink = "#1a1a2e";
  const muted = "#6b7280";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${opts.heading}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f7;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ececf1;">
            <tr>
              <td style="background:#0a0e14;padding:22px 32px;">
                <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#ffffff;letter-spacing:0.2px;">Arcadia</span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${ink};font-weight:600;">${opts.heading}</h1>
                ${opts.body}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;border-top:1px solid #ececf1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <p style="margin:0;font-size:12.5px;line-height:1.5;color:${muted};">
                  Arcadia, your study planner. If you did not create an account, you can ignore this email and nothing happens.
                </p>
                <p style="margin:8px 0 0;font-size:12.5px;color:${muted};">
                  <a href="https://arcadiahq.app" style="color:${accent};text-decoration:none;">arcadiahq.app</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Bulletproof-ish CTA button. Inline styles so it survives email clients. */
function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
    <tr>
      <td style="border-radius:10px;background:#7c5cff;">
        <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

export function verificationEmail(link: string) {
  const body = `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#3a3a4a;">
      You are one tap away. Confirm your email and Arcadia will start planning your week around your subjects, deadlines and everything else.
    </p>
    ${emailButton(link, "Confirm my email")}
    <p style="margin:22px 0 6px;font-size:13px;line-height:1.5;color:#6b7280;">
      Or paste this link into your browser:
    </p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.5;word-break:break-all;">
      <a href="${link}" style="color:#7c5cff;text-decoration:none;">${link}</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
      This link expires in 24 hours.
    </p>`;
  return {
    subject: "Confirm your email to start planning",
    text: `Welcome to Arcadia.\n\nYou are one tap away. Confirm your email to start planning your week:\n${link}\n\nThis link expires in 24 hours.\n\nIf you did not create an account, you can ignore this email.\n\narcadiahq.app`,
    html: emailLayout({
      heading: "Welcome to Arcadia",
      preheader: "Confirm your email to start planning your week.",
      body,
    }),
  };
}

export function resetPasswordEmail(link: string) {
  const body = `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#3a3a4a;">
      Use this link to choose a new password for your Arcadia account.
    </p>
    ${emailButton(link, "Reset my password")}
    <p style="margin:22px 0 6px;font-size:13px;line-height:1.5;color:#6b7280;">
      Or paste this link into your browser:
    </p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.5;word-break:break-all;">
      <a href="${link}" style="color:#7c5cff;text-decoration:none;">${link}</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
      This link works for 60 minutes. If you didn&rsquo;t ask for this, you can ignore this email.
    </p>`;
  return {
    subject: "Reset your Arcadia password",
    text: `Reset your Arcadia password.\n\nUse this link to choose a new password:\n${link}\n\nThis link works for 60 minutes. If you didn't ask for this, you can ignore this email.\n\narcadiahq.app`,
    html: emailLayout({
      heading: "Reset your Arcadia password",
      preheader: "Choose a new password for your Arcadia account.",
      body,
    }),
  };
}
