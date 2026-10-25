import { cloneElement, useId } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Inbox,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";

export function Button({
  children,
  busy = false,
  variant = "primary",
  className = "",
  disabled,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && <LoaderCircle size={17} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  id: suppliedId,
  ...props
}) {
  const uniqueId = useId();
  const id = suppliedId || uniqueId;
  const helpId = `${id}-help`;
  const inputProps = {
    id,
    "aria-describedby": hint || error ? helpId : undefined,
    "aria-invalid": error ? true : undefined,
    ...props,
  };
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {children ? (
        cloneElement(children, inputProps)
      ) : (
        <input {...inputProps} />
      )}
      {(hint || error) && (
        <small id={helpId} className={error ? "field-error" : "field-hint"}>
          {error || hint}
        </small>
      )}
    </div>
  );
}

export function Feedback({
  children,
  tone = "error",
  onRetry,
  title,
  className = "",
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={`ui-feedback ui-feedback--${tone} ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon size={20} aria-hidden="true" />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title = "Nothing here yet",
  description,
  action,
  to,
  onAction,
  compact = false,
}) {
  return (
    <div className={`empty-state ${compact ? "empty-state--compact" : ""}`}>
      <div className="empty-state-icon">
        <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action &&
        (to ? (
          <Link className="ui-button ui-button--secondary" to={to}>
            {action}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <Button variant="secondary" onClick={onAction}>
            {action}
          </Button>
        ))}
    </div>
  );
}

export function Skeleton({ label = "Loading content", cards = 3 }) {
  return (
    <div className="skeleton-grid" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="skeleton-card" aria-hidden="true">
          <div className="skeleton skeleton-thumb" />
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({ status }) {
  const good = [
    "paid",
    "completed",
    "delivered",
    "available",
    "confirmed",
    "active",
    "served",
  ].includes(status);
  const bad = [
    "cancelled",
    "failed",
    "no_show",
    "refunded",
    "unavailable",
    "deactivated",
  ].includes(status);
  return (
    <span
      data-status={status || "pending"}
      className={`status-badge status-badge--${good ? "good" : bad ? "muted" : "pending"}`}
    >
      <i aria-hidden="true" />
      {String(status || "pending").replaceAll("_", " ")}
    </span>
  );
}
