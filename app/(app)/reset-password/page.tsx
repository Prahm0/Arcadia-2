"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { api } from "@/lib/api/client";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true); setError("");
    try {
      await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      router.replace("/app");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This link could not be used.");
    } finally { setBusy(false); }
  }
  return <AuthShell eyebrow="Account recovery" title="Choose a new password." subtitle="Your other devices will be signed out when you reset it." footer={<Link href="/forgot-password" className="underline underline-offset-4">Request another link</Link>}>
    {token ? <form onSubmit={submit} className="space-y-5">
      <Field label="New password" type="password" name="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." value={password} onChange={(event) => setPassword(event.target.value)} />
      {error ? <p role="alert" className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
      <PrimaryButton type="submit" loading={busy}>Reset password</PrimaryButton>
    </form> : <p role="alert">This reset link is incomplete. Request a new link.</p>}
  </AuthShell>;
}
export default function ResetPasswordPage() { return <Suspense fallback={null}><ResetForm /></Suspense>; }
