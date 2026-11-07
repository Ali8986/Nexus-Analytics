import { Skeleton, Surface, TableSkeleton } from "@/components/ui";

export default function DashboardRouteLoading() {
  return (
    <div aria-busy="true" aria-label="Loading workspace page" className="customers-page">
      <div className="customers-page-heading">
        <div className="loading-heading">
          <Skeleton className="loading-line loading-line-short" />
          <Skeleton className="loading-line loading-line-title" />
          <Skeleton className="loading-line loading-line-long" />
        </div>
      </div>
      <Surface className="customers-surface">
        <TableSkeleton
          headers={["", "", "", "", "", ""]}
          label="workspace page"
        />
      </Surface>
    </div>
  );
}
