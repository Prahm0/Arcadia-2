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
 * what the register page already handles via `verificationUrl`.
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
    const detail = await response.text().catch(() => "");
    console.error("[email] resend failed", response.status, detail.slice(0, 500));
    return false;
  }
  return true;
}

export function verificationEmail(link: string) {
  return {
    subject: "Confirm your Arcadia account",
    text: `Welcome to Arcadia.\n\nConfirm your email address:\n${link}\n\nThis link expires in 24 hours.`,
    html: `<p>Welcome to Arcadia.</p><p><a href="${link}">Confirm your email address</a></p><p>This link expires in 24 hours.</p>`,
  };
}
