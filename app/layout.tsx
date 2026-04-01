import type { Metadata } from "next";
import { Geist } from "next/font/google";
import AppShell from "./_components/AppShell";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

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
      <body className={geistSans.variable}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
