import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Refunds · Arcadia",
  description: "Arcadia's cancellation and refund policy.",
};

export default function RefundsPage() {
  return (
    <LegalPage title="Cancellation and refunds" updated="September 2026">
      <p>
        This page explains how cancellation and refunds work on Arcadia&rsquo;s
        paid tiers (Pro and Max).
      </p>

      <h2>Cancelling</h2>
      <p>
        You can cancel your subscription at any time from Settings → Manage
        subscription. You keep full access to your paid tier until the end of your
        current billing period, then automatically move to the Free tier. Your
        data stays with you either way.
      </p>
      <p>
        Deleting your Arcadia account is different: it permanently removes your
        app data and cancels any active subscription immediately. Unused paid
        time is not refunded.
      </p>

      <h2>Refunds</h2>
      <p>
        We don&rsquo;t offer refunds for partial billing periods, unused time, or
        for the current month/year if you cancel mid-period. This is standard
        practice for subscription software (Notion, Linear, ChatGPT and others do
        the same). Because cancellation is one click and takes effect at the next
        renewal, you&rsquo;re always in control of what you pay for next.
      </p>

      <h2>Exceptions</h2>
      <p>We&rsquo;ll issue a refund if:</p>
      <ul>
        <li>You were charged in error (for example, billed twice for the same
          period, or charged after cancelling);</li>
        <li>Arcadia was unavailable for an extended period during your billing
          cycle due to a fault on our side; or</li>
        <li>Australian Consumer Law entitles you to a refund because we failed to
          meet a consumer guarantee that can&rsquo;t be excluded.</li>
      </ul>

      <h2>Your rights under Australian Consumer Law</h2>
      <p>
        Nothing in this policy limits or excludes any right you have under the
        Australian Consumer Law. If Arcadia has a major failure that we
        can&rsquo;t fix in a reasonable time, you&rsquo;re entitled to a refund
        for the affected period.
      </p>

      <h2>How to request a refund</h2>
      <p>
        Email{" "}
        <a href="mailto:teamarcadiahq@gmail.com">teamarcadiahq@gmail.com</a> from
        the address on your account. Include the reason and (if applicable) the
        date range affected. We aim to respond within 5 business days. Approved
        refunds go back to the original payment method within 5–10 business days
        of approval.
      </p>
    </LegalPage>
  );
}
