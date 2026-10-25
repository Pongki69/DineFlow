import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  ChefHat,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileClock,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Settings2,
  Star,
  ShoppingBag,
  Table2,
  Truck,
  UserRound,
  UsersRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { api } from "../api";
import "../features/riderWorkspace.css";
import "./workspaceStructure.css";
import "./deliveryWorkspaceTheme.css";
import {
  visibleNavigation,
  navigationGroup,
  navigationContext,
} from "../navigation";
import { Notifications } from "./Notifications";
import { brandTheme } from "./brandTheme";

const icons = {
  "/menu": UtensilsCrossed,
  "/restaurant": MapPin,
  "/reserve": CalendarDays,
  "/my-reservations": CalendarDays,
  "/my-orders": ShoppingBag,
  "/account": UserRound,
  "/dashboard": LayoutDashboard,
  "/reservations": CalendarDays,
  "/admin/floor-plan": Table2,
  "/orders": ClipboardList,
  "/admin/menu": UtensilsCrossed,
  "/kitchen": ChefHat,
  "/service": Table2,
  "/admin/deliveries": Truck,
  "/rider": LayoutDashboard,
  "/rider/deliveries": Truck,
  "/rider/offers": MapPin,
  "/rider/history": FileClock,
  "/rider/reviews": Star,
  "/settings": Settings2,
  "/payments": CreditCard,
  "/cashier/summary": CreditCard,
  "/reports": ChartNoAxesCombined,
  "/admin/users": UsersRound,
  "/admin/audit": FileClock,
};
function Navigation({ user, branding, onNavigate, onSignOut }) {
  const location = useLocation();
  const links = visibleNavigation(user.permissions, user.roles);
  const context = navigationContext(location.pathname, links);
  const customer = user.roles.includes("customer");
  const rider = user.roles.includes("rider");
  const groups = [
    ...new Set(links.map(([, , path]) => navigationGroup(path, user.roles))),
  ];
  return (
    <>
      <Link
        className="brand"
        to="/"
        onClick={onNavigate}
        aria-label={`${branding.name} home`}
      >
        <span className="brand-mark">
          <UtensilsCrossed size={21} aria-hidden="true" />
        </span>
        <span>
          {branding.name}
          <b className="wordmark-dot">.</b>
          <small>
            {customer
              ? "YOUR NEXT GOOD MOMENT"
              : rider
                ? "DELIVERY WORKSPACE"
                : "RESTAURANT WORKSPACE"}
          </small>
        </span>
      </Link>
      <nav aria-label="Main navigation">
        {groups.map((group) => (
          <section className="nav-group" key={group} aria-label={group}>
            <span className="nav-group-label">{group}</span>
            {links
              .filter(
                ([, , path]) => navigationGroup(path, user.roles) === group,
              )
              .map(([label, , path]) => {
                const Icon = icons[path] || Settings2;
                return (
                  <NavLink
                    key={path}
                    to={path}
                    end
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      isActive || context.parent?.path === path
                        ? "active"
                        : undefined
                    }
                  >
                    <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                    <span>{label}</span>
                    <ChevronRight
                      size={14}
                      className="nav-chevron"
                      aria-hidden="true"
                    />
                  </NavLink>
                );
              })}
          </section>
        ))}
      </nav>
      <div className="sidebar-footer">
        <Link className="identity" to="/account" onClick={onNavigate}>
          <span className="avatar" aria-hidden="true">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{user.name}</strong>
            <small>{user.roles.join(", ").replaceAll("_", " ")}</small>
          </span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <button
          className="signout"
          onClick={() => {
            onNavigate?.();
            onSignOut();
          }}
        >
          <LogOut size={17} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </>
  );
}

export function AppShell({ user, onSignOut, children }) {
  const [branding, setBranding] = useState({
    name: "DineFlow",
    brand_color: "#245440",
  });
  const menu = useRef(null);
  const menuButton = useRef(null);
  const content = useRef(null);
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = visibleNavigation(user.permissions, user.roles);
  const context = navigationContext(location.pathname, links);
  const current = context.title;
  useEffect(() => {
    api("/restaurant/branding")
      .then((result) => setBranding(result.data))
      .catch(() => {});
  }, []);
  function closeMenu() {
    menu.current?.close();
    setMenuOpen(false);
  }
  useEffect(() => {
    document.title = `${current} · ${branding.name}`;
    const focusHeading = () => {
      const heading = content.current?.querySelector("h1");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        observer.disconnect();
      }
      window.scrollTo({ top: 0 });
    };
    const observer = new MutationObserver(focusHeading);
    if (content.current)
      observer.observe(content.current, { childList: true, subtree: true });
    const frame = requestAnimationFrame(focusHeading);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [location.pathname, current, branding.name]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const resize = () => {
      if (media.matches) closeMenu();
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  return (
    <div
      className="app-shell"
      data-page={
        location.pathname === "/rider"
          ? "rider-dashboard"
          : location.pathname === "/rider/deliveries"
            ? "rider-deliveries"
            : undefined
      }
      data-workspace={
        user.roles.includes("rider")
          ? "delivery"
          : user.roles.includes("customer")
            ? "customer"
            : "restaurant"
      }
      data-density={user.preferences?.compact_view ? "compact" : "comfortable"}
      data-motion={user.preferences?.reduced_motion ? "reduced" : "system"}
      style={brandTheme(branding.brand_color)}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <Navigation user={user} branding={branding} onSignOut={onSignOut} />
      </aside>
      <dialog
        ref={menu}
        className="mobile-nav-dialog"
        aria-labelledby="mobile-nav-title"
        onClose={() => {
          setMenuOpen(false);
          menuButton.current?.focus();
        }}
      >
        <div className="mobile-nav-top">
          <h2 id="mobile-nav-title">Navigation</h2>
          <button
            className="icon-button"
            aria-label="Close navigation"
            onClick={closeMenu}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <Navigation
          user={user}
          branding={branding}
          onNavigate={closeMenu}
          onSignOut={onSignOut}
        />
      </dialog>
      <div className="app-body">
        <header className="app-topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-menu-button"
              ref={menuButton}
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => {
                menu.current.showModal();
                setMenuOpen(true);
              }}
            >
              <Menu size={23} aria-hidden="true" />
            </button>
            <Link className="topbar-brand" to="/">
              {branding.name}
            </Link>
            <ChevronRight size={14} aria-hidden="true" />
            <nav className="workspace-breadcrumb" aria-label="Breadcrumb">
              {context.parent && (
                <>
                  <Link to={context.parent.path}>{context.parent.title}</Link>
                  <ChevronRight size={14} aria-hidden="true" />
                </>
              )}
              <span aria-current="page">{current}</span>
            </nav>
          </div>
          <div className="topbar-actions">
            {user.roles.includes("rider") &&
            user.permissions.includes("deliveries.assigned") ? (
              <div id="rider-presence-slot" />
            ) : (
              <span className="workspace-label">
                {user.roles.includes("customer")
                  ? "Customer experience"
                  : user.roles.includes("rider")
                    ? "Rider workspace"
                    : "Restaurant workspace"}
              </span>
            )}
            <Notifications
              showBadge={user.preferences?.show_notification_badge !== false}
            />
            <Link
              to="/account"
              className="avatar avatar-link"
              aria-label="Your account"
            >
              {user.name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>
        <main
          id="main-content"
          className={`app-content${location.pathname === "/rider" || location.pathname.startsWith("/rider/") ? " rider-content" : ""}`}
          ref={content}
          tabIndex={-1}
        >
          {children}
        </main>
        <footer className="app-footer">
          <span>DineFlow · Thoughtful dining, simply managed.</span>
          <Link to="/account">
            Account & security
            <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
