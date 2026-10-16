import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "VisionMed — Clinical Surveillance & Emergency Detection",
  description: "Real-time AI Medical Emergency Detection Dashboard with Computer Vision",
};

import { EmergencyAlertBanner } from "../components/notifications/EmergencyAlertBanner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#f8fafc] text-slate-900 min-h-screen`}
      >
        {children}
        <EmergencyAlertBanner />
      </body>
    </html>
  );
}
