import { ChartNoAxesCombined } from "lucide-react";
import { ComingSoonPage } from "@/components/coming-soon-page";

export const metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <ComingSoonPage
      description="Dig deeper into revenue, product performance, and customer purchasing trends."
      icon={ChartNoAxesCombined}
      milestone="Milestone 6"
      title="Analytics"
    />
  );
}
