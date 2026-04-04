import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AuthProvider } from "./_components/AuthProvider";
import AppShell from "./_components/AppShell";
import { getAuthContext } from "@/lib/auth/server";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Tycoon Order Portal",
  description: "Internal order portal for Tycoon battery-operated vehicles",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthContext();

  return (
    <html lang="en">
      <body className={geistSans.variable}>
        <AuthProvider value={auth}>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
