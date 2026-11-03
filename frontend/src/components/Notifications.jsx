import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, ChevronRight, X } from "lucide-react";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { EmptyState, Feedback, Skeleton } from "./ui";
import { notificationTarget } from "./notificationTarget";

// "Just now", "5m ago", "3h ago", then the date: quick to scan in a list.
function relativeTime(value) {
  const then = new Date(value);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h ago`;
  return then.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function Notifications({ showBadge = true, variant = "icon", user }) {
  const tab = variant === "tab";
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const region = useRef(null);
  const sheet = useRef(null);
  const trigger = useRef(null);
  // Tab variant: a short toast when a new unread alert arrives.
  const [toast, setToast] = useState(null);
  const seen = useRef(null);
  async function load(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const result = await api("/notifications");
      const next = result.data || [];
      if (tab) {
        const fresh = seen.current
          ? next.find((item) => !item.read_at && !seen.current.has(item.id))
          : null;
        seen.current = new Set(next.map((item) => item.id));
        if (fresh) setToast(fresh);
      }
      setItems(next);
      setCount(result.unread_count || 0);
      setError("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return subscribeToLiveChanges(load, ["notifications"]);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      } else if (
        event.type === "pointerdown" &&
        !region.current?.contains(event.target) &&
        !sheet.current?.contains(event.target)
      )
        setOpen(false);
    }
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [open]);
  async function markRead(item) {
    try {
      await api(`/notifications/${item.id}/read`, { method: "PATCH" });
      await load();
    } catch (failure) {
      setError(failure.message);
    }
  }
  // Opening an alert marks it read and goes to the record it is about.
  function openItem(item) {
    const target = notificationTarget(item, user);
    if (!item.read_at) markRead(item);
    if (!target) return;
    setOpen(false);
    navigate(target);
  }
  // Phones: the alerts sheet is drawn at the top of the app, so no bar, map
  // or floating button can sit above it.
  const sheetHost =
    tab && open ? document.querySelector(".dineflow-app") : null;
  const sheetLayer = (
    <>
      {open && tab && (
        <div
          className="notification-scrim"
          aria-hidden="true"
          onClick={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
      {open && (
        <section
          id="recent-notifications"
          className="notification-popover"
          aria-label="Recent notifications"
        >
          <div className="popover-heading">
            <h2>
              Recent updates
              {count > 0 && (
                <span className="notification-unread-label">{count} new</span>
              )}
            </h2>
            <button
              className="icon-button"
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {loading ? (
            <Skeleton cards={1} label="Loading notifications" />
          ) : error ? (
            <Feedback onRetry={() => load(true)}>{error}</Feedback>
          ) : !items.length ? (
            <EmptyState
              compact
              icon={CheckCheck}
              title="You’re all caught up"
              description="Order and reservation updates will appear here."
            />
          ) : (
            (tab
              ? [...items].sort(
                  (a, b) => Number(!!a.read_at) - Number(!!b.read_at),
                )
              : items
            ).map((item, index, list) => (
              <Fragment key={item.id}>
                {tab &&
                  (index === 0 ||
                    !!list[index - 1].read_at !== !!item.read_at) && (
                    <h3 className="notification-group">
                      {item.read_at ? "Earlier" : "New"}
                    </h3>
                  )}
                <button
                  className={`notification-item ${item.read_at ? "" : "unread"}${notificationTarget(item, user) ? " has-target" : ""}`}
                  key={item.id}
                  onClick={() => openItem(item)}
                >
                  <b>{item.data?.title || "Restaurant update"}</b>
                  <span>
                    {item.data?.message ||
                      "There is an update to your account."}
                  </span>
                  <small>
                    <time
                      dateTime={item.created_at}
                      title={new Date(item.created_at).toLocaleString()}
                    >
                      {relativeTime(item.created_at)}
                    </time>
                    {notificationTarget(item, user)
                      ? " · View details"
                      : !item.read_at && " · Mark as read"}
                  </small>
                  {notificationTarget(item, user) && (
                    <ChevronRight
                      className="notification-item-go"
                      size={18}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </Fragment>
            ))
          )}
        </section>
      )}
    </>
  );
  return (
    <div
      className={`notification-center${tab ? " notification-center--tab" : ""}`}
      ref={region}
    >
      <button
        ref={trigger}
        className={
          tab ? "notification-trigger" : "icon-button notification-trigger"
        }
        type="button"
        aria-label={`Notifications${showBadge && count ? `, ${count} unread` : ""}`}
        aria-expanded={open}
        aria-controls="recent-notifications"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) load(true);
        }}
      >
        <span className="notification-trigger-icon">
          <Bell size={tab ? 22 : 21} aria-hidden="true" />
          {showBadge && count > 0 && (
            <span className="notification-count">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
        {tab && <small>Alerts</small>}
      </button>
      {toast && !open && (
        <button
          type="button"
          className="notification-toast"
          role="status"
          onClick={() => {
            setToast(null);
            if (notificationTarget(toast, user)) openItem(toast);
            else {
              setOpen(true);
              load(true);
            }
          }}
        >
          <Bell size={18} aria-hidden="true" />
          <span>
            <b>{toast.data?.title || "New update"}</b>
            {toast.data?.message && <small>{toast.data.message}</small>}
          </span>
        </button>
      )}
      {sheetHost
        ? createPortal(
            <div
              className="notification-center--tab notification-portal"
              ref={sheet}
            >
              {sheetLayer}
            </div>,
            sheetHost,
          )
        : sheetLayer}
    </div>
  );
}
