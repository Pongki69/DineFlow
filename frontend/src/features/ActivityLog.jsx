import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bike,
  CalendarDays,
  ChefHat,
  LayoutGrid,
  Settings2,
  ShoppingBag,
  UserRound,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { EmptyState, Feedback, Skeleton } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { DatePicker } from "../components/DatePicker";
import { useAdminDesktop } from "../components/adminDesk";
import { useDragScroll } from "../components/useDragScroll";
import "./activityLog.css";

export const ACTIVITY_AREAS = [
  ["", "All", Activity],
  ["orders", "Orders", ShoppingBag],
  ["kitchen", "Kitchen", ChefHat],
  ["cashier", "Cashier", Wallet],
  ["tables", "Tables", LayoutGrid],
  ["bookings", "Bookings", CalendarDays],
  ["delivery", "Delivery", Bike],
  ["menu", "Menu", UtensilsCrossed],
  ["setup", "Setup", Settings2],
  ["accounts", "Accounts", UserRound],
];
const areaIcon = (area) =>
  ACTIVITY_AREAS.find(([value]) => value === area)?.[2] || Activity;

/** "Today", "Yesterday" or the date, for the day headings. */
export function activityDay(value, now = new Date()) {
  const day = new Date(value);
  const start = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((start(now) - start(day)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return day.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/** Entries in order, split into day groups. */
export function groupByDay(entries) {
  const groups = [];
  for (const entry of entries) {
    const key = new Date(entry.created_at).toDateString();
    if (groups.at(-1)?.key !== key)
      groups.push({ key, at: entry.created_at, entries: [] });
    groups.at(-1).entries.push(entry);
  }
  return groups;
}

function useActivity(endpoint, filters) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    rows: [],
    meta: null,
  });
  const request = useRef(null);
  const key = JSON.stringify(filters);
  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const params = new URLSearchParams(
      Object.entries(JSON.parse(key)).filter(([, value]) => value),
    );
    try {
      const result = await api(`${endpoint}?${params}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setState({
        loading: false,
        error: "",
        rows: result.data || [],
        meta: {
          page: result.current_page || 1,
          lastPage: result.last_page || 1,
          total: result.total ?? 0,
          from: result.from || 0,
          to: result.to || 0,
        },
      });
    } catch (failure) {
      if (!controller.signal.aborted)
        setState((current) => ({
          ...current,
          loading: false,
          error: failure.message,
        }));
    }
  }
  useEffect(() => {
    load();
    const stop = subscribeToLiveChanges(load);
    return () => {
      stop();
      request.current?.abort();
    };
    // `key` carries every filter.
  }, [endpoint, key]);
  return { ...state, reload: load };
}

// The day to send: the picked one, or today when only a time is set.
function activityRange(day, fromTime, toTime) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = day || (fromTime || toTime ? today : "");
  return {
    from: date,
    to: date,
    from_time: date ? fromTime : "",
    to_time: date ? toTime : "",
  };
}

function ActivityFilters({
  area,
  setArea,
  day,
  setDay,
  fromTime = "",
  setFromTime,
  toTime = "",
  setToTime,
  // Extra filters in the row (the Audit log person): whether one is set,
  // and how to reset it, so Clear covers them too.
  extraActive = false,
  onClearExtra,
  children,
}) {
  const chipsRef = useDragScroll();
  const anySet = Boolean(day || fromTime || toTime || extraActive);
  return (
    <div className="activity-filters">
      <div
        className="activity-chips"
        role="group"
        aria-label="Area"
        ref={chipsRef}
      >
        {ACTIVITY_AREAS.map(([value, text]) => (
          <button
            key={value || "all"}
            type="button"
            aria-pressed={area === value}
            onClick={() => setArea(value)}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="activity-filter-row">
        {children}
        <div className="activity-day">
          <DatePicker
            label="Day"
            value={day}
            onChange={(value) => setDay(value || "")}
          />
          {setFromTime && (
            <div
              className="activity-time"
              role="group"
              aria-label="Time of day"
            >
              <label>
                <span>From</span>
                <input
                  type="time"
                  value={fromTime}
                  onChange={(event) => setFromTime(event.target.value)}
                  aria-label="From time"
                />
              </label>
              <label>
                <span>to</span>
                <input
                  type="time"
                  value={toTime}
                  onChange={(event) => setToTime(event.target.value)}
                  aria-label="To time"
                />
              </label>
            </div>
          )}
          <button
            type="button"
            className="activity-clear"
            disabled={!anySet}
            onClick={() => {
              setDay("");
              setFromTime?.("");
              setToTime?.("");
              onClearExtra?.();
            }}
          >
            <X size={14} aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

// "Just now", "12 min ago", "3 h ago" for today; earlier days show the date.
function sinceLabel(value) {
  const at = new Date(value);
  const minutes = Math.round((Date.now() - at.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60 && at.toDateString() === new Date().toDateString())
    return `${Math.floor(minutes / 60)} h ago`;
  return at.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ActivityList({ rows, showActor }) {
  // Admin desktop: a timestamp column down the left, like a timeline.
  const desk = useAdminDesktop();
  return groupByDay(rows).map((group) => (
    <section className="activity-group" key={group.key}>
      <h2>{activityDay(group.at)}</h2>
      <ol>
        {group.entries.map((entry) => {
          const Icon = areaIcon(entry.area);
          return (
            <li key={entry.id} data-area={entry.area}>
              {desk && (
                <time className="activity-stamp" dateTime={entry.created_at}>
                  <strong>
                    {new Date(entry.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </strong>
                  <small>{sinceLabel(entry.created_at)}</small>
                </time>
              )}
              <span className="activity-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <div>
                <p>{entry.summary}</p>
                <small>
                  {!desk && (
                    <time dateTime={entry.created_at}>
                      {new Date(entry.created_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </time>
                  )}
                  {showActor && (
                    <>
                      {desk ? "" : " · "}
                      <strong>{entry.actor?.name || "System"}</strong>
                      {entry.actor?.role && ` (${entry.actor.role})`}
                    </>
                  )}
                  {showActor && entry.ip_address && (
                    <span className="activity-device">
                      {" · "}device {entry.ip_address}
                    </span>
                  )}
                </small>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  ));
}

function ActivityBody({ data, filtered, page, setPage, showActor }) {
  return (
    <>
      {data.error && <Feedback onRetry={data.reload}>{data.error}</Feedback>}
      {data.loading && (
        <Skeleton
          label="Loading activity"
          layout={{ body: "list", rows: 10 }}
        />
      )}
      {!data.loading && !data.error && data.rows.length === 0 && (
        <EmptyState
          title={filtered ? "Nothing matches" : "No activity yet"}
          description={
            filtered
              ? "Try another area, person or day."
              : "Actions you take in the app are listed here as they happen."
          }
        />
      )}
      {!data.loading && data.rows.length > 0 && (
        <ActivityList rows={data.rows} showActor={showActor} />
      )}
      {!data.loading && data.meta && data.meta.lastPage > 1 && (
        <Pagination
          page={page}
          lastPage={data.meta.lastPage}
          total={data.meta.total}
          from={data.meta.from}
          to={data.meta.to}
          onChange={(value) => {
            setPage(value);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </>
  );
}

/** Every staff member: what they did, so their own work is on record. */
export function MyActivity() {
  const [area, setArea] = useState("");
  const [day, setDay] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [page, setPage] = useState(1);
  const data = useActivity("/activity", {
    area,
    ...activityRange(day, fromTime, toTime),
    page,
    per_page: 25,
  });
  const reset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };
  return (
    <section className="welcome activity-page">
      <span className="eyebrow">YOUR RECORD</span>
      <h1>My activity</h1>
      <p>
        Everything you've done in DineFlow, with the time it happened. Only you
        and the administrator can see it.
      </p>
      <ActivityFilters
        area={area}
        setArea={reset(setArea)}
        day={day}
        setDay={reset(setDay)}
        fromTime={fromTime}
        setFromTime={reset(setFromTime)}
        toTime={toTime}
        setToTime={reset(setToTime)}
      />
      <ActivityBody
        data={data}
        filtered={!!(area || day)}
        page={page}
        setPage={setPage}
      />
    </section>
  );
}

/** Administrators: everyone's actions, by person, area and day. */
export function TeamActivity() {
  const [area, setArea] = useState("");
  const [day, setDay] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [person, setPerson] = useState("");
  const [page, setPage] = useState(1);
  const [people, setPeople] = useState([]);
  useEffect(() => {
    api("/admin/activity/people")
      .then((result) => setPeople(result.data || []))
      .catch(() => setPeople([]));
  }, []);
  const data = useActivity("/admin/activity", {
    area,
    actor_id: person,
    ...activityRange(day, fromTime, toTime),
    page,
    per_page: 25,
  });
  const reset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };
  return (
    <section className="welcome activity-page">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>Audit log</h1>
      <p>
        Who did what, and when, across every workspace. Use it to trace a
        problem to the right person instead of guessing.
      </p>
      <ActivityFilters
        area={area}
        setArea={reset(setArea)}
        day={day}
        setDay={reset(setDay)}
        fromTime={fromTime}
        setFromTime={reset(setFromTime)}
        toTime={toTime}
        setToTime={reset(setToTime)}
        extraActive={Boolean(person)}
        onClearExtra={() => reset(setPerson)("")}
      >
        <label className="activity-person">
          <span className="sr-only">Person</span>
          <UserRound size={15} aria-hidden="true" />
          <select
            value={person}
            onChange={(event) => reset(setPerson)(event.target.value)}
          >
            <option value="">Everyone</option>
            {people.map((someone) => (
              <option key={someone.id} value={someone.id}>
                {someone.name}
                {someone.role ? ` · ${someone.role}` : ""}
              </option>
            ))}
          </select>
        </label>
      </ActivityFilters>
      <ActivityBody
        data={data}
        filtered={!!(area || day || person)}
        page={page}
        setPage={setPage}
        showActor
      />
    </section>
  );
}
