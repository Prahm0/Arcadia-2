import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Arcadia handles your personal information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="September 2026">
      <p>
        This policy explains what personal information Arcadia collects, how we
        use it, and the choices you have. Arcadia is operated by Iman Rahmani
        as a sole trader, based in Queensland, Australia. We handle personal
        information in line with the Australian Privacy Principles under the
        Privacy Act 1988.
      </p>

      <h2>1. What we collect</h2>
      <p>When you sign up and use Arcadia, we collect:</p>
      <ul>
        <li><strong>Account details</strong>, your email address, a hashed password,
          your display name and (optionally) grade level and timezone. If you
          sign in with Google or Apple, we receive your name, email address and
          an account identifier from them (with Apple you can choose to hide
          your real email).</li>
        <li><strong>Plan content you create</strong>, subjects, tasks, deadlines,
          study sessions, focus timer runs, and chat messages you send to Arcad.</li>
        <li><strong>Calendar data you choose to sync</strong>, event titles, times
          and locations from Google Calendar, Apple, Canvas or any .ics feed you
          add. We import; we don&rsquo;t write back to your calendar.</li>
        <li><strong>Files you upload</strong>, PDFs or notes you attach, so Arcad
          can answer questions from them.</li>
        <li><strong>Billing information</strong>, handled by Stripe on the web and
          by Apple in the iOS app. We see your plan and status, but never your
          card number.</li>
        <li><strong>Referral details</strong>, if you invite a friend or join with
          an invite link, we record who invited whom so we can apply rewards.</li>
        <li><strong>Usage and diagnostics</strong>, page views, feature usage,
          error reports and performance metrics. When something goes wrong, we
          may keep a short recording of the screen around the error so we can
          fix it. These recordings hide all text you see and everything you
          type.</li>
      </ul>

      <h2>2. How we use it</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Run and improve the service you signed up for;</li>
        <li>Personalise your plan and give Arcad context about your schedule;</li>
        <li>Send you transactional email (verification, receipts, service updates);</li>
        <li>Detect abuse, prevent fraud and secure your account;</li>
        <li>Comply with legal obligations (tax records, lawful requests).</li>
      </ul>
      <p>
        We <strong>don&rsquo;t</strong> sell your data. We <strong>don&rsquo;t</strong>{" "}
        use your content to train third-party AI models. We <strong>don&rsquo;t</strong>{" "}
        add you to marketing lists you didn&rsquo;t opt in to.
      </p>

      <h2>3. Third parties we share with</h2>
      <p>
        To run Arcadia, we send some data to service providers. Each of them
        processes data only on our instructions and under their own privacy terms:
      </p>
      <ul>
        <li><strong>Cloudflare</strong>, hosting, edge database, R2 storage.</li>
        <li><strong>Stripe</strong>, subscription payments and invoicing on the web.</li>
        <li><strong>Apple and RevenueCat</strong>, subscriptions bought in the iOS
          app. Apple processes the payment; RevenueCat tells us which plan is
          active. Apple also handles Sign in with Apple if you use it.</li>
        <li><strong>OpenAI</strong>, Arcad&rsquo;s language model. We send the chat
          history and a compact snapshot of your plan so Arcad can answer
          contextually. OpenAI does not train on data sent through their API.</li>
        <li><strong>Resend</strong>, transactional email delivery.</li>
        <li><strong>Google</strong>, if you sign in with Google or connect Google
          Calendar. Calendar tokens are stored encrypted and used solely to read
          calendar events.</li>
        <li><strong>PostHog</strong>, product analytics, so we can see which
          features help and where people get stuck.</li>
        <li><strong>Sentry</strong>, error tracking and masked error recordings
          (described above), so we can fix crashes quickly.</li>
      </ul>

      <h2>4. Cookies and local storage</h2>
      <p>
        Arcadia uses a small number of cookies for authentication (keeping you
        signed in) and CSRF protection. We store some settings locally on your
        device (like your theme and notification preferences). We don&rsquo;t use
        third-party advertising cookies.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We keep your account data as long as your account is active. When you
        delete your account, we remove your content within 30 days, except for
        records we&rsquo;re legally required to keep (like invoices, which are
        retained for 7 years under Australian tax law).
      </p>

      <h2>6. Your rights</h2>
      <p>You can, at any time:</p>
      <ul>
        <li><strong>Access</strong> your data, email us and we&rsquo;ll send you a
          full copy.</li>
        <li><strong>Correct</strong> anything that&rsquo;s wrong, edit it in-app or
          email us.</li>
        <li><strong>Delete</strong> your account and content from Settings.</li>
        <li><strong>Withdraw</strong> a consent you gave (e.g. disconnect Google).</li>
        <li><strong>Complain</strong> to the Office of the Australian Information
          Commissioner if you think we&rsquo;ve mishandled your data.</li>
      </ul>

      <h2>7. Security</h2>
      <p>
        Passwords are hashed with PBKDF2-SHA256. Sensitive tokens (like Google
        OAuth refresh tokens) are encrypted at rest with AES-GCM. All traffic
        between your device and Arcadia is over HTTPS. We take security seriously,
        but no service can promise perfect security, please keep your password
        safe and enable device-level protection.
      </p>
      <p>
        If we ever discover a security incident that affects your data, we&rsquo;ll
        notify you promptly and in line with our obligations under the Notifiable
        Data Breaches scheme.
      </p>

      <h2>8. Children</h2>
      <p>
        Arcadia is built for high-school students and is not intended for
        children under 13. If you&rsquo;re 13 to 17, you need your parent or
        guardian&rsquo;s permission to use Arcadia. We collect only what we need
        to run your study plan, we never sell it, and we don&rsquo;t show ads.
        Parents and guardians can contact us to access or delete their
        child&rsquo;s data. If we learn we&rsquo;ve collected data from a child
        under 13, we&rsquo;ll delete it.
      </p>

      <h2>9. Where your data is stored</h2>
      <p>
        Arcadia runs on Cloudflare&rsquo;s global network, and several of the
        providers listed above (including OpenAI, Stripe, Apple, RevenueCat,
        PostHog, Sentry, Resend and Google) are based in the United States. This
        means your data may be processed outside Australia, including in the
        United States and the European Union. We only use providers that
        protect personal information to a standard comparable to the Australian
        Privacy Principles.
      </p>

      <h2>10. Changes and contact</h2>
      <p>
        We&rsquo;ll update this policy when things change and mark the &ldquo;last
        updated&rdquo; date above. Material changes will be notified in-app or by
        email.
      </p>
      <p>
        Privacy questions or requests? Email{" "}
        <a href="mailto:teamarcadiahq@gmail.com">teamarcadiahq@gmail.com</a>. We
        aim to respond within 30 days.
      </p>
    </LegalPage>
  );
}
