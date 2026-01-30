import type { Metadata } from "next";
import "./globals.css";
import { IdleLogout } from "@/components/idle-logout";
import { CanonicalHost } from "@/components/canonical-host";
import { AuthKeepalive } from "@/components/auth-keepalive";

export const metadata: Metadata = {
  title: "Haulio",
  description: "Back-office + driver-friendly logistics console",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#f8f5f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <CanonicalHost />
        <AuthKeepalive />
        <IdleLogout />
        {children}
      </body>
    </html>
  );
}
