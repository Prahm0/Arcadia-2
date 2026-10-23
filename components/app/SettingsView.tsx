"use client";

import { useEffect, useState } from "react";
import { api, ApiError, saveCsrf } from "@/lib/api/client";
import { resetAnalytics } from "@/lib/analytics/events";
import type { CalendarFeed } from "@/lib/api/types";
import { updateProfile } from "@/lib/api/profile";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStudySky } from "@/lib/app/StudySkyProvider";
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
  DEFAULT_PUSH_PREFERENCES,
  enablePushCheckins,
  getPushSubscriptionStatus,
  pushCheckinsSupported,
  updatePushPreferences,
  type PushPreferences,
} from "@/lib/app/pushCheckins";
import {
  FocusGuard,
  describePicked,
  isHoldingFocus,
  releaseFocusGuard,
  useFocusGuardStatus,
  type FocusGuardStatus,
} from "@/lib/capacitor/focusGuard";
import { unlinkNativePush } from "@/lib/capacitor/nativePush";
import PageHeader from "./PageHeader";
import AppButton, { appButtonClass } from "./AppButton";
import SettingRow, { SettingIcons } from "./SettingRow";
import BlockTimesEditor from "./BlockTimesEditor";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isGuestEmail } from "@/lib/auth/guest";
import DeleteAccountModal from "./DeleteAccountModal";
import { useNativeIOS } from "@/lib/capacitor/platform";
import { getIosSubscriptionManagementUrl, logOutRevenueCat } from "@/lib/capacitor/revenuecat";
import { DeveloperFeedback, FeedbackForm } from "./Feedback";
import CalendarExport from "./CalendarExport";

interface AccountResponse {
  account: {
    email: string;
    displayName: string;
    theme: string;
    createdAt: string;
    lastSignInAt?: string;
  };
}

interface BlockedPerson {
  userId: string;
  displayName: string;
  blockedAt: string;
}

export default function SettingsView() {
  const router = useRouter();
  const { data, patch, reload } = useDashboardData();
  const [aiBusy, setAiBusy] = useState(false);
  async function saveAiConsent(allow: boolean) {
    setAiBusy(true);
    try {
      await updateProfile({ aiConsent: allow ? "granted" : "declined" });
      await reload();
    } finally {
      setAiBusy(false);
    }
  }
  const { mode, setMode } = useTheme();
  const { sky, update: updateSky } = useStudySky();

  useEffect(() => {
    if (window.location.hash !== "#help-feedback") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("help-feedback")?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const [account, setAccount] = useState<AccountResponse["account"] | null>(null);
  const [blockedPeople, setBlockedPeople] = useState<BlockedPerson[]>([]);
  const [blockedPeopleLoading, setBlockedPeopleLoading] = useState(true);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);
  // Settings only mounts in the browser, after the dashboard loads, so these
  // device preferences can be read straight away.
  const [soundOn, setSoundOn] = useState(isSoundEnabled);
  const [remindersOn, setRemindersOn] = useState(isReminderEnabled);
  const [permission, setPermission] = useState<NotificationPermissionState>(getPermissionState);
  const [leadMin, setLeadMin] = useState(getLeadMinutes);
  const [use24h, setUse24h] = useState(is24Hour);

  useEffect(() => {
    api<AccountResponse>("/api/account").then((r) => setAccount(r.account)).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    api<{ people: BlockedPerson[] }>("/api/study-rooms/blocked")
      .then((response) => { if (active) setBlockedPeople(response.people); })
      .catch(() => { if (active) setBlockedPeople([]); })
      .finally(() => { if (active) setBlockedPeopleLoading(false); });
    return () => { active = false; };
  }, []);

  async function unblockPerson(person: BlockedPerson) {
    setUnblockingUserId(person.userId);
    try {
      await api(`/api/study-rooms/blocked/${encodeURIComponent(person.userId)}`, { method: "DELETE" });
      setBlockedPeople((current) => current.filter((item) => item.userId !== person.userId));
    } finally {
      setUnblockingUserId(null);
    }
  }

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
  const [googleNotice, setGoogleNotice] = useState<{ tone: "info" | "error"; text: string } | null>(googleRedirectNotice);

  const tier = data.user.tier ?? "free";
  const hasPaidPlan = tier === "pro" || tier === "max";
  const hasSubscription = Boolean(data.user.hasSubscription);
  // Gifted Pro with no subscription behind it has nothing to manage or cancel.
  const giftedUntil = !hasSubscription && data.user.proBonusUntil
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long" }).format(new Date(data.user.proBonusUntil))
    : null;
  const nativeIOS = useNativeIOS();
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [pushPreferences, setPushPreferences] = useState<PushPreferences>(DEFAULT_PUSH_PREFERENCES);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [developerTierBusy, setDeveloperTierBusy] = useState(false);
  const [billingNotice, setBillingNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  async function changeDeveloperTier(next: "free" | "pro" | "max") {
    setDeveloperTierBusy(true);
    setBillingNotice(null);
    try {
      const response = await api<{ tier: "free" | "pro" | "max" }>("/api/billing/developer-tier", {
        method: "POST",
        body: JSON.stringify({ tier: next }),
      });
      patch((previous) => ({ ...previous, user: { ...previous.user, tier: response.tier } }));
      setBillingNotice({ tone: "info", text: `Developer plan switched to ${next[0].toUpperCase()}${next.slice(1)}.` });
    } catch (err) {
      setBillingNotice({
        tone: "error",
        text: err instanceof Error && err.message ? err.message : "Couldn't change the developer plan.",
      });
    } finally {
      setDeveloperTierBusy(false);
    }
  }

  // The billing webhook records the purchase (backend lib/posthog); this only
  // tidies the redirect's ?upgrade=success off the address.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") !== "success" || tier === "free") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("upgrade");
    window.history.replaceState({}, "", url.toString());
  }, [tier]);

  async function openBillingPortal() {
    setBillingBusy(true);
    setBillingNotice(null);
    try {
      if (nativeIOS) {
        const url = await getIosSubscriptionManagementUrl(data.user.id);
        if (!url) throw new Error("Your App Store subscription settings are not available yet.");
        window.open(url, "_blank", "noopener,noreferrer");
        setBillingBusy(false);
        return;
      }
      const response = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      if (response?.url) {
        window.location.href = response.url;
        return;
      }
      throw new Error("Portal URL missing.");
    } catch (err) {
      setBillingNotice({
        tone: "error",
        text: err instanceof Error && err.message ? err.message : nativeIOS ? "Couldn't open App Store subscription settings." : "Couldn't open the billing portal.",
      });
      setBillingBusy(false);
    }
  }

  // Calendar feed subscriptions (Apple, Canvas, Outlook, and any .ics URL).
  // Reads live from the dashboard, mutates via /api/calendar-feeds.
  const calendarFeeds = data.calendarFeeds ?? [];
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newFeedName, setNewFeedName] = useState("");
  const [showFeedForm, setShowFeedForm] = useState(false);
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

  const emailReminders = data.profile?.emailReminders !== false;

  async function saveEmailReminders(next: boolean) {
    setEmailBusy(true);
    setEmailNotice(null);
    try {
      await updateProfile({ emailReminders: next });
      patch((prev) => ({ ...prev, profile: prev.profile ? { ...prev.profile, emailReminders: next } : prev.profile }));
    } catch (err) {
      setEmailNotice({ tone: "error", text: err instanceof Error && err.message ? err.message : "Couldn't update email reminders." });
    } finally {
      setEmailBusy(false);
    }
  }

  async function enablePush() {
    setPushBusy(true);
    setPushNotice(null);
    try {
      const { endpoint, preferences } = await enablePushCheckins();
      setPushEndpoint(endpoint);
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

  // Off means every subject's weekly study is 0: only deadlines and exams get blocks.
  const fillsFreeTime = data.subjects.some((subject) => (subject.weeklyMinutes ?? 0) > 0);
  const [planBusy, setPlanBusy] = useState(false);
  async function saveFillFreeTime(next: boolean) {
    setPlanBusy(true);
    try {
      for (const subject of data.subjects) {
        // Back on: each subject returns to its usual year-level amount.
        await api(`/api/subjects/${encodeURIComponent(subject.id)}`, { method: "PATCH", body: JSON.stringify({ weeklyMinutes: next ? null : 0 }) });
      }
      await reload();
    } finally {
      setPlanBusy(false);
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
      setShowFeedForm(false);
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

  // The OAuth callback comes back with ?google=connected (or upgrade, denied):
  // its notice is read on first render; here the param is stripped once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const flag = new URLSearchParams(window.location.search).get("google");
    if (!flag) return;
    if (flag === "connected") void reload();
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState({}, "", url.toString());
  }, [reload]);

  function connectGoogle() {
    if (typeof window === "undefined") return;
    // /api/google/connect issues a redirect, so navigate the whole tab there.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- an API route, not a page
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
      body: "This is what a schedule reminder will look like.",
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
    void logOutRevenueCat().catch((error) => {
      console.warn("[revenuecat] sign-out failed", error);
    });
    // iOS app: unlink this phone's check-ins and lift any app block, while
    // the session can still do it.
    await Promise.all([
      unlinkNativePush().catch((error) => console.warn("[native-push] unlink failed", error)),
      releaseFocusGuard(),
    ]);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    saveCsrf(null);
    resetAnalytics();
    router.push("/login");
  }

  return (
    <>
      <PageHeader width={720}
        title="Settings"
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
              You&apos;re using a guest account.
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
              {isGuest ? <Hint>Guest accounts have no email. Create an account to add one and save your progress.</Hint> : null}
            </Field>
            {!isGuest && !data.user.hasSubscription ? (
              <div className="border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                <SettingRow icon={SettingIcons.friends} title="Invite friends" detail="Earn 7 days of Pro when a friend finishes setup.">
                  <AppButton variant="secondary" onClick={() => router.push("/app/invite")}>Invite friends</AppButton>
                </SettingRow>
              </div>
            ) : null}
            <div className="border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
              <SettingRow icon={SettingIcons.exit} title="Sign out" detail="Signs out this device. Your data stays safe.">
                <AppButton variant="secondary" onClick={signOut}>Sign out</AppButton>
              </SettingRow>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader label="Appearance" />
          <div className="grid grid-cols-3 gap-2">
            {([["light", "Day"], ["system", "Match phone"], ["dark", "Night"]] as Array<[ThemeMode, string]>).map(([option, label]) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className="rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors"
                style={{
                  background: mode === option ? "var(--app-accent-soft)" : "transparent",
                  color: mode === option ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                  border: "1px solid var(--app-border)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {sky ? (
            <div className="mt-4">
              <PreferenceToggle
                label="Ambient motion"
                detail="Slow drifting stars in your constellations."
                checked={sky.preferences.ambientMotion}
                onChange={(ambientMotion) => void updateSky({ ambientMotion })}
              />
            </div>
          ) : null}
        </Card>

        {data.terms?.length ? (
          <Card>
            <SectionHeader label="School holidays" />
            <p className="mb-3 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              What happens to your plan in the holidays. Deadlines always keep their time.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["normal", "Usual plan"],
                ["light", "Lighter"],
                ["off", "Take a break"],
              ] as const).map(([option, label]) => {
                const current = (data.profile?.holidayMode ?? "normal") === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={current}
                    onClick={() => void updateProfile({ holidayMode: option }).then(() => reload())}
                    className="rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors"
                    style={{
                      background: current ? "var(--app-accent-soft)" : "transparent",
                      color: current ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                      border: "1px solid var(--app-border)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Card>
        ) : null}

        <Card>
          <SectionHeader label="Blocked people" />
          <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            Their messages are hidden from you in every study room. You can unblock them here any time.
          </p>
          {blockedPeopleLoading ? <p className="mt-3 text-[12px]" style={{ color: "var(--app-text-faint)" }}>Loading blocked people…</p> : blockedPeople.length === 0 ? <p className="mt-3 text-[12px]" style={{ color: "var(--app-text-faint)" }}>You haven&apos;t blocked anyone.</p> : <ul className="mt-3 flex flex-col gap-2">{blockedPeople.map((person) => <li key={person.userId} className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}><span className="min-w-0 truncate text-[13px]" style={{ color: "var(--app-text)" }}>{person.displayName}</span><AppButton variant="ghost" loading={unblockingUserId === person.userId} onClick={() => void unblockPerson(person)}>Unblock</AppButton></li>)}</ul>}
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

        <Card id="study-plan" className="scroll-mt-24">
          <SectionHeader label="Study plan" />
          <PreferenceToggle
            label="Fill my free time with study"
            detail={fillsFreeTime
              ? "Arcadia spreads study for every subject across your week, and plans prep before deadlines."
              : "Off: you plan your own days. Arcadia only adds prep before deadlines and exams."}
            checked={fillsFreeTime}
            disabled={planBusy}
            onChange={(next) => void saveFillFreeTime(next)}
          />
        </Card>

        <Card id="calendars" className="scroll-mt-24">
          <SectionHeader label="Calendars" />
          <CalendarExport isGuest={isGuest} />

          <div className="mt-5 flex flex-col gap-4 border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
            {!hasPaidPlan ? <PlanGate onUpgrade={() => router.push("/app/pricing")} /> : null}
            <SettingRow
              icon={SettingIcons.calendar}
              title="Google Calendar"
              detail={google.connected
                ? google.lastSyncAt
                  ? `Connected. Last sync ${relativeTime(google.lastSyncAt)}.`
                  : "Connected. First sync running."
                : "Bring your events in so Arcadia plans around them."}
            >
              {google.connected ? (
                <>
                  <AppButton type="button" variant="secondary" onClick={syncGoogle} loading={googleBusy === "sync"} disabled={!hasPaidPlan}>Sync now</AppButton>
                  <AppButton type="button" variant="ghost" onClick={disconnectGoogle} loading={googleBusy === "disconnect"}>Disconnect</AppButton>
                </>
              ) : (
                <AppButton type="button" variant="primary" onClick={connectGoogle} disabled={!hasPaidPlan}>Connect</AppButton>
              )}
            </SettingRow>
            {googleNotice ? (
              <p className="text-[13px]" style={{ color: googleNotice.tone === "error" ? "var(--app-danger)" : "var(--app-success)" }}>
                {googleNotice.text}
              </p>
            ) : null}

            <SettingRow icon={SettingIcons.link} title="Apple, Outlook or Canvas" detail="Paste a calendar link to bring its events in.">
              <AppButton type="button" variant="secondary" onClick={() => setShowFeedForm((open) => !open)} disabled={!hasPaidPlan}>
                {showFeedForm ? "Cancel" : "Add link"}
              </AppButton>
            </SettingRow>
            {showFeedForm ? (
              <form onSubmit={addCalendarFeed} className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="url"
                    required
                    autoFocus
                    value={newFeedUrl}
                    onChange={(event) => setNewFeedUrl(event.target.value)}
                    placeholder="Paste a calendar link (.ics or webcal)"
                    className="min-w-0 flex-1 rounded-md px-3 py-2.5 text-[13.5px] outline-none"
                    style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                    disabled={addingFeed || !hasPaidPlan}
                  />
                  <AppButton type="submit" variant="primary" loading={addingFeed} disabled={!hasPaidPlan || !newFeedUrl.trim()}>
                    Add
                  </AppButton>
                </div>
                <p className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>
                  Apple Calendar: tap share, turn on Public Calendar, copy the link.
                </p>
              </form>
            ) : null}
          </div>

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
          <SectionHeader label="AI" />
          <PreferenceToggle
            label="Let Arcadia use AI"
            detail="Sends your first name, year level, school, subjects, schedule, tasks, messages to Arcad and uploaded notes to OpenAI to build your plan and power Arcad. Never your email, password or payment details. OpenAI doesn't train on it. Off: you get a basic plan without Arcad."
            checked={data.profile?.aiConsent === "granted"}
            disabled={aiBusy}
            onChange={(next) => void saveAiConsent(next)}
          />
        </Card>

        <Card>
          <SectionHeader label="Feedback sounds" />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
                Completion tick
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                A quiet click when you mark a study block or task done. Off doesn&apos;t affect the visual burst.
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

        {/* The iOS app has no browser notifications; push check-ins cover it. */}
        {nativeIOS ? null : (
          <Card>
            <SectionHeader label="Schedule reminders" />
            {!notificationsSupported() ? (
              <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                This browser doesn&apos;t support notifications. On iOS Safari, add the app to your Home Screen to unlock them.
              </p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
                      Remind me before study and sleep
                    </p>
                    <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                      A quick browser notification before study blocks and bedtime while Arcadia is open in a tab.
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
                          className="rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors"
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
        )}

        {isGuest ? null : (
          <Card>
            <SectionHeader label="Push check-ins" />
            {!hasPaidPlan ? (
              <SettingRow icon={SettingIcons.bell} title="Check-ins on this device" detail="A nudge before study or sleep, and when a session needs logging. Included with Pro and Max.">
                <AppButton type="button" variant="secondary" onClick={() => router.push("/app/pricing")}>See plans</AppButton>
              </SettingRow>
            ) : !pushCheckinsSupported() ? (
              <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                This browser doesn&apos;t support push check-ins. On iPhone, add Arcadia to your Home Screen first.
              </p>
            ) : !pushEndpoint ? (
              <SettingRow icon={SettingIcons.bell} title="Check-ins on this device" detail="Get them even when Arcadia is closed. Choose which ones after you turn them on.">
                <AppButton type="button" variant="primary" onClick={() => void enablePush()} loading={pushBusy}>Turn on</AppButton>
              </SettingRow>
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
                      label="Before study or sleep"
                      detail="A heads-up five minutes before your next study block or bedtime."
                      checked={pushPreferences.sessionStartEnabled}
                      disabled={pushBusy || !pushPreferences.checkinsEnabled}
                      onChange={(sessionStartEnabled) => void savePushPreferences({ ...pushPreferences, sessionStartEnabled })}
                    />
                    <PreferenceToggle
                      label="If I haven't started"
                      detail="A nudge ten minutes into a study block you haven't started yet."
                      checked={pushPreferences.lateStartEnabled}
                      disabled={pushBusy || !pushPreferences.checkinsEnabled}
                      onChange={(lateStartEnabled) => void savePushPreferences({ ...pushPreferences, lateStartEnabled })}
                    />
                    <PreferenceToggle
                      label="Session follow-ups"
                      detail="A nudge when a session needs an outcome, including after two hours."
                      checked={pushPreferences.sessionFollowupEnabled}
                      disabled={pushBusy || !pushPreferences.checkinsEnabled}
                      onChange={(sessionFollowupEnabled) => void savePushPreferences({ ...pushPreferences, sessionFollowupEnabled })}
                    />
                    <PreferenceToggle
                      label="Streak on the line"
                      detail="An evening heads-up when today's plan won't keep your streak going."
                      checked={pushPreferences.streakEnabled}
                      disabled={pushBusy || !pushPreferences.checkinsEnabled}
                      onChange={(streakEnabled) => void savePushPreferences({ ...pushPreferences, streakEnabled })}
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
            <SectionHeader label="Email reminders" />
            <PreferenceToggle
              label="Study emails"
              detail="One useful email a day at most: a short plan Monday to Saturday, then your weekly recap on Sunday."
              checked={emailReminders}
              disabled={emailBusy}
              onChange={(next) => void saveEmailReminders(next)}
            />
            <Notice notice={emailNotice} />
          </Card>
        )}

        {nativeIOS ? <FocusGuardSection /> : null}

        {isGuest ? null : (
          <Card id="billing" className="scroll-mt-24">
            <SectionHeader label="Plan & billing" />
            <div className="flex flex-col gap-3">
              <SettingRow
                icon={SettingIcons.star}
                title={`Arcadia ${data.user.developerAccess ? `Developer · ${tier === "free" ? "Free" : tier === "pro" ? "Pro" : "Max"}` : tier === "free" ? "Free" : tier === "pro" ? "Pro" : "Max"}`}
                detail={data.user.developerAccess
                  ? "Developer access lets you switch feature tiers for free. Any existing subscription is billed separately."
                  : giftedUntil
                  ? `Free Pro until ${giftedUntil}. It's not a subscription, so there's nothing to cancel and you won't be charged.`
                  : tier === "free"
                  ? "2 Arcad messages per day. Upgrade any time."
                  : tier === "pro"
                  ? "20 Arcad messages per day, calendar sync, uploads."
                  : "100 Arcad messages per day, unlimited flashcard decks."}
              >
                  {(tier === "free" || giftedUntil) && !data.user.developerAccess ? (
                    <AppButton
                      variant="primary"
                      onClick={() => router.push("/app/pricing")}
                    >
                      See plans
                    </AppButton>
                  ) : null}
                  {/* App Store subscribers switch tiers from the plans page,
                      which the header's Pro/Max badge doesn't lead to. */}
                  {nativeIOS && hasSubscription && data.user.billingProvider === "app_store" ? (
                    <AppButton variant="primary" onClick={() => router.push("/app/pricing")}>
                      Change plan
                    </AppButton>
                  ) : null}
                  {hasSubscription && (!nativeIOS || data.user.billingProvider === "app_store") ? (
                    <AppButton
                      variant="secondary"
                      onClick={openBillingPortal}
                      loading={billingBusy}
                    >
                      {nativeIOS ? "Manage in App Store" : "Manage subscription"}
                    </AppButton>
                  ) : null}
              </SettingRow>
              <Notice notice={billingNotice} />
              {data.user.developerAccess ? (
                <label className="flex flex-col gap-1.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                  Developer test plan
                  <select
                    value={tier}
                    disabled={developerTierBusy}
                    onChange={(event) => void changeDeveloperTier(event.target.value as "free" | "pro" | "max")}
                    className="w-full max-w-xs rounded-md px-3 py-2 text-[13.5px] outline-none disabled:opacity-60"
                    style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="max">Max</option>
                  </select>
                </label>
              ) : null}
              {nativeIOS && hasSubscription && data.user.billingProvider !== "app_store" ? (
                <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                  This plan was purchased outside the App Store. Manage it where you bought it.
                </p>
              ) : null}
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

        <Card id="help-feedback" className="scroll-mt-24">
          <SectionHeader label="Help & feedback" />
          <FeedbackForm email={isGuest ? null : data.user.email} />
        </Card>

        {data.user.developerAccess ? (
          <Card>
            <SectionHeader label="Developer metrics" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                Signups, active students, plans, retention and AI spend.
              </p>
              <Link href="/app/admin" className={appButtonClass("secondary")}>Open metrics</Link>
            </div>
          </Card>
        ) : null}

        {data.user.developerAccess ? (
          <Card>
            <SectionHeader label="Developer feedback" />
            <DeveloperFeedback />
          </Card>
        ) : null}

        {(
          <Card>
            <SectionHeader label="Danger zone" />
            <SettingRow icon={SettingIcons.trash} title="Delete account" detail={isGuest ? "Permanently remove this guest account and its plan." : "Permanently remove your account and all Arcadia data."}>
              <AppButton variant="danger" onClick={() => setDeleteAccountOpen(true)}>Delete account</AppButton>
            </SettingRow>
          </Card>
        )}
      </div>
      {deleteAccountOpen ? (
        <DeleteAccountModal
          hasPaidPlan={hasPaidPlan}
          billingProvider={data.user.billingProvider ?? null}
          isGuest={isGuest}
          onClose={() => setDeleteAccountOpen(false)}
          onManageSubscription={() => {
            setDeleteAccountOpen(false);
            void openBillingPortal();
          }}
        />
      ) : null}
    </>
  );
}

function Card({
  children,
  id,
  className,
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      data-settings-card
      className={`rounded-lg p-6${className ? ` ${className}` : ""}`}
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

/**
 * iOS app only, on every plan: block picked apps while a focus timer runs,
 * and a nudge for leaving mid-focus. Both live on the phone (FocusGuard
 * plugin), so there's nothing to save to the account.
 */
function FocusGuardSection() {
  const [status, setStatus] = useFocusGuardStatus();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const loaded = status !== null;

  // The Focus page links here (#focus-guard); the card only appears once the
  // phone has answered, after the page's own hash scroll has come and gone.
  useEffect(() => {
    if (!loaded || window.location.hash !== "#focus-guard") return;
    document.getElementById("focus-guard")?.scrollIntoView({ block: "start" });
  }, [loaded]);

  // An older build of the app, without the plugin.
  if (!status) return null;

  async function run(action: () => Promise<FocusGuardStatus>, done?: (next: FocusGuardStatus) => string | null) {
    setBusy(true);
    setNotice(null);
    try {
      const next = await action();
      setStatus(next);
      const text = done?.(next);
      if (text) setNotice({ tone: "info", text });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't update that." });
    } finally {
      setBusy(false);
    }
  }

  const pickApps = () =>
    run(() => FocusGuard.pickApps(), (next) =>
      next.cancelled ? null : next.blockingEnabled ? "Saved. They're blocked from your next study block." : "Nothing picked, so nothing is blocked.");

  const picked = status.appCount + status.categoryCount + status.websiteCount > 0;
  const blocking = status.blockingEnabled && picked;
  const until = status.active && status.blocking && status.endsAt
    ? new Date(status.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !is24Hour() })
    : null;

  return (
    <Card id="focus-guard" className="scroll-mt-24">
      <SectionHeader label="App blocking" />
      <div className="flex flex-col gap-5">
        {status.blockingSupported ? (
          <div>
            <PreferenceToggle
              label="Block apps during study blocks"
              detail={picked
                ? `${describePicked(status)} are blocked from the start of each study block until you tick it or it ends, and during focus timers. Nothing to start.`
                : "Pick the apps that pull you away. Every study block blocks them until you tick it or it ends."}
              checked={blocking}
              disabled={busy}
              onChange={(next) => void (next && !picked ? pickApps() : run(() => FocusGuard.setPreferences({ blockingEnabled: next })))}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <AppButton type="button" variant="secondary" onClick={() => void pickApps()} disabled={busy}>
                {picked ? "Change apps" : "Choose apps"}
              </AppButton>
              {until ? (
                <span className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
                  Blocked until {until}
                </span>
              ) : null}
              {/* A running timer here unblocks by pausing. This is for a block
                  left over from a timer this visit no longer knows about. A
                  study block unblocks by ticking it, or "5 more minutes". */}
              {until && !isHoldingFocus() && !status.blockId ? (
                <AppButton type="button" variant="ghost" onClick={() => void run(async () => {
                  await releaseFocusGuard();
                  return FocusGuard.status();
                })} disabled={busy}>
                  Unblock now
                </AppButton>
              ) : null}
            </div>
          </div>
        ) : null}
        {status.blockingSupported && picked ? <BlockTimesEditor /> : null}
        <PreferenceToggle
          label="Nudge me if I leave"
          detail="One nudge if you leave Arcadia mid-focus (locking your phone is fine), and a heads-up when the timer's done."
          checked={status.nudgesEnabled}
          disabled={busy}
          onChange={(nudgesEnabled) => void run(() => FocusGuard.setPreferences({ nudgesEnabled }))}
        />
      </div>
      <Notice notice={notice} />
    </Card>
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

/** The notice for ?google=… after the Google Calendar OAuth redirect, if there is one. */
function googleRedirectNotice(): { tone: "info" | "error"; text: string } | null {
  if (typeof window === "undefined") return null;
  const flag = new URLSearchParams(window.location.search).get("google");
  if (flag === "connected") return { tone: "info", text: "Google Calendar connected. Fixed events will appear on Schedule after the first sync." };
  if (flag === "upgrade") return { tone: "error", text: "Google Calendar sync needs a Pro or Max plan." };
  if (flag === "denied") return { tone: "error", text: "Google didn't grant access. You can try again anytime." };
  return null;
}
