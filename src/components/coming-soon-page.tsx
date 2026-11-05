import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Sparkles } from "lucide-react";
import { Surface } from "@/components/ui";

export function ComingSoonPage({
  title,
  description,
  icon: Icon,
  milestone,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  milestone: string;
}) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-breadcrumb"><Link href="/">Overview</Link><span>/</span><span>{title}</span></div>
      <Surface className="placeholder-card">
        <span className="placeholder-icon"><Icon size={22} strokeWidth={1.8} /></span>
        <span className="placeholder-badge"><Sparkles size={13} /> Coming in {milestone}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="placeholder-divider" />
        <p className="placeholder-detail">This demo currently uses fictional sample data. This section will connect to your workspace after the next implementation milestone.</p>
        <Link className="button button-secondary" href="/"><ArrowLeft size={15} /> Back to overview</Link>
        <span className="placeholder-explore">Preview the <Link href="/">dashboard overview <ArrowUpRight size={13} /></Link></span>
      </Surface>
    </div>
  );
}
