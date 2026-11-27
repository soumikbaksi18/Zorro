import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Tracker } from "./Tracker";

export const metadata: Metadata = { title: "Tracker · Zorro" };

export default function TrackerPage() {
  return (
    <>
      <PageHeader
        title="Tracker"
        lead="Every payment and conversion, with what it cost you in ZEC."
        action={
          <a href="/api/tracker/export" download className="flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-2 text-xs font-medium hover:border-brand" aria-label="Download all payments as CSV">
            <Download size={14} aria-hidden="true" /> CSV
          </a>
        }
      />
      <Tracker />
    </>
  );
}
