import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const deploymentUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL ??
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(
    deploymentUrl.startsWith("http") ? deploymentUrl : `https://${deploymentUrl}`,
  ),
  title: "WINNING POST",
  description: "모바일로 즐기는 짜릿한 경마, 지금 레이스에 참여하세요.",
  openGraph: {
    title: "WINNING POST",
    description: "모바일로 즐기는 짜릿한 경마, 지금 레이스에 참여하세요.",
    siteName: "WINNING POST",
    locale: "ko_KR",
    type: "website",
  },
};

// Without cover, iOS reports env(safe-area-inset-*) as 0 and the race HUD cannot avoid the notch.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
