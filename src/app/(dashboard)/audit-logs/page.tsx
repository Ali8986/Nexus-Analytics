import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { AuditLogsManager } from "@/components/audit-logs-manager";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import { listAuditLogs } from "@/lib/services/audit-logs";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

export const metadata = { title: "Audit Logs" };
export const instant = false;

export default async function AuditLogsPage() {
  await connection();
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) redirect("/workspaces");

  const workspace = await resolveWorkspaceContext(selectedWorkspaceId);
  if (workspace.role !== "owner" && workspace.role !== "admin") notFound();

  let initialEvents: Awaited<ReturnType<typeof listAuditLogs>>["events"] = [];
  let initialHasMore = false;
  let initialError = "";
  let reportingTimezone = workspace.reportingTimezone;

  try {
    const result = await listAuditLogs(workspace.id, 0);
    initialEvents = result.events;
    initialHasMore = result.hasMore;
    reportingTimezone = result.reportingTimezone;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (error.code === "FORBIDDEN") notFound();
    initialError = publicErrorMessage(error);
  }

  return (
    <AuditLogsManager
      initialError={initialError}
      initialEvents={initialEvents}
      initialHasMore={initialHasMore}
      reportingTimezone={reportingTimezone}
      workspaceName={workspace.name}
    />
  );
}
