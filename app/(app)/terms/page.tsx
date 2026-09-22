import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms · Arcadia",
  description: "Terms of service for using Arcadia.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="September 2026">
      <p>
        These terms apply when you use Arcadia, a study planning app operated by Iman
        Rahmani as a sole trader (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
        &ldquo;Arcadia&rdquo;). By creating an account or using the service, you agree
        to these terms.
      </p>

      <h2>1. What Arcadia does</h2>
      <p>
        Arcadia helps students build a weekly study schedule around their tasks,
        subjects and calendar. It includes Arcad, an AI assistant that answers
        questions about your plan and proposes changes for you to accept or reject.
      </p>

      <h2>2. Your account</h2>
      <p>
        You need to be 13 or older to use Arcadia. If you are under 18, we ask that
        you use Arcadia with a parent or guardian&rsquo;s awareness. You&rsquo;re
        responsible for keeping your password confidential and for anything that
        happens under your account.
      </p>
      <p>
        You must give accurate information when you sign up, and keep it up to date.
        We may suspend or close an account if we reasonably believe it&rsquo;s being
        used to harm others or the service.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Attempt to break, probe or overload the service;</li>
        <li>Use automated tools to scrape, mass-request or resell Arcad;</li>
        <li>Upload content you don&rsquo;t have permission to share;</li>
        <li>Use Arcadia to harass others or generate content that&rsquo;s unlawful,
          harmful, or that violates a third party&rsquo;s rights;</li>
        <li>Impersonate anyone or share your account with people who haven&rsquo;t
          agreed to these terms.</li>
      </ul>

      <h2>4. Subscriptions and billing</h2>
      <p>
        Arcadia has a free tier and paid tiers (Pro and Max). Paid tiers renew
        automatically until you cancel. Prices are shown in Australian dollars and
        may include GST where applicable.
      </p>
      <p>
        Payments are processed by Stripe. By subscribing, you also agree to
        Stripe&rsquo;s terms. We may change prices from time to time; if we do,
        we&rsquo;ll give you notice before your next renewal and you can cancel
        before the new price takes effect.
      </p>
      <p>
        Cancellation and refunds are covered in our{" "}
        <Link href="/refunds">refund policy</Link>. In short: you can cancel any
        time and keep access until the end of the current billing period; we
        don&rsquo;t offer refunds for partial periods.
      </p>

      <h2>5. Arcad and AI-generated content</h2>
      <p>
        Arcad is an AI assistant. Its suggestions are for planning and study
        support only, they&rsquo;re not professional advice (educational, legal,
        medical or otherwise). Arcad can make mistakes; check anything important
        before acting on it.
      </p>
      <p>
        Every change Arcad wants to make to your plan is shown to you as a proposal
        that you accept or reject. Arcad never modifies your data without your
        consent.
      </p>

      <h2>6. Your content</h2>
      <p>
        Your tasks, notes, schedule and other content stay yours. You grant us a
        limited licence to store and process that content solely to provide the
        service (for example, to feed relevant context into Arcad so it can answer
        questions about your plan). We don&rsquo;t sell your content, and we
        don&rsquo;t use it to train third-party models.
      </p>
      <p>
        You can export or delete your data at any time from Settings, or by
        emailing us. Deleting your account removes your content within 30 days,
        except for records we&rsquo;re legally required to keep (like invoice
        records).
      </p>

      <h2>7. Our intellectual property</h2>
      <p>
        Arcadia, the Arcadia name, logo, source code, designs and documentation are
        our property (or that of our licensors). These terms don&rsquo;t transfer
        any of that to you; you get a personal, non-transferable, revocable licence
        to use the service.
      </p>

      <h2>8. Service availability</h2>
      <p>
        We work to keep Arcadia running reliably, but we don&rsquo;t guarantee it
        will always be available or error-free. We may change, suspend or discontinue
        features with reasonable notice. Scheduled maintenance and third-party
        outages (for example, Cloudflare or Stripe) may affect availability.
      </p>

      <h2>9. Warranty and liability</h2>
      <p>
        To the extent permitted by law, Arcadia is provided &ldquo;as is&rdquo;
        without warranties of any kind. Our total liability to you for any claim
        arising out of these terms or the service is limited to the amount you paid
        us in the 12 months before the claim.
      </p>
      <p>
        Nothing in these terms limits or excludes any rights you have under the
        Australian Consumer Law that can&rsquo;t be limited or excluded. If any
        part of these terms is found to be unenforceable, the rest still applies.
      </p>

      <h2>10. Termination</h2>
      <p>
        You can close your account at any time from Settings. We may suspend or
        close accounts that breach these terms. If we close your account, we&rsquo;ll
        give you a way to export your data first, unless doing so would risk
        further harm.
      </p>

      <h2>11. Changes to these terms</h2>
      <p>
        We&rsquo;ll update these terms occasionally. If a change is material,
        we&rsquo;ll notify you (by email or in the app) at least 14 days before it
        takes effect. Continued use of Arcadia after that date means you accept the
        updated terms.
      </p>

      <h2>12. Governing law and contact</h2>
      <p>
        These terms are governed by the laws of Queensland, Australia. Questions
        about these terms? Email{" "}
        <a href="mailto:teamarcadiahq@gmail.com">teamarcadiahq@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
