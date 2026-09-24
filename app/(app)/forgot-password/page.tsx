"use client";

import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { api } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title="Reset your password."
      subtitle="Enter your account email and we&rsquo;ll send a link to choose a new password."
      footer={
        <Link href="/login" className="underline underline-offset-4" style={{ color: "var(--app-text)" }}>
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="surface-inset rounded-md p-5">
          <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
            Check your email. If an account exists for that address, a reset link is on its way.
          </p>
          <p className="mt-2 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
            The link expires after 60 minutes. Check your spam folder too.
          </p>
        </div>
      ) : (
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
          {error ? (
            <div
              role="alert"
              className="surface-inset rounded-md px-4 py-3 text-[13.5px]"
              style={{ color: "var(--app-danger)" }}
            >
              {error}
            </div>
          ) : null}
          <PrimaryButton type="submit" loading={loading}>
            Send reset link
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
