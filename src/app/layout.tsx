import type { Metadata, Viewport } from "next";
import { Geist_Mono, Sora } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zorro: private cash for Zcash",
  description:
    "Hold ZEC and pay anyone, in any coin they want. Autopay, get-paid links and a tracker for every payment, through NEAR Intents.",
  applicationName: "Zorro",
  appleWebApp: {
    capable: true,
    title: "Zorro",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#070b08",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
