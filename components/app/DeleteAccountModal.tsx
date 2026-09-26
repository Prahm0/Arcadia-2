"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resetAnalytics } from "@/lib/analytics/events";
import { api, saveCsrf } from "@/lib/api/client";
import AppButton from "./AppButton";

interface DeleteAccountModalProps {
  hasPaidPlan: boolean;
  /** Who bills the subscription: we can cancel Stripe, only the student can cancel Apple. */
  billingProvider?: "stripe" | "app_store" | null;
  isGuest?: boolean;
  onClose: () => void;
  onManageSubscription: () => void;
}

export default function DeleteAccountModal({
  hasPaidPlan,
  billingProvider = null,
  isGuest = false,
  onClose,
  onManageSubscription,
}: DeleteAccountModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function deleteAccount() {
    if (confirmation !== "DELETE") return;
    setDeleting(true);
    setError(null);
    try {
      await api("/api/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      saveCsrf(null);
      resetAnalytics();
      router.replace("/login?deleted=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't delete your account.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        disabled={deleting}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(var(--shadow-rgb), 0.45)" }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="relative w-full max-w-[500px] rounded-lg p-6"
        style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)", color: "var(--app-text)" }}
      >
        <p className="type-eyebrow" style={{ color: "var(--app-danger)" }}>Danger zone</p>
        <h2 id="delete-account-title" className="mt-2 text-[24px] font-medium tracking-[-0.02em]">
          Delete your account?
        </h2>
        <p className="mt-3 text-[14px] leading-6" style={{ color: "var(--app-text-muted)" }}>
          This permanently removes your Arcadia account, subjects, tasks, study history, chats,
          flashcards and uploaded files. It cannot be undone.
        </p>
        {isGuest ? null : (
          <p className="mt-2 text-[13px] leading-5" style={{ color: "var(--app-text-faint)" }}>
            For security, you must have signed in within the last 15 minutes.
          </p>
        )}
        {billingProvider === "stripe" ? (
          <p className="mt-2 text-[13px] leading-5" style={{ color: "var(--app-text-faint)" }}>
            Stripe retains payment and invoice records where required for accounting.
          </p>
        ) : null}
        {hasPaidPlan && billingProvider === "app_store" ? (
          <div
            className="mt-4 rounded-md px-4 py-3 text-[13.5px] leading-5"
            style={{ background: "color-mix(in oklab, var(--app-danger) 10%, var(--app-surface))", color: "var(--app-text-soft)" }}
          >
            Deleting your account does not cancel your App Store subscription. Apple keeps billing
            it until you cancel it in your iPhone&rsquo;s Settings, under your name, then Subscriptions.
            <button
              type="button"
              disabled={deleting}
              onClick={onManageSubscription}
              className="ml-1 font-medium underline underline-offset-4 disabled:opacity-60"
              style={{ color: "var(--app-text)" }}
            >
              Manage subscription
            </button>
          </div>
        ) : hasPaidPlan ? (
          <div
            className="mt-4 rounded-md px-4 py-3 text-[13.5px] leading-5"
            style={{ background: "color-mix(in oklab, var(--app-danger) 10%, var(--app-surface))", color: "var(--app-text-soft)" }}
          >
            Your paid subscription will be cancelled immediately. There is no refund for unused time.
            <button
              type="button"
              disabled={deleting}
              onClick={onManageSubscription}
              className="ml-1 font-medium underline underline-offset-4 disabled:opacity-60"
              style={{ color: "var(--app-text)" }}
            >
              Cancel and keep my account instead
            </button>
          </div>
        ) : null}
        <label className="mt-6 block">
          <span className="mb-2 block text-[13px] font-medium" style={{ color: "var(--app-text-soft)" }}>
            Type <strong>DELETE</strong> to confirm
          </span>
          <input
            ref={inputRef}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={deleting}
            autoComplete="off"
            className="w-full rounded-md px-3 py-2.5 text-[14.5px] outline-none disabled:opacity-60"
            style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
          />
        </label>
        {error ? <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <AppButton variant="secondary" onClick={onClose} disabled={deleting}>Cancel</AppButton>
          <AppButton
            variant="danger"
            onClick={() => void deleteAccount()}
            disabled={confirmation !== "DELETE"}
            loading={deleting}
          >
            Delete permanently
          </AppButton>
        </div>
      </section>
    </div>
  );
}
