import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const title = "Arcadia — Your life changes. Your plan should too.";
const description =
  "Arcadia builds an intelligent study plan around your classes, deadlines and commitments — and reorganises it when life changes.";

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
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-black text-white">{children}</body>
    </html>
  );
}
