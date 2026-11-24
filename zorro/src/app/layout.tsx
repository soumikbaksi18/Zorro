import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zorro: ZEC take-profit, stop-loss & DCA",
  description:
    "Set take-profit, stop-loss, limit orders and recurring buys for Zcash, powered by NEAR Intents. Zorro never holds your funds.",
  applicationName: "Zorro",
  appleWebApp: {
    capable: true,
    title: "Zorro",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh font-sans">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[calc(5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
