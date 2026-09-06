import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
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
    <html lang="en" className={`${inter.variable} ${mono.variable} ${serif.variable} h-full`}>
      <body className="min-h-full bg-night-900 text-white">{children}</body>
    </html>
  );
}
