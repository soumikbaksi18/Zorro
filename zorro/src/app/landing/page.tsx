import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Zorro: private cash, pay in any coin",
  description: "Hold ZEC and pay anyone in the coin they want. Autopay, payment links and a tracker for every rupee, powered by NEAR Intents.",
};

export default function LandingPage() {
  return <Landing />;
}
