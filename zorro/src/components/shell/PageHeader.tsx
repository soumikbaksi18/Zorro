import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Screen header: optional round back button, big title, optional subtitle and a right-hand action. */
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
        <Link href={back.href} aria-label={`Back to ${back.label}`} title={back.label} className="icon-btn mb-4">
          <ArrowLeft size={19} aria-hidden="true" />
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
