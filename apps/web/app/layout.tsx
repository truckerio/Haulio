import type { Metadata } from "next";
import "./globals.css";
import { IdleLogout } from "@/components/idle-logout";
import { CanonicalHost } from "@/components/canonical-host";
import { UserProvider } from "@/components/auth/user-context";
import { AppearanceRuntime } from "@/components/appearance/appearance-runtime";
import { UiTelemetryRuntime } from "@/components/telemetry/ui-telemetry-runtime";

export const metadata: Metadata = {
  title: "Haulio",
  description: "Back-office + driver-friendly logistics console",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#f7f9f8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <UserProvider>
          <CanonicalHost />
          <AppearanceRuntime />
          <UiTelemetryRuntime />
          <IdleLogout />
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
