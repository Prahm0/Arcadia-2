"use client";

import { useEffect, useState } from "react";
import { api, saveCsrf } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useTheme, type ThemeMode } from "@/lib/app/theme";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import { useRouter } from "next/navigation";

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
  const { data, reload } = useDashboardData();
  const { mode, setMode } = useTheme();
  const [name, setName] = useState(data.user.name);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const [account, setAccount] = useState<AccountResponse["account"] | null>(null);

  useEffect(() => {
    api<AccountResponse>("/api/account").then((r) => setAccount(r.account)).catch(() => {});
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileNotice(null);
    try {
      await api("/api/account", { method: "PATCH", body: JSON.stringify({ name }) });
      setProfileNotice({ tone: "info", text: "Saved." });
      await reload();
    } catch (err) {
      setProfileNotice({ tone: "error", text: err instanceof Error ? err.message : "Failed." });
    } finally {
      setSavingProfile(false);
    }
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
        meta={account ? `Signed in as ${account.email}` : undefined}
      />

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-6 py-8 sm:px-10">
        <Card>
          <SectionHeader label="Profile" />
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <Field label="Display name">
              <Input value={name} onChange={setName} />
            </Field>
            <Field label="Email">
              <Input value={data.user.email} onChange={() => {}} disabled />
              <Hint>Email changes go through verification — use the change-email flow.</Hint>
            </Field>
            <div className="flex items-center justify-between pt-2">
              <Notice notice={profileNotice} />
              <AppButton type="submit" variant="primary" loading={savingProfile}>Save</AppButton>
            </div>
          </form>
        </Card>

        <Card>
          <SectionHeader label="Appearance" />
          <div className="grid grid-cols-3 gap-2">
            {(["light", "system", "dark"] as ThemeMode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className="rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium capitalize transition-colors"
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
      className="rounded-[16px] p-6"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
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
      className="w-full rounded-[10px] px-3 py-2.5 text-[14.5px] outline-none disabled:opacity-60"
      style={{
        background: "var(--app-surface-soft)",
        border: "1px solid var(--app-border)",
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
