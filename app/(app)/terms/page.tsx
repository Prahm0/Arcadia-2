import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms — Arcadia",
  description: "Terms for using the Arcadia website during early access.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="September 2026">
      <p>
        This website introduces Arcadia and lets you request early access. Requesting an
        invite doesn&rsquo;t create an account or guarantee a place in the early access
        programme.
      </p>
      <p>
        The product demonstrations on this site use sample data and are illustrative.
        Features, timing and availability may change before launch.
      </p>
      <p>
        Full terms of service for the Arcadia app will be provided when you receive your
        invite. Questions? Email{" "}
        <a href="mailto:hello@arcadia.study">hello@arcadia.study</a>.
      </p>
    </LegalPage>
  );
}
