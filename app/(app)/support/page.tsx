import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Arcadia: your account, subscriptions, sign-in and your data.",
};

export default function SupportPage() {
  return (
    <LegalPage title="Support" updated="September 2026">
      <p>
        Stuck on something? Email{" "}
        <a href="mailto:teamarcadiahq@gmail.com">teamarcadiahq@gmail.com</a> and a real
        person will get back to you, usually within 2 business days. Tell us the email on
        your account and what you were trying to do.
      </p>

      <h2>Your subscription</h2>
      <ul>
        <li>
          <strong>Subscribed on the website:</strong> cancel any time in Arcadia under
          Settings, then Manage subscription. You keep Pro or Max until the end of the
          period you paid for.
        </li>
        <li>
          <strong>Subscribed in the iPhone app:</strong> open your iPhone&rsquo;s
          Settings, tap your name, then Subscriptions, then Arcadia. Cancel at least 24
          hours before it renews.
        </li>
        <li>
          Refunds are covered in our <Link href="/refunds">refund policy</Link>. Refunds
          for iPhone purchases are handled by Apple at reportaproblem.apple.com.
        </li>
      </ul>

      <h2>Signing in</h2>
      <ul>
        <li>
          <strong>Forgot your password?</strong> Email us from your account&rsquo;s address
          and we&rsquo;ll help you get back in.
        </li>
        <li>
          <strong>Signed up with Google or Apple?</strong> Use the same button to sign in
          again. If you chose Apple&rsquo;s &ldquo;Hide My Email&rdquo;, your account uses
          a private relay address, so sign in with Apple rather than by email.
        </li>
        <li>
          <strong>Used Arcadia as a guest?</strong> Guest plans can&rsquo;t be recovered
          after signing out. Create a free account to keep your plan safe.
        </li>
      </ul>

      <h2>Your data</h2>
      <ul>
        <li>
          <strong>Delete your account:</strong> in Arcadia, go to Settings, then Delete
          account. This removes your plan and content.
        </li>
        <li>
          <strong>Get a copy of your data:</strong> email us from your account&rsquo;s
          address and we&rsquo;ll send it to you.
        </li>
        <li>
          How we handle your information is in our{" "}
          <Link href="/privacy">privacy policy</Link>. Our{" "}
          <Link href="/terms">terms of service</Link> cover the rest.
        </li>
      </ul>

      <h2>Parents and guardians</h2>
      <p>
        Arcadia is for high-school students aged 13 and over. If you&rsquo;re a parent or
        guardian with a question, or you&rsquo;d like to access or delete your
        child&rsquo;s data, email us and we&rsquo;ll help.
      </p>
    </LegalPage>
  );
}
