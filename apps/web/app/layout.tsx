import type { Metadata } from "next";
import { Space_Grotesk, Instrument_Sans } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "TruckerIO Demo",
  description: "Back-office + driver-friendly logistics demo",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#f8f5f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} min-h-screen`}>{children}</body>
    </html>
  );
}
