"use client";

import { useEffect, useState } from "react";
import { api, ApiError, saveCsrf } from "@/lib/api/client";
import type { CalendarFeed } from "@/lib/api/types";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useTheme, type ThemeMode } from "@/lib/app/theme";
import { isSoundEnabled, playCompletionTick, setSoundEnabled } from "@/lib/app/completion";
import { is24Hour, set24Hour } from "@/lib/app/timeFormat";
import {
  getLeadMinutes,
  getPermissionState,
  isReminderEnabled,
  notificationsSupported,
  requestPermission,
  setLeadMinutes,
  setReminderEnabled,
  showNotification,
  type NotificationPermissionState,
} from "@/lib/app/notifications";
import {
  enablePushCheckins,
  getPushSubscriptionStatus,
  pushCheckinsSupported,
  updatePushPreferences,
  type PushPreferences,
} from "@/lib/app/pushCheckins";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import { useRouter } from "next/navigation";
import { isGuestEmail } from "@/lib/auth/guest";

interface AccountResponse {
  account: {
    email: string;
    displayName: string;
    theme: string;
    createdAt: string;
    lastSignInAt?: string;
  };
}

export default function SettingsView() {
  const router = useRouter();
  const { data, patch, reload } = useDashboardData();
  const { mode, setMode } = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const [account, setAccount] = useState<AccountResponse["account"] | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [remindersOn, setRemindersOn] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [leadMin, setLeadMin] = useState(10);
  const [use24h, setUse24h] = useState(false);

  useEffect(() => {
    api<AccountResponse>("/api/account").then((r) => setAccount(r.account)).catch(() => {});
    setSoundOn(isSoundEnabled());
    setRemindersOn(isReminderEnabled());
    setPermission(getPermissionState());
    setLeadMin(getLeadMinutes());
    setUse24h(is24Hour());
  }, []);

  function toggleTimeFormat(next: boolean) {
    setUse24h(next);
    set24Hour(next);
    // Force a re-render of anything holding a formatClock result already
    // committed to the DOM. router.refresh() re-runs server code too, which
    // is more than we need, but it's the simplest way to fan out.
    router.refresh();
  }

  function toggleSound(next: boolean) {
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playCompletionTick();
  }

  async function toggleReminders(next: boolean) {
    setRemindersOn(next);
    setReminderEnabled(next);
    if (next && permission === "default") {
      const result = await requestPermission();
      setPermission(result);
    }
  }

  function updateLead(next: number) {
    setLeadMin(next);
    setLeadMinutes(next);
  }

  const google = data.google ?? { connected: false, lastSyncAt: null };
  const isGuest = isGuestEmail(data.user.email);
  const [googleBusy, setGoogleBusy] = useState<"sync" | "disconnect" | null>(null);
  const [googleNotice, setGoogleNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const tier = data.user.tier ?? "free";
  const hasPaidPlan = tier === "pro" || tier === "max";
  const hasSubscription = Boolean(data.user.hasSubscription);
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [pushPreferences, setPushPreferences] = useState<PushPreferences>({
    checkinsEnabled: true,
    sessionStartEnabled: true,
    sessionFollowupEnabled: true,
  });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingNotice, setBillingNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function openBillingPortal() {
    setBillingBusy(true);
    setBillingNotice(null);
    try {
      const response = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      if (response?.url) {
        window.location.href = response.url;
        return;
      }
      throw new Error("Portal URL missing.");
    } catch (err) {
      setBillingNotice({
        tone: "error",
        text: err instanceof Error && err.message ? err.message : "Couldn't open the billing portal.",
      });
      setBillingBusy(false);
    }
  }

  // Calendar feed subscriptions (Apple, Canvas, Outlook, and any .ics URL).
  // Reads live from the dashboard, mutates via /api/calendar-feeds.
  const calendarFeeds = data.calendarFeeds ?? [];
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newFeedName, setNewFeedName] = useState("");
  const [addingFeed, setAddingFeed] = useState(false);
  const [feedBusy, setFeedBusy] = useState<string | null>(null);
  const [feedNotice, setFeedNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isGuest || !hasPaidPlan || !pushCheckinsSupported()) return;
    getPushSubscriptionStatus()
      .then((value) => {
        if (!value) return;
        setPushEndpoint(value.endpoint);
        setPushPreferences(value.preferences);
      })
      .catch(() => {});
  }, [hasPaidPlan, isGuest]);

  async function enablePush() {
    setPushBusy(true);
    setPushNotice(null);
    try {
      const endpoint = await enablePushCheckins();
      setPushEndpoint(endpoint);
      const preferences = { checkinsEnabled: true, sessionStartEnabled: true, sessionFollowupEnabled: true };
      setPushPreferences(preferences);
      setPushNotice({ tone: "info", text: "Check-ins enabled on this device." });
    } catch (err) {
      setPushNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't enable check-ins." });
    } finally {
      setPushBusy(false);
    }
  }

  async function savePushPreferences(next: PushPreferences) {
    if (!pushEndpoint) return;
    setPushBusy(true);
    setPushNotice(null);
    try {
      await updatePushPreferences(pushEndpoint, next);
      setPushPreferences(next);
    } catch (err) {
      setPushNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't update check-ins." });
    } finally {
      setPushBusy(false);
    }
  }

  async function addCalendarFeed(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = newFeedUrl.trim();
    if (!url) return;
    setAddingFeed(true);
    setFeedNotice(null);
    try {
      const response = await api<{ feed: CalendarFeed }>("/api/calendar-feeds", {
        method: "POST",
        body: JSON.stringify({ url, name: newFeedName.trim() || undefined }),
      });
      patch((prev) => ({
        ...prev,
        calendarFeeds: [...(prev.calendarFeeds ?? []), response.feed],
      }));
      setNewFeedUrl("");
      setNewFeedName("");
      if (response.feed.lastSyncError) {
        setFeedNotice({
          tone: "error",
          text: `Added, but the first sync failed: ${response.feed.lastSyncError}`,
        });
      } else {
        setFeedNotice({ tone: "info", text: "Calendar added and synced." });
      }
      await reload();
    } catch (err) {
      setFeedNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Couldn't add that calendar.",
      });
    } finally {
      setAddingFeed(false);
    }
  }

  async function syncCalendarFeed(id: string) {
    setFeedBusy(`sync:${id}`);
    setFeedNotice(null);
    try {
      const response = await api<{ feed: CalendarFeed; result: { error?: string; eventsWritten?: number } }>(
        `/api/calendar-feeds/${id}/sync`,
        { method: "POST" },
      );
      patch((prev) => ({
        ...prev,
        calendarFeeds: (prev.calendarFeeds ?? []).map((f) => (f.id === id ? response.feed : f)),
      }));
      if (response.result.error) {
        setFeedNotice({ tone: "error", text: response.result.error });
      } else {
        setFeedNotice({ tone: "info", text: "Synced." });
      }
      await reload();
    } catch (err) {
      setFeedNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Sync failed.",
      });
    } finally {
      setFeedBusy(null);
    }
  }

  async function removeCalendarFeed(feed: CalendarFeed) {
    if (!confirm(`Remove "${feed.name}"? Its imported events will disappear from Schedule.`)) return;
    setFeedBusy(`delete:${feed.id}`);
    setFeedNotice(null);
    try {
      await api(`/api/calendar-feeds/${feed.id}`, { method: "DELETE" });
      patch((prev) => ({
        ...prev,
        calendarFeeds: (prev.calendarFeeds ?? []).filter((f) => f.id !== feed.id),
      }));
      setFeedNotice({ tone: "info", text: "Calendar removed." });
      await reload();
    } catch (err) {
      setFeedNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Couldn't remove that calendar.",
      });
    } finally {
      setFeedBusy(null);
    }
  }

  // When the OAuth callback redirects back to "/", it appends ?google=connected
  // or ?google=denied. Surface that once, then strip the param.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("google");
    if (!flag) return;
    if (flag === "connected") {
      setGoogleNotice({ tone: "info", text: "Google Calendar connected. Fixed events will appear on Schedule after the first sync." });
      void reload();
    } else if (flag === "upgrade") {
      setGoogleNotice({ tone: "error", text: "Google Calendar sync needs a Pro or Max plan." });
    } else if (flag === "denied") {
      setGoogleNotice({ tone: "error", text: "Google didn't grant access. You can try again anytime." });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState({}, "", url.toString());
  }, [reload]);

  function connectGoogle() {
    if (typeof window === "undefined") return;
    // /api/google/connect issues a redirect, so navigate the whole tab there.
    window.location.href = "/api/google/connect";
  }

  async function syncGoogle() {
    setGoogleBusy("sync");
    setGoogleNotice(null);
    try {
      const response = await api<{ ok: boolean; lastSyncAt?: string }>("/api/google/sync", { method: "POST" });
      // Optimistic reflect
      patch((prev) => ({
        ...prev,
        google: { connected: true, lastSyncAt: response.lastSyncAt || new Date().toISOString() },
      }));
      await reload();
      setGoogleNotice({ tone: "info", text: "Synced." });
    } catch (err) {
      setGoogleNotice({
        tone: "error",
        text: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Sync failed.",
      });
    } finally {
      setGoogleBusy(null);
    }
  }

  async function disconnectGoogle() {
    if (!confirm("Disconnect Google Calendar? Imported events will be removed from Schedule.")) return;
    setGoogleBusy("disconnect");
    setGoogleNotice(null);
    try {
      await api("/api/google/connection", { method: "DELETE" });
      patch((prev) => ({ ...prev, google: { connected: false, lastSyncAt: null } }));
      await reload();
      setGoogleNotice({ tone: "info", text: "Google Calendar disconnected." });
    } catch (err) {
      setGoogleNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Couldn't disconnect.",
      });
    } finally {
      setGoogleBusy(null);
    }
  }

  async function testReminder() {
    let state = getPermissionState();
    if (state === "default") state = await requestPermission();
    setPermission(state);
    if (state !== "granted") return;
    showNotification({
      title: "Test reminder",
      body: "This is what a session reminder will look like.",
      tag: "arcadia:test",
    });
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordNotice(null);
    try {
      await api("/api/account/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordNotice({ tone: "info", text: "Password updated." });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordNotice({ tone: "error", text: err instanceof Error ? err.message : "Failed." });
    } finally {
      setSavingPassword(false);
    }
  }

  async function signOut() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    saveCsrf(null);
    router.push("/login");
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Account & preferences"
        meta={
          account
            ? isGuest
              ? "Guest session, nothing you do here is saved after you sign out."
              : `Signed in as ${account.email}`
            : undefined
        }
      />

      {isGuest ? (
        <div className="mx-auto w-full max-w-[720px] px-6 pt-6 sm:px-10">
          <div
            className="rounded-lg p-5"
            style={{
              background: "var(--app-accent-soft)",
              boxShadow: "var(--elev-1)",
            }}
          >
            <p className="text-[14px] font-medium" style={{ color: "var(--app-accent-strong)" }}>
              You're using a guest account.
            </p>
            <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              Your tasks, focus streak and Arcad chats live only in this session. Create an account to keep them.
            </p>
            <div className="mt-4">
              <AppButton variant="primary" onClick={() => router.push("/register")}>
                Create an account
              </AppButton>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-6 py-8 sm:px-10">
        <Card>
          <SectionHeader label="Account" />
          <div className="flex flex-col gap-4">
            <Field label="Email">
              <Input value={isGuest ? "" : data.user.email} onChange={() => {}} disabled />
              <Hint>
                {isGuest
                  ? "Guest accounts have no email. Create an account to add one and save your progress."
                  : "Email changes go through verification, use the change-email flow."}
              </Hint>
            </Field>
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                Your name, subjects, goals and what Arcad knows about you are on your profile.
              </p>
              <AppButton variant="secondary" onClick={() => router.push("/app/profile")}>
                Open profile
              </AppButton>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader label="Appearance" />
          <div className="grid grid-cols-3 gap-2">
            {(["light", "system", "dark"] as ThemeMode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className="rounded-md px-3 py-2.5 text-[13.5px] font-medium capitalize transition-colors"
                style={{
                  background: mode === option ? "var(--app-accent-soft)" : "transparent",
                  color: mode === option ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                  border: "1px solid var(--app-border)",
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader label="Time format" />
          <div className="grid grid-cols-2 gap-2">
            {([{ v: false, label: "12-hour", sub: "1:45 pm" }, { v: true, label: "24-hour", sub: "13:45" }] as const).map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => toggleTimeFormat(option.v)}
                className="flex flex-col items-start rounded-md px-3 py-2.5 text-left transition-colors"
                style={{
                  background: use24h === option.v ? "var(--app-accent-soft)" : "transparent",
                  color: use24h === option.v ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                  border: "1px solid var(--app-border)",
                }}
              >
                <span className="text-[13.5px] font-medium">{option.label}</span>
                <span className="text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
                  {option.sub}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader label="Google Calendar" />
          {!hasPaidPlan ? <PlanGate onUpgrade={() => router.push("/app/pricing")} /> : null}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: google.connected ? "var(--app-success)" : "var(--app-text-faint)" }}
                />
                <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
                  {google.connected ? "Connected" : "Not connected"}
                </p>
              </div>
              <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                {google.connected
                  ? google.lastSyncAt
                    ? `Last sync ${relativeTime(google.lastSyncAt)}. Imported events show as fixed on Schedule; study blocks Arcadia creates are written to a dedicated Arcadia calendar.`
                    : "Just connected. First sync is running in the background, refresh in a minute."
                  : "Import school, work, and personal events so Arcadia plans study around them. Arcadia writes generated study blocks to its own Arcadia calendar; nothing else is changed."}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {google.connected ? (
                <>
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={syncGoogle}
                    loading={googleBusy === "sync"}
                    disabled={!hasPaidPlan}
                  >
                    Sync now
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="ghost"
                    onClick={disconnectGoogle}
                    loading={googleBusy === "disconnect"}
                  >
                    Disconnect
                  </AppButton>
                </>
              ) : (
                <AppButton type="button" variant="primary" onClick={connectGoogle} disabled={!hasPaidPlan}>
                  Connect Google Calendar
                </AppButton>
              )}
            </div>
          </div>
          {googleNotice ? (
            <p
              className="mt-3 text-[13px]"
              style={{ color: googleNotice.tone === "error" ? "var(--app-danger)" : "var(--app-success)" }}
            >
              {googleNotice.text}
            </p>
          ) : null}
        </Card>

        <Card>
          <SectionHeader label="Calendar subscriptions" />
          {!hasPaidPlan ? <PlanGate onUpgrade={() => router.push("/app/pricing")} /> : null}
          <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            Paste any calendar URL, Apple, Canvas, Outlook, or a per-calendar
            Google link, and Arcadia will pull its events in as fixed blocks on
            Schedule. Read-only, so nothing is written back.
          </p>

          <form onSubmit={addCalendarFeed} className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="url"
                required
                value={newFeedUrl}
                onChange={(event) => setNewFeedUrl(event.target.value)}
                placeholder="https://p01-calendars.icloud.com/…/calendar.ics"
                className="flex-1 rounded-md px-3 py-2.5 text-[13.5px] outline-none"
                style={{
                  background: "var(--app-surface-soft)",
                  boxShadow: "var(--elev-inset)",
                  color: "var(--app-text)",
                }}
                disabled={addingFeed || !hasPaidPlan}
              />
              <input
                type="text"
                value={newFeedName}
                onChange={(event) => setNewFeedName(event.target.value)}
                placeholder="Label (optional)"
                maxLength={60}
                className="rounded-md px-3 py-2.5 text-[13.5px] outline-none sm:w-[180px]"
                style={{
                  background: "var(--app-surface-soft)",
                  boxShadow: "var(--elev-inset)",
                  color: "var(--app-text)",
                }}
                disabled={addingFeed || !hasPaidPlan}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="type-mono-label" style={{ color: "var(--app-text-faint)" }}>
                Apple Calendar → share icon → &ldquo;Public Calendar&rdquo; → copy URL. Canvas →
                calendar page → &ldquo;Calendar feed&rdquo; link.
              </p>
              <AppButton
                type="submit"
                variant="primary"
                loading={addingFeed}
                disabled={!hasPaidPlan || !newFeedUrl.trim()}
              >
                Add calendar
              </AppButton>
            </div>
          </form>

          {calendarFeeds.length > 0 ? (
            <ul className="mt-5 flex flex-col gap-3">
              {calendarFeeds.map((feed) => (
                <li
                  key={feed.id}
                  className="flex flex-wrap items-center gap-3 rounded-md px-3.5 py-3"
                  style={{
                    background: "var(--app-surface-soft)",
                    boxShadow: "var(--elev-inset)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ background: feed.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
                      {feed.name}
                    </p>
                    <p className="mt-0.5 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
                      {feed.lastSyncError
                        ? `⚠ ${feed.lastSyncError}`
                        : feed.lastSyncAt
                          ? `Last sync ${relativeTime(feed.lastSyncAt)}`
                          : "Waiting for first sync"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AppButton
                      type="button"
                      variant="ghost"
                      onClick={() => void syncCalendarFeed(feed.id)}
                      loading={feedBusy === `sync:${feed.id}`}
                      disabled={!hasPaidPlan}
                    >
                      Sync now
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="ghost"
                      onClick={() => void removeCalendarFeed(feed)}
                      loading={feedBusy === `delete:${feed.id}`}
                    >
                      Remove
                    </AppButton>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {feedNotice ? (
            <p
              className="mt-3 text-[13px]"
              style={{ color: feedNotice.tone === "error" ? "var(--app-danger)" : "var(--app-success)" }}
            >
              {feedNotice.text}
            </p>
          ) : null}
        </Card>

        <Card>
          <SectionHeader label="Feedback sounds" />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
                Completion tick
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                A quiet click when you mark a study block or task done. Off doesn't affect the visual burst.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={soundOn}
              onClick={() => toggleSound(!soundOn)}
              className="inset-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
              style={{
                background: soundOn ? "var(--app-accent)" : "var(--app-surface-soft)",
              }}
            >
              <span
                aria-hidden="true"
                className="inline-block h-5 w-5 transform rounded-full surface-raised transition-transform"
                style={{ transform: soundOn ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        </Card>

        <Card>
          <SectionHeader label="Session reminders" />
          {!notificationsSupported() ? (
            <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
              This browser doesn't support notifications. On iOS Safari, add the app to your Home Screen to unlock them.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
                    Remind me before each study block
                  </p>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                    A quick browser notification while Arcadia is open in a tab. Push notifications while the app is closed are a follow-up.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={remindersOn}
                  onClick={() => void toggleReminders(!remindersOn)}
                  className="inset-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                  style={{
                    background: remindersOn ? "var(--app-accent)" : "var(--app-surface-soft)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-5 w-5 transform rounded-full surface-raised transition-transform"
                    style={{ transform: remindersOn ? "translateX(22px)" : "translateX(2px)" }}
                  />
                </button>
              </div>

              {remindersOn ? (
                <div className="mt-4">
                  <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Lead time</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[5, 10, 15, 30].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateLead(option)}
                        className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                        style={{
                          background: leadMin === option ? "var(--app-accent-soft)" : "transparent",
                          color: leadMin === option ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                          border: `1px solid ${leadMin === option ? "transparent" : "var(--app-border-strong)"}`,
                        }}
                      >
                        {option} min before
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
                  {permission === "granted"
                    ? "Browser: allowed"
                    : permission === "denied"
                      ? "Browser: blocked, enable notifications in your browser settings for this site"
                      : permission === "unsupported"
                        ? "Browser: unsupported"
                        : "Browser: not asked yet"}
                </span>
                {permission !== "denied" ? (
                  <AppButton type="button" variant="secondary" onClick={testReminder}>
                    Send a test
                  </AppButton>
                ) : null}
              </div>
            </>
          )}
        </Card>

        {isGuest ? null : (
          <Card>
            <SectionHeader label="Push check-ins" />
            {!hasPaidPlan ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13.5px] leading-5" style={{ color: "var(--app-text-muted)" }}>
                  Get a check-in before a study block and follow-ups when a session needs logging. Included with Pro and Max.
                </p>
                <AppButton type="button" variant="secondary" onClick={() => router.push("/app/pricing")}>See plans</AppButton>
              </div>
            ) : !pushCheckinsSupported() ? (
              <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                This browser doesn&apos;t support push check-ins. On iPhone, add Arcadia to your Home Screen first.
              </p>
            ) : !pushEndpoint ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13.5px] leading-5" style={{ color: "var(--app-text-muted)" }}>
                  Receive check-ins even when Arcadia is closed. You can choose which reminders you get after enabling it.
                </p>
                <AppButton type="button" variant="primary" onClick={() => void enablePush()} loading={pushBusy}>
                  Enable check-ins
                </AppButton>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <PreferenceToggle
                  label="Enable check-ins"
                  detail="Allow Arcad to send push notifications to this device."
                  checked={pushPreferences.checkinsEnabled}
                  disabled={pushBusy}
                  onChange={(checkinsEnabled) => void savePushPreferences({ ...pushPreferences, checkinsEnabled })}
                />
                <div className="border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                  <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Notification types</p>
                  <div className="mt-3 flex flex-col gap-4">
                    <PreferenceToggle
                      label="Before a study block"
                      detail="A heads-up five minutes before your next session."
                      checked={pushPreferences.sessionStartEnabled}
                      disabled={pushBusy || !pushPreferences.checkinsEnabled}
                      onChange={(sessionStartEnabled) => void savePushPreferences({ ...pushPreferences, sessionStartEnabled })}
                    />
                    <PreferenceToggle
                      label="Session follow-ups"
                      detail="A nudge when a session needs an outcome, including after two hours."
                      checked={pushPreferences.sessionFollowupEnabled}
                      disabled={pushBusy || !pushPreferences.checkinsEnabled}
                      onChange={(sessionFollowupEnabled) => void savePushPreferences({ ...pushPreferences, sessionFollowupEnabled })}
                    />
                  </div>
                </div>
              </div>
            )}
            <Notice notice={pushNotice} />
          </Card>
        )}

        {isGuest ? null : (
          <Card>
            <SectionHeader label="Plan & billing" />
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--app-text)" }}>
                    Arcadia {tier === "free" ? "Free" : tier === "pro" ? "Pro" : "Max"}
                  </p>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                    {tier === "free"
                      ? "2 Arcad messages per day. Upgrade any time."
                      : tier === "pro"
                      ? "20 Arcad messages per day, calendar sync, uploads."
                      : "100 Arcad messages per day, voice mode, tutor mode."}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <Notice notice={billingNotice} />
                <div className="flex gap-2">
                  {tier === "free" ? (
                    <AppButton
                      variant="primary"
                      onClick={() => router.push("/app/pricing")}
                    >
                      See plans
                    </AppButton>
                  ) : null}
                  {hasSubscription ? (
                    <AppButton
                      variant="secondary"
                      onClick={openBillingPortal}
                      loading={billingBusy}
                    >
                      Manage subscription
                    </AppButton>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>
        )}

        {isGuest ? null : (
          <Card>
            <SectionHeader label="Password" />
            <form onSubmit={changePassword} className="flex flex-col gap-4">
              <Field label="Current password">
                <Input value={currentPassword} onChange={setCurrentPassword} type="password" autoComplete="current-password" />
              </Field>
              <Field label="New password">
                <Input value={newPassword} onChange={setNewPassword} type="password" autoComplete="new-password" minLength={10} />
                <Hint>At least 10 characters.</Hint>
              </Field>
              <div className="flex items-center justify-between pt-2">
                <Notice notice={passwordNotice} />
                <AppButton type="submit" variant="primary" loading={savingPassword} disabled={!currentPassword || !newPassword}>Update</AppButton>
              </div>
            </form>
          </Card>
        )}

        <Card>
          <SectionHeader label="Session" />
          <div className="flex items-center justify-between">
            <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
              Sign out of this device. Your data stays safe on the server.
            </p>
            <AppButton variant="secondary" onClick={signOut}>Sign out</AppButton>
          </div>
        </Card>
      </div>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-6"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="type-eyebrow mb-4" style={{ color: "var(--app-text-muted)" }}>
      {label}
    </h2>
  );
}

function PreferenceToggle({
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>{label}</p>
        <p className="mt-1 text-[13px] leading-5" style={{ color: "var(--app-text-muted)" }}>{detail}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="inset-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: checked ? "var(--app-accent)" : "var(--app-surface-soft)" }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-5 transform rounded-full surface-raised transition-transform"
          style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  );
}

function PlanGate({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-md px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
    >
      <p className="text-[13px]">
        Calendar sync is included with Pro and Max. Upgrade to plan around your real timetable.
      </p>
      <AppButton type="button" variant="primary" onClick={onUpgrade}>
        See plans
      </AppButton>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function Input({
  value, onChange, type = "text", disabled = false, autoComplete, minLength,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      autoComplete={autoComplete}
      minLength={minLength}
      className="w-full rounded-md px-3 py-2.5 text-[14.5px] outline-none disabled:opacity-60"
      style={{
        background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)",
        color: "var(--app-text)",
      }}
    />
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1.5 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>{children}</span>;
}

function Notice({ notice }: { notice: { tone: "info" | "error"; text: string } | null }) {
  if (!notice) return <span />;
  return (
    <span
      className="text-[13px]"
      style={{ color: notice.tone === "error" ? "var(--app-danger)" : "var(--app-success)" }}
    >
      {notice.text}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
