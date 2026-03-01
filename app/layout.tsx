import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeController } from "@/components/theme/theme-controller";

/* ============================================================================
   Root Layout — wraps the entire application
   ============================================================================ */

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PropManager — Property Management",
  description: "Full-featured property management application with double-entry accounting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tooling like browser automation can inject DOM attributes pre-hydration.
  // Suppressing root hydration warnings prevents false-positive console noise.
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
