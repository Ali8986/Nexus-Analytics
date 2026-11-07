import { Suspense } from "react";
import { connection } from "next/server";
import Loading from "../loading";
import { OverviewDashboard } from "@/components/overview-dashboard";
import { getOverviewDashboardData } from "@/lib/analytics/overview-data";

async function OverviewDashboardContent() {
  await connection();
  const data = await getOverviewDashboardData("30d");
  return <OverviewDashboard initialData={data} />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <OverviewDashboardContent />
    </Suspense>
  );
}
