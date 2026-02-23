import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "YardOS Planning Studio",
  description: "Standalone consolidation planning system",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
