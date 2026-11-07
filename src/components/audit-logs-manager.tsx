"use client";

import {
  Activity,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadAuditLogs } from "@/app/actions/audit-logs";
import type { AuditLogItem } from "@/lib/services/audit-logs";
import {
  auditActionKey,
  describeAuditEvent,
  filterAuditEvents,
  formatAuditTimestamp,
  formatAuditTimestampWithZone,
  presentAuditMetadata,
} from "@/lib/audit-logs/presentation";
import {
  Button,
  EmptyState,
  ErrorState,
  Surface,
  TableSkeleton,
} from "@/components/ui";

const pageSize = 25;

function actorLabel(actorUserId: string | null) {
  return actorUserId ? "Workspace member" : "System";
}

function actionCategory(event: AuditLogItem) {
  return event.entityType === "order" ? "orders" :
    event.entityType === "customer" || event.entityType === "membership" ? "people" :
      event.entityType === "product" ? "products" :
        event.entityType === "export" ? "exports" : "workspace";
}

const emptyFilters = {
  query: "",
  action: "",
  resourceType: "",
  fromDate: "",
  toDate: "",
};

function hasActiveFilters(filters: typeof emptyFilters) {
  return Object.values(filters).some(Boolean);
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
  const [filters, setFilters] = useState(emptyFilters);
  const [selectedEvent, setSelectedEvent] = useState<AuditLogItem | null>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const dialogOpen = useRef(false);
  const requestIdRef = useRef(0);

  const actionOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const event of events) options.set(auditActionKey(event), describeAuditEvent(event).actionLabel);
    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [events]);
  const resourceOptions = useMemo(
    () => [...new Set(events.map((event) => event.entityType))].sort(),
    [events],
  );
  const filteredEvents = useMemo(
    () => filterAuditEvents(events, filters, reportingTimezone),
    [events, filters, reportingTimezone],
  );

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

  const selectedPresentation = selectedEvent ? describeAuditEvent(selectedEvent) : null;
  const selectedMetadata = selectedEvent ? presentAuditMetadata(selectedEvent) : [];
  const filtering = hasActiveFilters(filters);
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
            <div className="audit-filter-panel">
              <label className="audit-search">
                <Search aria-hidden="true" size={16} />
                <span className="sr-only">Search this page</span>
                <input
                  onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                  placeholder="Search action, actor ID, or resource reference"
                  type="search"
                  value={filters.query}
                />
              </label>
              <label>
                <span>Action</span>
                <select
                  onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
                  value={filters.action}
                >
                  <option value="">All actions</option>
                  {actionOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label>
                <span>Resource</span>
                <select
                  onChange={(event) => setFilters((current) => ({ ...current, resourceType: event.target.value }))}
                  value={filters.resourceType}
                >
                  <option value="">All resources</option>
                  {resourceOptions.map((resource) => (
                    <option key={resource} value={resource}>
                      {describeAuditEvent({
                        action: "",
                        entityType: resource,
                        entityId: null,
                        actorUserId: null,
                        metadata: {},
                        createdAt: "",
                      }).resourceLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>From</span>
                <input
                  onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))}
                  type="date"
                  value={filters.fromDate}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))}
                  type="date"
                  value={filters.toDate}
                />
              </label>
              <Button
                disabled={!filtering}
                onClick={() => setFilters(emptyFilters)}
                size="small"
                type="button"
              >
                <X aria-hidden="true" size={14} /> Clear
              </Button>
              <span className="audit-filter-scope">Filters apply to this page of up to {pageSize} events.</span>
            </div>
            {pending && events.length === 0 ? (
              <TableSkeleton
                className="audit-table"
                headers={["Action", "Actor", "Resource", "Details", "Date and time", "Event details"]}
                label="audit logs"
              />
            ) : events.length === 0 ? (
              <EmptyState
                description="Workspace activity will appear here as supported actions are recorded."
                title="No audit events yet"
              />
            ) : filteredEvents.length === 0 ? (
              <>
                <div className="audit-filter-empty">
                  <EmptyState
                    description="Try a different search or clear some filters. Pagination lets you inspect another page of activity."
                    title="No matching events on this page"
                  />
                  {filtering ? (
                    <Button onClick={() => setFilters(emptyFilters)} size="small" type="button">
                      Clear filters
                    </Button>
                  ) : null}
                </div>
                <div className="audit-pagination">
                  <span>Events {offset + 1}–{offset + events.length} on this page · no matches</span>
                  <div>
                    <Button
                      disabled={pending || offset === 0}
                      onClick={() => void loadPage(Math.max(0, offset - pageSize))}
                      size="small"
                      type="button"
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={pending || !hasMore}
                      onClick={() => void loadPage(offset + pageSize)}
                      size="small"
                      type="button"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div
                  aria-label="Audit events table"
                  className="table-scroll audit-table-scroll"
                  role="region"
                  tabIndex={0}
                >
                  <table className="data-table audit-table">
                    <thead>
                      <tr>
                        <th scope="col">Action</th>
                        <th scope="col">Actor</th>
                        <th scope="col">Resource</th>
                        <th scope="col">Details</th>
                        <th scope="col">Date and time</th>
                        <th scope="col">Event details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map((event) => {
                        const presentation = describeAuditEvent(event);
                        return (
                          <tr key={event.id}>
                            <td>
                              <span className="audit-event-title">
                                <span className={`audit-action-indicator audit-category-${actionCategory(event)}`}>
                                  <Activity aria-hidden="true" size={15} />
                                </span>
                                <span className="audit-action">{presentation.actionLabel}</span>
                              </span>
                            </td>
                            <td>{actorLabel(event.actorUserId)}</td>
                            <td>{presentation.resourceTypeLabel}</td>
                            <td className="audit-summary">
                              <span>{presentation.detail}</span>
                            </td>
                            <td className="audit-timestamp">
                              <time
                                aria-label={formatAuditTimestampWithZone(event.createdAt, reportingTimezone)}
                                dateTime={event.createdAt}
                                title={formatAuditTimestampWithZone(event.createdAt, reportingTimezone)}
                              >
                                {formatAuditTimestamp(event.createdAt, reportingTimezone)}
                              </time>
                            </td>
                            <td className="audit-event-action">
                              <Button
                                aria-label={`View ${presentation.actionLabel} details`}
                                onClick={() => {
                                  setSelectedEvent(event);
                                }}
                                size="small"
                                type="button"
                              >
                                View details
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div aria-live="polite" className="audit-pagination">
                  <span>
                  Events {events.length ? offset + 1 : 0}–{offset + events.length} on this page · {filteredEvents.length} match
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
                      type="button"
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={pending || !hasMore}
                      onClick={() => void loadPage(offset + pageSize)}
                      size="small"
                      type="button"
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
        {selectedEvent && selectedPresentation ? (
          <Surface className="audit-detail-card">
            <div className="audit-detail-heading">
              <div>
                <p className="auth-eyebrow">AUDIT EVENT</p>
                <h2 id="audit-event-title">{selectedPresentation.actionLabel}</h2>
                <p>
                  <time
                    dateTime={selectedEvent.createdAt}
                    title={formatAuditTimestampWithZone(selectedEvent.createdAt, reportingTimezone)}
                  >
                    {formatAuditTimestampWithZone(selectedEvent.createdAt, reportingTimezone)}
                  </time>
                </p>
              </div>
              <Button onClick={() => setSelectedEvent(null)} size="small" type="button">
                Close
              </Button>
            </div>
            <dl className="audit-detail-fields audit-readable-details">
              <div><dt>Actor</dt><dd>{actorLabel(selectedEvent.actorUserId)}</dd></div>
              <div><dt>Resource</dt><dd>{selectedPresentation.resourceLabel}</dd></div>
            </dl>
            {selectedMetadata.length ? (
              <section aria-label="Recorded changes" className="audit-change-section">
                <h3>Changes</h3>
                {selectedMetadata.some(({ kind }) => kind === "status") ? (
                  <div aria-label="Order status change" className="audit-status-changes" role="group">
                    {selectedMetadata.filter(({ kind }) => kind === "status").map(({ label, value }) => (
                      <div className="audit-status-change" key={label}>
                        <span className="audit-status-label">{label}</span>
                        <span
                          aria-label={`${label}: ${value}`}
                          className={`audit-status-chip audit-status-${value.toLowerCase()}`}
                        >
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {selectedMetadata.some(({ kind }) => kind === "text") ? (
                  <dl className="audit-change-list">
                    {selectedMetadata.filter(({ kind }) => kind === "text").map(({ label, value }) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </section>
            ) : null}
          </Surface>
        ) : null}
      </dialog>
    </div>
  );
}
