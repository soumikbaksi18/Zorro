import type { Metadata } from "next";
import { AskFlow } from "./AskFlow";

export const metadata: Metadata = { title: "Ask Zorro · Zorro" };

export default function AskPage() {
  return <AskFlow />;
}
