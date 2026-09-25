"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import AppButton from "./AppButton";

interface ExportLink {
  url: string | null;
  lastFetchedAt: string | null;
}

type Notice = { tone: "info" | "error"; text: string } | null;

/** Apple Calendar (and most desktop apps) open a subscription from webcal://. */
function webcal(url: string) {
  return url.replace(/^https?:\/\//, "webcal://");
}

/** Google's "add calendar by URL" dialog, pre-filled. */
function googleAddUrl(url: string) {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal(url))}`;
}

/**
 * Settings body for exporting the plan: one private .ics link that Google
 * Calendar and Apple Calendar subscribe to, so study blocks and deadlines
 * show up there and follow Arcad's re-plans.
 */
export default function CalendarExport({ isGuest }: { isGuest: boolean }) {
  const [link, setLink] = useState<ExportLink | null>(null);
  const [busy, setBusy] = useState<"google" | "apple" | "reset" | "off" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isGuest) return;
    api<ExportLink>("/api/calendar-export")
      .then(setLink)
      .catch(() => setLink({ url: null, lastFetchedAt: null }));
  }, [isGuest]);

  async function createLink(): Promise<string> {
    const next = await api<ExportLink>("/api/calendar-export", { method: "POST" });
    setLink(next);
    if (!next.url) throw new Error("Couldn't make your calendar link.");
    return next.url;
  }

  async function addToGoogle() {
    setNotice(null);
    if (link?.url) {
      window.open(googleAddUrl(link.url), "_blank", "noopener,noreferrer");
      return;
    }
    // Open the tab now, while the click still counts as a user gesture, so
    // the popup blocker lets it through once the link exists.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy("google");
    try {
      const url = await createLink();
      if (tab) tab.location.href = googleAddUrl(url);
      else window.location.href = googleAddUrl(url);
    } catch (err) {
      tab?.close();
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't make your calendar link." });
    } finally {
      setBusy(null);
    }
  }

  async function addToApple() {
    setNotice(null);
    setBusy("apple");
    try {
      const url = link?.url ?? (await createLink());
      window.location.href = webcal(url);
      setNotice({ tone: "info", text: "Calendar should open and ask to subscribe. If nothing happens, copy the link below instead." });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't make your calendar link." });
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice({ tone: "error", text: "Couldn't copy. Select the link and copy it yourself." });
    }
  }

  async function resetLink() {
    if (!confirm("Make a new link? Calendars using the old one will stop updating, so you'll need to add Arcadia again.")) return;
    setNotice(null);
    setBusy("reset");
    try {
      await createLink();
      setNotice({ tone: "info", text: "New link made. The old one no longer works." });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't make a new link." });
    } finally {
      setBusy(null);
    }
  }

  async function turnOff() {
    if (!confirm("Turn off the calendar link? Arcadia will stop updating in Google or Apple Calendar. Remove the calendar there too.")) return;
    setNotice(null);
    setBusy("off");
    try {
      await api("/api/calendar-export", { method: "DELETE" });
      setLink({ url: null, lastFetchedAt: null });
      setNotice({ tone: "info", text: "Link turned off." });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't turn it off." });
    } finally {
      setBusy(null);
    }
  }

  if (isGuest) {
    return (
      <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
        Create an account to see your study blocks and deadlines in Google Calendar or Apple Calendar.
      </p>
    );
  }

  const loading = link === null;

  return (
    <>
      <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
        See your study blocks and deadlines in Google Calendar or Apple Calendar. It&apos;s a private link, so it
        keeps up when Arcad moves things around.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <AppButton type="button" variant="primary" onClick={addToGoogle} loading={busy === "google"} disabled={loading}>
          Add to Google Calendar
        </AppButton>
        <AppButton type="button" variant="secondary" onClick={addToApple} loading={busy === "apple"} disabled={loading}>
          Add to Apple Calendar
        </AppButton>
      </div>

      {link?.url ? (
        <div className="mt-5 flex flex-col gap-3 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={link.url}
              aria-label="Your private calendar link"
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md px-3 py-2 font-mono text-[12px] outline-none"
              style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text-soft)" }}
            />
            <AppButton type="button" variant="secondary" onClick={copyLink}>
              {copied ? "Copied" : "Copy link"}
            </AppButton>
          </div>
          <p className="type-mono-label" style={{ color: "var(--app-text-faint)" }}>
            {link.lastFetchedAt
              ? `Last picked up by your calendar ${relativeTime(link.lastFetchedAt)}.`
              : "Not picked up by a calendar yet."}{" "}
            Google refreshes every few hours, Apple as often as you set. Outlook or another app? Add it by URL
            with this link. Keep it to yourself: anyone with it can see your plan.
          </p>
          <div className="flex flex-wrap gap-2">
            <AppButton type="button" variant="ghost" size="sm" onClick={resetLink} loading={busy === "reset"}>
              Make a new link
            </AppButton>
            <AppButton type="button" variant="ghost" size="sm" onClick={turnOff} loading={busy === "off"}>
              Turn off
            </AppButton>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p
          className="mt-3 text-[13px]"
          style={{ color: notice.tone === "error" ? "var(--app-danger)" : "var(--app-success)" }}
        >
          {notice.text}
        </p>
      ) : null}
    </>
  );
}

function relativeTime(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
