import type { Metadata, Viewport } from "next";
import { Courier_Prime, DM_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// DM Sans replaces Inter as the primary sans — warmer letterforms, no
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

// The product (dashboard, auth, legal) is typewriter-set throughout. It stays a
// fourth family rather than replacing the three above, because the landing page
// still needs DM Sans / JetBrains Mono / Instrument Serif. globals.css swaps it
// in under `html[data-app-theme]`. Courier Prime ships only 400 and 700.
const typewriter = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-courier",
  display: "swap",
});

const title = "Arcadia — Your week just changed. Your plan already knows.";
const description =
  "Arcadia builds a study plan around your classes, deadlines, training and the rest of your life — then quietly rebuilds it every time something moves.";

export const metadata: Metadata = {
  metadataBase: new URL("https://arcadia.study"),
  title,
  description,
  applicationName: "Arcadia",
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
    title,
    description,
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
  colorScheme: "dark",
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
      className={`${inter.variable} ${mono.variable} ${serif.variable} ${typewriter.variable} h-full`}
    >
      {/* The night background and white text are already set on `body` in
          globals.css @layer base. Repeating them as utilities here put them in
          @layer utilities, which outranks every layered rule — including the
          product's own `html[data-app-theme] body` override, so the app shell
          was sitting on a black body in both themes. */}
      <body className="min-h-full">{children}</body>
    </html>
  );
}
