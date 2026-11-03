import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  House,
  Navigation,
  Radio,
  Clock3,
  UserRound,
  ShieldCheck,
  Star,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Volume2,
  VolumeX,
  History,
} from "lucide-react";
import "./riderMobileChrome.css";
import "./riderMotion.css";
import { applyLiveUpdates, notifyLiveChange } from "../liveUpdates";
import { playSound, setSoundsEnabled, soundsEnabled } from "../uiSound";

const PULL_TRIGGER = 64;
const PULL_MAX = 110;
// Gestures that start here belong to the control, not to the page.
const PULL_IGNORE =
  ".leaflet-container, .rider-route-planner.is-expanded, dialog, .df-swipe, input, textarea, select, [data-no-pull], .order-summary.is-open, .cart-bubble, .cart-sheet-scrim, .reservation-date-popover";

// Native-feeling pull-to-refresh for the rider app on phones. It reuses the
// live-update queue, so it refreshes exactly what the Refresh button would.
export function RiderPullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    let startY = null;
    let distance = 0;
    let busy = false;
    // Moves are followed on the touched element itself: if the page re-renders
    // mid-pull and removes it, its touches stop bubbling to the document.
    let target = null;
    const options = { passive: true };
    const follow = (next) => {
      if (target) {
        target.removeEventListener("touchmove", move, options);
        target.removeEventListener("touchend", end, options);
        target.removeEventListener("touchcancel", end, options);
      }
      target = next;
      if (target) {
        target.addEventListener("touchmove", move, options);
        target.addEventListener("touchend", end, options);
        target.addEventListener("touchcancel", end, options);
      }
    };
    const start = (event) => {
      // Not while a sheet or dialog holds the page (it locks body scroll).
      startY =
        document.body.style.overflow !== "hidden" &&
        window.scrollY <= 0 &&
        event.touches.length === 1 &&
        !event.target.closest?.(PULL_IGNORE)
          ? event.touches[0].clientY
          : null;
      follow(startY == null ? null : event.target);
    };
    function move(event) {
      if (startY == null) return;
      const delta = event.touches[0].clientY - startY;
      distance =
        delta > 0 && window.scrollY <= 0 ? Math.min(PULL_MAX, delta * 0.5) : 0;
      setPull(distance);
    }
    function end() {
      follow(null);
      if (startY == null) return;
      startY = null;
      if (distance >= PULL_TRIGGER && !busy) {
        busy = true;
        setRefreshing(true);
        window.clearTimeout(timer.current);
        // Reopen the page (it shows its skeleton while it loads again) and
        // refresh the shared bits around it, such as alerts.
        window.dispatchEvent(new Event("dineflow:reload-page"));
        notifyLiveChange();
        applyLiveUpdates();
        window.dispatchEvent(new Event("rider-deliveries-updated"));
        timer.current = window.setTimeout(() => {
          busy = false;
          setRefreshing(false);
        }, 700);
      }
      distance = 0;
      setPull(0);
    }
    document.addEventListener("touchstart", start, options);
    return () => {
      document.removeEventListener("touchstart", start, options);
      follow(null);
      window.clearTimeout(timer.current);
    };
  }, []);
  const shown = refreshing ? PULL_TRIGGER : pull;
  return (
    <div
      className="rider-pull-refresh"
      data-pulling={pull > 0 || undefined}
      data-ready={pull >= PULL_TRIGGER || undefined}
      data-refreshing={refreshing || undefined}
      style={{ "--rider-pull": `${shown}px` }}
    >
      <span aria-hidden="true">
        <RefreshCw
          size={20}
          style={{ transform: `rotate(${(shown / PULL_TRIGGER) * 270}deg)` }}
        />
      </span>
      <span className="sr-only" role="status">
        {refreshing ? "Refreshing" : ""}
      </span>
    </div>
  );
}

export function RiderMobileNavigation({
  user,
  pathname,
  extraTab,
  presenceSlot = false,
}) {
  const hasWork = user.permissions.includes("deliveries.assigned");
  const items = [
    ...(hasWork
      ? [
          ["Home", "/rider", House],
          ["Deliveries", "/rider/deliveries", Navigation],
          ["Offers", "/rider/offers", Radio],
        ]
      : []),
    ["Profile", "/settings", UserRound],
  ];
  return (
    <nav
      className="rider-mobile-bottom-nav"
      aria-label="Rider app navigation"
      style={{
        gridTemplateColumns: `repeat(${items.length + (extraTab ? 1 : 0) + (presenceSlot ? 1 : 0)},minmax(0,1fr))`,
      }}
    >
      {items.map(([label, path, Icon], index) => {
        const active =
          pathname === path ||
          (path === "/settings" &&
            ["/account", "/rider/reviews"].includes(pathname)) ||
          // Past deliveries and their details belong to Deliveries.
          (path === "/rider/deliveries" &&
            (pathname === "/rider/history" ||
              /^\/rider\/deliveries\/[^/]+/.test(pathname)));
        return (
          <Fragment key={path}>
            {/* Online/offline sits in the middle, within thumb reach. */}
            {presenceSlot && index === Math.ceil(items.length / 2) && (
              <div id="rider-presence-slot" className="rider-nav-presence" />
            )}
            {/* The extra tab (notifications) sits just before Profile. */}
            {index === items.length - 1 && extraTab}
            <Link
              to={path}
              aria-current={active ? "page" : undefined}
              className={active ? "is-current" : ""}
            >
              <span>
                <Icon size={22} aria-hidden="true" />
              </span>
              <small>{label}</small>
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}

// What each role is called on the profile card.
const ROLE_NAMES = {
  administrator: "Administrator",
  manager: "Manager",
  cashier: "Cashier",
  kitchen_staff: "Kitchen staff",
  waiter: "Waiter · Service staff",
  rider: "Rider",
  customer: "Customer",
};

export function RiderMobileProfileActions({
  user,
  theme,
  toggleTheme,
  onSignOut,
  links = [
    ["/account", "Account & security", ShieldCheck],
    ["/rider/reviews", "Ratings & reviews", Star],
    ["/activity", "My activity", History],
  ],
  label = "Rider profile shortcuts",
}) {
  const [sounds, setSounds] = useState(soundsEnabled);
  return (
    <section className="rider-profile-card" aria-label="Your profile">
      {user && (
        <header className="rider-profile-identity">
          <span className="rider-profile-avatar" aria-hidden="true">
            {user.name?.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{user.name}</strong>
            {user.email && <small>{user.email}</small>}
            {!!user.roles?.length && (
              <ul className="rider-profile-roles" aria-label="Your roles">
                {user.roles.map((role) => (
                  <li key={role}>
                    {ROLE_NAMES[role] || role.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </header>
      )}
      <nav className="rider-mobile-profile-actions" aria-label={label}>
        {links.map(([path, text, Icon]) => (
          <Link key={path} to={path}>
            <Icon size={20} aria-hidden="true" />
            <span>{text}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        ))}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={
            theme === "light" ? "Switch to dark mode" : "Switch to light mode"
          }
        >
          {theme === "light" ? (
            <Moon size={20} aria-hidden="true" />
          ) : (
            <Sun size={20} aria-hidden="true" />
          )}
          <span>Dark mode</span>
          <i
            className="rider-profile-switch"
            data-on={theme !== "light" || undefined}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={sounds}
          onClick={() => {
            setSoundsEnabled(!sounds);
            setSounds(!sounds);
            if (!sounds) playSound("tap");
          }}
        >
          {sounds ? (
            <Volume2 size={20} aria-hidden="true" />
          ) : (
            <VolumeX size={20} aria-hidden="true" />
          )}
          <span>Sounds</span>
          <i
            className="rider-profile-switch"
            data-on={sounds || undefined}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          className="rider-profile-signout"
          onClick={onSignOut}
        >
          <LogOut size={20} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </nav>
    </section>
  );
}
