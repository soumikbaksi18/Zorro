import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Screen header: optional back link, big title, optional subtitle and a right-hand action. */
export function PageHeader({
  title,
  lead,
  back,
  action,
}: {
  title: string;
  lead?: string;
  back?: { href: string; label: string };
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="-ml-1 mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-snow">
          <ChevronLeft size={18} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <h1 className="page-title">{title}</h1>
        {action}
      </div>
      {lead && <p className="page-lead">{lead}</p>}
    </header>
  );
}
