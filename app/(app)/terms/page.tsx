import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of service",
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
        subjects and calendar, and automatically rearranges study sessions when
        things change. It includes Arcad, an AI assistant that answers questions
        about your plan and proposes changes for you to accept or reject.
      </p>

      <h2>2. Your account</h2>
      <p>
        You need to be 13 or older to use Arcadia. If you are 13 to 17, you
        confirm that your parent or guardian has agreed to you using Arcadia and,
        if you subscribe, to the paid plan. A parent or guardian who allows their
        child to use Arcadia agrees to these terms on the child&rsquo;s behalf.
        You&rsquo;re responsible for keeping your password confidential and for
        anything that happens under your account.
      </p>
      <p>
        If you continue as a guest, your plan is saved to a guest account on our
        servers that has no email or password. If you sign out or clear your
        browser or app data, we can&rsquo;t recover it. Create a free account to
        keep your plan safe and use it on other devices. Guest accounts
        can&rsquo;t subscribe to paid plans.
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
        If you subscribe on our website, payments are processed by Stripe and you
        also agree to Stripe&rsquo;s terms. If you subscribe in our iOS app,
        payment is charged to your Apple ID. iOS subscriptions renew
        automatically unless cancelled at least 24 hours before the end of the
        current period, and you manage or cancel them in your iPhone&rsquo;s
        Settings under your Apple ID. We may change prices from time to time; if
        we do, we&rsquo;ll give you notice before your next renewal and you can
        cancel before the new price takes effect.
      </p>
      <p>
        We may run promotions and a referral program. When a friend joins with
        your invite link, verifies their email and finishes setting up their
        plan, you both get free Pro time (currently 7 days each, up to 180 days
        in total per person). Referral rewards and discounts have no cash value,
        can&rsquo;t be transferred, and don&rsquo;t apply to your own accounts. We
        may withhold or remove rewards gained through fake accounts or other
        abuse, and we may change or end the program with notice.
      </p>
      <p>
        Cancellation and refunds are covered in our{" "}
        <Link href="/refunds">refund policy</Link>. In short: you can cancel any
        time and keep access until the end of the current billing period, and
        except where the Australian Consumer Law requires otherwise, we
        don&rsquo;t refund partial periods. Refunds for iOS purchases are handled
        by Apple.
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
      <p>
        Your study plan is a planning aid. It doesn&rsquo;t replace official
        information from your school, teachers or curriculum authority. Please
        check due dates and exam times against official sources.
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
        You can delete your account at any time from Settings, or email us for a
        copy of your data. Deleting your account removes your content within 30
        days, except for records we&rsquo;re legally required to keep (like
        invoice records). Deleting your account cancels a web subscription
        straight away, but an iOS subscription must be cancelled separately in
        your Apple ID settings.
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
        arising out of these terms or the service is limited to the greater of
        A$50 or the amount you paid us in the 12 months before the claim.
      </p>
      <p>
        Nothing in these terms limits or excludes any rights you have under the
        Australian Consumer Law that can&rsquo;t be limited or excluded. If any
        part of these terms is found to be unenforceable, the rest still applies.
      </p>

      <h2>10. The iOS app</h2>
      <p>
        If you download Arcadia from the Apple App Store, Apple&rsquo;s Standard
        Licensed Application End User License Agreement also applies to your use
        of the app. These terms are between you and us, not Apple. Apple
        isn&rsquo;t responsible for Arcadia or its content, and has no obligation
        to provide support for it.
      </p>

      <h2>11. Termination</h2>
      <p>
        You can close your account at any time from Settings. We may suspend or
        close accounts that breach these terms. If we close your account, we&rsquo;ll
        give you a way to export your data first, unless doing so would risk
        further harm.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>
        We&rsquo;ll update these terms occasionally. If a change is material,
        we&rsquo;ll notify you (by email or in the app) at least 14 days before it
        takes effect. Continued use of Arcadia after that date means you accept the
        updated terms.
      </p>

      <h2>13. Governing law and contact</h2>
      <p>
        These terms are governed by the laws of Queensland, Australia. Questions
        about these terms? Email{" "}
        <a href="mailto:teamarcadiahq@gmail.com">teamarcadiahq@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
