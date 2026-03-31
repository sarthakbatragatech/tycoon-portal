import type { Metadata } from "next";
import AppShell from "./_components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tycoon Order Portal",
  description: "Internal order portal for Tycoon battery-operated vehicles",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
