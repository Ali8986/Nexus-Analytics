import { Suspense } from "react";
import { connection } from "next/server";
import { AnalyticsDashboard, AnalyticsLoading } from "@/components/analytics-dashboard";
import { getAnalyticsDashboardData } from "@/lib/analytics/dashboard-data";

export const metadata = { title: "Analytics" };

async function AnalyticsDashboardContent() {
  await connection();
  const data = await getAnalyticsDashboardData("30d", "revenue");
  return <AnalyticsDashboard initialData={data} />;
}

export default function AnalyticsPage() {
  return <Suspense fallback={<AnalyticsLoading />}><AnalyticsDashboardContent /></Suspense>;
}
