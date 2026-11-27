import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { SetupFlow } from "./SetupFlow";

export const metadata: Metadata = { title: "Create wallet · Zorro" };

export default function SetupPage() {
  return (
    <>
      <PageHeader
        title="Create your wallet"
        lead="One Face ID creates a private wallet on NEAR Intents that only you control. Zorro can only pay people you approve, up to your daily limit."
        back={{ href: "/", label: "Home" }}
      />
      <SetupFlow />
    </>
  );
}
