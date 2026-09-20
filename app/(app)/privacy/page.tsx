import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy — Arcadia",
  description: "How Arcadia handles your information during early access.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="September 2026">
      <p>
        Arcadia is in private early access. During this period the only personal
        information we collect through this site is the email address you give us when
        you request an invite.
      </p>
      <p>
        We use that address for one purpose: to tell you when your invite is ready. We
        don&rsquo;t sell it, share it with advertisers or add it to any other list. You can
        ask us to delete it at any time by emailing{" "}
        <a href="mailto:hello@arcadia.study">hello@arcadia.study</a>.
      </p>
      <p>
        A full privacy policy covering the Arcadia app, including how timetable, assignment
        and calendar data is stored, will be published before the product launches.
      </p>
    </LegalPage>
  );
}
