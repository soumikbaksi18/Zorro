import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { ReceiveFlow } from "./ReceiveFlow";

export const metadata: Metadata = { title: "Add money · Zorro" };

export default function ReceivePage() {
  return (
    <>
      <PageHeader
        title="Add money"
        lead="Get a one-time address for any coin. It lands in your private Zorro balance."
        back={{ href: "/", label: "Home" }}
      />
      <ReceiveFlow />
    </>
  );
}
