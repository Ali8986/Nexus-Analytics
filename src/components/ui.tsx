import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "small" | "icon";
};

export function Button({
  children,
  className = "",
  variant = "secondary",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button-${variant} button-${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${className}`.trim()}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function Surface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`surface ${className}`.trim()}>{children}</section>;
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "completed" || normalized === "active"
      ? "success"
      : normalized === "processing"
        ? "accent"
        : normalized === "pending"
          ? "warning"
          : normalized === "cancelled"
            ? "neutral"
            : "neutral";

  return (
    <span className={`status-badge status-${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {status}
    </span>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-mark" aria-hidden="true">
        ◇
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. Please try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <strong>{title}</strong>
      <p>{description}</p>
      {onRetry ? (
        <Button onClick={onRetry} size="small">
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton ${className}`} />;
}

export function TableSkeleton({
  headers,
  label,
  rows = 5,
  className = "",
}: {
  headers: string[];
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div aria-busy="true" className="table-scroll table-skeleton-wrap" role="status">
      <span className="sr-only">Loading {label}</span>
      <table aria-hidden="true" className={`data-table ${className}`.trim()}>
        <thead>
          <tr>{headers.map((header, index) => <th key={`${header}-${index}`} scope="col">{header}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {headers.map((header, column) => (
                <td key={`${header}-${column}`}>
                  <Skeleton className={`table-skeleton-line table-skeleton-line-${column % 4}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
