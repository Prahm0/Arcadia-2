"use client";

import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { api } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devToken, setDevToken] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await api<{ message: string; resetToken?: string }>("/api/auth/forgot-password", {
        method: "POST", body: JSON.stringify({ email }),
      });
      setMessage(result.message);
      if (result.resetToken) setDevToken(result.resetToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally { setBusy(false); }
  }
  return <AuthShell eyebrow="Account recovery" title="Reset your password." subtitle="Enter your account email. If it matches an account, we'll send a link that works for 30 minutes." footer={<Link href="/login" className="underline underline-offset-4">Back to sign in</Link>}>
    <form onSubmit={submit} className="space-y-5">
      <Field label="Email" type="email" name="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      {message ? <p role="status" className="text-[13.5px]">{message}</p> : null}
      {devToken ? <Link href={`/reset-password?token=${encodeURIComponent(devToken)}`} className="block underline underline-offset-4">Open local development reset link</Link> : null}
      {error ? <p role="alert" className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
      <PrimaryButton type="submit" loading={busy}>Send reset link</PrimaryButton>
    </form>
  </AuthShell>;
}
