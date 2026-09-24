import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import NativeShell from "@/components/NativeShell";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import { PostHogProvider } from "@/lib/analytics/posthog";
import "./globals.css";

// DM Sans replaces Inter as the primary sans, warmer letterforms, no
// stylistic sets to fight, pairs better with the Instrument Serif italic
// accents. The CSS var name stays `--font-inter` for backward compatibility
// with the tokens already referencing it.
const inter = DM_Sans({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

// The product (dashboard, auth, legal) is set in Inter: a working UI face with
// tabular figures and a full weight range, where the landing keeps DM Sans for
// its warmer display type. globals.css swaps it in under `html[data-app-theme]`.
const ui = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

// The tab reads "Today · Arcadia" inside the app: every page sets a short
// title and the template adds the brand. The landing keeps the default, and
// link previews keep the tagline.
const title = "Arcadia · AI study planner";
const tagline = "Arcadia · Your week just changed. Your plan already knows.";
const description =
  "Arcadia builds a study plan around your classes, deadlines, training and the rest of your life, then quietly rebuilds it every time something moves.";

export const metadata: Metadata = {
  metadataBase: new URL("https://arcadiahq.app"),
  title: { default: title, template: "%s · Arcadia" },
  description,
  applicationName: "Arcadia",
  // PWA install hints. iOS Safari uses its own set of tags for
  // "Add to Home Screen" that Next.js maps through appleWebApp.
  appleWebApp: {
    capable: true,
    title: "Arcadia",
    statusBarStyle: "black-translucent",
  },
  keywords: [
    "student planner",
    "study planner",
    "AI study schedule",
    "adaptive timetable",
    "homework planner",
  ],
  openGraph: {
    type: "website",
    siteName: "Arcadia",
    title: tagline,
    description,
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: tagline,
    description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches the manifest's theme_color / background, sets the iOS status
  // bar tint when installed as a PWA and the Android URL bar tint in
  // Chrome. Kept as the deep-night background rather than pure black so
  // the tint blends with the app's own surface rather than punching a
  // hard cutoff at the top.
  themeColor: "#0a0714",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the pre-paint script in app/(app)/layout.tsx
    // stamps data-app-theme and color-scheme onto <html> before React hydrates,
    // so the client tree legitimately differs from the server one here. It
    // suppresses this element's attributes only, not the tree below.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${mono.variable} ${serif.variable} ${ui.variable} h-full`}
    >
      {/* The night background and white text are already set on `body` in
          globals.css @layer base. Repeating them as utilities here put them in
          @layer utilities, which outranks every layered rule, including the
          product's own `html[data-app-theme] body` override, so the app shell
          was sitting on a black body in both themes. */}
      <body className="min-h-full">
        <PostHogProvider>
          {children}
          <PwaInstallPrompt />
          <NativeShell />
        </PostHogProvider>
      </body>
    </html>
  );
}
