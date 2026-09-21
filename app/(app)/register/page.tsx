"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { api } from "@/lib/api/client";
import { continueAsGuest } from "@/lib/auth/guest";

interface RegisterResponse {
  message: string;
  verificationToken?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  async function onGuest() {
    setGuestLoading(true);
    setError(null);
    try {
      await continueAsGuest();
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGuestLoading(false);
    }
  }

  async function verifyWithToken(rawUrl: string) {
    setVerifying(true);
    setError(null);
    try {
      const token = new URL(rawUrl).searchParams.get("token");
      if (!token) throw new Error("Verification link is missing a token.");
      await api(`/api/auth/verify?token=${encodeURIComponent(token)}`);
      router.push("/login?verified=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
      setVerifying(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await api<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setResult(response);
      if (response.verificationToken) {
        void verifyWithToken(response.verificationToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Create account"
      title="Start planning like it matters."
      subtitle="Set up your account in seconds. We'll email a verification link — click it to activate."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="underline underline-offset-4"
            style={{ color: "var(--app-text)" }}
          >
            Sign in
          </Link>
        </>
      }
    >
      {result ? (
        <div className="clay-well space-y-4 rounded-clay-sm p-5">
          {result.verificationToken ? (
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2"
                style={{
                  borderColor: "var(--app-border-strong)",
                  borderTopColor: "var(--app-accent)",
                }}
              />
              <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
                {verifying ? "Verifying your email…" : "Preparing your account…"}
              </p>
            </div>
          ) : (
            <>
              <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
                Check your email to verify.
              </p>
              <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                {result.message}
              </p>
            </>
          )}
          {error ? (
            <p className="text-[13px]" style={{ color: "var(--app-danger)" }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <Field
            label="Name"
            type="text"
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
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
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="At least 10 characters."
          />
          {error ? (
            <div
              role="alert"
              className="clay-well rounded-clay-sm px-4 py-3 text-[13.5px]"
              style={{ color: "var(--app-danger)" }}
            >
              {error}
            </div>
          ) : null}
          <PrimaryButton type="submit" loading={loading}>
            Create account
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
            onClick={onGuest}
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
      )}
    </AuthShell>
  );
}
