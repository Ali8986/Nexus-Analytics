import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="loading-page">
      <span className="sr-only">Loading dashboard...</span>
      <div className="loading-banner"><Skeleton className="loading-line loading-line-long" /></div>
      <div className="loading-heading">
        <Skeleton className="loading-line loading-line-short" />
        <Skeleton className="loading-line loading-line-title" />
      </div>
      <div className="loading-kpis">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="loading-kpi" key={index} />)}
      </div>
      <div className="loading-panels">
        <Skeleton className="loading-chart" />
        <Skeleton className="loading-activity" />
      </div>
      <div className="loading-panels">
        <Skeleton className="loading-orders" />
        <Skeleton className="loading-products" />
      </div>
    </div>
  );
}
