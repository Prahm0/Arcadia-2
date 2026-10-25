import { api } from "@/lib/api/client";

export interface ReferralSummary {
  code: string;
  inviteLink: string;
  qualifiedReferrals: number;
  bonusDays: number;
}

export const INVITE_TEXT = "I plan my whole week with Arcadia and it rebuilds itself when life happens. Try it with my link:";

export function fetchReferralSummary(): Promise<ReferralSummary> {
  return api<ReferralSummary>("/api/referrals");
}

/**
 * Opens the share sheet with the invite link, or copies it where sharing
 * isn't available. "cancelled" when the student closed the sheet.
 */
export async function shareInviteLink(link: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ title: "Plan with Arcadia", text: INVITE_TEXT, url: link });
      return "shared";
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    return "copied";
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = link;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied ? "copied" : "failed";
  }
}
