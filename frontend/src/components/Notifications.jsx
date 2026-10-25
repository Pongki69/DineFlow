import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { api } from "../api";
import { EmptyState, Feedback, Skeleton } from "./ui";

export function Notifications({ showBadge = true }) {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const region = useRef(null);
  const trigger = useRef(null);
  async function load(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const result = await api("/notifications");
      setItems(result.data || []);
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
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      } else if (
        event.type === "pointerdown" &&
        !region.current?.contains(event.target)
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
  return (
    <div className="notification-center" ref={region}>
      <button
        ref={trigger}
        className="icon-button notification-trigger"
        type="button"
        aria-label={`Notifications${showBadge && count ? `, ${count} unread` : ""}`}
        aria-expanded={open}
        aria-controls="recent-notifications"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) load(true);
        }}
      >
        <Bell size={21} aria-hidden="true" />
        {showBadge && count > 0 && (
          <span className="notification-count">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <section
          id="recent-notifications"
          className="notification-popover"
          aria-label="Recent notifications"
        >
          <div className="popover-heading">
            <h2>Recent updates</h2>
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
            items.map((item) => (
              <button
                className={`notification-item ${item.read_at ? "" : "unread"}`}
                key={item.id}
                onClick={() => markRead(item)}
              >
                <b>{item.data?.title || "Restaurant update"}</b>
                <span>
                  {item.data?.message || "There is an update to your account."}
                </span>
                <small>
                  {new Date(item.created_at).toLocaleString()}
                  {!item.read_at && " · Mark as read"}
                </small>
              </button>
            ))
          )}
        </section>
      )}
    </div>
  );
}
