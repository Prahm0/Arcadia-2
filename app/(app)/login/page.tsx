"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { api } from "@/lib/api/client";

type Notice = { tone: "info" | "error"; text: string } | null;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const initialNotice: Notice = params.get("verified")
    ? { tone: "info", text: "Email confirmed — sign in to continue." }
    : params.get("email") === "changed"
      ? { tone: "info", text: "Email updated. Sign in with your new address." }
      : params.get("expired") === "1"
        ? { tone: "info", text: "Your session expired. Sign back in and you'll land right where you left off." }
        : null;
  const [notice, setNotice] = useState<Notice>(initialNotice);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      await api<{ redirect: string; csrfToken: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const next = params.get("next");
      // Only follow `next` if it's a same-origin path — never an external URL.
      const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
      router.push(safe);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setNotice({ tone: "error", text: message });
    } finally {
      setLoading(false);
    }
  }

  // Spins up a throwaway account, auto-verifies it via the dev-mode
  // `verificationToken` the backend returns, then signs in — all in one
  // click, no email required. Meant for demos and quick check-outs;
  // there's no cleanup, so guest rows accumulate in the DB.
  async function continueAsGuest() {
    setGuestLoading(true);
    setNotice(null);
    try {
      const suffix = Math.random().toString(36).slice(2, 10);
      const guestEmail = `guest-${suffix}@arcadia.local`;
      const guestPassword = `guest-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
      const guestName = `Guest ${suffix.slice(0, 4).toUpperCase()}`;

      const register = await api<{ verificationToken?: string }>(
        "/api/auth/register",
        {
          method: "POST",
          body: JSON.stringify({ name: guestName, email: guestEmail, password: guestPassword }),
        },
      );
      if (register.verificationToken) {
        await api(`/api/auth/verify?token=${encodeURIComponent(register.verificationToken)}`);
      }
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: guestEmail, password: guestPassword }),
      });
      router.push("/app");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setNotice({ tone: "error", text: message });
    } finally {
      setGuestLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back."
      subtitle="Your subjects, deadlines and focus streak are exactly where you left them."
      footer={
        <>
          New to Arcadia?{" "}
          <Link
            href="/register"
            className="underline underline-offset-4"
            style={{ color: "var(--app-text)" }}
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {notice ? (
          <div
            role="alert"
            className="clay-well rounded-clay-sm px-4 py-3 text-[13.5px]"
            style={{
              color: notice.tone === "error" ? "var(--app-danger)" : "var(--app-text-soft)",
            }}
          >
            {notice.text}
          </div>
        ) : null}
        <PrimaryButton type="submit" loading={loading}>
          Sign in
        </PrimaryButton>
        <div
          className="flex items-center gap-3 text-[11.5px] uppercase tracking-[0.16em]"
          style={{ color: "var(--app-text-faint)" }}
        >
          <span className="h-px flex-1" style={{ background: "var(--app-border)" }} />
          or
          <span className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        </div>
        <button
          type="button"
          onClick={continueAsGuest}
          disabled={guestLoading || loading}
          className="clay-pressable w-full rounded-clay-sm px-4 py-3 text-[14.5px] disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background: "var(--app-surface)",
            color: "var(--app-text)",
            boxShadow: "var(--clay-shadow), var(--clay-rim)",
          }}
        >
          {guestLoading ? "Setting up a guest account…" : "Continue as guest"}
        </button>
        <p className="text-center text-[12px]" style={{ color: "var(--app-text-faint)" }}>
          Skips sign-up with a throwaway account — nothing saves after you close the tab.
        </p>
      </form>
    </AuthShell>
  );
}

/**
 * useSearchParams() opts the subtree into client-side rendering, so it needs a
 * Suspense boundary or `next build` fails prerendering this route.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
