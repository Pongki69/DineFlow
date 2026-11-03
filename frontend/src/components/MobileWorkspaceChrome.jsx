import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  House,
  ShoppingBag,
  CalendarDays,
  ChefHat,
  Table2,
  CreditCard,
  Radio,
  LayoutGrid,
  UserRound,
  LogOut,
  Moon,
  Sun,
  Search,
  X,
  ShieldCheck,
  ChevronLeft,
  Settings2,
  MapPin,
  FileClock,
  UtensilsCrossed,
  Truck,
  Bike,
  UsersRound,
  ChartColumn,
  Store,
  Package,
} from "lucide-react";
import { mobileWorkspaceNavigation } from "./mobileWorkspaceNavigation";
import "./mobileWorkspaceChrome.css";

const icons = {
  "/menu": UtensilsCrossed,
  "/my-orders": ShoppingBag,
  "/reserve": CalendarDays,
  "/my-reservations": CalendarDays,
  "/admin/dashboard": House,
  "/dashboard": House,
  "/admin/orders": ShoppingBag,
  "/orders": ShoppingBag,
  "/admin/tracking": Radio,
  "/payments": CreditCard,
  "/cashier/summary": FileClock,
  "/kitchen": ChefHat,
  "/service": Table2,
  "/reservations": CalendarDays,
  "/admin/floor-plan": Table2,
  "/admin/outlets": MapPin,
  "/account": ShieldCheck,
  "/settings": Settings2,
  "/admin/menu": UtensilsCrossed,
  "/admin/deliveries": Truck,
  "/admin/riders": Bike,
  "/admin/users": UsersRound,
  "/admin/audit": FileClock,
  "/admin/system-settings": Settings2,
  "/admin/business-settings": Store,
  "/admin/settings": CalendarDays,
  "/admin/payment-settings": CreditCard,
  "/admin/delivery": Package,
  "/reports": ChartColumn,
  "/restaurant": MapPin,
};
// The More sheet groups a long tool list so each tool is easy to find.
const toolGroups = [
  [
    "Daily service",
    ["/reservations", "/admin/floor-plan", "/kitchen", "/service", "/orders"],
  ],
  ["Deliveries", ["/admin/deliveries", "/admin/riders", "/admin/outlets"]],
  ["Menu", ["/admin/menu"]],
  ["Payments & reports", ["/payments", "/cashier/summary", "/reports"]],
  ["Team & security", ["/admin/users", "/admin/audit"]],
  [
    "Settings",
    [
      "/admin/system-settings",
      "/admin/business-settings",
      "/admin/settings",
      "/admin/payment-settings",
      "/admin/delivery",
      "/settings",
    ],
  ],
  [
    "Customer view",
    ["/menu", "/reserve", "/my-reservations", "/my-orders", "/restaurant"],
  ],
];
function groupTools(tools) {
  const placed = new Set();
  const groups = toolGroups
    .map(([title, paths]) => {
      const entries = tools.filter(([, , path]) => paths.includes(path));
      entries.forEach(([, , path]) => placed.add(path));
      return [title, entries];
    })
    .filter(([, entries]) => entries.length);
  const rest = tools.filter(([, , path]) => !placed.has(path));
  return rest.length ? [...groups, ["More tools", rest]] : groups;
}
export function MobileWorkspaceTitle({ title, parent }) {
  return (
    <div className="mobile-workspace-title">
      {parent?.path && (
        <Link
          to={parent.path}
          aria-label={`Back to ${parent.title || parent.label}`}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </Link>
      )}
      <strong>
        <TitleMark />
        {title}
      </strong>
    </div>
  );
}
/** The DineFlow mark that sits beside page titles on phones. */
export function TitleMark() {
  return (
    <span className="mobile-title-mark" aria-hidden="true">
      <UtensilsCrossed size={14} strokeWidth={2.2} />
    </span>
  );
}
export function MobileWorkspaceChrome({
  user,
  pathname,
  theme,
  toggleTheme,
  onSignOut,
  extraTab = null,
  profileTab = null,
}) {
  const { items, menu } = mobileWorkspaceNavigation(user);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const dialog = useRef(null),
    trigger = useRef(null);
  const visible = menu.filter(([label, , path]) =>
    query.trim()
      ? label.toLowerCase().includes(query.trim().toLowerCase())
      : !items.some(([, primaryPath]) => primaryPath === path),
  );
  const detailPath =
    pathname.startsWith("/delivery/") || pathname.startsWith("/payments/")
      ? user.roles.includes("customer")
        ? "/my-orders"
        : "/payments"
      : pathname;
  const currentPath =
    items.some(([, path]) => path === "/admin/tracking") &&
    ["/admin/riders", "/admin/deliveries"].includes(detailPath)
      ? "/admin/tracking"
      : items.some(([, path]) => path === "/admin/orders") &&
          detailPath === "/orders"
        ? "/admin/orders"
        : items.some(([, path]) => path === "/admin/dashboard") &&
            detailPath === "/dashboard"
          ? "/admin/dashboard"
          : detailPath;
  const inPrimary = items.some(([, path]) => path === currentPath);
  const close = () => dialog.current?.close();
  useEffect(() => {
    const media = window.matchMedia("(min-width:851px)");
    const resize = () => {
      if (media.matches) dialog.current?.close();
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <>
      <nav
        className="workspace-mobile-nav"
        aria-label="App navigation"
        style={{
          gridTemplateColumns: `repeat(${items.length + (extraTab ? 2 : 1)},minmax(0,1fr))`,
        }}
      >
        {items.map(([label, path]) => {
          const Icon = icons[path] || LayoutGrid;
          // Booking a table is part of Bookings.
          const active =
            currentPath === path ||
            (path === "/my-reservations" && currentPath === "/reserve");
          return (
            <Link
              key={path}
              to={path}
              className={active ? "is-current" : ""}
              aria-current={active ? "page" : undefined}
            >
              <span>
                <Icon size={22} aria-hidden="true" />
              </span>
              <small>{label}</small>
            </Link>
          );
        })}
        {extraTab}
        {profileTab && (
          <Link
            to={profileTab}
            className={
              ["/settings", "/account"].includes(pathname) ? "is-current" : ""
            }
            aria-current={pathname === profileTab ? "page" : undefined}
          >
            <span>
              <UserRound size={22} aria-hidden="true" />
            </span>
            <small>Profile</small>
          </Link>
        )}
        <button
          ref={trigger}
          hidden={!!profileTab}
          type="button"
          aria-label="More tools and account"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setQuery("");
            dialog.current?.showModal();
            setOpen(true);
          }}
          className={!inPrimary ? "is-current" : ""}
        >
          <span>
            <LayoutGrid size={22} aria-hidden="true" />
          </span>
          <small>More</small>
        </button>
      </nav>
      <dialog
        ref={dialog}
        className="mobile-workspace-menu"
        aria-labelledby="mobile-workspace-menu-title"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <header>
          <div>
            <span className="mobile-workspace-menu-avatar">
              <UserRound size={23} aria-hidden="true" />
            </span>
            <div>
              <h2 id="mobile-workspace-menu-title">Your workspace</h2>
              <p>{user.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close workspace menu"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <label className="mobile-workspace-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="Find a tool"
            placeholder="Find a tool…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <nav
          className="mobile-workspace-tools"
          aria-label="All workspace tools"
        >
          {(query.trim() || visible.length <= 6
            ? [[null, visible]]
            : groupTools(visible)
          ).map(([title, entries]) => (
            <Fragment key={title || "all"}>
              {title && <h3 className="mobile-workspace-group">{title}</h3>}
              {entries.map(([label, , path]) => {
                const Icon = icons[path] || LayoutGrid;
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={close}
                    aria-current={pathname === path ? "page" : undefined}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </Fragment>
          ))}
        </nav>
        {!visible.length && (
          <p className="mobile-workspace-no-results">
            No tools match your search.
          </p>
        )}
        <footer>
          <Link to="/account" onClick={close}>
            <ShieldCheck size={20} aria-hidden="true" />
            <span>Account & security</span>
          </Link>
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
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              onSignOut();
            }}
          >
            <LogOut size={20} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </footer>
      </dialog>
    </>
  );
}
