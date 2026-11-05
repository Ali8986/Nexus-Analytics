import { connection } from "next/server";
import { OverviewDashboard } from "@/components/overview-dashboard";
import { getOverviewDashboardData } from "@/lib/analytics/overview-data";

export default async function HomePage() {
  await connection();
  const data = await getOverviewDashboardData("30d");
  return <OverviewDashboard initialData={data} />;
}
