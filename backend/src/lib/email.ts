import type { Env } from "../types";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra mail headers, e.g. List-Unsubscribe on marketing-style mail. */
  headers?: Record<string, string>;
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
      ...(args.headers ? { headers: args.headers } : {}),
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
function emailLayout(opts: { heading: string; preheader: string; body: string; footer?: string }): string {
  const accent = "#2f4a3a";
  const ink = "#1c2420";
  const muted = "#6b7280";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${opts.heading}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f1ea;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ea;padding:32px 16px;">
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
                  ${opts.footer ?? "Arcadia, your study planner. If you did not create an account, you can ignore this email and nothing happens."}
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
      <td style="border-radius:10px;background:#2f4a3a;">
        <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function roomReportEmail(args: {
  roomCode: string;
  reason: string;
  note: string;
  messageBody: string;
  reporterUserId: string;
  reportedUserId: string;
}) {
  const detail = [
    `Room code: ${args.roomCode}`,
    `Reason: ${args.reason}`,
    `Reporter user id: ${args.reporterUserId}`,
    `Reported user id: ${args.reportedUserId}`,
    `Message snapshot: ${args.messageBody}`,
    args.note ? `Reporter note: ${args.note}` : null,
  ].filter(Boolean).join("\n");
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3a3a4a;">A study room message was reported and needs review within 24 hours.</p>
    <pre style="margin:0;padding:14px;white-space:pre-wrap;word-break:break-word;background:#f3f1ea;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;color:#1c2420;">${escapeHtml(detail)}</pre>`;
  return {
    subject: `Arcadia room report: ${args.reason}`,
    text: `Arcadia room report\n\n${detail}`,
    html: emailLayout({ heading: "Study room report", preheader: "A room message needs review.", body }),
  };
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
      <a href="${link}" style="color:#2f4a3a;text-decoration:none;">${link}</a>
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
      <a href="${link}" style="color:#2f4a3a;text-decoration:none;">${link}</a>
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

export interface StudyPlanBlock {
  subject: string;
  /** Already formatted in the student's timezone, e.g. "4:30 pm". */
  time: string;
  minutes: number;
}

export interface WeeklySummary {
  minutes: number;
  sessions: number;
  topSubject: string | null;
  topSubjectMinutes: number;
  nextWeekBlocks: number;
}

/** Most blocks listed in one email; the rest become "and 2 more". */
const PLAN_EMAIL_BLOCK_LIMIT = 6;

/**
 * The 4pm "start with this" reminder. It is deliberately short: one clear
 * next block, enough context to make the rest of the day feel manageable,
 * and one way back into Arcadia.
 */
export function studyPlanEmail(args: {
  firstName: string;
  blocks: StudyPlanBlock[];
  appLink: string;
  unsubscribeUrl: string;
}) {
  const count = args.blocks.length;
  const first = args.blocks[0]!;
  const shown = args.blocks.slice(1, PLAN_EMAIL_BLOCK_LIMIT);
  const more = count - shown.length - 1;
  const remainingMinutes = args.blocks.reduce((sum, block) => sum + block.minutes, 0);
  const subject = `Your next block: ${first.subject} at ${first.time}`;
  const lead = args.firstName ? `Hi ${args.firstName}, your next study block is ready.` : "Your next study block is ready.";

  const rows = shown
    .map(
      (block) => `<tr>
        <td style="padding:12px 14px;border-top:1px solid #ececf1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <div style="font-size:15px;font-weight:600;color:#1c2420;">${escapeHtml(block.subject)}</div>
          <div style="margin-top:2px;font-size:13px;color:#6b7280;">${escapeHtml(block.time)} &middot; ${block.minutes} min</div>
        </td>
      </tr>`,
    )
    .join("");
  const moreRow = more > 0
    ? `<tr><td style="padding:12px 14px;border-top:1px solid #ececf1;font-size:13px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">and ${more} more in the app</td></tr>`
    : "";

  const body = `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#3a3a4a;">
      ${escapeHtml(lead)} You have ${remainingMinutes} focused ${remainingMinutes === 1 ? "minute" : "minutes"} planned for the rest of today.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #d8e2db;border-radius:10px;border-collapse:separate;overflow:hidden;background:#f5f8f5;">
      <tr><td style="padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="font-size:13px;font-weight:600;color:#2f4a3a;text-transform:uppercase;letter-spacing:0.06em;">Start here</div>
        <div style="margin-top:5px;font-size:18px;font-weight:600;color:#1c2420;">${escapeHtml(first.subject)}</div>
        <div style="margin-top:3px;font-size:14px;color:#52625a;">${escapeHtml(first.time)} &middot; ${first.minutes} min</div>
      </td></tr>
    </table>
    ${shown.length || more > 0 ? `${shown.length ? `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;">After that</p>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #ececf1;border-radius:10px;border-collapse:separate;overflow:hidden;">
      ${rows}${moreRow}
    </table>` : ""}
    ${emailButton(args.appLink, "Open today's plan")}`;

  const footer = `You are getting this because study emails are on in your Arcadia settings. <a href="${args.unsubscribeUrl}" style="color:#2f4a3a;text-decoration:underline;">Unsubscribe in one click</a>, or switch them off any time under Settings.`;

  const lines = [`Start here: ${first.subject}, ${first.time}, ${first.minutes} min`, ...shown.map((block) => `- ${block.subject}, ${block.time}, ${block.minutes} min`)];
  if (more > 0) lines.push(`- and ${more} more in the app`);
  const text = `${lead}\nYou have ${remainingMinutes} focused ${remainingMinutes === 1 ? "minute" : "minutes"} planned for the rest of today.\n\n${lines.join("\n")}\n\nOpen today's plan:\n${args.appLink}\n\nYou are getting this because study emails are on in your Arcadia settings. Unsubscribe in one click:\n${args.unsubscribeUrl}\n\narcadiahq.app`;

  return {
    subject,
    text,
    html: emailLayout({
      heading: "Your next study block",
      preheader: `${escapeHtml(first.subject)} at ${first.time}. Open Arcadia when you are ready.`,
      body,
      footer,
    }),
  };
}

/** A short, honest Sunday recap. It only uses logged focus and existing plan blocks. */
export function weeklySummaryEmail(args: {
  firstName: string;
  summary: WeeklySummary;
  appLink: string;
  unsubscribeUrl: string;
}) {
  const hours = Math.floor(args.summary.minutes / 60);
  const minutes = args.summary.minutes % 60;
  const focused = hours ? `${hours}h${minutes ? ` ${minutes}m` : ""}` : `${minutes}m`;
  const sessionLabel = `${args.summary.sessions} ${args.summary.sessions === 1 ? "session" : "sessions"}`;
  const greeting = args.firstName ? `Hi ${args.firstName}, here is what you made time for this week.` : "Here is what you made time for this week.";
  const highlight = args.summary.topSubject
    ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:#52625a;">Most of your focus went to <strong style="color:#1c2420;">${escapeHtml(args.summary.topSubject)}</strong> with ${args.summary.topSubjectMinutes} min.</p>`
    : "";
  const nextWeek = args.summary.nextWeekBlocks > 0
    ? `Next week already has ${args.summary.nextWeekBlocks} ${args.summary.nextWeekBlocks === 1 ? "study block" : "study blocks"} planned.`
    : "Your next week is ready whenever you are.";
  const body = `
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3a3a4a;">${escapeHtml(greeting)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-radius:12px;border-collapse:separate;overflow:hidden;background:#0a0e14;">
      <tr><td style="padding:22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="font-size:13px;font-weight:600;color:#bac7bf;text-transform:uppercase;letter-spacing:0.06em;">Your focused time</div>
        <div style="margin-top:4px;font-size:30px;line-height:1.1;font-weight:650;color:#ffffff;">${focused}</div>
        <div style="margin-top:6px;font-size:14px;color:#d9e1dc;">across ${sessionLabel}</div>
      </td></tr>
    </table>
    ${highlight}
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#3a3a4a;">${nextWeek}</p>
    ${emailButton(args.appLink, "See next week")}`;
  const footer = `You are getting this because study emails are on in your Arcadia settings. <a href="${args.unsubscribeUrl}" style="color:#2f4a3a;text-decoration:underline;">Unsubscribe in one click</a>, or switch them off any time under Settings.`;
  const text = `${greeting}\n\nYou focused for ${focused} across ${sessionLabel}.${args.summary.topSubject ? `\nMost of your focus went to ${args.summary.topSubject} with ${args.summary.topSubjectMinutes} min.` : ""}\n\n${nextWeek}\n\nSee next week:\n${args.appLink}\n\nYou are getting this because study emails are on in your Arcadia settings. Unsubscribe in one click:\n${args.unsubscribeUrl}\n\narcadiahq.app`;
  return {
    subject: `Your week in Arcadia: ${focused} focused`,
    text,
    html: emailLayout({
      heading: "Your week in focus",
      preheader: `${focused} focused across ${sessionLabel}.`,
      body,
      footer,
    }),
  };
}
