import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { AskFlow } from "./AskFlow";

export const metadata: Metadata = { title: "Ask AI · Zorro" };

export default function AskPage() {
  return (
    <>
      <PageHeader title="Ask Zorro" lead="Say what you want to pay. Zorro drafts it, you check it, and nothing moves until you confirm." back={{ href: "/", label: "Home" }} />
      <AskFlow />
    </>
  );
}
