import type { Metadata } from "next";
import { Suspense } from "react";
import { PayHub } from "./PayHub";

export const metadata: Metadata = { title: "Pay · Zorro" };

export default function PayPage() {
  return (
    <Suspense fallback={<div className="panel h-64 animate-pulse" />}>
      <PayHub />
    </Suspense>
  );
}
