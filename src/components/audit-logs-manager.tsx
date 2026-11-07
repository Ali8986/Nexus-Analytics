"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadAuditLogs } from "@/app/actions/audit-logs";
import type { AuditLogItem } from "@/lib/services/audit-logs";
import { formatAuditTimestamp } from "@/lib/audit-logs/presentation";
import {
  Button,
  EmptyState,
  ErrorState,
  Surface,
  TableSkeleton,
} from "@/components/ui";

const pageSize = 25;

function shortId(value: string): string {
  return `${value.slice(0, 8)}…`;
}

function displayLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function AuditLogsManager({
  initialError,
  initialEvents,
  initialHasMore,
  reportingTimezone,
  workspaceName,
}: {
  initialError: string;
  initialEvents: AuditLogItem[];
  initialHasMore: boolean;
  reportingTimezone: string;
  workspaceName: string;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);
  const [selectedEvent, setSelectedEvent] = useState<AuditLogItem | null>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const dialogOpen = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const dialog = detailDialog.current;
    if (!dialog) return;
    if (selectedEvent && !dialog.open) {
      dialog.showModal();
      dialogOpen.current = true;
    } else if (!selectedEvent && dialog.open) {
      dialog.close();
      dialogOpen.current = false;
    }
  }, [selectedEvent]);

  async function loadPage(nextOffset: number) {
    const requestId = ++requestIdRef.current;
    setPending(true);
    setError("");
    try {
      const result = await loadAuditLogs({ offset: nextOffset });
      if (requestId !== requestIdRef.current) return;
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEvents(result.data.events);
      setHasMore(result.data.hasMore);
      setOffset(nextOffset);
    } catch {
      if (requestId === requestIdRef.current) {
        setError("Audit logs could not be loaded. Please try again.");
      }
    } finally {
      if (requestId === requestIdRef.current) setPending(false);
    }
  }

  return (
    <div className="audit-page">
      <div className="audit-page-heading">
        <div>
          <p className="eyebrow">WORKSPACE ACTIVITY</p>
          <h1>Audit Logs</h1>
          <p>Review the append-only activity history for {workspaceName}.</p>
        </div>
        <span className="audit-access-note">Read-only · Owner and Admin</span>
      </div>

      <Surface className="audit-surface">
        {error && events.length === 0 ? (
          <ErrorState
            description={error}
            onRetry={() => void loadPage(offset)}
            title="Audit logs couldn’t be loaded"
          />
        ) : (
          <>
            {error ? (
              <div className="audit-inline-error" role="alert">
                {error}
                <Button onClick={() => void loadPage(offset)} size="small" type="button">
                  Try again
                </Button>
              </div>
            ) : null}
            {pending && events.length === 0 ? (
              <TableSkeleton
                className="audit-table"
                headers={["Timestamp", "Actor", "Action", "Entity", "Entity ID", "Details"]}
                label="audit logs"
              />
            ) : events.length === 0 ? (
              <EmptyState
                description="Workspace activity will appear here as supported actions are recorded."
                title="No audit events yet"
              />
            ) : (
              <>
                <div className="table-scroll">
                  <table className="data-table audit-table">
                    <thead>
                      <tr>
                        <th scope="col">Timestamp</th>
                        <th scope="col">Actor</th>
                        <th scope="col">Action</th>
                        <th scope="col">Entity</th>
                        <th scope="col">Entity ID</th>
                        <th scope="col">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id}>
                          <td className="audit-timestamp">
                            {formatAuditTimestamp(event.createdAt, reportingTimezone)}
                          </td>
                          <td>
                            {event.actorUserId
                              ? `User · ${shortId(event.actorUserId)}`
                              : "System"}
                          </td>
                          <td>
                            <span className="audit-action">{displayLabel(event.action)}</span>
                          </td>
                          <td>{displayLabel(event.entityType)}</td>
                          <td className="audit-id">
                            {event.entityId ? shortId(event.entityId) : "—"}
                          </td>
                          <td>
                            <Button
                              onClick={() => setSelectedEvent(event)}
                              size="small"
                              type="button"
                            >
                              View details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div aria-live="polite" className="audit-pagination">
                  <span>
                    Showing {offset + 1}–{offset + events.length} events
                    {pending ? (
                      <span className="audit-refreshing">
                        <LoaderCircle aria-hidden="true" className="inline-spinner" size={13} /> Updating
                      </span>
                    ) : null}
                  </span>
                  <div>
                    <Button
                      disabled={pending || offset === 0}
                      onClick={() => void loadPage(Math.max(0, offset - pageSize))}
                      size="small"
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={pending || !hasMore}
                      onClick={() => void loadPage(offset + pageSize)}
                      size="small"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Surface>

      <dialog
        aria-labelledby="audit-event-title"
        className="audit-detail-dialog"
        onCancel={(event) => {
          event.preventDefault();
          setSelectedEvent(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedEvent(null);
        }}
        onClose={() => {
          if (dialogOpen.current) {
            dialogOpen.current = false;
            setSelectedEvent(null);
          }
        }}
        ref={detailDialog}
      >
        {selectedEvent ? (
          <Surface className="audit-detail-card">
            <div className="audit-detail-heading">
              <div>
                <p className="auth-eyebrow">AUDIT EVENT</p>
                <h2 id="audit-event-title">
                  {displayLabel(selectedEvent.action)} {displayLabel(selectedEvent.entityType)}
                </h2>
                <p>{formatAuditTimestamp(selectedEvent.createdAt, reportingTimezone)}</p>
              </div>
              <Button onClick={() => setSelectedEvent(null)} size="small" type="button">
                Close
              </Button>
            </div>
            <dl className="audit-detail-fields">
              <div>
                <dt>Event ID</dt>
                <dd>{selectedEvent.id}</dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>{selectedEvent.actorUserId ?? "System"}</dd>
              </div>
              <div>
                <dt>Entity ID</dt>
                <dd>{selectedEvent.entityId ?? "—"}</dd>
              </div>
            </dl>
            <h3>Safe metadata</h3>
            <pre>{JSON.stringify(selectedEvent.metadata, null, 2)}</pre>
          </Surface>
        ) : null}
      </dialog>
    </div>
  );
}
