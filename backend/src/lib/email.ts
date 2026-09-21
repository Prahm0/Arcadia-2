import type { Env } from "../types";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** A failed mail send must never become an alternate account-verification path. */
export async function sendEmail(env: Env, args: SendArgs): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
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
      const detail = await response.text().catch(() => "");
      console.error("[email] Resend failed", response.status, detail.slice(0, 500));
    }
    return response.ok;
  } catch (error) {
    console.error("[email] Resend unavailable", error);
    return false;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

function message(title: string, intro: string, action: string, link: string, expiry: string) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeAction = escapeHtml(action);
  const safeLink = escapeHtml(link);
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#ece7dd;color:#100f0d;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;padding:0 18px">
  <div style="font-size:16px;font-weight:700;letter-spacing:.08em;margin-bottom:22px">ARCADIA</div>
  <div style="background:#fff;border:1px solid #ded5c6;border-radius:18px;padding:32px">
    <h1 style="font-size:27px;line-height:1.2;margin:0 0 18px">${safeTitle}</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 28px">${safeIntro}</p>
    <a href="${safeLink}" style="display:inline-block;background:#2c114f;color:#fff;text-decoration:none;border-radius:10px;padding:14px 20px;font-weight:700">${safeAction}</a>
    <p style="font-size:13px;line-height:1.5;color:#5f5a52;margin:28px 0 8px">${escapeHtml(expiry)} If the button does not work, copy this link:</p>
    <p style="overflow-wrap:anywhere;font-size:13px"><a href="${safeLink}" style="color:#2c114f">${safeLink}</a></p>
  </div>
  <p style="font-size:12px;line-height:1.5;color:#5f5a52;margin-top:18px">If you did not request this, you can ignore this email. Arcadia will never ask for your password by email.</p>
</div></body></html>`;
}

export function verificationEmail(link: string) {
  return {
    subject: "Confirm your Arcadia email",
    text: `Welcome to Arcadia. Confirm your email address: ${link}\n\nThis link expires in 24 hours. If you did not sign up, ignore this email.`,
    html: message("Make it yours.", "Confirm your email to start planning with Arcadia.", "Confirm my email", link, "This link expires in 24 hours."),
  };
}

export function resetPasswordEmail(link: string) {
  return {
    subject: "Reset your Arcadia password",
    text: `Reset your Arcadia password: ${link}\n\nThis link expires in 30 minutes. If you did not ask for a reset, ignore this email.`,
    html: message("Reset your password.", "Use this link to choose a new password for your Arcadia account.", "Choose a new password", link, "This link expires in 30 minutes."),
  };
}
